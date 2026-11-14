// «Konteyner berish» → «Hisobot»: need → issued → delivered → accepted for a
// period, the three gaps with their owner, and on-time read from the DELIVERY
// (docs/containers-flow.md). Every figure is the server's (`flow.report`).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Gauge, Package, PackageCheck, Scale, Truck, UsersRound } from "lucide-react";
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
import { fmt, errText } from "./flowUtil";

const PAGE = 50;
const COLS = ["need", "issued", "delivered", "accepted", "gap_axo", "gap_logistics", "gap_dispute", "surplus"];
const GAPS = new Set(["gap_axo", "gap_logistics", "gap_dispute"]);
const toDMY = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

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
            ...Object.fromEntries(COLS.map((c) => [c, t(`cflow.col.${c}`)])) },
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
          disabled={!rows.length} onClick={excel}>
          Excel
        </Button>
      </div>

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
