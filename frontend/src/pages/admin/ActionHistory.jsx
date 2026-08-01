import { useEffect, useState } from "react";
import { History, KeyRound } from "lucide-react";
import api from "../../utils/api";
import TableCard, { Th } from "../../components/ui/DataTable";
import Pagination from "../../components/ui/Pagination";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";

const PAGE_SIZE = 50;

/**
 * Admin «Action history» tab — the persistent register behind the grant-use
 * warning DMs: one row per action performed through a granted capability
 * (never native admin/role authority). Rows arrive pre-rendered for the
 * viewer's language from /admin/capability-uses, so this tab and the DMs
 * always read identically.
 */
export default function ActionHistory() {
  const { t, lang } = useLang();
  const [page, setPage] = usePersistentState("actions_page", 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // A restored page can outlive the register shrinking — clamp back to 1 when
  // the fetched total says it no longer exists.
  useEffect(() => {
    if (!data) return;
    const pages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
    if (page > pages) setPage(1);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.get("/admin/capability-uses", {
      params: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, lang },
    })
      .then(({ data }) => { if (!dead) setData(data); })
      .catch(() => { if (!dead) setData({ total: 0, rows: [] }); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [page, lang]);

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-3">
      <TableCard
        icon={History}
        title={t("admin.tabActions")}
        subtitle={t("caphist.subtitle")}
        right={
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {total.toLocaleString("ru-RU")}
          </span>
        }
        wrap
      >
        <thead>
          <tr>
            <Th label={t("caphist.when")} />
            <Th label={t("caphist.who")} />
            <Th label={t("caphist.permission")} />
            <Th label={t("caphist.action")} />
            <Th label={t("caphist.changes")} />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {t("caphist.empty")}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
                  {r.at}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.actor}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
                    {r.role} · {r.telegram_id}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="inline-flex items-center gap-1.5">
                    <KeyRound size={12} style={{ color: "var(--brand)" }} />
                    <span>{r.capability}</span>
                    {r.scope && (
                      <span className="text-[11px]" style={{ color: "var(--text-4)" }}>({r.scope})</span>
                    )}
                  </div>
                  {r.granted_by && (
                    <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
                      {t("caphist.grantedBy")} {r.granted_by}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.action}</div>
                  {r.details.map((d, i) => (
                    <div key={i} className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      <span style={{ color: "var(--text-4)" }}>{d.label}: </span>{d.value}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2">
                  {r.changes.length === 0 ? (
                    <span style={{ color: "var(--text-4)" }}>—</span>
                  ) : (
                    r.changes.map((c, i) => (
                      <div key={i} className="text-[11px]">
                        <span style={{ color: "var(--text-4)" }}>{c.field}: </span>
                        <span className="line-through" style={{ color: "var(--text-4)" }}>{c.old}</span>
                        <span style={{ color: "var(--text-4)" }}> → </span>
                        <span style={{ color: "var(--text-2)" }}>{c.new}</span>
                      </div>
                    ))
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
