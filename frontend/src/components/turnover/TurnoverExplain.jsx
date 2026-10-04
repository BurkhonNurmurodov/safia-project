// «Kadrlar qo'nimsizligi» — WHY a leader's (or a cell's) figure is what it is:
// the cells it is made of, the division with the real numbers, the band it
// lands in, the KPI points, then every person who left and every person who
// was counted as working. Nothing is computed here that the server did not
// send — the working lists are asked for only when the dialog opens.
import { useQuery } from "@tanstack/react-query";
import { Calculator, UserMinus, Users } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { fill } from "../../pages/turnoverText";
import { dmy, n0, pct1, pts, scoreTone, tenure, toneInk, weightPct } from "./turnoverUtil";
import { BandScale, ScoreChip } from "./TurnoverBits";

function Section({ icon: Icon, title, count, caption, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          {title}{count != null && <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}> · {count}</span>}
        </h3>
      </div>
      {caption && <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{caption}</p>}
      {children}
    </section>
  );
}

export default function TurnoverExplain({ open, onClose, item, kind, data, T, tl, tx, title, subtitle }) {
  const cells = kind === "leader"
    ? item.cells
    : [{ key: item.key, id: item.id, code: item.code, working: item.working, left: item.left }];
  const keys = cells.map((c) => c.key);
  const rule = data.rule;
  const w = weightPct(rule);
  const many = cells.length > 1;
  const working = item.working;
  const left = item.left;
  const rate = item.rate;
  const score = item.score ?? null;
  const points = kind === "leader" ? item.points : null;
  const provisional = data.state === "open";

  const peopleQ = useQuery({
    queryKey: ["turnover-people", data.month, keys.join(",")],
    queryFn: () => api.get("/api/turnover/people", { params: { month: data.month, keys: keys.join(",") } })
      .then((r) => r.data),
    enabled: open && keys.length > 0,
    staleTime: 60_000,
  });
  const leavers = (data.leavers || []).filter((l) => keys.includes(l.cell_key));
  const workingBy = peopleQ.data?.working || {};
  const codeOf = Object.fromEntries(cells.map((c) => [c.key, c]));

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-2xl"
      icon={<Calculator size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-6"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      {/* 1 — the arithmetic, with the real numbers in it */}
      <Section icon={Calculator} title={T.exCalc}>
        <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
          <div className="space-y-1.5">
            {cells.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                <CellLink id={c.id} className="font-semibold tabular-nums">{c.code}</CellLink>
                <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
                  {fill(T.exWorkingLeft, { w: n0(c.working), l: n0(c.left) })}
                </span>
              </div>
            ))}
            {many && (
              <div className="flex items-center justify-between gap-3 text-sm pt-1.5"
                style={{ borderTop: "1px solid var(--border)" }}>
                <span className="font-semibold" style={{ color: "var(--text-1)" }}>{T.exTotal}</span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                  {fill(T.exWorkingLeft, { w: n0(working), l: n0(left) })}
                </span>
              </div>
            )}
          </div>
          {rate == null ? (
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{T.exNoWorking}</p>
          ) : (
            <>
              <div className="text-base font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                {n0(left)} ÷ {n0(working)} × {rule?.multiplier ?? 12} ={" "}
                <span style={{ color: toneInk(scoreTone(score)) }}>{pct1(rate)}</span>
              </div>
              <BandScale rule={rule} rate={rate} T={T} />
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                <ScoreChip score={score} size="sm" />
                <span className="tabular-nums">{fill(T.exScore, { rate: pct1(rate), score })}</span>
                {kind === "leader" && points != null && (
                  <span className="tabular-nums">· {fill(T.exPoints, { score, w, p: pts(points) })}</span>
                )}
              </div>
            </>
          )}
          {provisional && (
            <p className="text-xs" style={{ color: "var(--status-warn)" }}>{T.provisional}</p>
          )}
        </div>
      </Section>

      {/* 2 — who left */}
      <Section icon={UserMinus} title={T.exLeftList} count={n0(leavers.length)} caption={T.exWhyLeft}>
        {leavers.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.exNone}</p>
        ) : (
          <ul className="divide-y rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
            {leavers.map((l) => (
              <li key={l.key} className="px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium" style={{ color: "var(--text-1)" }}>{tl(l.name)}</span>
                  <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(l.left)}</span>
                </div>
                <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
                  {many && <span className="tabular-nums">{l.code}</span>}
                  {l.job && <span>{tx(l.job)}</span>}
                  <span>{T.colTenure}: {tenure(l.days, T)}</span>
                  {l.reason && <span style={{ color: "var(--text-2)" }}>{tx(l.reason)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 3 — who was counted as working */}
      <Section icon={Users} title={T.exWorkingList} count={n0(working)}
        caption={`${T.exWhyWorking} ${fill(T.exWorkingAt, { date: dmy(data.as_of) })}`}>
        {peopleQ.isLoading ? (
          <div className="space-y-1.5">{[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-8 rounded-lg" />)}</div>
        ) : peopleQ.isError ? (
          <p className="text-sm" style={{ color: "var(--status-bad)" }}>{T.exLoadFail}</p>
        ) : working === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.exNone}</p>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => {
              const list = workingBy[k] || [];
              if (!list.length) return null;
              return (
                <div key={k}>
                  {many && (
                    <div className="text-xs font-semibold mb-1 tabular-nums" style={{ color: "var(--text-2)" }}>
                      {codeOf[k]?.code} · {n0(list.length)}
                    </div>
                  )}
                  <ol className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {list.map((p, i) => (
                      <li key={`${p.name}-${i}`} className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="truncate" style={{ color: "var(--text-1)" }} title={tl(p.name)}>{tl(p.name)}</span>
                        <span className="text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
                          {p.job ? tx(p.job) : dmy(p.hired)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </Modal>
  );
}
