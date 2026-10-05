// The pieces only the LIVE «Verifix to'g'irlash» adds to /staff's Workers tab
// (`/staff-live` — `StaffApiContext` decides). Everything else on that page is
// /staff's own component; these say what only a live source can say: when the
// stored Verifix read was taken, where the day stands, who is inside right now,
// the hours a worker carried here while their name sits on another unit's day,
// and (for admins) what the read held.
//
// The look (2026-10-05, the operator: «I must know how it looks on
// production»): no lab notice, no box around every sentence — the day's
// standing and the read's freshness share one header line, the summary is
// three figures on the card itself, the rules fold away under one link, and a
// phone reads a list instead of a ten-column table scrolled sideways.
import { memo, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Lock, RefreshCw, Unlock } from "lucide-react";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";

export const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
export const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : "");
// Hours: a row and the totals of rows always carry two decimals, a summary
// figure one — «2.2» beside «2.17» read as two different precisions.
export const n2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
export const n1 = (v) => (v == null ? "—" : Number(v).toFixed(1));

// A row's status — the traffic light for what is wrong (no check-out, not
// come), green for inside, slate for everything that is simply over.
export const STATUS_TONE = {
  inside: "#22c55e",
  break: "#eab308",
  left: "#94a3b8",
  absent: "#ef4444",
  not_yet: "#94a3b8",
  off: "#94a3b8",
  moved_out: "#94a3b8",
  on_task: "#94a3b8",
  no_out: "#ef4444",
};

// A chip's TEXT takes the theme's status ink (CLAUDE.md: --status-ok/warn/bad
// are the AA shades of the traffic light); the hex only tints the fill. The
// raw #eab308 as text on its own tint read 1.7:1 in the light theme. The tint
// is mixed over the CARD, never over whatever the chip sits on.
const INK = { "#22c55e": "var(--status-ok)", "#eab308": "var(--status-warn)", "#ef4444": "var(--status-bad)" };

export function LiveChip({ color, children, dashed = false, title }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[11px] font-medium whitespace-nowrap tabular-nums"
      style={{ background: `color-mix(in srgb, ${color} 10%, var(--bg-card))`, color: INK[color] || "var(--text-2)",
        border: `1px ${dashed ? "dashed" : "solid"} color-mix(in srgb, ${color} 35%, transparent)` }}>
      {children}
    </span>
  );
}

// A status is one line: the table gives it the room it needs (its column
// never wraps), and a phone puts it on a line of its own.
export function LiveStatusChip({ status }) {
  const { t } = useLang();
  const color = STATUS_TONE[status] || "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {t(`staffLive.st.${status}`)}
    </span>
  );
}

// ── the status strip ─────────────────────────────────────────────────────────
// The old live page's eight filters, kept on /staff's table (the operator's
// call): a status is a fact about the worker right now, a flag (late, left
// early, no check-out) is a fact about their clock.
export const LIVE_FILTERS = ["all", "inside", "left", "absent", "late", "early", "missing", "moved"];

export function liveMatch(w, f) {
  switch (f) {
    case "inside": return w.status === "inside" || w.status === "break";
    case "left": return w.status === "left";
    case "absent": return w.status === "absent" || w.status === "not_yet";
    case "late": return !!w.late;
    case "early": return !!w.early_out;
    case "missing": return !!w.missing;
    case "moved": return w.status === "moved_out" || w.moved?.dir === "in" || !!w.on_task;
    default: return w.status !== "off";
  }
}

// The people standing here under another unit's name carry a status and no
// clock flags: every one of them came by a move, and «no check-out» is their
// status — read through `liveMatch` they vanished under «Ko'chirilgan».
export function liveMatchExtra(x, f) {
  switch (f) {
    case "moved": return true;
    case "missing": return x.status === "no_out";
    case "late": case "early": case "absent": return false;
    default: return liveMatch(x, f);
  }
}

// `rows` are the day's people (`AttendanceTable` drops the day-off rows,
// which no filter shows): the strip counts the same set the figures and the
// export count.
export function liveFilterOptions(rows, t) {
  const primary = rows.filter((w) => !w.split_of);
  return LIVE_FILTERS.map((f) => [f, `${t(`staffLive.f.${f}`)} · ${primary.filter((w) => liveMatch(w, f)).length}`]);
}

// ── the header: where the day stands, and how fresh the read is ──────────────
function readAt(live) {
  const p = live?.pulled_at || "";
  if (!p) return "";
  const time = p.slice(11, 16);
  return p.slice(0, 10) === (live.now || "").slice(0, 10) ? time : `${p.slice(8, 10)}.${p.slice(5, 7)} ${time}`;
}

// The sentence for where the day stands. «Kelganlarning hammasi ketdi» was a
// false claim while people had no check-out — nobody SHOWS as inside, which is
// all Verifix can say — and «oxirgisi —» printed a clause with nothing in it.
function standingText(t, close, counts) {
  const s = close.state;
  if (s === "closed") return fill(t("staffLive.close.closed_manual"), { at: hhmm(close.at), by: close.by || "—" });
  if (s === "all_left") {
    const last = hhmm(close.last_out);
    if (close.missing > 0) {
      return last ? fill(t("staffLive.close.allLeftMissing"), { last }) : t("staffLive.close.allLeftMissingNoLast");
    }
    return fill(t("staffLive.close.all_left"), { last: last || "—" });
  }
  if (s === "open") {
    if (!(close.n > 0)) return fill(t("staffLive.close.openExpected"), { e: close.expected });
    if (counts?.extra_inside > 0) {
      return counts.inside > 0
        ? fill(t("staffLive.close.openExtra"), { n: counts.inside, x: counts.extra_inside })
        : fill(t("staffLive.close.openOnlyExtra"), { x: counts.extra_inside });
    }
    return fill(t("staffLive.close.open"), { n: close.n });
  }
  return t(close.closable ? "staffLive.close.waitingClosable" : "staffLive.close.waiting");
}

// A link's arrow stays with the label's last word when the label wraps.
function TailArrow({ text }) {
  const i = text.lastIndexOf(" ");
  return (
    <>
      {i > 0 ? text.slice(0, i + 1) : ""}
      <span className="whitespace-nowrap">
        {i > 0 ? text.slice(i + 1) : text}
        <ArrowRight size={12} aria-hidden="true" className="inline ml-1 -mt-px" />
      </span>
    </>
  );
}

// `counts` splits «inside» into this unit's own people and those standing here
// under another unit's name — the strip counts only the first, so the line
// says the second out loud. `onGoClose` (only for those who may close the day)
// opens «Tasdiqlash» on this day — offered where the close endpoint accepts it
// (`close.closable`: nobody inside, on a break or still due — everybody left,
// or nobody came and nobody is due); before that the line says when it can.
// `onGoRequests` turns «N changes await approval» into the way to them.
function Standing({ close, counts, onGoClose, onGoRequests }) {
  const { t } = useLang();
  if (!close) return <div className="flex-1" />;
  const s = close.state;
  const tone = s === "closed" ? "var(--status-ok)" : s === "all_left" ? "var(--status-warn)" : "var(--text-3)";
  const open = s === "open" || s === "all_left";
  // A payload from before `closable` existed: «everybody left» was the rule.
  const closable = close.closable ?? s === "all_left";
  const missing = open && close.missing > 0;
  const pending = open && close.pending > 0;
  return (
    <div className="flex-1 min-w-0 flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="flex items-start gap-2.5 min-w-[14rem] flex-1">
        {s === "closed"
          ? <Lock size={16} style={{ color: tone }} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          : <Unlock size={16} style={{ color: tone }} className="flex-shrink-0 mt-0.5" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{standingText(t, close, counts)}</div>
          {onGoClose && !closable && (s === "open" || s === "waiting") && (
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{t("staffLive.close.where")}</div>
          )}
          {(missing || pending || (open && close.notified_at)) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mt-1">
              {missing && <span style={{ color: "var(--status-bad)" }}>{fill(t("staffLive.close.missingNote"), { n: close.missing })}</span>}
              {pending && (onGoRequests ? (
                // Text flow, not flex: a wrapped label keeps its arrow at the
                // end of its own last line, left-aligned like the lines around it.
                <button type="button" onClick={onGoRequests}
                  className="text-left rounded-sm hover:underline underline-offset-2 live-focus"
                  style={{ color: "var(--status-warn)" }}>
                  <TailArrow text={fill(t("staffLive.close.pendingNote"), { n: close.pending })} />
                </button>
              ) : <span style={{ color: "var(--status-warn)" }}>{fill(t("staffLive.close.pendingNote"), { n: close.pending })}</span>)}
              {open && close.notified_at && (
                <span style={{ color: "var(--text-3)" }}>{fill(t("staffLive.close.notified"), { time: hhmm(close.notified_at) })}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {closable && onGoClose && (
        // A phone gives it a row of its own (under the text), and a long
        // label (ru) wraps instead of running off the card.
        <Button size="lg" variant="secondary" onClick={onGoClose}
          className="flex-shrink-0 max-sm:ml-[26px] max-sm:max-w-[calc(100%-26px)] max-sm:text-left max-sm:justify-start">
          {t("staffLive.close.go")} <ArrowRight size={14} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

// How fresh the read is. Today's day is read by the minute job, so it says
// «Jonli» with a breathing dot; a past day is the read that was stored. The
// clock is NOT a live region — a screen reader announced it every minute —
// only a refresh in progress is.
function Freshness({ live, refreshing, className = "" }) {
  const { t } = useLang();
  const at = readAt(live);
  const isLive = !!live?.auto?.on;
  const failed = !!live?.read_error;
  const dot = failed ? "#eab308" : isLive ? "#22c55e" : "#94a3b8";
  const label = refreshing
    ? t("staffLive.refreshing")
    : !live?.pulled_at
      ? t("staffLive.notReadYet")
      : isLive ? fill(t("staffLive.liveAt"), { time: at }) : fill(t("staffLive.readAt"), { time: at });
  return (
    <span className={`inline-flex items-center gap-2 text-xs tabular-nums whitespace-nowrap sm:self-center ${className}`}
      style={{ color: "var(--text-2)" }}
      title={isLive ? fill(t("staffLive.liveTitle"), { time: at || "—" }) : undefined}>
      <span className="relative inline-flex w-2 h-2" aria-hidden="true">
        {isLive && !failed && !refreshing && (
          <span className="absolute inset-0 rounded-full live-dot" style={{ background: dot, opacity: 0.5 }} />
        )}
        <span className="relative w-2 h-2 rounded-full" style={{ background: dot }} />
      </span>
      {label}
      <span className="sr-only" role="status">{refreshing ? t("staffLive.refreshing") : ""}</span>
    </span>
  );
}

export function LiveHeader({ data, onRefresh, refreshing, onGoClose, onGoRequests }) {
  const { t } = useLang();
  const live = data?.live;
  const isAdmin = !!live?.diag;          // the server sends Diagnostics to admins only
  return (
    <>
      {/* A phone: the sentence and the refresh button share the first line
          and the read's clock sits under the sentence; from sm up the clock
          and the button close the line on the right. */}
      <div className="px-4 pt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
        <Standing close={live?.close} counts={live?.counts} onGoClose={onGoClose} onGoRequests={onGoRequests} />
        {live && (
          <div className="contents sm:flex sm:items-center sm:gap-2 sm:flex-shrink-0">
            <Freshness live={live} refreshing={refreshing} className="max-sm:col-start-1 max-sm:row-start-2 max-sm:pl-[26px]" />
            <Button size="lg" variant="secondary" disabled={!onRefresh} loading={refreshing}
              onClick={onRefresh} aria-label={t("staffLive.refresh")} title={t("staffLive.refresh")}
              className="!px-0 w-[38px] h-[38px] max-sm:col-start-2 max-sm:row-start-1" icon={<RefreshCw size={15} />} />
          </div>
        )}
      </div>
      {live?.read_error && (
        <div className="mx-4 mt-3 text-xs flex gap-2" style={{ color: "var(--status-warn)" }}
          title={isAdmin ? live.read_error.message || "" : undefined}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-px" aria-hidden="true" />
          <span>{fill(t("staffLive.readErrorPlain"), { at: hhmm(live.read_error.at) })}</span>
        </div>
      )}
    </>
  );
}

// ── the day in three figures ─────────────────────────────────────────────────
// On the card itself, no boxes: who came, who counts in the загрузка, and the
// загрузка's hours. Each is ONE number with ONE line under it naming what it
// is counted out of — the line is always there, so nothing above the strip
// moves when a filter changes what it says. They count the rows ON SCREEN
// (the /staff rule), and the first line says so while a filter is on.
function Stat({ label, value, sub, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>
        {value}
      </div>
      <div className="text-xs mt-0.5 tabular-nums" style={{ color: "var(--text-3)" }}>{sub || " "}</div>
    </div>
  );
}

export function LiveSummary({ came, total, counted, countedOf, hours, avg, soFar, filtered, schedule = null }) {
  const { t } = useLang();
  const pct = total > 0 ? Math.round((came / total) * 100) : null;
  return (
    <div className="px-4 pt-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 sm:gap-8 sm:max-w-3xl">
        <Stat label={t("staffLive.sum.came")} value={came}
          sub={[fill(t(filtered ? "staffLive.sum.ofFiltered" : "staffLive.sum.of"), { n: total }), pct != null && `${pct}%`]
            .filter(Boolean).join(" · ")} />
        <Stat label={t("staffLive.sum.counted")} value={counted}
          sub={fill(t("staffLive.sum.ofRoles"), { n: countedOf })} />
        <Stat className="max-sm:col-span-2" label={t("staffLive.sum.hours")} value={counted ? n1(hours) : "—"}
          sub={avg != null ? [fill(t("staffLive.sum.avg"), { n: n1(avg) }), soFar && t("staffLive.sum.soFar")].filter(Boolean).join(" · ") : null} />
      </div>
      {schedule && (
        <div className="mt-3 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {fill(t("staffLive.sum.scheduleLine"), { s: schedule })}
        </div>
      )}
    </div>
  );
}

// ── one row's cells ──────────────────────────────────────────────────────────
export function LiveRowNotes({ w }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  return (
    <>
      {w.moved && (
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {fill(t(w.moved.dir === "out" ? "staffLive.movedOut" : "staffLive.movedIn"),
            { unit: w.moved.task ? w.moved.unit : tl(w.moved.unit || "—"), t: w.moved.at })}
        </span>
      )}
      {w.pending?.length > 0 && (
        <LiveChip color="#eab308" dashed>{fill(t("staffLive.pending"), { n: w.pending.length })}</LiveChip>
      )}
    </>
  );
}

// A time the report has not given yet and a mark stood in for: «≈», with the
// reason on hover — a dotted underline already means «a link» (a cell code).
function MarkTime({ time, tip }) {
  return (
    <span title={tip} className="whitespace-nowrap">
      <span aria-hidden="true" style={{ color: "var(--text-3)" }}>≈ </span>{time}
      <span className="sr-only"> ({tip})</span>
    </span>
  );
}

// The clock cells. Late / early leave are WORDS under the time («34 daq
// kech»): «+34 daq» beside an arrival read as extra time. `inline` (a phone
// row) puts them after the time instead.
function ClockNote({ tone, children }) {
  return <span className="text-xs whitespace-nowrap" style={{ color: tone }}>{children}</span>;
}

export function LiveClockIn({ w, inline = false }) {
  const { t } = useLang();
  if (!w.clock_in) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const time = w.in_src && w.in_src !== "report" ? <MarkTime time={w.clock_in} tip={t("staffLive.inMark")} /> : w.clock_in;
  const note = w.late ? <ClockNote tone="var(--status-warn)">{fill(t("staffLive.lateBy"), { n: w.late })}</ClockNote> : null;
  return inline
    ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{time}{note && <>{" · "}{note}</>}</span>
    : <span className="flex flex-col">{<span>{time}</span>}{note}</span>;
}

// Clock Out is written only once the worker is OUT of this unit (the operator,
// 2026-10-04): left the plant, or moved on at that minute. While they are
// inside — or out on a break — the cell stays empty.
export function LiveClockOut({ w, inline = false }) {
  const { t } = useLang();
  const out = w.status === "inside" || w.status === "break" ? null : w.clock_out;
  const time = out
    ? (w.out_src && w.out_src !== "report"
      ? <MarkTime time={out} tip={t(w.out_src === "last_mark" ? "staffLive.outLastMark" : w.out_src === "gate" ? "staffLive.outGate" : "staffLive.outMark")} />
      : out)
    : (inline ? null : <span style={{ color: "var(--text-4)" }}>—</span>);
  // The status column already says «Chiqish belgisi yo'q» for that row.
  const note = w.early_out
    ? <ClockNote tone="var(--status-warn)">{fill(t("staffLive.earlyBy"), { n: w.early_out })}</ClockNote>
    : w.missing && w.status !== "no_out" ? <ClockNote tone="var(--status-bad)">{t("staffLive.missing")}</ClockNote> : null;
  if (inline) return time || note ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{time}{time && note && " · "}{note}</span> : null;
  return <span className="flex flex-col">{<span>{time}</span>}{note}</span>;
}

// The name as the row's first cell, SHORT — the surname's initial and the
// given name, «A. Sardor» (the operator, 2026-10-05); the full Verifix name is
// on hover, and the search still matches it. For an admin it opens the Verifix
// read behind the row — a button that looks like the name until pointed at.
export const liveShortName = (full) => shortPerson(full, { nameCase: true });

export function LiveName({ w, open, onToggle, className = "" }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const full = tl(w.worker_name);
  if (!onToggle || !w.raw) return (
    <span className={`whitespace-nowrap ${className}`} style={{ color: "var(--text-1)" }} title={full}>{liveShortName(full)}</span>
  );
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} title={`${full}\n${t("staffLive.rawHint")}`}
      className={`text-left whitespace-nowrap rounded-sm hover:underline underline-offset-2 live-focus ${className}`}
      style={{ color: "var(--text-1)" }}>
      {liveShortName(full)}
    </button>
  );
}

// ── a phone reads a list, not a ten-column table scrolled sideways ───────────
// One worker per row: the name across the whole width, then the status with
// role · cell, then the clock and the hours. Only what is there is printed —
// no «Ketdi —» for somebody still inside, no dash for hours nobody has, no
// schedule the summary already states.
export const LivePhoneList = memo(function LivePhoneList({ rows, openRaw, setOpenRaw, isAdmin, oneSchedule = false }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  return (
    <ul>
      {rows.map((w) => {
        const outLine = <LiveClockOut w={w} inline />;
        return (
          <li key={w.id} className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="text-[15px] leading-snug">
              <LiveName w={w} open={openRaw === w.id}
                onToggle={isAdmin ? () => setOpenRaw((v) => (v === w.id ? null : w.id)) : null} />
            </div>
            <div className="mt-1 text-[13px] flex flex-wrap items-center gap-x-1.5 gap-y-1" style={{ color: "var(--text-3)" }}>
              <LiveStatusChip status={w.status} />
              {tx(w.job_title) && <><span aria-hidden="true">·</span><span>{tx(w.job_title)}</span></>}
              {w._cell && <><span aria-hidden="true">·</span>
                <CellLink id={w._cell.id} className="font-mono relative before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
                  style={{ color: "var(--text-3)" }}>{w._cell.code}</CellLink></>}
              {!w.clock_in && w.schedule && !oneSchedule && <><span aria-hidden="true">·</span><span className="tabular-nums">{tx(w.schedule)}</span></>}
              <LiveRowNotes w={w} />
            </div>
            {w.clock_in && (
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] tabular-nums" style={{ color: "var(--text-2)" }}>
                <span className="inline-flex items-baseline gap-1.5"><span style={{ color: "var(--text-3)" }}>{t("staffLive.c.in")}</span><LiveClockIn w={w} inline /></span>
                {outLine && <span className="inline-flex items-baseline gap-1.5"><span style={{ color: "var(--text-3)" }}>{t("staffLive.c.out")}</span>{outLine}</span>}
                {w.hours_worked != null && (
                  <span className="ml-auto" style={{ color: "var(--text-1)" }}>{n2(w.hours_worked)} {t("daily.hrs")}</span>
                )}
              </div>
            )}
            {isAdmin && openRaw === w.id && w.raw && (
              <div className="mt-2 rounded-lg p-2.5" style={{ background: "var(--bg-inner)" }}><LiveRaw raw={w.raw} /></div>
            )}
          </li>
        );
      })}
    </ul>
  );
});

// ── an admin's look at the read behind one row ───────────────────────────────
// Every stamp in one shape («05.10 07:55»): the report writes «05.10.2026
// 07:55:57», the window ISO, the marks «05.10 07:45».
function stamp(x) {
  if (!x) return "—";
  const s = String(x);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}.${m[2]} ${m[4]}:${m[5]}`;
  m = s.match(/^(\d{2})\.(\d{2})(?:\.\d{4})? (\d{2}):(\d{2})/);
  if (m) return `${m[1]}.${m[2]} ${m[3]}:${m[4]}`;
  return s;
}

export function LiveRaw({ raw }) {
  const { t } = useLang();
  if (!raw) return null;
  const r = raw.report || {};
  return (
    <div className="text-[11px] font-mono space-y-1 whitespace-normal" style={{ color: "var(--text-2)" }}>
      <div>
        {t("staffLive.rawReport")}: {t("staffLive.c.in")} {stamp(r.input_time)} · {t("staffLive.c.out")} {stamp(r.output_time)}
        {" · "}{stamp(r.begin_time)} → {stamp(r.end_time)}
        {" · "}{r.day_kind || "—"}
      </div>
      <div>{t("staffLive.rawWindow")}: {(raw.window || []).map(stamp).join(" → ")}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{fill(t("staffLive.rawMarks"), { n: raw.marks_total ?? 0 })}:</span>
        {(raw.marks || []).length === 0 ? <span>—</span> : raw.marks.map(([tm, type, inWin], i) => (
          <span key={i} style={{ opacity: inWin ? 1 : 0.5 }}>{stamp(tm)} {type || "?"}</span>
        ))}
      </div>
      <div>{t("staffLive.rawFacts")}: {Object.entries(raw.facts || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}</div>
    </div>
  );
}

// ── hours a worker carried here while their name is elsewhere ────────────────
// The operator's rule: right after a move the name stays on the sender and the
// receiver gets «additional hours»; once the receiver's side is the bigger one
// the name moves there and the sender keeps its hours as additional. These are
// those hours, each with where the name is now. One status per person: inside
// or on a break means here now (this unit files their next move), anything
// else that is not here reads «Ko'chirilgan».
function extraStatus(x) {
  return x.here ? x.status : "moved_out";
}

export function LiveExtras({ extras, phone = false }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  if (!extras?.length) return null;
  const total = extras.reduce((s, x) => s + (x.hours || 0), 0);
  const named = (x) => (x.named_at ? tl(x.named_at) : t(`staffLive.ex.r.${x.reason}`));
  const th = "h-10 px-3 first:pl-4 last:pr-4 border-y text-xs font-semibold whitespace-nowrap align-middle text-left";
  const td = "px-3 first:pl-4 last:pr-4 py-2.5 whitespace-nowrap";
  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <div className="px-4 pt-4 pb-1 flex items-baseline gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("staffLive.ex.title")}</h3>
        <span className="ml-auto text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
          {fill(t("staffLive.ex.total"), { n: n2(total) })}
        </span>
      </div>
      <p className="px-4 pb-3 text-xs max-w-[75ch]" style={{ color: "var(--text-3)" }}>{t("staffLive.ex.sub")}</p>
      {phone ? (
        <ul className="border-t" style={{ borderColor: "var(--border)" }}>
          {extras.map((x) => (
            <li key={x.employee_id} className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] leading-snug min-w-0" style={{ color: "var(--text-1)" }} title={tl(x.worker_name)}>{liveShortName(tl(x.worker_name))}</span>
                <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>
                  {n2(x.hours)} {t("daily.hrs")}
                </span>
              </div>
              <div className="mt-1 text-[13px] flex flex-wrap items-center gap-x-1.5" style={{ color: "var(--text-3)" }}>
                <LiveStatusChip status={extraStatus(x)} />
                <span aria-hidden="true">·</span>
                <span>{t("staffLive.ex.c.named")}: {named(x)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--bg-inner)" }}>
                <th scope="col" className={th} style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>{t("staffLive.ex.c.worker")}</th>
                <th scope="col" className={th} style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>{t("staffLive.ex.c.status")}</th>
                <th scope="col" className={th} style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>{t("staffLive.ex.c.named")}</th>
                <th scope="col" className={th.replace("text-left", "text-right")} style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>{t("staffLive.ex.c.hours")}</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((x) => (
                <tr key={x.employee_id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className={td} style={{ color: "var(--text-1)" }} title={tl(x.worker_name)}>{liveShortName(tl(x.worker_name))}</td>
                  <td className={td}><LiveStatusChip status={extraStatus(x)} /></td>
                  <td className={td} style={{ color: x.named_at ? "var(--text-2)" : "var(--text-3)" }}>{named(x)}</td>
                  <td className={`${td} tabular-nums text-right`} style={{ color: "var(--text-1)" }}>{n2(x.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── the footer: how the hours are counted, and (admins) what the read held ───
// Folded under one link: a reader who wants the rules opens them; everybody
// else is not handed five lines of small print under every table. What the
// formula behind the hours is — and how well it matched the files — is the
// admins' Diagnostics, not a sentence for a brigadir.
export function LiveFooter({ data }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  const [open, setOpen] = useState(false);
  const live = data?.live;
  if (!live) return null;
  const d = live.diag;                   // admins only (the server decides)
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 min-h-[32px] text-xs rounded-md hover:underline underline-offset-2 live-focus"
        style={{ color: "var(--text-3)" }}>
        {t("staffLive.rulesTitle")}
        <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 text-xs max-w-[80ch]" style={{ color: "var(--text-3)" }}>
          <p>{t(live.formula ? "staffLive.hoursPlain" : "staffLive.hoursClockPlain")}</p>
          <p>{t("staffLive.soFarNote")}</p>
          <p>{fill(t("staffLive.moveRule"), { min: live.rules?.min_moved_hours ?? 2 })}</p>
          <p>{fill(t("staffLive.rules"), {
            late: live.rules?.late_grace, early: live.rules?.early_grace, miss: live.rules?.missing_after,
          })}</p>
          {d && (
            <div className="pt-2 tabular-nums space-y-0.5">
              <div className="font-semibold" style={{ color: "var(--text-2)" }}>{t("staffLive.diag")}</div>
              <div>
                {live.formula
                  ? fill(t("staffLive.hoursRule"), {
                    kinds: live.formula.names.map((k) => tx(k)).join(" + "),
                    pct: `${Math.round((live.formula.share || 0) * 100)}%`,
                  })
                  : t("staffLive.hoursClock")}
              </div>
              <div>
                {fill(t("staffLive.diagLine"), {
                  e: d.employees, r: d.report_rows, m: d.marks,
                  types: Object.entries(d.mark_types || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—",
                })}
              </div>
              <div>{fill(t("staffLive.diagIn"), { report: d.in_sources?.report || 0, mark: d.in_sources?.mark || 0 })}</div>
              <div>
                {fill(t("staffLive.diagOut"), {
                  report: d.out_sources?.report || 0, mark: d.out_sources?.mark || 0,
                  last: d.out_sources?.last_mark || 0, gate: d.out_sources?.gate || 0,
                })}
              </div>
              {(d.held?.back || d.held?.no_report_out) ? (
                <div>{fill(t("staffLive.diagHeld"), { back: d.held.back || 0, none: d.held.no_report_out || 0 })}</div>
              ) : null}
              {!d.directed && d.marks > 0 && <div>{t("staffLive.diagUndirected")}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── the day cannot be shown: the reason, and the one thing to do about it ────
// Instead of the whole page (figures of 0, eight empty filters, a search box,
// a disabled export) above «no data». `onRetry` re-reads Verifix now.
export function LiveDayState({ data, onRetry, retrying, onToday, isAdmin, empty }) {
  const { t } = useLang();
  const err = data?.error;
  const kind = empty ? "empty" : (["not_configured", "no_cells", "future", "busy", "no_unit", "day"].includes(err) ? err : "failed");
  const title = t(`staffLive.state.${kind}.title`);
  const msg = t(`staffLive.state.${kind}.msg`);
  const danger = kind === "failed" || kind === "day";
  const action = (danger || kind === "busy") && onRetry
    ? <Button size="lg" variant="secondary" loading={retrying} onClick={onRetry} icon={<RefreshCw size={15} />}>{t("staffLive.retry")}</Button>
    : kind === "future" && onToday
      ? <Button size="lg" variant="secondary" onClick={onToday}>{t("staffLive.backToday")}</Button>
      : null;
  return (
    <div className="px-4 py-12 flex flex-col items-center text-center gap-3" role={danger ? "alert" : undefined}>
      {danger ? (
        <span className="grid place-items-center w-11 h-11 rounded-full" style={{ background: "rgba(239,68,68,0.12)" }}>
          <AlertTriangle size={20} style={{ color: "var(--status-bad)" }} aria-hidden="true" />
        </span>
      ) : null}
      <div className="max-w-md">
        <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{title}</div>
        <div className="text-sm mt-1" style={{ color: "var(--text-3)" }}>{msg}</div>
        {danger && isAdmin && data?.message && (
          <div className="text-xs mt-2 font-mono break-words" style={{ color: "var(--text-3)" }}>{data.message}</div>
        )}
      </div>
      {action}
    </div>
  );
}
