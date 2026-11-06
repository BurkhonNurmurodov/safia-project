import { useNavigate } from "react-router-dom";
import ProfileAvatar from "../ui/ProfileAvatar";
import CellLink from "../ui/CellLink";
import GroupBadge from "../ui/GroupBadge";
import { VerdictChip } from "../kpi/KpiBits";
import { useTranslit } from "../../utils/transliterate";
import { fill, fmtDate, tenureText, nameCase, useCanOpen } from "./peopleUtil";
import { StatusChip } from "./PeopleSearch";

// Today's live state: green at work, amber on a break, slate otherwise — a
// status, never the brand gold.
const PRESENCE = { inside: "var(--status-ok)", break: "var(--status-warn)" };

/** The photo inside today's ring: a person at work wears a green ring that
 *  breathes, on a break an amber one, otherwise none. */
function Presence({ hero, size }) {
  const { tl } = useTranslit();
  const st = hero.today?.status;
  const ring = PRESENCE[st];
  const pad = 5;
  return (
    <span className="relative inline-grid place-items-center flex-shrink-0 rounded-full"
      style={{ width: size + pad * 2, height: size + pad * 2 }}>
      {ring && (
        <span aria-hidden="true" className={`absolute inset-0 rounded-full ${st === "inside" ? "pc-presence" : ""}`}
          style={{ boxShadow: `inset 0 0 0 2px ${ring}`, "--ring": ring }} />
      )}
      <ProfileAvatar muted name={nameCase(tl(hero.name))} colorKey={hero.name} size={size}
        photoUrl={hero.photo ? `/api/people/${encodeURIComponent(hero.employee_id)}/photo?size=${size > 80 ? 192 : 96}` : undefined} />
    </span>
  );
}

function TodayLine({ today, P }) {
  if (!today) return null;
  const label = P.live[today.status] || today.status;
  const text = today.in && today.out ? `${label} · ${today.in}–${today.out}`
    : today.in ? fill(P.liveSince, { s: label, t: today.in })
    : label;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs min-w-0" style={{ color: "var(--text-2)" }}>
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: PRESENCE[today.status] || "var(--text-4)" }} />
      <span className="truncate"><span style={{ color: "var(--text-3)" }}>{P.today}: </span>{text}</span>
    </span>
  );
}

/** One fact: a quiet label and its value — a row in the column, a stacked
 *  pair in the grid the narrow card lays them in. */
function Fact({ label, title, children }) {
  return (
    <div className="min-w-0 @5xl:flex @5xl:items-baseline @5xl:justify-between @5xl:gap-3 @5xl:py-[7px]" title={title}>
      <dt className="text-[11px] @5xl:text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd className="mt-0.5 @5xl:mt-0 min-w-0 flex items-center gap-1.5 text-[13px] @5xl:justify-end @5xl:text-right"
        style={{ color: "var(--text-1)" }}>{children}</dd>
    </div>
  );
}

function Group({ children, first }) {
  return (
    <dl className={`px-4 @5xl:px-5 py-3 @5xl:py-2 grid grid-cols-2 @2xl:grid-cols-4 @5xl:grid-cols-1 gap-x-5 gap-y-3 @5xl:gap-y-0 @5xl:divide-y @5xl:divide-[var(--border)]`}
      style={first ? undefined : { borderTop: "1px solid var(--border)" }}>
      {children}
    </dl>
  );
}

/**
 * Who this is — the card's identity, and on a wide card a column of its own
 * that stays in view while the tabs scroll (a personnel file's front page):
 * the photo in today's ring, the name, the job and tenure, then where they
 * stand (cell, its manager, the brigadir, the shift), their category, and the
 * register facts. Everything is the server's `hero`.
 */
export default function IdentityRail({ hero, P }) {
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const canBrigadir = useCanOpen("overview");
  const c = hero.cell;
  const cat = hero.category;

  return (
    <aside className="pc-rise rounded-2xl overflow-hidden @5xl:sticky @5xl:top-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="p-4 @5xl:px-5 @5xl:pt-6 @5xl:pb-5 flex items-center gap-4 @5xl:flex-col @5xl:text-center">
        <span className="@5xl:hidden"><Presence hero={hero} size={64} /></span>
        <span className="hidden @5xl:inline-grid"><Presence hero={hero} size={104} /></span>
        <div className="min-w-0 flex-1 @5xl:flex-none @5xl:w-full">
          <h2 className="text-lg @5xl:text-[19px] font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>
            {nameCase(tl(hero.name))}
          </h2>
          <div className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>{tx(hero.job || "—")}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 @5xl:justify-center">
            <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}
              title={`${P.hired}: ${fmtDate(hero.hired)}`}>
              {P.tenure}: {tenureText(hero.tenure_months, P)}
            </span>
            <StatusChip status={hero.status} dismissed={hero.dismissed} P={P} />
          </div>
          {hero.today && <div className="mt-2.5"><TodayLine today={hero.today} P={P} /></div>}
        </div>
      </div>

      <Group>
        <Fact label={P.cell}>
          {c ? (
            <>
              <CellLink id={c.id} className="text-xs font-semibold tabular-nums" title={P.cell}>
                <span className="px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>{c.code}</span>
              </CellLink>
              <GroupBadge group={c.letter} />
            </>
          ) : (
            <span className="truncate" style={{ color: "var(--text-3)" }}>{P.noCell}</span>
          )}
        </Fact>
        <Fact label={P.manager}>
          <span className="truncate" style={{ color: c?.leader ? "var(--text-1)" : "var(--text-3)" }}>
            {c?.leader ? tl(c.leader) : c ? P.noLeader : "—"}
          </span>
        </Fact>
        <Fact label={P.brigadir}>
          {c?.unit && canBrigadir ? (
            <button type="button" className="cell-link truncate" onClick={() => nav(`/brigadir/${c.unit_id}`)}>{tl(c.unit)}</button>
          ) : <span className="truncate">{c?.unit ? tl(c.unit) : "—"}</span>}
        </Fact>
        <Fact label={P.shift}>{c?.shift ? fill(P.shiftN, { n: c.shift }) : "—"}</Fact>
      </Group>

      <Group>
        <Fact label={P.category} title={P.categoryTip}>
          {cat ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 @5xl:justify-end">
              <span className="whitespace-nowrap">{cat.actual ? tx(cat.actual) : P.categoryNone}</span>
              <VerdictChip counted={cat.counted} compliant={cat.compliant}>{P.verdict[cat.verdict] || cat.verdict}</VerdictChip>
            </span>
          ) : "—"}
        </Fact>
        {/* The expected step only where it is not the one held. */}
        {cat?.expected && cat.expected !== cat.actual && (
          <Fact label={P.expectedL}><span className="truncate">{tx(cat.expected)}</span></Fact>
        )}
        <Fact label={P.hired}><span className="tabular-nums">{fmtDate(hero.hired)}</span></Fact>
        <Fact label={P.fSchedule}><span className="truncate">{hero.schedule ? tx(hero.schedule) : "—"}</span></Fact>
      </Group>

      <Group>
        <Fact label={P.unitVerifix}><span className="truncate">{hero.unit_name ? tx(hero.unit_name) : "—"}</span></Fact>
        <Fact label={P.fFirstDay}><span className="tabular-nums">{fmtDate(hero.first_day)}</span></Fact>
        <Fact label={P.fVerifix}><span className="tabular-nums">{hero.employee_id}</span></Fact>
      </Group>
    </aside>
  );
}
