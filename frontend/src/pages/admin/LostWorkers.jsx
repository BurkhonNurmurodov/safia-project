import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserX, AlertTriangle, Lock, FileQuestion, RotateCcw } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";

/**
 * «Yo'qolgan xodimlar» — workers an approved → supervisor exchange left on no
 * roster at all.
 *
 * READ-ONLY, and that is the point. Restoring one of these rows moves
 * historical numbers (загрузка, «came» counts, KPIs, the leaderboard all rise
 * on the day it is repaired), so the scope is measured and read FIRST; the
 * repair is a separate decision made against this list, not a button beside it.
 *
 * Each row says which of three states it is in, because they need three
 * different actions and lumping them together hides the only one an operator
 * can act on today:
 *   recoverable — the batch still holds the row; re-project the sender's day.
 *   day_blocked — it does, but the sender's day is closed and `_project` skips
 *                 a closed day, so it must be re-opened first.
 *   no_batch    — nothing left to re-project from; needs the original workbook.
 */

const STATES = ["recoverable", "day_blocked", "no_batch"];

// Column count — the skeleton and the empty row must span the header exactly.
const COLS = 9;

const STATE_META = {
  recoverable: { color: "#22c55e", Icon: RotateCcw },
  day_blocked: { color: "#eab308", Icon: Lock },
  no_batch:    { color: "#ef4444", Icon: FileQuestion },
};

function StateChip({ state, t }) {
  const m = STATE_META[state] || STATE_META.no_batch;
  const { Icon } = m;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55` }}
    >
      <Icon size={11} />
      {t(`lostWorkers.state.${state}`)}
    </span>
  );
}

function Stat({ label, value, tone, hint }) {
  return (
    <div
      className="rounded-2xl px-3 py-2.5 min-w-0"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums" style={{ color: tone || "var(--text-1)" }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-4)" }}>{hint}</div>
      )}
    </div>
  );
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function LostWorkers() {
  const { t } = useLang();
  const { tl } = useTranslit();

  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(180));
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [state,    setState]    = useState("all");
  const [search,   setSearch]   = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-exchange-audit", dateFrom, dateTo],
    queryFn: async () =>
      (await api.get("/api/admin/exchange-audit", { params: { from: dateFrom, to: dateTo } })).data,
    keepPreviousData: true,
  });

  const all = data?.rows || [];
  const sum = data?.summary || {};

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (state !== "all" && r.state !== state) return false;
      if (!q) return true;
      return [r.worker_name, r.sender_name, r.target_name, r.verifix_code, r.date]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [all, state, search]);

  const stateOpts = useMemo(
    () => [
      { value: "all", label: `${t("lostWorkers.filterAll")} (${all.length})` },
      ...STATES.map((s) => ({
        value: s,
        label: `${t(`lostWorkers.state.${s}`)} (${all.filter((r) => r.state === s).length})`,
      })),
    ],
    [all, t],
  );

  const hoursCell = (r) =>
    r.hours_worked != null ? Number(r.hours_worked).toFixed(2) : "—";

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
        {t("lostWorkers.intro")}
      </p>

      {isError && (
        <div
          className="rounded-2xl px-3 py-2.5 text-xs flex items-start gap-2"
          style={{ background: "#ef444414", border: "1px solid #ef444455", color: "#ef4444" }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error?.message || t("lostWorkers.loadFailed")}</span>
        </div>
      )}

      {isLoading ? (
        <SkeletonBlock className="h-24" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <Stat
            label={t("lostWorkers.statWorkers")}
            value={sum.workers ?? 0}
            tone={sum.workers ? "#ef4444" : undefined}
            hint={t("lostWorkers.statWorkersHint")
              .replace("{days}", sum.days ?? 0)
              .replace("{units}", sum.units ?? 0)}
          />
          <Stat label={t("lostWorkers.statHours")} value={(sum.hours ?? 0).toFixed(1)} />
          <Stat label={t("lostWorkers.state.recoverable")} value={sum.recoverable ?? 0} tone="#22c55e" />
          <Stat label={t("lostWorkers.state.day_blocked")} value={sum.day_blocked ?? 0} tone="#eab308" />
          <Stat label={t("lostWorkers.state.no_batch")} value={sum.no_batch ?? 0} tone="#ef4444" />
        </div>
      )}

      <TableCard
        icon={UserX}
        title={t("lostWorkers.title")}
        right={
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {rows.length} / {all.length}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2 w-full">
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              compactLabel
              triggerClassName="px-3 py-2 text-sm"
            />
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("lostWorkers.searchPh")}
              className="w-full sm:w-56"
            />
            <SegmentedToggle
              value={state}
              onChange={setState}
              options={stateOpts}
              size="md"
              scrollable
              className="ml-auto"
            />
          </div>
        }
        minWidth="1040px"
        mobileCards
        mobile={
          isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-8 text-center text-xs"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}
            >
              {t("lostWorkers.empty")}
            </div>
          ) : rows.map((r) => (
            <div
              key={`${r.date}-${r.worker_name}`}
              className="rounded-2xl px-3 py-3 space-y-2"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm font-semibold min-w-0 flex-1" style={{ color: "var(--text-1)" }}>
                  {r.worker_name}
                </span>
                <StateChip state={r.state} t={t} />
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                {r.date} · {r.verifix_code || "—"} · {tl(r.job_title || "") || "—"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {tl(r.sender_name || "")} → {tl(r.target_name || "")}
              </div>
              <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-4)" }}>
                <span>{r.clock_in_out || "—"}</span>
                <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
                  {hoursCell(r)} {t("lostWorkers.hoursUnit")}
                </span>
              </div>
            </div>
          ))
        }
      >
        <thead>
          <tr>
            <Th label={t("lostWorkers.colDate")} cls="w-28" />
            <Th label={t("lostWorkers.colWorker")} />
            <Th label={t("lostWorkers.colRole")} cls="w-36" />
            <Th label={t("lostWorkers.colCell")} cls="w-20" />
            <Th label={t("lostWorkers.colFrom")} cls="w-44" />
            <Th label={t("lostWorkers.colTo")} cls="w-44" />
            <Th label={t("lostWorkers.colClock")} cls="w-40" />
            <Th label={t("lostWorkers.colHours")} align="right" cls="w-24" />
            <Th label={t("lostWorkers.colState")} cls="w-40" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {Array.from({ length: COLS }).map((_, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-4" /></td>
                ))}
              </tr>
            ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={COLS} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>
                {t("lostWorkers.empty")}
              </td>
            </tr>
          )}
          {!isLoading && rows.map((r) => (
            <tr key={`${r.date}-${r.worker_name}`}>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.date}</td>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{r.worker_name}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(r.job_title || "") || "—"}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.verifix_code || "—"}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(r.sender_name || "")}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(r.target_name || "")}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{r.clock_in_out || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{hoursCell(r)}</td>
              <td className="px-3 py-2"><StateChip state={r.state} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>
        {t("lostWorkers.footnote")}
      </p>
    </div>
  );
}
