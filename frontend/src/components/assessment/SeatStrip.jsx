import { Check, X, LogOut, UserRound } from "lucide-react";
import Button from "../ui/Button";
import { useTranslit } from "../../utils/transliterate";
import { useAT, fill, DEPT_ICON, VERDICT } from "./assessmentUtil";

/**
 * The panel: five department seats, live. Each says who sits there and how
 * far their scorecard is — never a verdict (the panel stays independent). A
 * free seat is claimable; the viewer's own unsubmitted seat can be left; an
 * admin can free anybody's unsubmitted seat.
 */
export default function SeatStrip({ seats, total, rights, mine, onClaim, onLeave, onRelease, busyDept }) {
  const T = useAT();
  const { tl } = useTranslit();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {seats.map((s) => {
        const Icon = DEPT_ICON[s.department];
        const dept = T.dept[s.department];
        const free = !s.judge_name;
        const pct = total ? Math.round((s.graded / total) * 100) : 0;
        const ring = s.mine
          ? { border: "1.5px solid var(--brand)", background: "rgba(var(--brand-rgb),0.06)" }
          : free
            ? { border: "1px dashed var(--border)", background: "transparent" }
            : { border: "1px solid var(--border)", background: "var(--bg-card)" };
        return (
          <div key={s.department} className="rounded-xl p-3 flex flex-col gap-2 min-w-0" style={ring}>
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon size={14} style={{ color: "var(--text-2)" }} aria-hidden="true" />
              <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>{dept}</span>
              {s.mine ? (
                <span className="ml-auto rounded-md px-1.5 py-[1px] text-[10px] font-semibold"
                  style={{ background: "var(--brand)", color: "var(--on-brand)" }}>{T.seatYou}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 text-xs" style={{ color: free ? "var(--text-3)" : "var(--text-1)" }}>
              <UserRound size={12} aria-hidden="true" style={{ color: "var(--text-3)" }} />
              <span className="truncate" title={s.judge_name ? tl(s.judge_name) : undefined}>
                {s.judge_name ? tl(s.judge_name) : T.seatFree}
              </span>
            </div>
            {!free && (
              <div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: s.submitted ? VERDICT.pass.hex : "var(--brand)" }} />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                  {fill(T.seatProgress, { g: s.graded, t: total })}
                  {s.submitted && (
                    <span className="ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-[1px] text-[10px] font-semibold"
                      style={{ background: "rgba(34,197,94,0.14)", color: VERDICT.pass.ink }}>
                      <Check size={10} strokeWidth={3} aria-hidden="true" />{T.seatSubmitted}
                    </span>
                  )}
                </div>
              </div>
            )}
            {free && rights.claim && (
              <Button size="sm" variant={mine ? "secondary" : "primary"} loading={busyDept === s.department}
                onClick={() => onClaim(s)} className="mt-auto">
                {mine ? T.moveHere : T.takeSeat}
              </Button>
            )}
            {s.mine && !s.submitted && rights.grade && (
              <Button size="sm" variant="ghost" icon={LogOut} onClick={() => onLeave(s)} className="mt-auto"
                title={T.leaveSeat} aria-label={T.leaveSeat}>
                {T.leave}
              </Button>
            )}
            {!s.mine && !free && !s.submitted && rights.release_any && (
              <Button size="sm" variant="danger" tint icon={X} onClick={() => onRelease(s)} className="mt-auto"
                aria-label={`${T.releaseTip} · ${dept}`}>
                {T.release}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
