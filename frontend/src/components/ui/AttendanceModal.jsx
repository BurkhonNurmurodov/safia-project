import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import api from "../../utils/api";
import { useFilters } from "../../context/FilterContext";
import { fmtTime } from "../../utils/formatters";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

// Single-date mode:  { managerId, date, managerName, onClose }
// Date-range mode:   { managerId, dateFrom, dateTo, managerName, onClose }
export default function AttendanceModal({ managerId, date, dateFrom, dateTo, managerName, onClose }) {
  const { unit } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [nameAsc, setNameAsc] = useState(true);

  const isRange = !date && (dateFrom || dateTo);
  // A "range" spanning a single day (dateFrom === dateTo) has no meaningful days-present count.
  const isSingleDay = isRange && (!dateFrom || !dateTo || dateFrom === dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", managerId, date, dateFrom, dateTo],
    queryFn: () => {
      const params = { manager_id: managerId };
      if (date)     params.date      = date;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      return api.get("/api/attendance", { params }).then((r) => r.data);
    },
    enabled: !!managerId && !!(date || dateFrom || dateTo),
  });

  function fmtDateLabel(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  const subtitle = isRange
    ? (dateFrom && dateTo && dateFrom !== dateTo
        ? `${fmtDateLabel(dateFrom)} – ${fmtDateLabel(dateTo)}`
        : fmtDateLabel(dateFrom || dateTo))
    : date;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="font-semibold" style={{ color: "var(--text-1)" }}>{tl(managerName)}</div>
            <div className="text-xs" style={{ color: "var(--text-3)" }}>
              {subtitle} — {isRange ? t("attendance.uniqueWorkers") : t("attendance.title")}
            </div>
          </div>
          <button onClick={onClose} className="transition-colors hover:text-red-400" style={{ color: "var(--text-3)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="overflow-auto p-4">
          {isLoading ? (
            <div className="text-sm text-center py-8" style={{ color: "var(--text-3)" }}>{t("attendance.loading")}</div>
          ) : !data?.length ? (
            <div className="text-sm text-center py-8" style={{ color: "var(--text-3)" }}>{t("attendance.noData")}</div>
          ) : isRange ? (
            // Range mode: unique workers with days-present count
            (() => {
              const displayData = nameAsc !== null
                ? [...data].sort((a, b) => nameAsc
                    ? (tl(a.worker_name) || "").localeCompare(tl(b.worker_name) || "")
                    : (tl(b.worker_name) || "").localeCompare(tl(a.worker_name) || ""))
                : data;
              return (
                <>
                  <div className="text-xs mb-3" style={{ color: "var(--text-3)" }}>
                    {data.length} {t("attendance.uniqueWorkerCount")}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
                        <th className="text-left py-2 pr-3 cursor-pointer select-none" onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}>
                          <span className="inline-flex items-center gap-1">
                            {t("attendance.worker")}
                            {nameAsc === null ? <ChevronsUpDown size={9} style={{opacity:.4}}/> : nameAsc ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                          </span>
                        </th>
                        <th className="text-left py-2 pr-3">{t("attendance.role")}</th>
                        {!isSingleDay && <th className="text-right py-2">{t("attendance.daysPresent")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map((r) => (
                        <tr key={r.worker_name} style={{ borderBottom: "1px solid var(--border)" }}
                          className="hover:opacity-80">
                          <td className="py-2 pr-3" style={{ color: "var(--text-1)" }}>{tl(r.worker_name) || "—"}</td>
                          <td className="py-2 pr-3" style={{ color: "var(--text-2)" }}>{tl(r.job_title) || "—"}</td>
                          {!isSingleDay && <td className="py-2 text-right font-mono" style={{ color: "var(--text-2)" }}>{r.days_present}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()
          ) : (
            // Single-date mode: full per-row details
            (() => {
              const displayData = nameAsc !== null
                ? [...data].sort((a, b) => nameAsc
                    ? (tl(a.worker_name) || "").localeCompare(tl(b.worker_name) || "")
                    : (tl(b.worker_name) || "").localeCompare(tl(a.worker_name) || ""))
                : data;
              return (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
                      <th className="text-left py-2 pr-3 cursor-pointer select-none" onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}>
                        <span className="inline-flex items-center gap-1">
                          {t("attendance.worker")}
                          {nameAsc === null ? <ChevronsUpDown size={9} style={{opacity:.4}}/> : nameAsc ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                        </span>
                      </th>
                      <th className="text-left py-2 pr-3">{t("attendance.role")}</th>
                      <th className="text-left py-2 pr-3">{t("attendance.schedule")}</th>
                      <th className="text-left py-2 pr-3">{t("attendance.clockInOut")}</th>
                      <th className="text-right py-2 pr-3">{t("attendance.hoursWorked")}</th>
                      <th className="text-right py-2 pr-3">{t("attendance.earlyArrival")}</th>
                      <th className="text-right py-2">{t("attendance.effHours")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayData.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}
                        className="hover:opacity-80">
                        <td className="py-2 pr-3" style={{ color: "var(--text-1)" }}>{tl(r.worker_name) || "—"}</td>
                        <td className="py-2 pr-3" style={{ color: "var(--text-2)" }}>{tl(r.job_title) || "—"}</td>
                        <td className="py-2 pr-3" style={{ color: "var(--text-2)" }}>{r.schedule || "—"}</td>
                        <td className="py-2 pr-3" style={{ color: "var(--text-2)" }}>{r.clock_in_out || "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono" style={{ color: "var(--text-1)" }}>
                          {fmtTime(r.hours_worked ? r.hours_worked * 60 : null, unit)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono" style={{ color: "var(--text-1)" }}>
                          {r.early_arrival_min !== null ? `${r.early_arrival_min} min` : "—"}
                        </td>
                        <td className="py-2 text-right font-mono" style={{ color: "var(--text-1)" }}>
                          {fmtTime(r.effective_hours ? r.effective_hours * 60 : null, unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
