import { useQuery } from "@tanstack/react-query";
import Layout from "../components/layout/Layout";
import BrigadirCard from "../components/ui/BrigadirCard";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import api from "../utils/api";

export default function Leaderboard() {
  const { params, ready } = useFilters();
  const { t } = useLang();

  const { data: brigadirs = [], isLoading: brigLoading } = useQuery({
    queryKey: ["brigadirs", params],
    queryFn: () => api.get("/api/brigadirs", { params }).then((r) => r.data),
    enabled: ready,
  });

  const top5   = [...brigadirs].sort((a, b) => (b.net_util || 0) - (a.net_util || 0)).slice(0, 5);
  const worst5 = [...brigadirs].sort((a, b) => (a.net_util || 0) - (b.net_util || 0)).slice(0, 5);

  return (
    <Layout title={t("leaderboard.subtitle")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
        {/* Top performers */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">{t("zagruzka.top5")}</div>
          {brigLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : top5.length ? (
            <div className="space-y-2">{top5.map((b) => <BrigadirCard key={b.manager_id} brigadir={b} />)}</div>
          ) : (
            <EmptyState title={t("zagruzka.noData")} message={t("zagruzka.noDataTopMsg")} />
          )}
        </div>

        {/* Needs attention */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">{t("zagruzka.worst5")}</div>
          {brigLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : worst5.length ? (
            <div className="space-y-2">{worst5.map((b) => <BrigadirCard key={b.manager_id} brigadir={b} />)}</div>
          ) : (
            <EmptyState title={t("zagruzka.noData")} message={t("zagruzka.noDataWorstMsg")} />
          )}
        </div>
      </div>
    </Layout>
  );
}
