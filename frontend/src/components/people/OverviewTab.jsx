import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft, Award, BadgeCheck, ChevronRight, CircleSlash, ClipboardCheck, Clock, History, LogIn, LogOut,
  MessageSquareWarning, Repeat, UserCog,
} from "lucide-react";
import Button from "../ui/Button";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import { useLang } from "../../context/LangContext";
import { staffLink } from "../../utils/scopeLinks";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { fill, fmtShort } from "./peopleUtil";

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
    case "career_rank": return { text: fill(ev.career_rank, { r: e.rank ? tx(e.rank) : "—" }) };
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

// The kind's tone on the spine: an absence red and a missing check-out amber
// (the statuses the calendar paints them in), an honour the brand's gold, the
// rest neutral — a feed of colours would mean nothing.
const TONE = {
  absent: { fg: "var(--status-bad)", bg: "rgba(239,68,68,.12)" },
  no_out: { fg: "var(--status-warn)", bg: "rgba(234,179,8,.14)" },
  honour: { fg: "var(--brand-text)", bg: "rgba(var(--brand-rgb),.14)" },
};

const monthKey = (iso) => String(iso || "").slice(0, 7);

/** «Umumiy» — «Oxirgi voqealar», the merged dated feed, as a timeline read by
 *  month: a spine down the left, each event a node on it. */
export default function OverviewTab({ data, P, ready }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const can = useCan();
  const [shown, setShown] = useState(PAGE);
  const feed = ready ? data.feed || [] : null;

  const groups = useMemo(() => {
    if (!ready) return [];
    const out = [];
    (data.feed || []).slice(0, shown).forEach((e, i) => {
      const k = monthKey(e.date);
      if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, items: [] });
      out[out.length - 1].items.push({ e, i });
    });
    return out;
  }, [ready, data.feed, shown]);

  const monthLabel = (k) => {
    const [y, m] = k.split("-");
    return y && m ? `${t(`cal.m${Number(m) - 1}`)} ${y}` : k;
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Clock} title={P.feed} right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{P.feedSub}</span>} />
      {feed === null ? (
        <div className="px-4 pb-4 space-y-2">{[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-11 w-full" />)}</div>
      ) : feed.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-sm" style={{ color: "var(--text-3)" }}>{P.feedEmpty}</p>
      ) : (
        <div className="px-2 sm:px-3 pb-3">
          {groups.map((g) => (
            <section key={g.key} className="mt-1 first:mt-0">
              <h3 className="px-2 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-3)" }}>
                {monthLabel(g.key)}
              </h3>
              <ol className="relative">
                {/* The spine: one line behind the month's nodes. */}
                <span aria-hidden="true" className="absolute left-[25px] sm:left-[27px] top-3 bottom-3 w-px" style={{ background: "var(--border-md)" }} />
                {g.items.map(({ e, i }) => {
                  const Icon = ICON[e.kind] || History;
                  const d = describe(e, P, tl, tx);
                  const to = target(e, can);
                  const tone = TONE[e.kind];
                  const body = (
                    <>
                      <span className="relative z-[1] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: tone ? tone.bg : "var(--bg-inner)", color: tone ? tone.fg : "var(--text-2)",
                                 boxShadow: "0 0 0 4px var(--bg-card)" }}>
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate" style={{ color: "var(--text-1)" }}>{d.text}</span>
                        {d.sub && <span className="block text-xs truncate" style={{ color: "var(--text-3)" }}>{d.sub}</span>}
                      </span>
                      <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtShort(e.date)}</span>
                      {to && <ChevronRight size={14} className="flex-shrink-0 -mr-0.5" style={{ color: "var(--text-4)" }} aria-hidden="true" />}
                    </>
                  );
                  return (
                    <li key={`${e.kind}-${e.date}-${i}`} className="pc-row" style={{ "--d": `${Math.min(i, 12) * 28}ms` }}>
                      {to ? (
                        <button type="button" onClick={() => nav(to)}
                          className="w-full text-left px-2.5 py-2 flex items-center gap-3 min-h-[52px] rounded-xl transition-colors hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)]">
                          {body}
                        </button>
                      ) : (
                        <div className="px-2.5 py-2 flex items-center gap-3 min-h-[52px]">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
      {feed && feed.length > shown && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
            {fill(P.feedMore, { n: Math.min(PAGE, feed.length - shown) })}
          </Button>
        </div>
      )}
    </div>
  );
}
