import { Check, LogOut, PencilLine, X } from "lucide-react";
import Button from "../ui/Button";
import { useTranslit } from "../../utils/transliterate";
import { useAT, fill, DEPT_ICON, VERDICT } from "./assessmentUtil";

/**
 * A seat as a ring around its department's icon: the arc is how far that
 * judge's scorecard is (graded ÷ the seat's own questions), green and closed
 * once submitted, dashed while nobody sits there. A brand halo marks the seat
 * on screen. Never a verdict — the panel stays independent.
 */
export function SeatRing({ seat, current, size = 30 }) {
  const Icon = DEPT_ICON[seat.department];
  const free = !seat.judge_name;
  const total = seat.total ?? 0;
  const pct = seat.submitted ? 1 : total ? Math.min(1, seat.graded / total) : 0;
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const onScreen = seat.mine && seat.department === current;
  return (
    <span className="relative inline-grid place-items-center flex-shrink-0 rounded-full"
      style={{ width: size, height: size, boxShadow: onScreen ? "0 0 0 2px var(--bg-card), 0 0 0 4px var(--brand)" : "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-md)" strokeWidth="2.5"
          strokeDasharray={free ? "3 3" : undefined} />
        {!free && pct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
            stroke={seat.submitted ? VERDICT.pass.hex : "var(--brand)"}
            strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray .5s var(--ease-out)" }} />
        )}
      </svg>
      {Icon && <Icon size={Math.round(size * 0.42)} style={{ color: free ? "var(--text-4)" : "var(--text-2)" }} aria-hidden="true" />}
      {seat.submitted && (
        <span className="absolute -right-0.5 -bottom-0.5 grid place-items-center w-3.5 h-3.5 rounded-full"
          style={{ background: VERDICT.pass.bg, color: "#fff", boxShadow: "0 0 0 2px var(--bg-card)" }} aria-hidden="true">
          <Check size={9} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

/**
 * The panel: five department seats, live. Each says who sits there and how
 * far their scorecard is — never a verdict (the panel stays independent). A
 * free seat is claimable; the viewer's own unsubmitted seat can be left; an
 * admin can free anybody's unsubmitted seat.
 */
export default function SeatStrip({ seats, rights, mine, current, onClaim, onLeave, onRelease, onSwitch, busyDept }) {
  const T = useAT();
  const { tl } = useTranslit();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
      {seats.map((s) => {
        const dept = T.dept[s.department];
        const free = !s.judge_name;
        const total = s.total ?? 0;
        const onScreen = s.mine && s.department === current;
        return (
          <div key={s.department} className="rounded-xl p-3 flex items-center gap-3 lg:flex-col lg:items-stretch min-w-0"
            style={{
              background: free ? "transparent" : "var(--bg-inner)",
              border: onScreen ? "1px solid rgba(var(--brand-rgb), .55)" : free ? "1px dashed var(--border-md)" : "1px solid transparent",
            }}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <SeatRing seat={s} current={current} size={34} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-1)" }}>
                  {dept}{s.mine && <span className="font-medium" style={{ color: "var(--brand-text)" }}> · {T.seatYou}</span>}
                </div>
                <div className="text-xs truncate" style={{ color: free ? "var(--text-3)" : "var(--text-2)" }} title={s.judge_name ? tl(s.judge_name) : undefined}>
                  {free ? fill(T.seatQs, { n: total }) : tl(s.judge_name)}
                </div>
                {!free && (
                  <div className="text-[11px] tabular-nums" style={{ color: s.submitted ? "var(--status-ok)" : "var(--text-3)" }}>
                    {s.submitted ? T.seatSubmitted : fill(T.seatProgress, { g: s.graded, t: total })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 lg:mt-auto">
              {free && rights.claim && (
                <Button size="sm" variant={mine && !rights.multi_seat ? "secondary" : "primary"} loading={busyDept === s.department}
                  onClick={() => onClaim(s)} className="lg:w-full">
                  {mine && !rights.multi_seat ? T.moveHere : T.takeSeat}
                </Button>
              )}
              {s.mine && !onScreen && (
                <Button size="sm" variant="secondary" icon={PencilLine} onClick={() => onSwitch?.(s)} className="lg:w-full">
                  {s.submitted ? T.viewSeat : T.gradeAs}
                </Button>
              )}
              {onScreen && !s.submitted && rights.grade && (
                <Button size="sm" variant="ghost" icon={LogOut} onClick={() => onLeave(s)} className="lg:w-full"
                  title={T.leaveSeat} aria-label={T.leaveSeat}>
                  {T.leave}
                </Button>
              )}
              {!s.mine && !free && !s.submitted && rights.release_any && (
                // A rare admin act: quiet on the tile, the danger confirm says the rest.
                <Button size="sm" variant="ghost" icon={X} onClick={() => onRelease(s)} className="lg:w-full"
                  style={{ color: "var(--text-3)" }} aria-label={`${T.releaseTip} · ${dept}`}>
                  {T.release}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
