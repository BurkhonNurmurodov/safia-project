import { BadgeCheck, GitCommitVertical, LayoutGrid, LogIn, LogOut, Repeat } from "lucide-react";
import TableCard, { SectionHead, Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { VerdictChip } from "../kpi/KpiBits";
import { useTranslit } from "../../utils/transliterate";
import { fill, fmtDate, Chip } from "./peopleUtil";

const ICON = { hire: LogIn, transfer: Repeat, rank: BadgeCheck, dismissed: LogOut };

/** «Karyera» — the HR journals' timeline and the cells the person stood in. */
export default function CareerTab({ data, P, ready }) {
  const { tx } = useTranslit();
  const c = ready ? data.career : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={GitCommitVertical} title={P.timeline} subtitle={P.timelineSub} />
        {!c ? (
          <div className="px-4 pb-4 space-y-3">{[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-14 w-full" />)}</div>
        ) : c.timeline.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-sm" style={{ color: "var(--text-3)" }}>{P.timelineEmpty}</p>
        ) : (
          <ol className="px-4 pb-4 pt-1">
            {c.timeline.map((e, i) => {
              const Icon = ICON[e.kind] || GitCommitVertical;
              const last = i === c.timeline.length - 1;
              // The unit's own name usually starts with its code («4311 Оф.…»).
              const place = e.unit ? (e.code && !String(e.unit).startsWith(e.code) ? `${e.code} · ${tx(e.unit)}` : tx(e.unit)) : e.code;
              return (
                <li key={`${e.kind}-${e.date}-${i}`} className="pc-row relative flex gap-3 pb-5 last:pb-1" style={{ "--d": `${Math.min(i, 10) * 40}ms` }}>
                  {!last && <span aria-hidden="true" className="absolute left-[15px] top-9 bottom-1 w-px" style={{ background: "var(--border-md)" }} />}
                  <span className="relative z-[1] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: i === 0 ? "rgba(var(--brand-rgb),.14)" : "var(--bg-inner)", color: i === 0 ? "var(--brand-text)" : "var(--text-2)" }}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{P.k[e.kind] || e.kind}</span>
                      {e.cancelled && <Chip>{P.evCancelled}</Chip>}
                      <span className="ml-auto flex-shrink-0 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDate(e.date)}</span>
                    </div>
                    {e.kind === "rank" ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
                        <b style={{ color: "var(--text-1)" }}>{tx(e.rank)}</b>
                        {e.expected && (
                          <>
                            <span style={{ color: "var(--text-3)" }}>{fill(P.expectedAt, { t: e.tenure, e: tx(e.expected) })}</span>
                            <VerdictChip counted={e.verdict !== "no_ladder"} compliant={e.verdict === "ok" || e.verdict === "above"}>
                              {P.verdict[e.verdict] || e.verdict}
                            </VerdictChip>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="mt-0.5 text-xs truncate" style={{ color: "var(--text-3)" }}>
                          {[e.job ? tx(e.job) : null, place || null].filter(Boolean).join(" · ") || "—"}
                        </div>
                        {/* A hiring or transfer line names the category it put
                            the person in — often the change the hero reads. */}
                        {e.rank && (
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>
                            {P.category}: <b style={{ color: "var(--text-1)" }}>{tx(e.rank)}</b>
                          </div>
                        )}
                      </>
                    )}
                    {e.until && <div className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>{fill(P.until, { d: fmtDate(e.until) })}</div>}
                    {e.reason && <div className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>{fill(P.reason, { r: tx(e.reason) })}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <TableCard icon={LayoutGrid} title={P.runs} subtitle={P.runsSub}>
        <thead>
          <tr>
            <Th label={P.cell} />
            <Th label={P.colFrom} />
            <Th label={P.colTo} />
            <Th label={P.colDays} align="right" />
          </tr>
        </thead>
        <tbody>
          {!c ? (
            [...Array(3)].map((_, i) => <tr key={i}><td colSpan={4} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>)
          ) : c.runs.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{P.runsEmpty}</td></tr>
          ) : c.runs.map((r) => (
            <tr key={`${r.code}-${r.from}`}>
              <td className="px-3 py-2 font-semibold tabular-nums">{r.code}</td>
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.from)}</td>
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.to)}</td>
              <td className="px-3 py-2 tabular-nums text-right">{r.days}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
