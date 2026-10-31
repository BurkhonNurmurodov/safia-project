import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft, Award, BadgeCheck, CircleSlash, ClipboardCheck, Clock, History, LogIn, LogOut,
  MessageSquareWarning, Repeat, UserCog,
} from "lucide-react";
import Button from "../ui/Button";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import { staffLink } from "../../utils/scopeLinks";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { fill, fmtDate, Chip } from "./peopleUtil";

const PAGE = 20;

const ICON = {
  absent: CircleSlash, no_out: Clock, people_exchange: ArrowRightLeft, role_change: UserCog,
  career_hire: LogIn, career_transfer: Repeat, career_rank: BadgeCheck, career_dismissed: LogOut,
  concern: MessageSquareWarning, assessment: ClipboardCheck, honour: Award,
};

function useCan() {
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  return (page) => canAccessPage(auth?.role, page, access, capPages, deniedPages);
}

/** One feed line's words and where it lives. */
function describe(e, P, tl, tx) {
  const ev = P.ev;
  switch (e.kind) {
    case "absent": return { text: ev.absent };
    case "no_out": return { text: fill(ev.no_out, { t: e.in || "—" }) };
    case "people_exchange": {
      const to = e.to_unit ? tl(e.to_unit) : e.task ? fill(P.evTask, { t: tx(e.task) }) : "—";
      const span = e.at ? ` · ${e.at}${e.back ? `–${e.back}` : ""}` : "";
      return { text: fill(ev.people_exchange, { to }) + span, sub: [e.unit ? tl(e.unit) : null, P.evSrc[e.source]].filter(Boolean).join(" · ") };
    }
    case "role_change":
      return { text: fill(ev.role_change, { r: tx(e.new_role || "—") }), sub: [e.unit ? tl(e.unit) : null, P.evSrc[e.source]].filter(Boolean).join(" · ") };
    case "career_hire": return { text: ev.career_hire, sub: [tx(e.job || ""), e.code || tx(e.unit || "")].filter(Boolean).join(" · ") };
    case "career_transfer": return { text: ev.career_transfer, sub: [tx(e.job || ""), e.code || tx(e.unit || "")].filter(Boolean).join(" · ") };
    case "career_rank": return { text: fill(ev.career_rank, { r: e.rank || "—" }) };
    case "career_dismissed":
      return { text: ev.career_dismissed + (e.cancelled ? ` (${P.evCancelled})` : ""), sub: e.reason ? fill(P.reason, { r: tx(e.reason) }) : "" };
    case "concern": return { text: fill(ev.concern, { n: e.seq ?? e.id }), sub: [e.code, P.bucket[e.bucket]].filter(Boolean).join(" · ") };
    case "assessment": return { text: ev.assessment, sub: e.status === "open" ? P.stOpen : P.stClosed };
    case "honour": return { text: fill(ev.honour, { t: e.title }), sub: P.hk[e.honour] || "" };
    default: return { text: e.kind };
  }
}

function target(e, can) {
  if ((e.kind === "absent" || e.kind === "no_out") && e.unit_id && can("staff")) return staffLink({ unit: e.unit_id, date: e.date });
  if ((e.kind === "people_exchange" || e.kind === "role_change") && e.unit_id && can("staff"))
    return staffLink({ unit: e.unit_id, date: e.date, tab: "requests" });
  if (e.kind === "concern" && can("concerns")) return `/concerns?open=${e.id}`;
  if (e.kind === "assessment" && can("assessment")) return `/assessment/${e.id}`;
  return null;
}

function FactRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 min-w-0" style={{ borderTop: "1px solid var(--border)" }}>
      <span className="text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="text-sm text-right min-w-0 truncate" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

/** «Umumiy» — compact facts and «Oxirgi voqealar», the merged dated feed. */
export default function OverviewTab({ data, P, ready }) {
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const can = useCan();
  const [shown, setShown] = useState(PAGE);
  const h = data.hero;
  const feed = ready ? data.feed || [] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={History} title={P.facts} />
        <div className="px-4 pb-2">
          <FactRow label={P.fUnit}>{h.cell?.unit ? tl(h.cell.unit) : "—"}</FactRow>
          <FactRow label={P.cell}>{h.cell ? `${h.cell.code}${h.cell.letter ? ` · ${h.cell.letter}` : ""}` : "—"}</FactRow>
          <FactRow label={P.unitVerifix}>{h.unit_name ? tx(h.unit_name) : "—"}</FactRow>
          <FactRow label={P.shift}>{h.cell?.shift ? fill(P.shiftN, { n: h.cell.shift }) : "—"}</FactRow>
          <FactRow label={P.fSchedule}>{h.schedule ? tx(h.schedule) : "—"}</FactRow>
          <FactRow label={P.hired}>{fmtDate(h.hired)}</FactRow>
          <FactRow label={P.fFirstDay}>{fmtDate(h.first_day)}</FactRow>
          <FactRow label={P.fVerifix}><span className="tabular-nums">{h.employee_id}</span></FactRow>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Clock} title={P.feed} right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{P.feedSub}</span>} />
        {feed === null ? (
          <div className="px-4 pb-4 space-y-2">{[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-11 w-full" />)}</div>
        ) : feed.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-sm" style={{ color: "var(--text-3)" }}>{P.feedEmpty}</p>
        ) : (
          <ul>
            {feed.slice(0, shown).map((e, i) => {
              const Icon = ICON[e.kind] || History;
              const d = describe(e, P, tl, tx);
              const to = target(e, can);
              const body = (
                <>
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate" style={{ color: "var(--text-1)" }}>{d.text}</span>
                    {d.sub && <span className="block text-xs truncate" style={{ color: "var(--text-3)" }}>{d.sub}</span>}
                  </span>
                  <Chip className="tabular-nums">{fmtDate(e.date)}</Chip>
                </>
              );
              return (
                <li key={`${e.kind}-${e.date}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  {to ? (
                    <button type="button" onClick={() => nav(to)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 min-h-[52px] hover:bg-[var(--bg-inner)]">
                      {body}
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 flex items-center gap-3 min-h-[52px]">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {feed && feed.length > shown && (
          <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
              {fill(P.feedMore, { n: Math.min(PAGE, feed.length - shown) })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
