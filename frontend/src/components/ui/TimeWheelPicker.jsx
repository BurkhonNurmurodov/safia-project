import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Clock } from "lucide-react";
import { useLang } from "../../context/LangContext";

// Samsung-style wheel time picker, opened as a popup/bottom-sheet. Two snapping
// columns (hours | minutes) at 1-minute granularity, constrained to a valid
// [lo, hi] minute window: the minutes wheel narrows at the boundary hours so a
// time outside everyone's day can't be picked. `value` is an "HH:MM" string (or
// "" for none); `onConfirm` returns the chosen "HH:MM". `title` names what is
// being picked — the sheet is used by more than one flow now, and a header that
// still said "transfer time" while an ojidaniya's END was being chosen was the
// one label on screen describing a different task.
//
// The keyboard button in the action row swaps the wheels for two typed HH:MM
// inputs (wall clock) judged against the SAME [lo, hi] window — a wall-clock
// time before the window's start is read as next-day, exactly as the wheels
// render it, so the two modes can never disagree about what is pickable.
// Confirm stays disabled while the typed time is outside the window.

const ROW_H  = 44;                          // px per row
const VISIBLE = 5;                          // visible rows (odd → one centered)
const PAD    = ((VISIBLE - 1) / 2) * ROW_H; // spacer so the first/last row can center

function pad2(n) { return String(n).padStart(2, "0"); }
function parseHHMM(s) {
  if (!s) return null;
  const [h, m] = String(s).split(":");
  const hh = parseInt(h, 10), mm = parseInt(m, 10);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
}

// One scrollable wheel column. `valueIndex` positions it on (re)mount and
// whenever `resetKey` changes; user scrolling is reported back via `onChange`
// once it settles. An internal `center` drives the live fade as you drag.
function Wheel({ values, valueIndex, resetKey, onChange, ariaLabel }) {
  const ref    = useRef(null);
  const settle = useRef(null);
  const prog   = useRef(false);            // true while we scroll programmatically
  const [center, setCenter] = useState(valueIndex);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    prog.current = true;
    el.scrollTop = valueIndex * ROW_H;
    setCenter(valueIndex);
    const id = setTimeout(() => { prog.current = false; }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const live = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW_H)));
    setCenter(live);
    if (prog.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW_H)));
      if (Math.abs(el.scrollTop - i * ROW_H) > 1) el.scrollTo({ top: i * ROW_H, behavior: "smooth" });
      setCenter(i);
      onChange(i);
    }, 110);
  }

  function pick(i) {
    ref.current?.scrollTo({ top: i * ROW_H, behavior: "smooth" });
    setCenter(i);
    onChange(i);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="no-scrollbar"
      style={{
        height: VISIBLE * ROW_H, width: 76, overflowY: "auto",
        scrollSnapType: "y mandatory", scrollbarWidth: "none", msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
      }}>
      <div style={{ height: PAD }} />
      {values.map((v, i) => {
        const d = Math.abs(i - center);
        const opacity = d === 0 ? 1 : d === 1 ? 0.5 : d === 2 ? 0.22 : 0.1;
        return (
          <div
            key={v}
            role="option"
            aria-selected={i === center}
            onClick={() => pick(i)}
            style={{
              height: ROW_H, scrollSnapAlign: "center",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: d === 0 ? 26 : 22, fontWeight: d === 0 ? 700 : 500,
              color: d === 0 ? "var(--text-1)" : "var(--text-3)", opacity,
              transition: "opacity .12s ease, font-size .12s ease",
              cursor: "pointer", userSelect: "none",
            }}>
            {v}
          </div>
        );
      })}
      <div style={{ height: PAD }} />
    </div>
  );
}

function WheelDialog({ lo, hi, value, title, onConfirm, onClose }) {
  const { t } = useLang();
  const loH = Math.floor(lo / 60), hiH = Math.floor(hi / 60);
  // Hour values are kept in "extended" form (can exceed 23 for an overnight window
  // that crossed midnight) so minute bounds stay monotonic; they're shown and
  // emitted as wall-clock via h % 24 (e.g. 24 → 00, 29 → 05).
  const hours = useMemo(() => {
    const a = []; for (let h = loH; h <= hiH; h++) a.push(h); return a;
  }, [loH, hiH]);

  const init = (() => {
    let m = parseHHMM(value);
    if (m != null && m < lo) m += 1440;          // post-midnight wall-clock → next day
    if (m == null || m < lo || m > hi) m = lo;
    return m;
  })();
  const [hour, setHour]     = useState(Math.floor(init / 60));
  const [minute, setMinute] = useState(init % 60);

  // Manual (typed) entry — the wheels' equal twin, never a separate validator.
  const [manual, setManual] = useState(false);
  const [hStr, setHStr]     = useState("");
  const [mStr, setMStr]     = useState("");
  const hourRef = useRef(null);
  const minRef  = useRef(null);

  // Minutes valid for the currently selected hour (narrowed at the boundaries).
  const minutes = useMemo(() => {
    const minM = hour === loH ? lo % 60 : 0;
    const maxM = hour === hiH ? hi % 60 : 59;
    const a = []; for (let mm = minM; mm <= maxM; mm++) a.push(mm); return a;
  }, [hour, loH, hiH, lo, hi]);

  // Keep the minute inside the valid set whenever the hour (→ minutes) changes.
  useEffect(() => {
    if (!minutes.length) return;
    if (minute < minutes[0]) setMinute(minutes[0]);
    else if (minute > minutes[minutes.length - 1]) setMinute(minutes[minutes.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);

  const hourIdx = Math.max(0, hours.indexOf(hour));
  const minIdx  = Math.max(0, minutes.indexOf(minute));

  // Typed wall clock → extended minutes inside [lo, hi], or null. Mirrors the
  // seed logic above: a wall-clock time before the window's start belongs to
  // the next day.
  const typedMin = useMemo(() => {
    if (hStr === "" || mStr === "") return null;
    const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
    if (!Number.isFinite(h) || h > 23 || !Number.isFinite(m) || m > 59) return null;
    let x = h * 60 + m;
    if (x < lo) x += 1440;
    return x >= lo && x <= hi ? x : null;
  }, [hStr, mStr, lo, hi]);

  // A valid typed time IS the selection — switching back to the wheels lands
  // on it, and Confirm needs no second code path.
  useEffect(() => {
    if (!manual || typedMin == null) return;
    setHour(Math.floor(typedMin / 60));
    setMinute(typedMin % 60);
  }, [manual, typedMin]);

  useEffect(() => {
    if (!manual) return;
    const id = setTimeout(() => { hourRef.current?.focus(); hourRef.current?.select(); }, 50);
    return () => clearTimeout(id);
  }, [manual]);

  function toggleManual() {
    if (!manual) { setHStr(pad2(hour % 24)); setMStr(pad2(minute)); }
    setManual((v) => !v);
  }

  const hBad = hStr !== "" && parseInt(hStr, 10) > 23;
  const mBad = mStr !== "" && parseInt(mStr, 10) > 59;
  const rangeBad = !hBad && !mBad && hStr !== "" && mStr !== "" && typedMin == null;
  const canConfirm = !manual || typedMin != null;

  const wall = (x) => `${pad2(Math.floor(x / 60) % 24)}:${pad2(x % 60)}`;
  const invalidMsg = t("ui.timeWheel.invalid").replace("{from}", wall(lo)).replace("{to}", wall(hi));

  function confirm() {
    const m = manual && typedMin != null ? typedMin : hour * 60 + minute;
    onConfirm(`${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`);
  }

  const timeInput = (ref, val, set, bad, ariaLabel, onFull) => (
    <input
      ref={ref}
      value={val}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 2);
        set(v);
        if (v.length === 2) onFull?.();
      }}
      onBlur={() => { if (val.length === 1) set("0" + val); }}
      onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) confirm(); }}
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="00"
      aria-label={ariaLabel}
      aria-invalid={bad || rangeBad || undefined}
      className="text-center rounded-xl outline-none"
      style={{
        width: 76, height: ROW_H + 12, fontSize: 26, fontWeight: 700,
        background: "var(--bg-inner)",
        border: `1px solid ${bad || rangeBad ? "#ef4444" : "var(--border-md)"}`,
        color: "var(--text-1)", caretColor: "var(--brand)",
        fontVariantNumeric: "tabular-nums",
      }}
    />
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", paddingBottom: "calc(var(--tg-safe-bottom, 0px))" }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[280px] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", boxShadow: "0 -8px 40px rgba(0,0,0,0.35)" }}>
        {/* header */}
        <div className="px-5 py-3 text-center text-sm font-semibold border-b"
          style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
          {title || t("staff.transferTimeToggle")}
        </div>

        {manual ? (
          /* typed entry — same window, judged by typedMin above */
          <div className="px-6 py-6">
            <div className="flex items-center justify-center gap-1.5">
              {timeInput(hourRef, hStr, setHStr, hBad, "hours",
                () => { minRef.current?.focus(); minRef.current?.select(); })}
              <div className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>:</div>
              {timeInput(minRef, mStr, setMStr, mBad, "minutes")}
            </div>
            {(hBad || mBad || rangeBad) && (
              <p className="mt-3 text-[11px] text-center leading-snug" style={{ color: "#ef4444" }}>
                {invalidMsg}
              </p>
            )}
          </div>
        ) : (
          /* wheels */
          <div className="relative px-6 py-5">
            {/* center selection band */}
            <div className="pointer-events-none absolute left-6 right-6"
              style={{ top: "50%", transform: "translateY(-50%)", height: ROW_H, background: "var(--bg-inner)", borderRadius: 12 }} />
            {/* top / bottom fade */}
            <div className="pointer-events-none absolute left-0 right-0" style={{ top: 0, height: PAD + 20,
              background: "linear-gradient(var(--bg-card), transparent)" }} />
            <div className="pointer-events-none absolute left-0 right-0" style={{ bottom: 0, height: PAD + 20,
              background: "linear-gradient(transparent, var(--bg-card))" }} />

            <div className="relative flex items-stretch justify-center gap-1">
              <Wheel values={hours.map(h => pad2(h % 24))} valueIndex={hourIdx} resetKey="h"
                onChange={(i) => setHour(hours[i])} ariaLabel="hours" />
              <div className="flex items-center text-2xl font-bold" style={{ color: "var(--text-1)" }}>:</div>
              <Wheel values={minutes.map(pad2)} valueIndex={minIdx} resetKey={`m-${hour}`}
                onChange={(i) => setMinute(minutes[i])} ariaLabel="minutes" />
            </div>
          </div>
        )}

        {/* actions */}
        <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={toggleManual}
            aria-label={manual ? t("ui.timeWheel.wheel") : t("ui.timeWheel.manual")}
            title={manual ? t("ui.timeWheel.wheel") : t("ui.timeWheel.manual")}
            className="px-3 py-2.5 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            {manual ? <Clock size={16} /> : <Keyboard size={16} />}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 text-xs font-medium py-2.5 rounded-lg"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            {t("staff.cancel")}
          </button>
          <button type="button" disabled={!canConfirm} onClick={confirm}
            className="flex-1 text-xs font-semibold py-2.5 rounded-lg disabled:cursor-not-allowed"
            style={{ background: "var(--brand)", color: "#fff", opacity: canConfirm ? 1 : 0.5 }}>
            {t("staff.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimeWheelPicker({ open, lo, hi, value, title, onConfirm, onClose }) {
  if (!open || lo == null || hi == null || hi < lo) return null;
  // Re-mounts fresh on each open (unmounted while closed) → state seeds from `value`.
  return createPortal(
    <WheelDialog lo={lo} hi={hi} value={value} title={title} onConfirm={onConfirm} onClose={onClose} />,
    document.body,
  );
}
