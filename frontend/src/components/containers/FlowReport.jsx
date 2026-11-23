// «Konteyner berish» → «Hisobot»: the period's requests — how many, how fast
// logistics split them, what the brigadirs confirmed — day by day, and the
// Excel (docs/containers-flow.md). Every figure is the server's
// (`flow.requests_report`). The automatic batches' half of it went with
// «Partiyalar» on 2026-11-18. From 2026-11-19 «given» is the brigadirs' and
// the dispatch areas' together, split in its next two columns, and the
// dispatch areas have a table (and an Excel sheet) of their own.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, Gauge, PackageCheck, Timer } from "lucide-react";
import Button from "../ui/Button";
import DateRangePicker from "../ui/DateRangePicker";
import { FilterPanel } from "../ui/ColumnFilter";
import KPICard from "../ui/KPICard";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { exportXlsx } from "../../utils/exportXlsx";
import api from "../../utils/api";
import { fmt, errText, durText, onTimeTone, ALL_KEYS, prodToday } from "./flowUtil";
import { SendingTable, TogetherCard } from "./FlowSending";

const toDMY = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
// The requests' per-day table (the same columns the Excel's «Requests» sheet carries).
const RQ_COLS = ["requests", "asked", "given", "in_given", "send_given", "received", "missing", "late", "overdue", "short"];
const RQ_BAD = new Set(["missing", "late", "overdue", "short"]);
const rqVal = (d, c) => (c === "missing" ? d.sent_confirmed - d.received : d[c]);

export default function FlowReport({ t, toast, factory = null, plantSection = null }) {
  const today = prodToday();                // the production day, never the calendar date
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["cflow-report", from, to, factory],
    queryFn: () => api.get("/api/container-flow/report", {
      params: { date_from: from, date_to: to, ...(factory != null ? { factory } : {}) },
    }).then((r) => r.data),
  });
  const rq = q.data?.requests;
  const rs = rq?.summary;

  const excel = async () => {
    setBusy(true);
    try {
      const via = await exportXlsx("/api/container-flow/report.xlsx", {
        body: {
          date_from: from, date_to: to, factory,
          headers: { total: t("production.cont.total"),
            rq_day: t("cflow.rep.day"), ...Object.fromEntries(RQ_COLS.map((c) => [`rq_${c}`, t(`cflow.rq.col.${c}`)])),
            // the «Jo'natish» sheet
            snd_sheet: t("cflow.snd.tableTitle"), snd_area: t("cflow.sa.col.area"), snd_shift: t("cflow.sa.col.shift"),
            snd_need: t("cflow.snd.col.need"), snd_asked: t("cflow.snd.col.asked"), snd_given: t("cflow.snd.col.given"),
            snd_pct: t("cflow.snd.col.pct"), shift_1: t("cflow.sa.shift.1"), shift_2: t("cflow.sa.shift.2") },
          types: Object.fromEntries(ALL_KEYS.map((k) => [k, t(`production.cont.${k}`)])),
        },
        fallbackName: "containers.xlsx",
      });
      toast.success(t(via === "download" ? "staff.exportDownloaded" : "staff.exportToast"));
    } catch (e) {
      toast.error(errText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo} max={today} compactLabel />
        {plantSection && <FilterPanel sections={[plantSection]} />}
        {factory != null && <span className="text-xs" style={{ color: "var(--text-3)" }}>{t("cflow.an.scopePlant")}</span>}
        <Button size="lg" variant="secondary" icon={<FileSpreadsheet size={15} />} className="ml-auto" loading={busy}
          disabled={!rs?.requests} onClick={excel}>
          Excel
        </Button>
      </div>

      <RequestsReport t={t} loading={q.isLoading} rq={rq} />
      <TogetherCard t={t} s={rs} loading={q.isLoading} />
      <SendingTable t={t} x={q.data?.sending} loading={q.isLoading} />
    </div>
  );
}

// The requests side (AXO → logistics → brigadirs): how many, how fast they
// were opened and split, on time against the deadline, and what the brigadirs
// confirmed against what was sent. Every figure is `flow.requests_report`.
function RequestsReport({ t, loading, rq }) {
  const s = rq?.summary;
  const pct = (v) => (v == null ? "—" : `${v}%`);
  const mins = (v) => (v == null ? "—" : durText(t, v));
  const days = rq?.days ?? [];
  const reasons = Object.entries(rq?.reasons ?? {}).filter(([, n]) => n > 0);
  const recvPct = s && s.sent_confirmed ? Math.round((100 * s.received) / s.sent_confirmed) : null;
  const dash = loading ? "…" : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={ClipboardList} label={t("cflow.rq.count")} value={dash ?? fmt(s?.requests)}
          sub={s ? t("cflow.rq.countSub").replace("{a}", s.assigned).replace("{w}", s.waiting + s.overdue).replace("{c}", s.cancelled) : ""} />
        <KPICard icon={Gauge} label={t("cflow.rq.onTime")} value={dash ?? pct(s?.on_time_pct)}
          valueColor={onTimeTone(s?.on_time_pct) ? `var(--status-${onTimeTone(s.on_time_pct)})` : undefined}
          sub={s ? t("cflow.rq.onTimeSub").replace("{ok}", s.on_time).replace("{late}", s.late).replace("{over}", s.overdue) : ""} />
        <KPICard icon={Timer} label={t("cflow.rq.speed")} value={dash ?? mins(s?.avg_assign_min)}
          sub={s ? t("cflow.rq.speedSub").replace("{d}", mins(s.avg_seen_min)) : ""} />
        <KPICard icon={PackageCheck} label={t("cflow.rq.received")} value={dash ?? pct(recvPct)}
          sub={s ? t("cflow.rq.receivedSub").replace("{c}", s.confirmed).replace("{u}", s.units).replace("{m}", s.missing) : ""} />
      </div>
      <TableCard icon={ClipboardList} title={t("cflow.rq.title")} subtitle={t("cflow.rq.sub")} headSize="lg"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{days.length}</span>} maxHeight="none"
        footer={reasons.length ? (
          <div className="px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--text-3)" }}>
            <span>{t("cflow.rq.reasons")}</span>
            {reasons.map(([k, n]) => <span key={k} style={{ color: "var(--text-2)" }}>{t(`cflow.reason.${k}`)}: <b className="tabular-nums">{n}</b></span>)}
          </div>
        ) : null}>
        <thead>
          <tr>
            <Th label={t("cflow.rep.day")} />
            {RQ_COLS.map((c) => <Th key={c} label={t(`cflow.rq.col.${c}`)} align="right" hint={t(`cflow.rq.hint.${c}`)} />)}
          </tr>
        </thead>
        <tbody>
          {loading ? Array.from({ length: 3 }).map((_, i) => (
            <tr key={i}><td colSpan={RQ_COLS.length + 1} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : !days.length ? (
            <tr><td colSpan={RQ_COLS.length + 1} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.rq.none")}</td></tr>
          ) : (
            <>
              {days.map((d) => (
                <tr key={d.day} className="text-sm">
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{toDMY(d.day)}</td>
                  {RQ_COLS.map((c) => {
                    const v = rqVal(d, c);
                    return (
                      <td key={c} className="px-3 py-2 text-right tabular-nums"
                        style={{ color: RQ_BAD.has(c) && v > 0 ? "var(--status-bad)" : v ? "var(--text-1)" : "var(--text-4)" }}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {days.length > 1 && (
                <tr className="text-sm font-semibold" style={{ background: "var(--bg-inner)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{t("production.cont.total")}</td>
                  {RQ_COLS.map((c) => {
                    const v = c === "missing" ? s.missing : s[c];
                    return (
                      <td key={c} className="px-3 py-2 text-right tabular-nums"
                        style={{ color: RQ_BAD.has(c) && v > 0 ? "var(--status-bad)" : "var(--text-1)" }}>{fmt(v)}</td>
                    );
                  })}
                </tr>
              )}
            </>
          )}
        </tbody>
      </TableCard>
    </div>
  );
}
