// «Konteyner berish» → «Hisobot»: need → issued → delivered → accepted for a
// period, the three gaps with their owner, and on-time read from the DELIVERY
// (docs/containers-flow.md). Every figure is the server's (`flow.report`).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList, FileSpreadsheet, Gauge, Package, PackageCheck, Scale, Timer, Truck, UsersRound,
} from "lucide-react";
import Button from "../ui/Button";
import DateRangePicker from "../ui/DateRangePicker";
import KPICard from "../ui/KPICard";
import Pagination from "../ui/Pagination";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { tashkentNow } from "../production/HourlyContainers";
import { exportXlsx } from "../../utils/exportXlsx";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { ontimeTone } from "../../utils/statusBands";
import { fmt, errText, durText } from "./flowUtil";

const PAGE = 50;
const COLS = ["need", "issued", "delivered", "accepted", "gap_axo", "gap_logistics", "gap_dispute", "surplus"];
const GAPS = new Set(["gap_axo", "gap_logistics", "gap_dispute"]);
const toDMY = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
// The requests' per-day table (the same columns the Excel's «Requests» sheet carries).
const RQ_COLS = ["requests", "asked", "given", "received", "missing", "late", "overdue", "short"];
const RQ_BAD = new Set(["missing", "late", "overdue", "short"]);
const rqVal = (d, c) => (c === "missing" ? d.sent_confirmed - d.received : d[c]);

export default function FlowReport({ t, toast }) {
  const { tl } = useTranslit();
  const today = tashkentNow().iso;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPage(1); }, [from, to]);
  const q = useQuery({
    queryKey: ["cflow-report", from, to],
    queryFn: () => api.get("/api/container-flow/report", { params: { date_from: from, date_to: to } }).then((r) => r.data),
  });
  const rows = q.data?.rows ?? [];
  const rq = q.data?.requests;
  const rs = rq?.summary;
  const s = q.data?.summary;
  const tot = q.data?.totals;
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const pct = (v) => (v == null ? "—" : `${v}%`);

  const excel = async () => {
    setBusy(true);
    try {
      const via = await exportXlsx("/api/container-flow/report.xlsx", {
        body: {
          date_from: from, date_to: to,
          headers: { day: t("cflow.rep.day"), unit: t("containers.brigadir"), ctype: t("cflow.rep.type"), total: t("production.cont.total"),
            ...Object.fromEntries(COLS.map((c) => [c, t(`cflow.col.${c}`)])),
            rq_day: t("cflow.rep.day"), ...Object.fromEntries(RQ_COLS.map((c) => [`rq_${c}`, t(`cflow.rq.col.${c}`)])) },
          types: Object.fromEntries(["yellow", "round", "grey", "bucket", "box"].map((k) => [k, t(`production.cont.${k}`)])),
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
        <Button size="lg" variant="secondary" icon={<FileSpreadsheet size={15} />} className="ml-auto" loading={busy}
          disabled={!rows.length && !rs?.requests} onClick={excel}>
          Excel
        </Button>
      </div>

      <GroupLabel>{t("cflow.rq.group")}</GroupLabel>
      <RequestsReport t={t} loading={q.isLoading} rq={rq} />

      <GroupLabel>{t("cflow.rep.group")}</GroupLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={Gauge} label={t("cflow.rep.onTime")} value={q.isLoading ? "…" : pct(s?.on_time_pct)}
          sub={s ? t("cflow.rep.onTimeSub").replace("{ok}", s.on_time).replace("{late}", s.late).replace("{over}", s.overdue) : ""} />
        <KPICard icon={PackageCheck} label={t("cflow.rep.issuedOnTime")} value={q.isLoading ? "…" : pct(s?.issued_on_time_pct)}
          sub={t("cflow.rep.issuedOnTimeSub")} />
        <KPICard icon={Package} label={t("cflow.rep.batches")} value={q.isLoading ? "…" : fmt(s?.batches)}
          sub={s ? t("cflow.rep.batchesSub").replace("{topup}", s.topup).replace("{manual}", s.manual).replace("{forced}", s.forced) : ""} />
        <KPICard icon={Scale} label={t("cflow.rep.gaps")}
          value={q.isLoading ? "…" : fmt((tot?.gap_axo ?? 0) + (tot?.gap_logistics ?? 0) + (tot?.gap_dispute ?? 0))}
          sub={tot ? `AXO ${fmt(tot.gap_axo)} · ${t("cflow.tab.logistics")} ${fmt(tot.gap_logistics)} · ${t("cflow.rep.dispute")} ${fmt(tot.gap_dispute)}` : ""} />
      </div>

      <TableCard icon={Truck} title={t("cflow.rep.title")} subtitle={t("cflow.rep.sub")} headSize="lg"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length}</span>} maxHeight="none">
        <thead>
          <tr>
            <Th label={t("cflow.rep.day")} /><Th label={t("containers.brigadir")} icon={UsersRound} /><Th label={t("cflow.rep.type")} />
            {COLS.map((c) => <Th key={c} label={t(`cflow.col.${c}`)} align="right" hint={GAPS.has(c) ? t(`cflow.colHint.${c}`) : undefined} />)}
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}><td colSpan={COLS.length + 3} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : !rows.length ? (
            <tr><td colSpan={COLS.length + 3} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.rep.none")}</td></tr>
          ) : (
            <>
              {shown.map((r) => (
                <tr key={`${r.day}|${r.manager_id}|${r.ctype}`} className="text-sm">
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{toDMY(r.day)}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }}>{tl(r.unit) || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{t(`production.cont.${r.ctype}`)}</td>
                  {COLS.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums"
                      style={{ color: GAPS.has(c) && r[c] > 0 ? "var(--status-bad)" : r[c] ? "var(--text-1)" : "var(--text-4)" }}>
                      {fmt(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="text-sm font-semibold" style={{ background: "var(--bg-inner)" }}>
                <td className="px-3 py-2" colSpan={3} style={{ color: "var(--text-1)" }}>{t("production.cont.total")}</td>
                {COLS.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums"
                    style={{ color: GAPS.has(c) && tot[c] > 0 ? "var(--status-bad)" : "var(--text-1)" }}>
                    {fmt(tot[c])}
                  </td>
                ))}
              </tr>
            </>
          )}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={Math.ceil(rows.length / PAGE)} total={rows.length} pageSize={PAGE} onPage={setPage} />
    </div>
  );
}

// The report holds two flows; each opens under its own caption.
function GroupLabel({ children }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider -mb-1 mt-1" style={{ color: "var(--text-3)" }}>{children}</h3>
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
          valueColor={ontimeTone(s?.on_time_pct) ? `var(--status-${ontimeTone(s.on_time_pct)})` : undefined}
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
