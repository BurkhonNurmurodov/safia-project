import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, AlertTriangle, Check } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useCapabilities } from "../../hooks/useCapabilities";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";

/**
 * «Kutish manbasi» — where each supervisor's ojidaniya minutes come from.
 *
 * Every KPI surface that prints a unit's idle time (fleet загрузка, Overview,
 * the Ojidaniya page, the bot card, the weekly svodka) reads ONE of two
 * sources per supervisor, and this tab is the only place the rule is visible:
 *
 *   sheet — the «Смена отчёт» row, today's rule and everybody's default;
 *   cells — the per-cell interval model, headcount-weighted across the unit's
 *           cells (Σ N·T ÷ Σ N), FROM A GIVEN DATE onward. Days before the
 *           date keep the sheet, so switching a unit never rewrites history —
 *           which is why a `cells` row without a date is refused, here and on
 *           the server: a switch with no start is a switch that rewrites
 *           everything.
 *
 * One row per active supervisor, saved one row at a time (PUT per manager).
 * The pilot unit is an ordinary row; nothing here names it. The KPI payloads
 * carry no source label by design — this register is the label.
 */

const SRC_SHEET = "sheet";
const SRC_CELLS = "cells";

const QK = ["admin-idle-source"];

function ShiftChip({ shift, t }) {
  if (!shift) {
    return (
      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
        {t("idleSource.noShift")}
      </span>
    );
  }
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wide"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {`S${shift}`}
    </span>
  );
}

export default function IdleSource() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useCapabilities();

  const canEdit = can("admin.idle_source.manage");

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/idle-source").then((r) => r.data),
  });

  const units = useMemo(() => data?.units || [], [data]);

  // Drafts live beside the server rows, keyed by manager id: a row is DIRTY
  // when its draft differs from what the server last answered, and clean rows
  // simply have no draft. Saving one row never touches another's draft, so an
  // admin can line up three switches and save them in any order.
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState({});
  const [search, setSearch] = useState("");

  const effective = (u) => drafts[u.manager_id] || { source: u.source || SRC_SHEET, from_date: u.from_date || "" };
  const isDirty = (u) => {
    const d = drafts[u.manager_id];
    if (!d) return false;
    return d.source !== (u.source || SRC_SHEET) || (d.from_date || "") !== (u.from_date || "");
  };
  const setDraft = (u, patch) =>
    setDrafts((prev) => ({ ...prev, [u.manager_id]: { ...effective(u), ...patch } }));

  const anyDirty = useMemo(() => units.some(isDirty), [units, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  useAdminDirty(anyDirty);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = units.filter((u) => {
      if (!q) return true;
      const raw = String(u.name || "").toLowerCase();
      const shown = String(tl(u.name || "") || "").toLowerCase();
      return raw.includes(q) || shown.includes(q);
    });
    return list.sort((a, b) => (tl(a.name || "") || "").localeCompare(tl(b.name || "") || ""));
  }, [units, search, tl]);

  const errText = (e) => e?.response?.data?.detail || e?.message || t("idleSource.saveFailed");

  const save = async (u) => {
    const d = effective(u);
    if (d.source === SRC_CELLS && !d.from_date) {
      toast.error(t("idleSource.fromRequired"));
      return;
    }
    setBusy((b) => ({ ...b, [u.manager_id]: true }));
    try {
      await api.put(`/api/admin/idle-source/${u.manager_id}`, {
        source: d.source,
        from_date: d.source === SRC_CELLS ? d.from_date : null,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[u.manager_id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: QK });
      toast.success(t("idleSource.saved").replace("{name}", tl(u.name || "") || `#${u.manager_id}`));
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy((b) => ({ ...b, [u.manager_id]: false }));
    }
  };

  const srcOptions = [
    { value: SRC_SHEET, label: t("idleSource.srcSheet") },
    { value: SRC_CELLS, label: t("idleSource.srcCells") },
  ];

  // ── per-row controls, shared by the table row and the phone card ──────────
  const sourceControl = (u) => {
    const d = effective(u);
    return (
      <SegmentedToggle
        size="sm"
        value={d.source}
        onChange={(v) => canEdit && setDraft(u, { source: v })}
        options={canEdit ? srcOptions : srcOptions.map((o) => ({ ...o, disabled: o.value !== d.source }))}
      />
    );
  };

  const dateControl = (u, fill = false) => {
    const d = effective(u);
    if (d.source !== SRC_CELLS) {
      // The sheet has no start: it is the rule for every day nobody switched.
      return <span style={{ color: "var(--text-4)" }}>—</span>;
    }
    const missing = !d.from_date;
    return (
      <div className={`flex flex-col gap-1 ${fill ? "w-full" : ""}`}>
        {canEdit ? (
          <DateRangePicker
            single
            dateFrom={d.from_date}
            dateTo={d.from_date}
            setDateFrom={(v) => setDraft(u, { from_date: v })}
            setDateTo={() => {}}
          />
        ) : (
          <span className="tabular-nums" style={{ color: "var(--text-1)" }}>{d.from_date || "—"}</span>
        )}
        <span className="text-[11px]" style={{ color: missing ? "#ef4444" : "var(--text-3)" }}>
          {missing ? t("idleSource.fromRequired") : t("idleSource.fromBefore")}
        </span>
      </div>
    );
  };

  const saveControl = (u) => {
    const dirty = isDirty(u);
    return (
      <Button
        size="sm"
        variant="primary"
        disabled={!canEdit || !dirty}
        loading={!!busy[u.manager_id]}
        onClick={() => save(u)}
        icon={<Check size={12} />}
      >
        {t("common.save")}
      </Button>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-96" />
      </div>
    );
  }

  // A failed load must not read as "nobody is switched": an empty register is
  // exactly what a healthy platform on the sheet rule looks like.
  if (loadError) {
    return (
      <div
        className="flex items-start gap-2.5 px-4 py-3 rounded-2xl"
        style={{
          background: "color-mix(in srgb, #ef4444 10%, transparent)",
          border: "1px solid color-mix(in srgb, #ef4444 35%, transparent)",
        }}
      >
        <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          <span className="font-semibold" style={{ color: "var(--text-1)" }}>{t("common.loadFailed")}</span>
          <br />
          {loadError?.response?.data?.detail || loadError?.message || t("common.error")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The rule, spelled out once: an admin flipping a unit must know what
          the number they are about to move is made of. */}
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
        {t("idleSource.intro")}
      </p>

      <TableCard
        icon={GitBranch}
        title={t("idleSource.title")}
        right={
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {rows.length} / {units.length}
          </span>
        }
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("idleSource.searchPh")}
            className="w-full sm:w-64"
          />
        }
        minWidth="860px"
        mobileCards
        mobile={
          rows.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-8 text-center text-xs"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}
            >
              {t("idleSource.empty")}
            </div>
          ) : rows.map((u) => {
            const dirty = isDirty(u);
            return (
              <div
                key={u.manager_id}
                className="rounded-2xl px-3 py-3 space-y-2.5"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${dirty ? "var(--brand-border)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate min-w-0 flex-1" style={{ color: "var(--text-1)" }}>
                    {tl(u.name || "") || `#${u.manager_id}`}
                  </span>
                  <ShiftChip shift={u.shift} t={t} />
                </div>
                <div className="text-[11px] truncate" style={{ color: u.factory_name ? "var(--text-3)" : "var(--text-4)" }}>
                  {tl(u.factory_name || "") || "—"}
                </div>
                <div>{sourceControl(u)}</div>
                <div className="text-xs">{dateControl(u, true)}</div>
                <div className="flex items-center justify-end gap-2">
                  {dirty && (
                    <span className="text-[11px]" style={{ color: "var(--brand-text)" }}>
                      {t("idleSource.unsaved")}
                    </span>
                  )}
                  {saveControl(u)}
                </div>
              </div>
            );
          })
        }
      >
        <thead>
          <tr>
            <Th label={t("idleSource.colBrigadir")} />
            <Th label={t("idleSource.colShift")} cls="w-20" />
            <Th label={t("idleSource.colFactory")} cls="w-40" />
            <Th label={t("idleSource.colSource")} cls="w-72" />
            <Th label={t("idleSource.colFrom")} cls="w-56" />
            <Th label="" align="right" cls="w-32" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-8 text-xs" style={{ color: "var(--text-4)" }}>
                {t("idleSource.empty")}
              </td>
            </tr>
          ) : rows.map((u) => {
            const dirty = isDirty(u);
            return (
              <tr key={u.manager_id} style={dirty ? { background: "var(--brand-bg)" } : undefined}>
                <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-1)" }}>
                  {tl(u.name || "") || `#${u.manager_id}`}
                </td>
                <td className="px-3 py-2"><ShiftChip shift={u.shift} t={t} /></td>
                <td className="px-3 py-2" style={{ color: u.factory_name ? "var(--text-2)" : "var(--text-4)" }}>
                  {tl(u.factory_name || "") || "—"}
                </td>
                <td className="px-3 py-2">{sourceControl(u)}</td>
                <td className="px-3 py-2 text-xs">{dateControl(u)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {dirty && (
                      <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--brand-text)" }}>
                        {t("idleSource.unsaved")}
                      </span>
                    )}
                    {saveControl(u)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      {toast.node}
    </div>
  );
}
