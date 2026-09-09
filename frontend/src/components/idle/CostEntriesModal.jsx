import { useQuery } from "@tanstack/react-query";
import { ListTree } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonCard } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useFactory } from "../../context/FactoryContext";
import api from "../../utils/api";

/**
 * Every event behind one (cell, category) cell of the cost tree.
 *
 * Each row is priced on its OWN minutes, which is what somebody checking a
 * figure expects to be able to add up. Where two events of this category
 * overlap, that sum exceeds the UNION the table row shows — so both totals are
 * printed and named whenever they differ, rather than one being shown and the
 * other discovered. Same rule `UnitOjidaniyaModal` follows for its own two
 * totals.
 *
 * No export in the footer, deliberately: the tab's own «Excel» one level up is
 * the file for this register, and a second file offering one row's slice of it
 * is a second answer to «what did the cells file».
 */
export default function CostEntriesModal({ open, onClose, ctx, from, to, money }) {
  const { t } = useLang();
  const tp = (k, vars) => Object.entries(vars || {}).reduce(
    (out, [a, b]) => out.split(`{${a}}`).join(String(b)), t(k));
  const { factory } = useFactory();

  const params = ctx ? {
    manager_id: ctx.managerId, cell_id: ctx.cellId, category: ctx.category,
    date_from: from, date_to: to, ...(factory == null ? {} : { factory }),
  } : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["downtime-cost-entries", params],
    queryFn: () => api.get("/api/downtime/cost/entries", { params }).then((r) => r.data),
    enabled: !!(open && params),
  });

  const rows = data?.entries || [];
  const sum = data?.sum_minutes ?? 0;
  const union = data?.union_minutes ?? 0;
  const overlapped = sum > union;
  const num = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("ru-RU",
    { minimumFractionDigits: d, maximumFractionDigits: d }));
  const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");

  const th = "px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-left whitespace-nowrap";
  const td = "px-3 py-2 text-[13px] border-t";

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<ListTree size={16} />}
      title={ctx ? `${ctx.category} · ${ctx.catLabel || ""}`.trim() : ""}
      subtitle={ctx ? [ctx.code, ctx.leader, `${dmy(from)} — ${dmy(to)}`,
                       ctx.hc == null ? t("downtime.cost.noHc") : `~${num(ctx.hc, 1)} ${t("downtime.cost.people")}`]
                      .filter(Boolean).join(" · ") : ""}
      maxWidth="max-w-3xl"
      zIndex={60}
      bodyClassName="p-0"
      footer={<><div className="flex-1" /><Button variant="secondary" size="md" onClick={onClose}>{t("downtime.cost.close")}</Button></>}
    >
      <p className="px-4 py-2.5 text-[12px] border-b"
         style={{ background: "var(--bg-inner)", borderColor: "var(--border)", color: "var(--text-3)" }}>
        {t("downtime.cost.entriesNote")}
      </p>

      {isLoading ? (
        <div className="p-4"><SkeletonCard /></div>
      ) : isError ? (
        <p className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
          {t("common.loadFailed")}
        </p>
      ) : !rows.length ? (
        <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
          {t("downtime.cost.noEntries")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 660 }}>
            <thead>
              <tr style={{ background: "var(--bg-inner)" }}>
                <th className={th} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colDate")}</th>
                <th className={th} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colClock")}</th>
                <th className={`${th} text-right`} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colMin")}</th>
                <th className={`${th} text-right`} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colHrs")}</th>
                <th className={`${th} text-right`} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colHc")}</th>
                <th className={`${th} text-right`} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colCost")}</th>
                <th className={th} style={{ color: "var(--text-3)" }}>{t("idleCell.colNote")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--hover-bg)]">
                  <td className={`${td} tabular-nums whitespace-nowrap`} style={{ borderColor: "var(--border)" }}>{dmy(r.date)}</td>
                  <td className={`${td} tabular-nums whitespace-nowrap`} style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    {r.start} — {r.end}
                  </td>
                  <td className={`${td} text-right tabular-nums`} style={{ borderColor: "var(--border)" }}>{num(r.minutes)}</td>
                  <td className={`${td} text-right tabular-nums`} style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>{num(r.hours, 1)}</td>
                  <td className={`${td} text-right tabular-nums`} style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    {r.hc == null ? <span style={{ color: "var(--text-4)" }}>—</span> : `~${num(r.hc, 1)}`}
                  </td>
                  <td className={`${td} text-right tabular-nums font-semibold`} style={{ borderColor: "var(--border)" }}>
                    {r.cost == null ? <span style={{ color: "var(--text-4)", fontWeight: 400 }}>—</span> : money(r.cost)}
                  </td>
                  <td className={td} style={{ borderColor: "var(--border)", color: "var(--text-3)", minWidth: 200 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg-inner)" }}>
                <td className={`${td} font-semibold`} colSpan={2} style={{ borderColor: "var(--border-md)" }}>
                  {t("downtime.cost.total")} · {rows.length}
                </td>
                <td className={`${td} text-right tabular-nums font-semibold`} style={{ borderColor: "var(--border-md)" }}>{num(sum)}</td>
                <td className={`${td} text-right tabular-nums font-semibold`} style={{ borderColor: "var(--border-md)" }}>{num(sum / 60, 1)}</td>
                <td className={td} style={{ borderColor: "var(--border-md)" }} />
                <td className={`${td} text-right tabular-nums font-semibold`} style={{ borderColor: "var(--border-md)" }}>
                  {rows.some((r) => r.cost == null) ? "—"
                    : money(rows.reduce((a, r) => a + (r.cost || 0), 0))}
                </td>
                <td className={td} style={{ borderColor: "var(--border-md)" }} />
              </tr>
            </tfoot>
          </table>
          {/* Only where the two genuinely differ — otherwise it is noise on
              every row of a register that mostly does not overlap. */}
          {overlapped && (
            <p className="px-4 py-2.5 text-[12px] border-t"
               style={{ background: "var(--bg-inner)", borderColor: "var(--border)", color: "var(--text-3)" }}>
              {tp("downtime.cost.entriesOverlap", { sum: num(sum), union: num(union) })}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
