import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { FulfilChip } from "../plan/planTable";
import { useTranslit } from "../../utils/transliterate";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";
import { useOT, fill, ratio, toneOf, fmtQty, ddmm, weekdayOf, hhmm, windowText, useGroupName } from "./ontimeUtil";

// One product, day by day and wave by wave — the working behind its row: what
// was ordered, what production posted inside the window, the sheet's on-time
// share, and when SAP recorded the production. Read-only.
export default function OntimeProductModal({ material, dateFrom, dateTo, onClose }) {
  const T = useOT();
  const { t } = useLang();
  const { tx } = useTranslit();
  const gn = useGroupName();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["ontime-product", material, dateFrom, dateTo],
    queryFn: () => api.get("/api/ontime/product", { params: { material, date_from: dateFrom, date_to: dateTo } }).then((r) => r.data),
    enabled: !!material,
    staleTime: 60_000,
  });

  const waves = Object.keys(data?.windows || {}).sort();
  const days = data?.days || [];
  let D = 0, C = 0;
  days.forEach((d) => Object.values(d.waves).forEach((v) => { D += v.D; C += v.covered; }));

  const posts = (d) => {
    const all = [...(d.posts || []), ...(d.posts_next || []).map(([s, q]) => [s + 86_400, q])];
    if (!all.length) return <span style={{ color: "var(--text-4)" }}>{T.pmPostsNone}</span>;
    const first = all[0][0], last = all[all.length - 1][0];
    const label = (s) => (s >= 86_400 ? `${hhmm(s - 86_400)}⁺¹` : hhmm(s));
    const list = all.map(([s, q]) => `${label(s)} · ${fmtQty(q)}`).join("\n");
    return (
      <span className="tabular-nums whitespace-nowrap" title={list}>
        {label(first)}{all.length > 1 ? `–${label(last)}` : ""}
        <span style={{ color: "var(--text-4)" }}> · {all.length}</span>
      </span>
    );
  };

  return (
    <Modal open onClose={onClose} icon={Package}
      title={data?.name ? tx(data.name) : material}
      subtitle={data ? fill(T.pmSub, { code: material, grp: gn(data.grp) || "—" }) : material}
      maxWidth="max-w-4xl"
      footer={<Button variant="secondary" size="md" onClick={onClose}>{T.close}</Button>}>
      {isPending ? (
        <SkeletonBlock className="h-48 rounded-xl" />
      ) : isError ? (
        <div className="text-sm text-center py-6" style={{ color: "var(--text-3)" }}>
          {T.loadError} <button type="button" className="underline" onClick={() => refetch()}>{T.retry}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-2">
              <FulfilChip r={ratio(C, D)} toneFn={toneOf} />
              {fill(T.pmTotal, { d: fmtQty(D), c: fmtQty(C), l: fmtQty(D - C) })}
            </span>
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="font-semibold uppercase tracking-wider mr-2">{T.pmWindows}</span>
            {waves.length
              ? waves.map((w) => `${fill(T.waveN, { n: w })} ${windowText(w, data.windows[w], T)}`).join(" · ")
              : T.pmNoWindows}
          </div>
          {!days.length ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-4)" }}>{T.pmEmpty}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
              <table className="w-full text-xs" style={{ minWidth: 220 + waves.length * 210 }}>
                <thead>
                  <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                    <th rowSpan={2} className="px-3 py-1.5 text-left font-semibold">{T.pmDay}</th>
                    {waves.map((w) => (
                      <th key={w} colSpan={3} className="px-3 py-1.5 text-center font-semibold" style={{ borderLeft: "1px solid var(--border)" }}>
                        {fill(T.waveN, { n: w })}
                      </th>
                    ))}
                    <th rowSpan={2} className="px-3 py-1.5 text-left font-semibold" style={{ borderLeft: "1px solid var(--border)" }} title={T.pmPostsHint}>{T.pmPosts}</th>
                  </tr>
                  <tr style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>
                    {waves.map((w) => [
                      <th key={`${w}o`} className="px-2 py-1 text-right font-medium" style={{ borderLeft: "1px solid var(--border)" }}>{T.pmOrdered}</th>,
                      <th key={`${w}i`} className="px-2 py-1 text-right font-medium">{T.pmInWindow}</th>,
                      <th key={`${w}p`} className="px-2 py-1 text-center font-medium">{T.pmPct}</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                        {ddmm(d.date)} <span style={{ color: "var(--text-4)" }}>{t(`cal.d${weekdayOf(d.date)}`)}</span>
                      </td>
                      {waves.map((w) => {
                        const v = d.waves[w];
                        if (!v || (v.D <= 0 && v.P <= 0)) {
                          return [
                            <td key={`${w}o`} className="px-2 py-1.5 text-right" style={{ borderLeft: "1px solid var(--border)", color: "var(--text-4)" }}>—</td>,
                            <td key={`${w}i`} className="px-2 py-1.5" />,
                            <td key={`${w}p`} className="px-2 py-1.5" />,
                          ];
                        }
                        return [
                          <td key={`${w}o`} className="px-2 py-1.5 text-right tabular-nums" style={{ borderLeft: "1px solid var(--border)" }}>{v.D > 0 ? fmtQty(v.D) : "—"}</td>,
                          <td key={`${w}i`} className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-2)" }}
                            title={v.H !== v.P ? `${fmtQty(v.P)} → ${fmtQty(v.H)}` : undefined}>{fmtQty(v.P)}</td>,
                          <td key={`${w}p`} className="px-2 py-1.5 text-center">{v.c == null ? <span style={{ color: "var(--text-4)" }}>—</span> : <FulfilChip r={v.c} toneFn={toneOf} />}</td>,
                        ];
                      })}
                      <td className="px-3 py-1.5" style={{ borderLeft: "1px solid var(--border)", color: "var(--text-2)" }}>{posts(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
