import {
  useState, useEffect, useMemo, useSyncExternalStore, useCallback, createElement,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play, Square, Radio, WifiOff, CloudUpload, AlertTriangle, Timer, TimerOff,
  Trash2, RotateCw, Check, Clock, Info,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import TimeField from "../ui/TimeField";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmDialog from "../ui/ConfirmDialog";
import api from "../../utils/api";
import { errText, isRetryable } from "../../utils/idleErrors";
import { fmtDur } from "../../utils/idleTime";
import { CATS, iconFor, catByName, catColor } from "./categories";
import {
  CAP_MIN, subscribe, snapshot, startRun, finishRun, queueRun, retryRun,
  resumeRun, discardRun, capOverdue, elapsedMin, flush, tashkentAt,
} from "../../utils/liveOjidaniya";

// The live start/finish recorder — /idle-cell «Jonli», the page's fourth tab.
//
// ▶ when the cell stops, ■ when it runs again. Both presses are recorded on the
// DEVICE and sent when there is signal; see utils/liveOjidaniya.js for why the
// clock is the phone's and what that costs. Nothing here re-derives a total:
// the moment a record reaches the server it becomes an ordinary ojidaniya and
// the register beside it is what states the day.
//
// Three rules the layout is built on:
//   • the elapsed time is the loudest thing on a running row — it is the only
//     number that is changing, and the whole reason to look at this tab;
//   • a record that has not reached the server SAYS so, per record, for as long
//     as that is true. A queue that reports nothing is indistinguishable from
//     work that was never recorded, which is the failure this tab exists to
//     prevent, not to introduce;
//   • the reason (izoh) is owed at ■ and the register refuses a record without
//     one — so an unanswered one stays visible as «pending» rather than being
//     dropped or silently filed with a placeholder nobody wrote.

const RETRY_MS = 20000;   // the queue is retried on a timer as well as on `online`:
                          // `online` never fires for a drop that lasted a second.

const pad2 = (n) => String(n).padStart(2, "0");
const todayIso = () => tashkentAt().date;

/** The tab's clock: one value, ticking only while something is actually
 *  running, handed down to every row. Reading `Date.now()` during render would
 *  make each row impure and — worse — let two rows on one screen disagree about
 *  the second they are showing. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    // Re-synced on the next tick rather than in the effect body: the value may
    // be minutes stale (nothing was running, so nothing was ticking), and the
    // first press must not be read against it. The elapsed figure is clamped at
    // zero, so the one frame before this lands shows 00:00, never a negative.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active]);
  return now;
}

/** "00:18" / "8:04:12" — seconds included, because a stop of under a minute is
 *  otherwise a row that reads as frozen at 0. */
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

const catName = (name, t) => {
  const c = catByName(name);
  if (!c) return name;
  const lbl = t(`downtime.cat.${c.code}.label`);
  return lbl && !lbl.startsWith("downtime.cat.")
    ? `${t("idleCell.category")} ${c.code} · ${lbl}`
    : `${t("idleCell.category")} ${c.code}`;
};

/* ------------------------------------------------------------- start sheet */

// The clock is stamped by the PRESS that opened this sheet, not by the confirm:
// the seconds spent choosing a category belong to the stop. The sheet says so
// by showing that instant and counting up from it while it stands open.
function StartSheet({ atMs, cell, date, t, onCancel, onStart }) {
  const [category, setCategory] = useState("");
  const [wants, setWants] = useState(true);
  const now = useNow(true);

  // Cat H has no not-stopped half anywhere in the system, so the answer is
  // DERIVED rather than corrected after the fact — a value that is silently
  // overwritten a render later is a value the operator watched themselves set.
  const cat = catByName(category);
  const locked = !!cat?.alwaysStopped;
  const stopped = locked ? true : wants;

  const at = tashkentAt(atMs);

  return (
    <Modal
      open
      onClose={onCancel}
      icon={<Play size={16} />}
      title={t("idleCell.liveStartTitle")}
      subtitle={`${cell.verifix_code} · ${date}`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{t("idleCell.cancel")}</Button>
          <Button
            variant="primary"
            icon={<Play size={15} />}
            disabled={!category}
            onClick={() => onStart({ category, stopped })}
          >
            {t("idleCell.liveStart")}
          </Button>
        </>
      }
    >
      {/* The stamped instant, and the count-up from it — so the operator can see
          that the record already began and that thinking about the category is
          not costing the cell its minutes. */}
      <div
        className="rounded-xl px-3 py-2.5 flex items-baseline gap-2 flex-wrap"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
      >
        <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
          {t("idleCell.liveStartedAt")}
        </span>
        <span className="text-lg font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{at.hhmm}</span>
        <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--brand)" }}>
          {fmtElapsed(now - atMs)}
        </span>
      </div>

      <FormField label={t("idleCell.liveCategory")} required>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {CATS.map((c) => {
            const Icon = iconFor(c.code);
            const on = category === c.name;
            const col = catColor(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setCategory(c.name)}
                title={t(`downtime.cat.${c.code}.label`)}
                className="flex items-center gap-1.5 min-w-0 px-2 py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{
                  background: on ? `${col}22` : "var(--bg-inner)",
                  border: `1px solid ${on ? col : "var(--border)"}`,
                  color: on ? col : "var(--text-2)",
                }}
              >
                <Icon size={14} style={{ color: col, flexShrink: 0 }} />
                <span className="flex-shrink-0">{t("idleCell.category")} {c.code}</span>
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField
        label={t("idleCell.colStatus")}
        hint={locked ? t("idleCell.catHAlwaysStopped") : null}
      >
        <SegmentedToggle
          fill
          value={stopped ? "yes" : "no"}
          onChange={(v) => !locked && setWants(v === "yes")}
          options={[
            { value: "yes", label: t("idleCell.stopped"), title: t("idleCell.stoppedHint") },
            { value: "no", label: t("idleCell.notStopped"), title: t("idleCell.notCountedHint") },
          ]}
        />
      </FormField>
    </Modal>
  );
}

/* ------------------------------------------------------------ finish sheet */

// The reason, and the last chance to correct the two clocks — which is what a
// capped run needs, and the only thing that can rescue one.
function FinishSheet({ rec, cell, t, onClose, onSave, onResume, onDiscard }) {
  // Seeded ONCE. The parent keys this component on the record's id, so a new
  // record remounts it — and a background write to the store (another cell's
  // timer ticking past the cap) leaves the half-typed reason exactly where it
  // was, which re-seeding from `rec` would wipe. Same rule IntervalFormModal
  // states for the form next door.
  const [note, setNote] = useState(rec.note || "");
  const [start, setStart] = useState(rec.start || "");
  const [end, setEnd] = useState(rec.end || "");
  const [askDrop, setAskDrop] = useState(false);

  const mins = elapsedMin({ ...rec, state: "pending", start, end });
  const valid = note.trim().length > 0 && !!start && !!end && start !== end;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        // NOT `Square`: the ■ that makes sense on the button beside its own
        // label renders in the header chip as an empty box, i.e. an unticked
        // checkbox the reader looks for a way to tick.
        icon={<TimerOff size={16} />}
        title={t("idleCell.liveFinishTitle")}
        subtitle={`${cell?.verifix_code || rec.cellCode} · ${rec.date}`}
        footer={
          <>
            {/* NOT a discard: the clocks are already captured and closing
                without a reason leaves the record standing on the row. The
                button that throws it away says so and confirms. */}
            <Button variant="secondary" onClick={onClose}>{t("idleCell.liveLater")}</Button>
            {/* «The stop is not over» — the answer to a ■ pressed a minute too
                early, which on a phone carried round a floor is the likeliest
                mistake there is. Withheld on a CAPPED record: that run is
                already past the point where the platform goes on counting it,
                so resuming would re-cap it on the next tick and the button
                would appear to do nothing. There the fix is the end field. */}
            {!rec.capped && (
              <Button
                variant="secondary" tint icon={<Play size={15} />}
                onClick={() => onResume({ note })}
              >
                {t("idleCell.liveResume")}
              </Button>
            )}
            <Button
              variant="primary" icon={<Check size={15} />}
              disabled={!valid} onClick={() => onSave({ note, start, end })}
            >
              {t("idleCell.liveSave")}
            </Button>
          </>
        }
      >
        <div
          className="rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
        >
          <CatChip name={rec.category} t={t} />
          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-1)" }}>
            {start} – {end}
          </span>
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
            {fmtDur(mins, t)}
          </span>
        </div>

        {rec.capped && (
          // A run nobody ended. It claims the cap and no more, and it says both
          // things: how long it is allowed to state, and that the number was
          // not witnessed.
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] leading-snug"
            style={{
              background: "rgba(234,179,8,0.12)",
              border: "1px solid rgba(234,179,8,0.35)",
              color: "var(--text-2)",
            }}
          >
            <AlertTriangle size={14} style={{ color: "#eab308", flexShrink: 0 }} />
            <span>{t("idleCell.liveCappedHint").replace("{v}", fmtDur(CAP_MIN, t))}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("idleCell.startTime")} required>
            <TimeField value={start} onChange={setStart} clearable={false} />
          </FormField>
          <FormField label={t("idleCell.endTime")} required>
            <TimeField value={end} onChange={setEnd} clearable={false} />
          </FormField>
        </div>

        <FormField
          label={t("idleCell.colNote")}
          required
          hint={t("idleCell.liveNoteHint")}
        >
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("idleCell.notePlaceholder")}
            className="w-full rounded-xl px-3 py-2 text-sm resize-y"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
          />
        </FormField>

        <button
          type="button"
          onClick={() => setAskDrop(true)}
          className="text-[11px] underline underline-offset-2"
          style={{ color: "var(--text-4)" }}
        >
          {t("idleCell.liveDiscard")}
        </button>
      </Modal>

      <ConfirmDialog
        open={askDrop}
        tone="danger"
        title={t("idleCell.liveDiscardTitle")}
        message={t("idleCell.liveDiscardConfirm")}
        confirmLabel={t("idleCell.liveDiscard")}
        cancelLabel={t("idleCell.cancel")}
        onCancel={() => setAskDrop(false)}
        onConfirm={() => { setAskDrop(false); onDiscard(); }}
      />
    </>
  );
}

function CatChip({ name, t }) {
  const c = catByName(name);
  const col = catColor(name);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg min-w-0"
      style={{ background: `${col}1f`, border: `1px solid ${col}59`, color: col }}
      title={catName(name, t)}
    >
      {/* `createElement` rather than binding the icon to a capitalised local:
          `iconFor` reads a module-level map, so the reference is stable, but a
          component ASSIGNED during render is indistinguishable from one
          DEFINED there — and the one that is defined there loses its state on
          every render. Spelling it this way keeps the distinction visible. */}
      {createElement(iconFor(c?.code), { size: 12, style: { flexShrink: 0 } })}
      <span className="flex-shrink-0">{t("idleCell.category")} {c?.code || "?"}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- the rows */

function RunningRow({ rec, now, t, onFinish }) {
  const ms = Math.max(0, now - rec.startedAtMs);
  const near = ms >= (CAP_MIN - 30) * 60000;   // within half an hour of the cap
  return (
    <div
      className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-xl"
      style={{
        background: near ? "rgba(234,179,8,0.10)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${near ? "rgba(234,179,8,0.35)" : "rgba(239,68,68,0.28)"}`,
      }}
    >
      {/* `.live-pulse` is the /live monitor's own ring (reduced-motion gated
          there, so this inherits the gating). It animates a box-shadow, so it
          needs a shape to sit on. */}
      <span
        className="live-pulse flex-shrink-0"
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 999, background: near ? "#eab308" : "#ef4444" }}
      />
      <CatChip name={rec.category} t={t} />
      <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rec.start}</span>
      {!rec.stopped && (
        <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(148,163,184,0.16)", color: "var(--text-3)" }}>
          {t("idleCell.notStopped")}
        </span>
      )}
      <span
        className="text-base font-bold tabular-nums ml-auto"
        style={{ color: near ? "#eab308" : "var(--text-1)" }}
        title={t("idleCell.liveRunning")}
      >
        {fmtElapsed(ms)}
      </span>
      <Button size="sm" variant="danger" tint icon={<Square size={13} />} onClick={onFinish}>
        {t("idleCell.liveFinish")}
      </Button>
    </div>
  );
}

// Module scope, so the icon component is a stable reference rather than one
// created inside a render — and so the three not-yet-filed states are declared
// in one place instead of being spelled out down the JSX.
const TONE = {
  pending: { bg: "rgba(234,179,8,0.10)", bd: "rgba(234,179,8,0.35)", fg: "#eab308", Icon: Timer },
  queued:  { bg: "rgba(100,116,139,0.12)", bd: "rgba(100,116,139,0.32)", fg: "var(--text-3)", Icon: CloudUpload },
  failed:  { bg: "rgba(239,68,68,0.10)", bd: "rgba(239,68,68,0.35)", fg: "#ef4444", Icon: AlertTriangle },
};

function RecordRow({ rec, t, onOpen, onRetry, onDiscard }) {
  const tone = TONE[rec.state];
  if (!tone) return null;
  const Icon = tone.Icon;
  return (
    <div
      className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-xl"
      style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}
    >
      <Icon size={14} style={{ color: tone.fg, flexShrink: 0 }} />
      <CatChip name={rec.category} t={t} />
      <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>
        {rec.start} – {rec.end}
      </span>
      <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
        {fmtDur(elapsedMin(rec), t)}
      </span>
      {rec.capped && (
        <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(234,179,8,0.18)", color: "#eab308" }}>
          {t("idleCell.liveCapped")}
        </span>
      )}
      <span className="basis-full sm:basis-auto sm:ml-auto text-[11px]" style={{ color: tone.fg }}>
        {rec.state === "pending" && t("idleCell.livePending")}
        {rec.state === "queued" && t("idleCell.liveQueued")}
        {rec.state === "failed" && (rec.error || t("idleCell.liveFailed"))}
      </span>
      {rec.state === "pending" && (
        <Button size="sm" variant="primary" tint icon={<Check size={13} />} onClick={onOpen}>
          {t("idleCell.liveFinishUp")}
        </Button>
      )}
      {rec.state === "failed" && (
        <>
          <Button size="sm" variant="secondary" tint icon={<RotateCw size={13} />} onClick={onRetry}>
            {t("idleCell.liveRetry")}
          </Button>
          <Button size="sm" variant="danger" tint icon={<Trash2 size={13} />} onClick={onDiscard}>
            {t("idleCell.liveDiscard")}
          </Button>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- the tab */

export default function LiveOjidaniya({ cells, date, day, t, tl, toast, onToday }) {
  const qc = useQueryClient();
  const records = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [starting, setStarting] = useState(null);   // { cell, atMs }
  const [finishing, setFinishing] = useState(null); // record id
  const [dropId, setDropId] = useState(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const running = records.filter((r) => r.state === "running");
  const unsent = records.filter((r) => r.state !== "running");
  const now = useNow(running.length > 0);

  // A forgotten run stops counting at the cap. It rides the tab's own clock —
  // a run only reaches the cap while it is running, which is exactly when that
  // clock is ticking, so this needs no timer of its own.
  useEffect(() => { capOverdue(); }, [now]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const send = useCallback(
    () => flush((body) => api.post("/api/idle-cell/intervals", body), {
      onSent: () => qc.invalidateQueries({ queryKey: ["idle-cells"] }),
      retryable: isRetryable,
      describe: (e) => errText(e, t),
    }),
    [qc, t],
  );

  // The queue is drained on open, whenever the line comes back, and on a timer
  // — `online` never fires for a drop that lasted one second, and a record that
  // waited for somebody to reopen the page is a record that was never filed.
  const queued = records.some((r) => r.state === "queued");
  useEffect(() => {
    send();
    const id = setInterval(() => { if (navigator.onLine) send(); }, RETRY_MS);
    window.addEventListener("online", send);
    return () => { clearInterval(id); window.removeEventListener("online", send); };
  }, [send, queued]);

  const byCell = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      if (!m.has(r.cellId)) m.set(r.cellId, []);
      m.get(r.cellId).push(r);
    }
    return m;
  }, [records]);

  const isToday = date === todayIso();
  const dayShut = !!(day && !day.can_write);
  const canStart = isToday && !dayShut;
  const finishRec = records.find((r) => r.id === finishing) || null;

  // Records whose cell is not in the list on screen — a filter narrowed the
  // page, or the cell moved. They must not disappear: an unsent record that
  // nothing renders is exactly the silent loss this tab exists to prevent.
  const shownIds = new Set(cells.map((c) => c.cell_id));
  const orphans = records.filter((r) => !shownIds.has(r.cellId));

  return (
    <div className="space-y-3">
      {/* What this tab is, and the one thing about it a reader must know: the
          clock comes from this phone. Stated once, at the top, rather than
          discovered from a wrong time on a record next week. */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[11px] leading-snug"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-3)" }}
      >
        <Radio size={14} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
        <span>{t("idleCell.liveIntro")}</span>
      </div>

      {!online && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)", color: "var(--text-2)" }}
        >
          <WifiOff size={14} style={{ color: "#eab308", flexShrink: 0 }} />
          {t("idleCell.liveOffline")}
        </div>
      )}

      {unsent.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
        >
          <CloudUpload size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          {t("idleCell.liveUnsent").replace("{n}", unsent.length)}
          <Button size="sm" variant="secondary" tint className="ml-auto"
                  icon={<RotateCw size={13} />} onClick={send}>
            {t("idleCell.liveSendNow")}
          </Button>
        </div>
      )}

      {!isToday && (
        // Starting a stop on a day that is not today would stamp the press with
        // today's clock and file it against another date. Refused, with the way
        // out — the records already on the page still finish and send.
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: "rgba(100,116,139,0.14)", border: "1px solid rgba(100,116,139,0.35)", color: "var(--text-2)" }}
        >
          <Clock size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
          {t("idleCell.liveNotToday")}
          <Button size="sm" variant="secondary" tint className="ml-auto" onClick={onToday}>
            {t("idleCell.liveGoToday")}
          </Button>
        </div>
      )}

      {cells.map((c) => {
        const mine = byCell.get(c.cell_id) || [];
        return (
          <div
            key={c.cell_id}
            className="rounded-2xl px-3 py-3 space-y-2"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-bold px-2 py-1 rounded-md tabular-nums flex-shrink-0"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
              >
                {c.verifix_code}
              </span>
              <span className="text-[11px] truncate" style={{ color: c.leader ? "var(--text-3)" : "var(--text-4)" }}>
                {c.leader ? tl(c.leader) : t("idleCell.noLeader")}
              </span>
              <Button
                size="lg" variant="primary" icon={<Play size={15} />}
                className="ml-auto min-h-[44px] md:min-h-0"
                disabled={!canStart}
                title={dayShut ? t("idleCell.dayClosedErr") : (!isToday ? t("idleCell.liveNotToday") : undefined)}
                onClick={() => setStarting({ cell: c, atMs: Date.now() })}
              >
                {t("idleCell.liveStart")}
              </Button>
            </div>

            {mine.length === 0 ? (
              <div className="text-[11px] py-1" style={{ color: "var(--text-4)" }}>
                {t("idleCell.liveNoRuns")}
              </div>
            ) : (
              <div className="space-y-1.5">
                {mine.map((r) => (r.state === "running" ? (
                  <RunningRow key={r.id} rec={r} now={now} t={t}
                              onFinish={() => { finishRun(r.id); setFinishing(r.id); }} />
                ) : (
                  <RecordRow
                    key={r.id} rec={r} t={t}
                    onOpen={() => setFinishing(r.id)}
                    onRetry={() => { retryRun(r.id); send(); }}
                    onDiscard={() => setDropId(r.id)}
                  />
                )))}
              </div>
            )}
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div
          className="rounded-2xl px-3 py-3 space-y-2"
          style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)" }}
        >
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            <Info size={13} style={{ flexShrink: 0 }} />
            {t("idleCell.liveOffScope")}
          </div>
          {orphans.map((r) => (r.state === "running" ? (
            <RunningRow key={r.id} rec={r} now={now} t={t}
                        onFinish={() => { finishRun(r.id); setFinishing(r.id); }} />
          ) : (
            <RecordRow
              key={r.id} rec={r} t={t}
              onOpen={() => setFinishing(r.id)}
              onRetry={() => { retryRun(r.id); send(); }}
              onDiscard={() => setDropId(r.id)}
            />
          )))}
        </div>
      )}

      {starting && <StartSheet
        key={starting.atMs}
        atMs={starting.atMs}
        cell={starting.cell}
        date={date}
        t={t}
        onCancel={() => setStarting(null)}
        onStart={({ category, stopped }) => {
          startRun({
            atMs: starting.atMs,
            cellId: starting.cell.cell_id,
            cellCode: starting.cell.verifix_code,
            date,
            category,
            stopped,
          });
          setStarting(null);
        }}
      />}

      {finishRec && <FinishSheet
        key={finishRec.id}
        rec={finishRec}
        cell={cells.find((c) => c.cell_id === finishRec?.cellId)}
        t={t}
        onClose={() => setFinishing(null)}
        onSave={({ note, start, end }) => {
          queueRun(finishRec.id, { note, start, end });
          setFinishing(null);
          toast?.success?.(t("idleCell.liveQueuedToast"));
          send();
        }}
        onResume={({ note }) => {
          // The typed reason travels with the resume, so a leader who had
          // started explaining and then realised the cell was still down does
          // not have to write it twice.
          resumeRun(finishRec.id, { note });
          setFinishing(null);
          toast?.info?.(t("idleCell.liveResumedToast"));
        }}
        onDiscard={() => { discardRun(finishRec.id); setFinishing(null); }}
      />}

      <ConfirmDialog
        open={!!dropId}
        tone="danger"
        title={t("idleCell.liveDiscardTitle")}
        message={t("idleCell.liveDiscardConfirm")}
        confirmLabel={t("idleCell.liveDiscard")}
        cancelLabel={t("idleCell.cancel")}
        onCancel={() => setDropId(null)}
        onConfirm={() => { discardRun(dropId); setDropId(null); }}
      />
    </div>
  );
}
