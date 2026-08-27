import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardX, AlertTriangle, Save, Ban } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";

/**
 * «Barcha yo'qolganlar» — the GENERAL check, one question per day:
 *
 *   everyone the uploaded file says worked  −  everyone the platform can show
 *
 * The exchange report next to this one finds only workers an exchange document
 * NAMED, so it cannot see a cell unticked after a save, a deleted supervisor
 * day, or a day closed before its cells were projected. This asks the same
 * question without caring which of them happened, which is the point: chasing
 * each cause with its own detector is how the next one goes unnoticed.
 *
 * Two reasons, deliberately separated — they need different actions and mixing
 * them makes the number unreadable:
 *   lost      — the row was accepted and then dropped. The real alarm.
 *   not_saved — the cell is staged and never projected (often a closed day).
 *               Pressing Save, or re-opening the day, writes it.
 */

const COLS = 8;

const REASON = {
  lost:      { color: "#ef4444", Icon: Ban },
  not_saved: { color: "#eab308", Icon: Save },
};

function ReasonChip({ reason, t }) {
  const m = REASON[reason] || REASON.lost;
  const { Icon } = m;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55` }}
    >
      <Icon size={11} />
      {t(`reconcile.reason.${reason}`)}
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

export default function ReconcileView({ dateFrom, dateTo, setDateFrom, setDateTo }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [reason, setReason] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-reconcile", dateFrom, dateTo],
    queryFn: async () =>
      (await api.get("/api/admin/exchange-audit/reconcile",
                     { params: { from: dateFrom, to: dateTo } })).data,
    keepPreviousData: true,
  });

  const all = data?.rows || [];
  const sum = data?.summary || {};

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (reason !== "all" && r.reason !== reason) return false;
      if (!q) return true;
      return [r.worker_name, r.manager_name, r.verifix_code, r.date]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [all, reason, search]);

  const opts = useMemo(() => [
    { value: "all", label: `${t("reconcile.filterAll")} (${all.length})` },
    ...["lost", "not_saved"].map((k) => ({
      value: k,
      label: `${t(`reconcile.reason.${k}`)} (${all.filter((r) => r.reason === k).length})`,
    })),
  ], [all, t]);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
        {t("reconcile.intro")}
      </p>

      {isError && (
        <div className="rounded-2xl px-3 py-2.5 text-xs flex items-start gap-2"
             style={{ background: "#ef444414", border: "1px solid #ef444455", color: "#ef4444" }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error?.message || t("reconcile.loadFailed")}</span>
        </div>
      )}

      {isLoading ? (
        <SkeletonBlock className="h-24" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat label={t("reconcile.statLost")} value={sum.lost ?? 0}
                tone={sum.lost ? "#ef4444" : "#22c55e"}
                hint={t("reconcile.statLostHint")
                  .replace("{days}", sum.days ?? 0)
                  .replace("{units}", sum.units ?? 0)} />
          <Stat label={t("reconcile.statHours")} value={(sum.hours ?? 0).toFixed(1)} />
          <Stat label={t("reconcile.reason.not_saved")} value={sum.not_saved ?? 0}
                tone={sum.not_saved ? "#eab308" : undefined} />
          <Stat label={t("reconcile.statTotal")} value={sum.total ?? 0} />
        </div>
      )}

      <TableCard
        icon={ClipboardX}
        title={t("reconcile.title")}
        right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
          {rows.length} / {all.length}
        </span>}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 w-full">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo}
                             setDateFrom={setDateFrom} setDateTo={setDateTo}
                             compactLabel triggerClassName="px-3 py-2 text-sm" />
            <SearchInput value={search} onChange={setSearch}
                         placeholder={t("reconcile.searchPh")} className="w-full sm:w-56" />
            <SegmentedToggle value={reason} onChange={setReason} options={opts}
                             size="md" className="ml-auto" />
          </div>
        }
        minWidth="900px"
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
              {t("reconcile.empty")}
            </div>
          ) : rows.map((r) => (
            <div key={`${r.date}-${r.worker_name}`} className="rounded-2xl px-3 py-3 space-y-2"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-2">
                <span className="text-sm font-semibold min-w-0 flex-1" style={{ color: "var(--text-1)" }}>
                  {r.worker_name}
                </span>
                <ReasonChip reason={r.reason} t={t} />
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                {r.date} · {r.verifix_code || "—"} · {tl(r.job_title || "") || "—"}
              </div>
              <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-4)" }}>
                <span>{tl(r.manager_name || "")}</span>
                <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
                  {r.hours_worked != null ? Number(r.hours_worked).toFixed(2) : "—"}
                </span>
              </div>
            </div>
          ))
        }
      >
        <thead>
          <tr>
            <Th label={t("reconcile.colDate")} cls="w-28" />
            <Th label={t("reconcile.colWorker")} />
            <Th label={t("reconcile.colRole")} cls="w-36" />
            <Th label={t("reconcile.colCell")} cls="w-20" />
            <Th label={t("reconcile.colUnit")} cls="w-44" />
            <Th label={t("reconcile.colClock")} cls="w-40" />
            <Th label={t("reconcile.colHours")} align="right" cls="w-24" />
            <Th label={t("reconcile.colReason")} cls="w-36" />
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
                {t("reconcile.empty")}
              </td>
            </tr>
          )}
          {!isLoading && rows.map((r) => (
            <tr key={`${r.date}-${r.worker_name}`}>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.date}</td>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{r.worker_name}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(r.job_title || "") || "—"}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.verifix_code || "—"}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(r.manager_name || "")}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.clock_in_out || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>
                {r.hours_worked != null ? Number(r.hours_worked).toFixed(2) : "—"}
              </td>
              <td className="px-3 py-2"><ReasonChip reason={r.reason} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>
        {t("reconcile.footnote")}
      </p>
    </div>
  );
}
