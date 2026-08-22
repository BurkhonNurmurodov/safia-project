import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileClock, AlertTriangle, ShieldAlert, CalendarClock, Repeat } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import Modal from "../../components/ui/Modal";

/**
 * «Hujjatlar tarixi» — who changed which HR document, across all of them.
 *
 * The per-document «O'zgarishlar tarixi» dialog has always existed, but one
 * document at a time: answering "did anything rejected get approved" meant
 * opening every row in the register, so nobody ever asked. That is how a
 * backlog of June drafts got posted in one burst on 2026-08-22 with eleven
 * Telegram notifications as the only trace.
 *
 * Three flags, none of them an error by itself:
 *   revived — rejected, then approved later. Should be impossible; a hit is
 *             the one row to act on.
 *   stale   — posted long after the document's own date, which rewrites a day
 *             already uploaded and confirmed. Now refused outright on the
 *             server, so this only surfaces what is already in the data.
 *   flapped — approved/cancelled more than once; its day was rewritten each
 *             time.
 */

const COLS = 8;

const FLAG = {
  revived: { color: "#ef4444", Icon: ShieldAlert },
  stale:   { color: "#eab308", Icon: CalendarClock },
  flapped: { color: "#94a3b8", Icon: Repeat },
};

function FlagChip({ flag, t }) {
  const m = FLAG[flag] || FLAG.flapped;
  const { Icon } = m;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55` }}
    >
      <Icon size={11} />
      {t(`docAudit.flag.${flag}`)}
    </span>
  );
}

function Stat({ label, value, tone, hint }) {
  return (
    <div className="rounded-2xl px-3 py-2.5 min-w-0"
         style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums" style={{ color: tone || "var(--text-1)" }}>
        {value}
      </div>
      {hint && <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-4)" }}>{hint}</div>}
    </div>
  );
}

const fmt = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function DocAudit() {
  const { t } = useLang();
  const { tl } = useTranslit();

  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(180));
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [flag,   setFlag]   = useState("all");
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-doc-audit", dateFrom, dateTo],
    queryFn: async () =>
      (await api.get("/api/admin/doc-audit", { params: { from: dateFrom, to: dateTo } })).data,
    keepPreviousData: true,
  });

  const all = data?.rows || [];
  const sum = data?.summary || {};

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (flag !== "all" && !(r.flags || []).includes(flag)) return false;
      if (!q) return true;
      return [r.unit, r.created_by, r.approved_by, r.date, String(r.doc_id)]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [all, flag, search]);

  const opts = useMemo(() => [
    { value: "all", label: `${t("docAudit.filterAll")} (${all.length})` },
    ...["revived", "stale", "flapped"].map((k) => ({
      value: k,
      label: `${t(`docAudit.flag.${k}`)} (${all.filter((r) => (r.flags || []).includes(k)).length})`,
    })),
  ], [all, t]);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
        {t("docAudit.intro").replace("{n}", sum.max_age_days ?? 14)}
      </p>

      {isError && (
        <div className="rounded-2xl px-3 py-2.5 text-xs flex items-start gap-2"
             style={{ background: "#ef444414", border: "1px solid #ef444455", color: "#ef4444" }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error?.message || t("docAudit.loadFailed")}</span>
        </div>
      )}

      {isLoading ? (
        <SkeletonBlock className="h-24" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat label={t("docAudit.flag.revived")} value={sum.revived ?? 0}
                tone={sum.revived ? "#ef4444" : "#22c55e"}
                hint={t("docAudit.revivedHint")} />
          <Stat label={t("docAudit.flag.stale")} value={sum.stale ?? 0}
                tone={sum.stale ? "#eab308" : undefined}
                hint={t("docAudit.staleHint").replace("{n}", sum.max_age_days ?? 14)} />
          <Stat label={t("docAudit.flag.flapped")} value={sum.flapped ?? 0} />
          <Stat label={t("docAudit.statScanned")} value={data?.docs_scanned ?? 0} />
        </div>
      )}

      <TableCard
        icon={FileClock}
        title={t("docAudit.title")}
        right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
          {rows.length} / {all.length}
        </span>}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 w-full">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo}
                             setDateFrom={setDateFrom} setDateTo={setDateTo}
                             compactLabel triggerClassName="px-3 py-2 text-sm" />
            <SearchInput value={search} onChange={setSearch}
                         placeholder={t("docAudit.searchPh")} className="w-full sm:w-56" />
            <SegmentedToggle value={flag} onChange={setFlag} options={opts}
                             size="md" scrollable className="ml-auto" />
          </div>
        }
        minWidth="980px"
        mobileCards
        mobile={
          isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl px-4 py-8 text-center text-xs"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
              {t("docAudit.empty")}
            </div>
          ) : rows.map((r) => (
            <button key={r.doc_id} onClick={() => setOpen(r)}
                    className="w-full text-left rounded-2xl px-3 py-3 space-y-2"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                  #{r.doc_id} · {r.date}
                </span>
                <span className="ml-auto flex gap-1 flex-wrap">
                  {(r.flags || []).map((f) => <FlagChip key={f} flag={f} t={t} />)}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {tl(r.unit || "")} · {r.workers} {t("docAudit.workersShort")}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
                {t("docAudit.colApprovedBy")}: {tl(r.approved_by || "") || "—"} · {fmt(r.approved_at)}
              </div>
            </button>
          ))
        }
      >
        <thead>
          <tr>
            <Th label="#" cls="w-16" />
            <Th label={t("docAudit.colDocDate")} cls="w-28" />
            <Th label={t("docAudit.colUnit")} cls="w-44" />
            <Th label={t("docAudit.colWorkers")} align="right" cls="w-20" />
            <Th label={t("docAudit.colApprovedBy")} cls="w-44" />
            <Th label={t("docAudit.colApprovedAt")} cls="w-40" />
            <Th label={t("docAudit.colAge")} align="right" cls="w-24" />
            <Th label={t("docAudit.colFlags")} cls="w-52" />
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              {Array.from({ length: COLS }).map((_, j) => (
                <td key={j} className="px-3 py-2"><SkeletonBlock className="h-4" /></td>
              ))}
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={COLS} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>
                {t("docAudit.empty")}
              </td>
            </tr>
          )}
          {!isLoading && rows.map((r) => (
            <tr key={r.doc_id} className="cursor-pointer" onClick={() => setOpen(r)}>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.doc_id}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{r.date || "—"}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{tl(r.unit || "")}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{r.workers}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                {tl(r.approved_by || "") || "—"}
                {r.approvals > 1 && (
                  <span className="ml-1 text-[10px] tabular-nums" style={{ color: "var(--text-4)" }}>
                    ×{r.approvals}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{fmt(r.approved_at)}</td>
              <td className="px-3 py-2 text-right tabular-nums"
                  style={{ color: r.age_days ? "#eab308" : "var(--text-4)" }}>
                {r.age_days != null ? `+${r.age_days}` : "—"}
              </td>
              <td className="px-3 py-2">
                <span className="flex gap-1 flex-wrap">
                  {(r.flags || []).map((f) => <FlagChip key={f} flag={f} t={t} />)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {open && (
        <Modal open onClose={() => setOpen(null)}
               title={`#${open.doc_id} · ${open.date || ""}`}
               subtitle={tl(open.unit || "")}>
          <div className="space-y-2">
            {(open.timeline || []).map((e, i) => (
              <div key={i} className="rounded-xl px-3 py-2 flex items-center gap-3"
                   style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{ background: "var(--bg-card)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                  {t(`docAudit.action.${e.action}`) || e.action}
                </span>
                <span className="text-sm min-w-0 flex-1 truncate" style={{ color: "var(--text-1)" }}>
                  {tl(e.by || "") || "—"}
                </span>
                <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                  {fmt(e.at)}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>
        {t("docAudit.footnote").replace("{n}", sum.max_age_days ?? 14)}
      </p>
    </div>
  );
}
