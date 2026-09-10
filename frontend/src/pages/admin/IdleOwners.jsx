import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldQuestion, Info, UserRound, Save, RotateCcw } from "lucide-react";

import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { CATS, catColor, iconFor } from "../../components/idle/categories";

/**
 * «Kutish mas'ullari» — WHO answers for each ojidaniya category.
 *
 * The plant runs twelve waiting categories and, from 2026-09-10, each has one
 * named person responsible for driving it down. That assignment does two
 * separate things and this destination is the only place either is set:
 *
 *   • the NAME printed beside the category on every by-category surface —
 *     the «Xarajat» tree, the «Toifalar bo'yicha» matrix, both workbooks and
 *     the owner's own page;
 *   • the SCOPE of the «Kutish mas'uli» role: a viewer holding it reads the
 *     ojidaniya register through their own categories and no others
 *     (services/idle_scope, applied server-side — `?cats=` is a query
 *     parameter anyone can type).
 *
 * ONE owner per category, by the unique key on the column: re-assigning
 * REPLACES, so there is never a second name for a reader to choose between.
 * A person may hold SEVERAL categories — twelve causes, fewer people — and
 * their page answers for all of them at once.
 *
 * Nothing is denormalised: the owner is resolved on read, so re-assigning a
 * category re-labels every past surface at once with no migration and no
 * re-sync. It therefore moves NO figure, ever — it decides who is NAMED and
 * what one role may look at, never what anything costs. The Save says so.
 *
 * Everything is a DRAFT until Save: an admin re-arranging responsibility
 * should be able to change their mind before anything is real.
 */

const QK = ["admin-idle-owners"];

// The role chips on the pick list. «Kutish mas'uli» first because that is the
// role this exists for, but a brigadir or a shift manager may perfectly well
// own a cause — refusing to offer them would make the register describe less
// than reality.
const ROLE_KEY = {
  "idle-owner": "role.idleOwner",
  "shift-manager": "role.manager",
  "top-manager": "role.topManager",
  supervisor: "role.supervisor",
};

export default function IdleOwners() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();

  // The house i18n convention: whole sentences carrying {placeholders}, filled
  // by the caller. There is no params argument on `t`.
  const tp = useCallback(
    (k, vars) => Object.entries(vars || {}).reduce(
      (out, [a, b]) => out.split(`{${a}}`).join(String(b ?? "")), t(k)),
    [t]);

  const [draft, setDraft] = useState({});      // category -> profile_key | null
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/idle-owner/admin/owners").then((r) => r.data),
  });

  const rows = data?.rows || [];
  const people = data?.people || [];
  const canEdit = !!data?.can_edit;

  // The saved state, as a plain map — what a draft is compared against.
  const saved = useMemo(() => {
    const m = {};
    rows.forEach((r) => { m[r.category] = r.profile_key || null; });
    return m;
  }, [rows]);

  // A draft that has caught up with the server is not a draft. Clearing it on
  // every refetch is what makes the dirty guard honest after a Save.
  useEffect(() => { setDraft({}); }, [saved]);

  const current = (cat) => (cat in draft ? draft[cat] : saved[cat] ?? null);
  const changed = Object.keys(draft).filter((c) => (draft[c] || null) !== (saved[c] || null));
  const dirty = changed.length > 0;
  useAdminDirty(dirty);

  const nameOf = (key) => {
    const p = people.find((x) => x.profile_key === key);
    return p ? (tl(p.name) || p.name) : "";
  };

  const options = useMemo(() => ([
    { value: "", label: t("idleOwners.nobody") },
    ...people.map((p) => ({
      value: p.profile_key,
      label: `${tl(p.name) || p.name} · ${t(ROLE_KEY[p.role] || "role.guest")}`,
      title: `${tl(p.name) || p.name} · ${t(ROLE_KEY[p.role] || "role.guest")}`,
    })),
  ]), [people, t, tl]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const c = CATS.find((x) => x.name === r.category);
      const words = [
        r.category,
        c ? t(`downtime.cat.${c.code}.label`) : "",
        nameOf(current(r.category)),
      ].join(" ").toLowerCase();
      return words.includes(needle);
    });
  }, [rows, q, draft, saved, people, t]);

  async function save() {
    setSaving(true);
    try {
      const assignments = changed.map((c) => ({
        category: c, profile_key: draft[c] || null,
      }));
      await api.put("/api/idle-owner/admin/owners", { assignments });
      await qc.invalidateQueries({ queryKey: QK });
      setDraft({});
      setConfirm(null);
      toast.success(tp("idleOwners.saved", { n: assignments.length }));
    } catch (e) {
      // The failure stays INSIDE the dialog with the reason on it: a mutation
      // that fails must never close the dialog and leave the reason nowhere.
      setConfirm((c) => (c ? { ...c, error: e?.detail || t("common.loadFailed") } : c));
    } finally {
      setSaving(false);
    }
  }

  const unassigned = rows.filter((r) => !current(r.category)).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
          <ShieldQuestion size={18} style={{ color: "var(--brand-text)" }} />
          {t("admin.tabIdleOwners")}
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          {t("admin.desc.idleowners")}
        </p>
      </div>

      {/* What the assignment DOES and — as importantly — what it does not. */}
      <div
        className="rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed flex gap-2"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      >
        <Info size={14} className="shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
        <span>{t("idleOwners.explain")}</span>
      </div>

      <TableCard
        icon={UserRound}
        title={t("idleOwners.title")}
        right={
          <span className="text-[11px]" style={{ color: unassigned ? "#eab308" : "var(--text-3)" }}>
            {unassigned
              ? tp("idleOwners.nUnassigned", { n: unassigned })
              : t("idleOwners.allAssigned")}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={q} onChange={setQ}
              placeholder={t("idleOwners.searchPh")}
              className="w-full sm:w-72"
            />
            <span className="flex-1" />
            {dirty && (
              <Button size="lg" variant="ghost" onClick={() => setDraft({})}>
                <RotateCcw size={14} />
                {t("common.cancel")}
              </Button>
            )}
            <Button
              size="lg" variant="primary"
              disabled={!dirty || !canEdit}
              onClick={() => setConfirm({ n: changed.length })}
            >
              <Save size={14} />
              {dirty ? tp("idleOwners.saveN", { n: changed.length }) : t("common.save")}
            </Button>
          </>
        }
      >
        <thead>
          <tr>
            <Th label={t("downtime.mx.catCol")} />
            <Th label={t("idleOwners.ownerCol")} />
            <Th label={t("idleOwners.wasCol")} cls="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={3}><SkeletonTable rows={6} cols={3} /></td></tr>
          ) : shown.map((r) => {
            const c = CATS.find((x) => x.name === r.category);
            const code = c?.code || r.category;
            const hue = catColor(r.category);
            const Icon = iconFor(code);
            const val = current(r.category);
            const moved = r.category in draft
              && (draft[r.category] || null) !== (saved[r.category] || null);
            return (
              <tr key={r.category}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-[24px] h-[24px] rounded-lg grid place-items-center shrink-0"
                      style={{ background: `${hue}22`, color: hue, border: `1px solid ${hue}55` }}
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span className="font-bold shrink-0" style={{ color: hue }}>{code}</span>
                    <span className="truncate" style={{ color: "var(--text-2)" }}>
                      {t(`downtime.cat.${code}.label`)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2" style={{ minWidth: 260 }}>
                  <StyledSelect
                    searchable
                    disabled={!canEdit}
                    value={val || ""}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.category]: v || null }))}
                    options={options}
                    placeholder={t("idleOwners.nobody")}
                    triggerClassName="px-2.5 py-1.5 text-xs"
                  />
                </td>
                {/* What it WAS, whenever a draft has moved it — an assignment is
                    a decision about a person, so the change is shown before it
                    is committed rather than discovered afterwards. */}
                <td className="px-3 py-2 hidden md:table-cell" style={{ color: "var(--text-3)" }}>
                  {moved
                    ? (nameOf(saved[r.category]) || t("idleOwners.nobody"))
                    : <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      <ConfirmDialog
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={save}
        loading={saving}
        error={confirm?.error}
        title={t("idleOwners.confirmTitle")}
        // The confirm names the reach AND the non-reach: what changes is who is
        // named and what one role may read, and no figure anywhere moves.
        message={tp("idleOwners.confirmBody", { n: confirm?.n || 0 })}
        confirmLabel={t("common.save")}
      />
      {toast.node}
    </div>
  );
}
