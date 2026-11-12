import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { SkeletonBlock } from "../ui/Skeleton";
import { DAY, clock, hourLabel, tashkentNow, prevISO } from "../production/HourlyContainers";

// The hour-by-hour table under the tiles (2026-11-12, the operator) — shown to
// these roles only, as «Soatlik» on «Zagruzka fayli» (the server refuses the
// rest: `HOURLY_ROLES` in routers/shift_report.py).
const HOURLY_ROLES = ["admin", "shift-manager"];

// The day's container totals for the whole scope (2026-10-30, the operator:
// «total number of each container type as a whole, not by supervisor or
// cells») — `GET /api/shift-report/containers`, Σ over every position of the
// count the «Pozitsiyalar» table's «soni» columns print. One tile per
// container; «—» where no position states a capacity.
const KEYS = ["yellow", "round", "grey", "bucket", "box"];
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));

export default function ContainerTotalsCard({ day, params, enabled = true }) {
  const { t } = useLang();
  const { auth } = useAuth();
  const showHourly = HOURLY_ROLES.includes(auth?.role);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-daily-containers", day, params],
    queryFn: () => api.get("/api/shift-report/containers", { params: { ...params, day } }).then((r) => r.data),
    enabled: enabled && !!day,
    staleTime: 60_000,
  });
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Package size={16} style={{ color: "var(--brand-text)" }} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            {t("production.contTotals.title")}
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.contTotals.sub")}</div>
        </div>
      </div>
      {isError ? (
        <div className="text-sm" style={{ color: "var(--text-3)" }}>{t("production.contTotals.failed")}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {KEYS.map((k) => {
            const v = data?.totals?.[k];
            return (
              <div key={k} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <div className="text-[12px] leading-snug min-h-[2.5em]" style={{ color: "var(--text-3)" }}>{t(`production.cont.${k}`)}</div>
                {isLoading || !data ? (
                  <SkeletonBlock className="h-7 w-16 mt-1" />
                ) : (
                  <>
                    <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: v == null ? "var(--text-4)" : "var(--text-1)" }}>{fmt(v)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      {t("production.contTotals.lines").replace("{n}", String(data.lines?.[k] ?? 0))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showHourly && <HourlyTable day={day} params={params} enabled={enabled} t={t} />}
    </div>
  );
}

// Every hour of the day as a column, the five containers as rows: the scope's
// containers per clock hour (`GET /api/shift-report/containers-hourly`, the
// «Soatlik» timeline of every team summed). The NEXT hour is gold —
// «tayyorlang»: at 08:xx the 09–10 column; hours already over are dimmed.
function HourlyTable({ day, params, enabled, t }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-daily-containers-hourly", day, params],
    queryFn: () => api.get("/api/shift-report/containers-hourly", { params: { ...params, day } }).then((r) => r.data),
    enabled: enabled && !!day,
    staleTime: 60_000,
  });
  // Re-read the clock every minute so the gold column moves on by itself.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = tashkentNow();
  const nowMin = day === now.iso ? now.min : day === prevISO(now.iso) ? now.min + DAY : null;
  const prepHour = nowMin == null ? null : Math.floor(nowMin / 60) + 1;

  const head = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 mb-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
        <Clock size={13} style={{ color: "var(--brand-text)" }} />
        {t("production.contTotals.hourly")}
      </span>
      {prepHour != null && (
        <span className="text-[12px]" style={{ color: "var(--brand-text)" }}>
          {t("production.hourly.prepNow").replace("{at}", clock((prepHour - 1) * 60))
            .replace("{span}", `${clock(prepHour * 60)}–${clock((prepHour + 1) * 60)}`)}
        </span>
      )}
    </div>
  );
  if (isError) return <>{head}<div className="text-sm" style={{ color: "var(--text-3)" }}>{t("production.contTotals.failed")}</div></>;
  if (isLoading || !data) return <>{head}<SkeletonBlock className="h-40 w-full" /></>;
  const hours = data.hours ?? [];
  const untimed = data.untimed ?? {};
  const keys = (data.keys ?? KEYS).filter((k) => hours.some((x) => x.counts?.[k]) || untimed[k]);
  if (!hours.length || !keys.length) {
    return <>{head}<div className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.hourly.none")}</div></>;
  }
  const lo = hours[0].h, hi = hours[hours.length - 1].h;
  const byH = Object.fromEntries(hours.map((x) => [x.h, x.counts || {}]));
  const cols = [];
  for (let h = lo; h <= hi; h++) cols.push(h);
  const hasUntimed = keys.some((k) => untimed[k]);
  const past = (h) => nowMin != null && (h + 1) * 60 <= nowMin;
  const bg = (h) => (h === prepHour ? "rgba(200,151,63,0.16)" : "transparent");
  const cellBorder = { borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)" };
  return (
    <>
      {head}
      <div className="overflow-x-auto rounded-xl" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <table className="text-xs tabular-nums border-collapse w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] text-left font-medium px-3 py-2 whitespace-nowrap"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>{t("production.hourly.container")}</th>
              {cols.map((h) => (
                <th key={h} className="px-2 py-2 font-medium text-center whitespace-nowrap"
                  title={h === prepHour ? t("production.hourly.prepHint") : undefined}
                  style={{ background: bg(h), borderLeft: "1px solid var(--border)",
                    color: h === prepHour ? "var(--brand-text)" : past(h) ? "var(--text-4)" : "var(--text-2)" }}>
                  {hourLabel(h)}–{hourLabel(h + 1)}
                </th>
              ))}
              {hasUntimed && (
                <th className="px-2 py-2 font-medium text-center whitespace-nowrap" title={t("production.hourly.untimedHint")}
                  style={{ borderLeft: "1px solid var(--border)", color: "#eab308" }}>{t("production.hourly.untimed")}</th>
              )}
              <th className="px-3 py-2 font-semibold text-right whitespace-nowrap"
                style={{ borderLeft: "1px solid var(--border)", color: "var(--text-2)" }}>{t("production.cont.total")}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const total = cols.reduce((s, h) => s + (byH[h]?.[k] ?? 0), 0) + (untimed[k] ?? 0);
              return (
                <tr key={k}>
                  <td className="sticky left-0 z-[1] px-3 py-2 whitespace-nowrap max-w-[200px] truncate"
                    title={t(`production.cont.${k}`)}
                    style={{ background: "var(--bg-inner)", color: "var(--text-1)", borderTop: "1px solid var(--border)" }}>
                    {t(`production.cont.${k}`)}
                  </td>
                  {cols.map((h) => {
                    const n = byH[h]?.[k] ?? 0;
                    return (
                      <td key={h} className="px-2 py-2 text-center"
                        style={{ ...cellBorder, background: bg(h),
                          color: n ? (past(h) ? "var(--text-3)" : "var(--text-1)") : "var(--text-4)",
                          fontWeight: n && h === prepHour ? 700 : n ? 600 : 400 }}>
                        {n ? fmt(n) : "·"}
                      </td>
                    );
                  })}
                  {hasUntimed && (
                    <td className="px-2 py-2 text-center"
                      style={{ ...cellBorder, color: untimed[k] ? "#eab308" : "var(--text-4)" }}>
                      {untimed[k] ? fmt(untimed[k]) : "·"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-bold" style={{ ...cellBorder, color: "var(--text-1)" }}>{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{t("production.contTotals.hourlyHint")}</p>
    </>
  );
}
