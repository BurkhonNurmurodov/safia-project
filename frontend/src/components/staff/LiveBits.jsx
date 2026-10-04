// The pieces only the LIVE «Verifix to'g'irlash» adds to /staff's Workers tab
// (`/staff-live`, the lab — `StaffApiContext` decides). Everything else on that
// page is /staff's own component; these say what only a live source can say:
// when the stored Verifix read was taken, who is inside right now, the hours a
// worker carried here while their name sits on another unit's day, and (for
// admins) what the read held.
import {
  AlertTriangle, ArrowRight, FlaskConical, Info, Loader2, Lock, RefreshCw, Unlock, ArrowRightLeft,
} from "lucide-react";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

export const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
export const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : "");
const n2 = (v) => (v == null ? "—" : String(Math.round(v * 100) / 100));

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
// is mixed over the CARD, never over whatever the chip sits on: inside the
// amber standing line a translucent amber stacked on amber fell under AA again.
const INK = { "#22c55e": "var(--status-ok)", "#eab308": "var(--status-warn)", "#ef4444": "var(--status-bad)" };

export function LiveChip({ color, children, dashed = false, title }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${color} 8%, var(--bg-card))`, color: INK[color] || "var(--text-2)",
        border: `1px ${dashed ? "dashed" : "solid"} ${color}66` }}>
      {children}
    </span>
  );
}

export function LiveStatusChip({ status }) {
  const { t } = useLang();
  const color = STATUS_TONE[status] || "#94a3b8";
  return (
    // On a phone the label may take two lines: «Chiqish belgisi yo'q» on one
    // line pushed the status column past a 320px screen.
    <span className="inline-flex items-center max-sm:items-start gap-1.5 text-xs whitespace-nowrap max-sm:whitespace-normal"
      style={{ color: "var(--text-2)" }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 max-sm:mt-[4px]" style={{ background: color }} />
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

export function liveFilterOptions(rows, t) {
  const primary = rows.filter((w) => !w.split_of);
  return LIVE_FILTERS.map((f) => [f, `${t(`staffLive.f.${f}`)} · ${primary.filter((w) => liveMatch(w, f)).length}`]);
}

// ── the header: lab note, the read, the day's standing ───────────────────────
function readAt(live) {
  const p = live?.pulled_at || "";
  if (!p) return "";
  const time = p.slice(11, 16);
  return p.slice(0, 10) === (live.now || "").slice(0, 10) ? time : `${p.slice(8, 10)}.${p.slice(5, 7)} ${time}`;
}

// `counts` splits «inside» into this unit's own people and those standing here
// under another unit's name — the strip counts only the first, so the line
// says the second out loud. `onGoClose` (only for those who may close the day)
// opens «Tasdiqlash» on this day — offered once everybody has left, the only
// state the close endpoint accepts; before that the line says when it can.
function CloseLine({ close, counts, onGoClose }) {
  const { t } = useLang();
  if (!close) return null;
  const s = close.state;
  const tone = s === "closed" ? "#22c55e" : s === "all_left" ? "#eab308" : "#94a3b8";
  const text = s === "closed"
    ? fill(t("staffLive.close.closed_manual"), { at: hhmm(close.at), by: close.by || "—" })
    : s === "all_left"
      ? fill(t("staffLive.close.all_left"), { last: hhmm(close.last_out) || "—" })
      : s === "open"
        ? (close.n > 0
          ? (counts?.extra_inside > 0
            ? (counts.inside > 0
              ? fill(t("staffLive.close.openExtra"), { n: counts.inside, x: counts.extra_inside })
              : fill(t("staffLive.close.openOnlyExtra"), { x: counts.extra_inside }))
            : fill(t("staffLive.close.open"), { n: close.n }))
          : fill(t("staffLive.close.openExpected"), { e: close.expected }))
        : t("staffLive.close.waiting");
  const open = s === "open" || s === "all_left";
  return (
    <div className="rounded-xl px-3 py-2 flex flex-wrap items-start gap-2 text-[13px]"
      style={{ background: `${tone}14`, border: `1px solid ${tone}55`, color: "var(--text-1)" }}>
      {s === "closed"
        ? <Lock size={15} style={{ color: tone }} className="flex-shrink-0 mt-0.5" />
        : <Unlock size={15} style={{ color: tone }} className="flex-shrink-0 mt-0.5" />}
      <div className="min-w-[12rem] flex-1">
        <div>{text}</div>
        {onGoClose && (s === "open" || s === "waiting") && (
          <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{t("staffLive.close.where")}</div>
        )}
        {open && (close.missing > 0 || close.pending > 0 || close.notified_at) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {close.missing > 0 && <LiveChip color="#ef4444">{fill(t("staffLive.close.missingNote"), { n: close.missing })}</LiveChip>}
            {close.pending > 0 && <LiveChip color="#eab308">{fill(t("staffLive.close.pendingNote"), { n: close.pending })}</LiveChip>}
            {close.notified_at && (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {fill(t("staffLive.close.notified"), { time: hhmm(close.notified_at) })}
              </span>
            )}
          </div>
        )}
      </div>
      {s === "all_left" && onGoClose && (
        <Button size="md" variant="secondary" className="flex-shrink-0 self-center max-sm:ml-[23px]" onClick={onGoClose}>
          {t("staffLive.close.go")} <ArrowRight size={14} />
        </Button>
      )}
    </div>
  );
}

export function LiveHeader({ data, onRefresh, refreshing, onGoClose }) {
  const { t } = useLang();
  const live = data?.live;
  return (
    <div className="px-3 pt-3 space-y-2">
      <div className="rounded-xl px-3 py-2 text-[12px] flex gap-2"
        style={{ background: "var(--bg-inner)", border: "1px dashed var(--border-md)", color: "var(--text-2)" }}>
        <FlaskConical size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
        <span>{t("staffLive.lab")}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="lg" variant="secondary" icon={<RefreshCw size={14} />} loading={refreshing}
          disabled={!onRefresh} onClick={onRefresh}>
          {t("staffLive.refresh")}
        </Button>
        <span className="text-xs tabular-nums inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
          {refreshing && <Loader2 size={13} className="animate-spin" />}
          {refreshing
            ? t("staffLive.loading")
            : live
              ? [
                live.pulled_at ? fill(t("staffLive.updated"), { time: readAt(live) }) : t("staffLive.notReadYet"),
                t(live.auto?.on ? "staffLive.autoNote" : "staffLive.storedNote"),
              ].join(" · ")
              : ""}
        </span>
      </div>
      {data?.error && (
        <div className="rounded-xl px-3 py-2.5 text-sm flex gap-2"
          style={{ background: "#ef444414", border: "1px solid #ef444455", color: "var(--text-1)" }}>
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <span>
            {data.error === "not_configured" ? t("staffLive.err.not_configured")
              : data.error === "no_cells" ? t("staffLive.err.no_cells")
                : data.error === "future" ? t("staffLive.err.future")
                  : data.error === "busy" ? t("staffLive.err.busy")
                    : fill(t("staffLive.err.generic"), { msg: data.message || data.error })}
          </span>
        </div>
      )}
      {live?.read_error && (
        <div className="rounded-xl px-3 py-2 text-xs flex gap-2"
          style={{ background: "#eab30814", border: "1px solid #eab30855", color: "var(--text-1)" }}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-px" style={{ color: "#eab308" }} />
          <span>{fill(t("staffLive.readError"), { at: hhmm(live.read_error.at), msg: live.read_error.message || "" })}</span>
        </div>
      )}
      {live && <CloseLine close={live.close} counts={live.counts} onGoClose={onGoClose} />}
    </div>
  );
}

// ── one row's name cell additions ────────────────────────────────────────────
export function LiveRowNotes({ w }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  return (
    <>
      {w.moved && (
        <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
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

export function LiveClockIn({ w }) {
  const { t } = useLang();
  if (!w.clock_in) return <span style={{ color: "var(--text-4)" }}>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {w.in_src && w.in_src !== "report"
        ? <span title={t("staffLive.inMark")} className="underline decoration-dotted underline-offset-2">{w.clock_in}</span>
        : w.clock_in}
      {w.late ? <LiveChip color="#eab308">{fill(t("staffLive.lateMin"), { n: w.late })}</LiveChip> : null}
    </span>
  );
}

// Clock Out is written only once the worker is OUT of this unit (the operator,
// 2026-10-04): left the plant, or moved on at that minute. While they are
// inside — or out on a break — the cell stays empty.
export function LiveClockOut({ w }) {
  const { t } = useLang();
  const out = w.status === "inside" || w.status === "break" ? null : w.clock_out;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {out
        ? (w.out_src && w.out_src !== "report"
          ? <span className="underline decoration-dotted underline-offset-2"
            title={t(w.out_src === "last_mark" ? "staffLive.outLastMark" : w.out_src === "gate" ? "staffLive.outGate" : "staffLive.outMark")}>{out}</span>
          : out)
        : <span style={{ color: "var(--text-4)" }}>—</span>}
      {w.early_out ? <LiveChip color="#eab308">{fill(t("staffLive.earlyOut"), { n: w.early_out })}</LiveChip> : null}
      {w.missing ? <LiveChip color="#ef4444">{t("staffLive.missing")}</LiveChip> : null}
    </span>
  );
}

// ── an admin's look at the read behind one row ───────────────────────────────
export function LiveRaw({ raw }) {
  const { t } = useLang();
  if (!raw) return null;
  return (
    <div className="text-[11px] font-mono space-y-1 whitespace-normal" style={{ color: "var(--text-2)" }}>
      <div>
        {t("staffLive.rawReport")}: in {raw.report?.input_time || "—"} · out {raw.report?.output_time || "—"}
        {" · "}{raw.report?.begin_time || "—"} → {raw.report?.end_time || "—"}
        {" · "}{raw.report?.day_kind || "—"}
      </div>
      <div>{t("staffLive.rawWindow")}: {(raw.window || []).map((x) => (x || "—").replace("T", " ")).join(" → ")}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{fill(t("staffLive.rawMarks"), { n: raw.marks_total ?? 0 })}:</span>
        {(raw.marks || []).length === 0 ? <span>—</span> : raw.marks.map(([tm, type, inWin], i) => (
          <span key={i} style={{ opacity: inWin ? 1 : 0.5 }}>{tm} {type || "?"}</span>
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
// those hours, each with where the name is now — and «hozir shu yerda» for a
// worker standing here, whom this unit files the next move for.
export function LiveExtras({ extras }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  if (!extras?.length) return null;
  const total = extras.reduce((s, x) => s + (x.hours || 0), 0);
  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <div className="px-3 pt-3 pb-1 flex items-center gap-2">
        <ArrowRightLeft size={14} style={{ color: "var(--brand-text)" }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          {t("staffLive.ex.title")}
        </span>
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
          {fill(t("staffLive.ex.total"), { n: n2(total) })}
        </span>
      </div>
      <div className="px-3 pb-2 text-[11px]" style={{ color: "var(--text-3)" }}>{t("staffLive.ex.sub")}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {["worker", "hours", "named", "status"].map((k) => (
                <th key={k} className="text-left px-3 py-2 border-b text-[11px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                  {t(`staffLive.ex.c.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {extras.map((x) => (
              <tr key={x.employee_id} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(x.worker_name)}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-1)" }}>
                  {n2(x.hours)}{x.so_far ? <span style={{ color: "var(--text-3)" }}>*</span> : null}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                  {x.named_at ? tl(x.named_at) : <span style={{ color: "var(--text-3)" }}>{t(`staffLive.ex.r.${x.reason}`)}</span>}
                </td>
                <td className="px-3 py-2">
                  {/* «hozir shu yerda» only while they ARE here: `here` is also
                      true for somebody who ended the day here and has left. */}
                  {x.here && (x.status === "inside" || x.status === "break")
                    ? <span className="inline-flex items-center gap-2"><LiveStatusChip status={x.status} />
                      <LiveChip color="#22c55e">{t("staffLive.ex.here")}</LiveChip></span>
                    : <LiveStatusChip status={x.here ? x.status : "moved_out"} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── the footer: how the hours are counted, and (admins) what the read held ───
export function LiveFooter({ data }) {
  const { t } = useLang();
  const { tx } = useTranslit();
  const live = data?.live;
  if (!live) return null;
  const d = live.diag;
  return (
    <div className="px-3 py-3 border-t text-[11px] space-y-1" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
      {(data.workers || []).some((w) => w.so_far) && <div>{t("staffLive.soFarNote")}</div>}
      <div>
        {live.formula
          ? fill(t("staffLive.hoursRule"), {
            kinds: live.formula.names.map((k) => tx(k)).join(" + "),
            pct: `${Math.round((live.formula.share || 0) * 100)}%`,
          })
          : t("staffLive.hoursClock")}
      </div>
      <div>{fill(t("staffLive.moveRule"), { min: live.rules?.min_moved_hours ?? 2 })}</div>
      <div>{fill(t("staffLive.rules"), {
        late: live.rules?.late_grace, early: live.rules?.early_grace, miss: live.rules?.missing_after,
      })}</div>
      {d && (
        <div>
          <div className="inline-flex items-center gap-1 font-semibold"><Info size={11} /> {t("staffLive.diag")}</div>
          <div className="mt-1 tabular-nums">
            {fill(t("staffLive.diagLine"), {
              e: d.employees, r: d.report_rows, m: d.marks,
              types: Object.entries(d.mark_types || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—",
            })}
          </div>
          <div className="mt-0.5 tabular-nums">
            {fill(t("staffLive.diagIn"), { report: d.in_sources?.report || 0, mark: d.in_sources?.mark || 0 })}
          </div>
          <div className="mt-0.5 tabular-nums">
            {fill(t("staffLive.diagOut"), {
              report: d.out_sources?.report || 0, mark: d.out_sources?.mark || 0,
              last: d.out_sources?.last_mark || 0, gate: d.out_sources?.gate || 0,
            })}
          </div>
          {(d.held?.back || d.held?.no_report_out) ? (
            <div className="mt-0.5 tabular-nums">
              {fill(t("staffLive.diagHeld"), { back: d.held.back || 0, none: d.held.no_report_out || 0 })}
            </div>
          ) : null}
          {!d.directed && d.marks > 0 && <div className="mt-0.5">{t("staffLive.diagUndirected")}</div>}
        </div>
      )}
    </div>
  );
}

