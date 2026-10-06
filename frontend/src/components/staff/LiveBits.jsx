// The pieces only a LIVE day adds to /staff (from `live_day.LIVE_FROM`): the
// status a worker is in right now, the notes a row carries (a move, a change
// waiting on approval) and the screen a day that cannot be shown puts up. The
// rest of the page is /staff's own (`StaffApiContext` picks the source per day).
// The look the lab page /staff-live gave a live day — the status strip, three
// figures, the freshness line, a phone list, the raw Verifix facts — went with
// that page on 2026-10-06.
import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

export const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
// Hours on a row carry two decimals.
export const n2 = (v) => (v == null ? "—" : Number(v).toFixed(2));

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
      className="inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[11px] leading-4 font-medium whitespace-nowrap tabular-nums"
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

// ── the day cannot be shown: the reason, and the one thing to do about it ────
// Instead of the whole page (figures of 0, eight empty filters, a search box,
// a disabled export) above «no data». `onRetry` re-reads Verifix now.
export function LiveDayState({ data, onRetry, retrying, isAdmin }) {
  const { t } = useLang();
  const err = data?.error;
  const kind = ["not_configured", "no_cells", "future", "busy", "no_unit", "day"].includes(err) ? err : "failed";
  const title = t(`staffLive.state.${kind}.title`);
  const msg = t(`staffLive.state.${kind}.msg`);
  const danger = kind === "failed" || kind === "day";
  const action = (danger || kind === "busy") && onRetry
    ? <Button size="lg" variant="secondary" loading={retrying} onClick={onRetry} icon={<RefreshCw size={15} />}>{t("staffLive.retry")}</Button>
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
