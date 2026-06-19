import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../../context/LangContext";

// Samsung-style wheel time picker, opened as a popup/bottom-sheet. Two snapping
// columns (hours | minutes) at 1-minute granularity, constrained to a valid
// [lo, hi] minute window: the minutes wheel narrows at the boundary hours so a
// time outside everyone's day can't be picked. `value` is an "HH:MM" string (or
// "" for none); `onConfirm` returns the chosen "HH:MM".

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

function WheelDialog({ lo, hi, value, onConfirm, onClose }) {
  const { t } = useLang();
  const loH = Math.floor(lo / 60), hiH = Math.floor(hi / 60);
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

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", paddingBottom: "calc(var(--tg-safe-bottom, 0px))" }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[280px] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", boxShadow: "0 -8px 40px rgba(0,0,0,0.35)" }}>
        {/* header */}
        <div className="px-5 py-3 text-center text-sm font-semibold border-b"
          style={{ color: "var(--text-1)", borderColor: "var(--border)" }}>
          {t("staff.transferTimeToggle")}
        </div>

        {/* wheels */}
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
            <Wheel values={hours.map(pad2)} valueIndex={hourIdx} resetKey="h"
              onChange={(i) => setHour(hours[i])} ariaLabel="hours" />
            <div className="flex items-center text-2xl font-bold" style={{ color: "var(--text-1)" }}>:</div>
            <Wheel values={minutes.map(pad2)} valueIndex={minIdx} resetKey={`m-${hour}`}
              onChange={(i) => setMinute(minutes[i])} ariaLabel="minutes" />
          </div>
        </div>

        {/* actions */}
        <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={onClose}
            className="flex-1 text-xs font-medium py-2.5 rounded-lg"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            {t("staff.cancel")}
          </button>
          <button type="button" onClick={() => onConfirm(`${pad2(hour)}:${pad2(minute)}`)}
            className="flex-1 text-xs font-semibold py-2.5 rounded-lg"
            style={{ background: "var(--brand)", color: "#fff" }}>
            {t("staff.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimeWheelPicker({ open, lo, hi, value, onConfirm, onClose }) {
  if (!open || lo == null || hi == null || hi < lo) return null;
  // Re-mounts fresh on each open (unmounted while closed) → state seeds from `value`.
  return createPortal(
    <WheelDialog lo={lo} hi={hi} value={value} onConfirm={onConfirm} onClose={onClose} />,
    document.body,
  );
}
