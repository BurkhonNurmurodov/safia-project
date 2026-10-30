import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { SkeletonBlock } from "../ui/Skeleton";

// The day's container totals for the whole scope (2026-10-30, the operator:
// «total number of each container type as a whole, not by supervisor or
// cells») — `GET /api/shift-report/containers`, Σ over every position of the
// count the «Pozitsiyalar» table's «soni» columns print. One tile per
// container; «—» where no position states a capacity.
const KEYS = ["yellow", "round", "grey", "bucket", "box"];
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));

export default function ContainerTotalsCard({ day, params, enabled = true }) {
  const { t } = useLang();
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
    </div>
  );
}
