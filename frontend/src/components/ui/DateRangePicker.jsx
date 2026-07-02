import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { useLang } from "../../context/LangContext";

// ── date helpers ──────────────────────────────────────────────────────────────

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayISO() { return localISO(new Date()); }
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d);
}
function som(y, m) { return localISO(new Date(y, m, 1)); }
function eom(y, m) { return localISO(new Date(y, m+1, 0)); }
function navMo(y, m, dir) {
  if (dir < 0) return m === 0  ? [y-1, 11] : [y, m-1];
  return            m === 11 ? [y+1, 0]  : [y, m+1];
}
function calDays(y, m) {
  const firstDow = new Date(y, m, 1).getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const dim      = new Date(y, m+1, 0).getDate();
  const days     = [];
  for (let i = offset; i > 0; i--) days.push({ iso: localISO(new Date(y,m,1-i)),   cur: false });
  for (let i = 1; i <= dim; i++)   days.push({ iso: localISO(new Date(y,m,i)),      cur: true  });
  while (days.length < 42)         days.push({ iso: localISO(new Date(y,m+1,days.length-dim-offset+1)), cur: false });
  return days;
}
function fmtRange(from, to, t) {
  const f = iso => { if (!iso) return ""; const [y,m,d]=iso.split("-"); return `${parseInt(d)} ${t(`cal.mg${parseInt(m)-1}`)} ${y}`; };
  if (!from && !to) return t("filter.selectDates");
  if (from && to && from === to) return f(from);
  if (from && to) return `${f(from)} – ${f(to)}`;
  return f(from);
}
function fmtInput(iso) {
  if (!iso) return ""; const [y,m,d]=iso.split("-"); return `${d}.${m}.${y}`;
}
function getPresets(t) {
  const today=todayISO(), ty=parseInt(today.split("-")[0]), tm=parseInt(today.split("-")[1])-1;
  const [lmy,lmm]=navMo(ty,tm,-1);
  return [
    { labelKey:"filter.today",    from:today,              to:today },
    { labelKey:"filter.yesterday",from:addDays(today,-1),  to:addDays(today,-1) },
    { labelKey:"filter.last7",    from:addDays(today,-6),  to:today },
    { labelKey:"filter.last14",   from:addDays(today,-13), to:today },
    { labelKey:"filter.last30",   from:addDays(today,-29), to:today },
    { labelKey:"filter.thisMonth",from:som(ty,tm),         to:today },
    { labelKey:"filter.lastMonth",from:som(lmy,lmm),       to:eom(lmy,lmm) },
  ].map(p => ({ ...p, label: t(p.labelKey) }));
}

// ── Day cell ──────────────────────────────────────────────────────────────────

function Day({ iso, cur, from, to, hover, onPick, onHover }) {
  const effTo  = from && !to && hover ? hover : to;
  let a=null, b=null;
  if (from && effTo) [a,b] = from<=effTo ? [from,effTo] : [effTo,from];
  else if (from) a=from;

  const isStart=iso===a, isEnd=iso===b, inRange=a&&b&&iso>a&&iso<b;
  const isSingle=isStart&&isEnd, selected=isStart||isEnd;
  const day=parseInt(iso.split("-")[2]);

  if (!cur) return (
    <div className="h-8 flex items-center justify-center">
      <span className="text-[11px]" style={{ color:"var(--text-4)", opacity:0.4 }}>{day}</span>
    </div>
  );

  return (
    <div className="relative h-8 flex items-center justify-center cursor-pointer"
      onClick={()=>onPick(iso)} onMouseEnter={()=>onHover(iso)}>
      {(inRange||(selected&&!isSingle)) && (
        <div className={`absolute inset-y-[3px] z-0 ${isStart?"left-1/2 right-0":isEnd?"left-0 right-1/2":"left-0 right-0"}`}
          style={{ background:"var(--brand-bg)" }} />
      )}
      <span className="relative z-10 w-7 h-7 flex items-center justify-center rounded-full text-[12px] transition-colors"
        style={{
          background: selected ? "var(--brand)" : "transparent",
          color: selected ? "#fff" : "var(--text-2)",
        }}>
        {day}
      </span>
    </div>
  );
}

function MonthGrid({ year, month, from, to, hover, onPick, onHover, t }) {
  const days = calDays(year, month);
  return (
    <div>
      <div className="grid grid-cols-7 mb-0.5">
        {[0,1,2,3,4,5,6].map(i => (
          <div key={i} className="h-7 flex items-center justify-center text-[10px] font-medium"
            style={{ color:"var(--text-4)" }}>{t(`cal.d${i}`)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(({iso,cur}) => (
          <Day key={iso} iso={iso} cur={cur}
            from={from} to={to} hover={hover}
            onPick={onPick} onHover={onHover} />
        ))}
      </div>
    </div>
  );
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

export default function DateRangePicker({ dateFrom, dateTo, setDateFrom, setDateTo, single = false }) {
  const { t } = useLang();
  const [open,     setOpen]     = useState(false);
  const [tempFrom, setTempFrom] = useState(dateFrom||"");
  const [tempTo,   setTempTo]   = useState(dateTo||"");
  const [hover,    setHover]    = useState(null);
  const [phase,    setPhase]    = useState("from");
  const [activeP,  setActiveP]  = useState(null);

  const [leftY, setLeftY] = useState(()=>{ const s=dateFrom||todayISO(); return parseInt(s.split("-")[0]); });
  const [leftM, setLeftM] = useState(()=>{ const s=dateFrom||todayISO(); return parseInt(s.split("-")[1])-1; });
  const [rightY, rightM]  = navMo(leftY, leftM, 1);

  const wrapRef    = useRef(null);
  const triggerRef = useRef(null);
  const popRef     = useRef(null);
  const [pos, setPos] = useState(null);
  const isMobile  = window.innerWidth < 640;

  // Desktop dropdown is portaled to <body> so it escapes the Filters panel's
  // overflow clipping; position is computed from the trigger's bounding rect.
  function computePos() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(660, vw - 16);
    let left = rect.right - width;                 // right-align to trigger
    left = Math.min(left, vw - width - 8);
    left = Math.max(8, left);
    const h = popRef.current?.offsetHeight || 380;
    const spaceBelow = vh - rect.bottom - 8;
    const openUp = spaceBelow < h && rect.top - 8 > spaceBelow;
    const top = openUp ? Math.max(8, rect.top - 8 - h) : rect.bottom + 8;
    return { top, left, width };
  }

  useEffect(() => {
    if (!open) return;
    setTempFrom(dateFrom||""); setTempTo(dateTo||"");
    setPhase("from"); setActiveP(null); setHover(null);
    if (dateFrom) { setLeftY(parseInt(dateFrom.split("-")[0])); setLeftM(parseInt(dateFrom.split("-")[1])-1); }
  }, [open]); // eslint-disable-line

  // Position the portaled dropdown (runs before paint so there's no flicker).
  useLayoutEffect(() => {
    if (open && !isMobile) setPos(computePos());
    else setPos(null);
  }, [open]); // eslint-disable-line

  // Keep it anchored to the trigger while scrolling / resizing.
  useEffect(() => {
    if (!open || isMobile) return;
    const update = () => setPos(computePos());
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]); // eslint-disable-line

  useEffect(() => {
    const h = e => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === "Enter") handleApply(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, tempFrom, tempTo]); // eslint-disable-line

  function handlePick(iso) {
    if (phase==="from"||(tempFrom&&tempTo)) {
      setTempFrom(iso); setTempTo(""); setPhase("to"); setActiveP(null);
    } else {
      if (iso<tempFrom) { setTempTo(tempFrom); setTempFrom(iso); }
      else setTempTo(iso);
      setPhase("from"); setActiveP(null);
    }
  }

  function handlePreset(p) {
    setTempFrom(p.from); setTempTo(p.to); setPhase("from"); setActiveP(p.label);
    setLeftY(parseInt(p.from.split("-")[0])); setLeftM(parseInt(p.from.split("-")[1])-1);
  }

  function handleApply() {
    if (!tempFrom) return;
    setDateFrom(tempFrom); setDateTo(tempTo||tempFrom); setOpen(false);
  }

  const presets = getPresets(t);

  const btnStyle = (active) => ({
    background: active ? "var(--brand)" : "transparent",
    color:      active ? "#fff"         : "var(--text-2)",
  });

  const inputBorder = (active) => `1px solid ${active ? "var(--brand)" : "var(--border-md)"}`;

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
        style={{
          background: "var(--bg-inner)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border-md)"}`,
          color: dateFrom ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <CalendarDays size={13} className="flex-shrink-0" style={{ color:"var(--text-3)" }} />
        <span className="whitespace-nowrap">{fmtRange(dateFrom, dateTo, t)}</span>
      </button>

      {/* ── Mobile: full-screen bottom sheet ── */}
      {open && isMobile && (
        <div className="fixed inset-0 z-[300] flex flex-col justify-end" style={{ background:"rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target===e.currentTarget) setOpen(false); }}>
          <div className="rounded-t-2xl flex flex-col max-h-[90dvh]"
            style={{ background:"var(--bg-card)", border:"1px solid var(--border-md)" }}>

            {/* Handle + header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2"
              style={{ borderBottom:"1px solid var(--border)" }}>
              <div className="w-10 h-1 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2"
                style={{ background:"var(--border-md)" }} />
              <span className="text-sm font-semibold" style={{ color:"var(--text-1)" }}>{t("filter.selectDates")}</span>
              <button onClick={() => setOpen(false)} style={{ color:"var(--text-3)" }}><X size={18} /></button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4">
              {/* Presets */}
              <div className="flex flex-wrap gap-1.5 py-3">
                {presets.map(p => (
                  <button key={p.label} onClick={() => handlePreset(p)}
                    className="px-3 py-1.5 rounded-full text-xs transition-colors"
                    style={btnStyle(activeP===p.label)}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date inputs */}
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setPhase("from")}
                  className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left"
                  style={{ background:"var(--bg-inner)", border:inputBorder(phase==="from"), color:tempFrom?"var(--text-1)":"var(--text-3)" }}>
                  <CalendarDays size={12} style={{ color:"var(--text-4)" }} />
                  {tempFrom ? fmtInput(tempFrom) : t("filter.startDate")}
                </button>
                <span className="text-xs" style={{ color:"var(--text-4)" }}>→</span>
                <button onClick={() => { if (tempFrom) setPhase("to"); }}
                  className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left"
                  style={{ background:"var(--bg-inner)", border:inputBorder(phase==="to"), color:tempTo?"var(--text-1)":"var(--text-3)" }}>
                  <CalendarDays size={12} style={{ color:"var(--text-4)" }} />
                  {tempTo ? fmtInput(tempTo) : t("filter.endDate")}
                </button>
              </div>

              {/* Single month calendar */}
              <div className="flex items-center mb-3">
                <button onClick={() => { const [ny,nm]=navMo(leftY,leftM,-1); setLeftY(ny); setLeftM(nm); }}
                  className="p-1 rounded-lg" style={{ color:"var(--text-3)" }}>
                  <ChevronLeft size={16} />
                </button>
                <div className="flex-1 text-sm font-semibold text-center" style={{ color:"var(--text-1)" }}>
                  {t(`cal.m${leftM}`)} {leftY}
                </div>
                <button onClick={() => { const [ny,nm]=navMo(leftY,leftM,1); setLeftY(ny); setLeftM(nm); }}
                  className="p-1 rounded-lg" style={{ color:"var(--text-3)" }}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div onMouseLeave={() => setHover(null)}>
                <MonthGrid year={leftY} month={leftM}
                  from={tempFrom} to={tempTo} hover={hover}
                  onPick={handlePick} onHover={setHover} t={t} />
              </div>
            </div>

            {/* Apply / Cancel */}
            <div className="px-4 py-3 flex gap-2" style={{ borderTop:"1px solid var(--border)" }}>
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background:"var(--bg-inner)", color:"var(--text-2)" }}>
                {t("filter.cancel")}
              </button>
              <button onClick={handleApply} disabled={!tempFrom}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background:"var(--brand)", color:"#fff" }}>
                {t("filter.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop: portaled fixed dropdown (escapes parent overflow) ── */}
      {open && !isMobile && createPortal(
        <div ref={popRef} data-popover-portal className="rounded-xl shadow-2xl flex overflow-hidden"
          style={{
            position:"fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: pos?.width ?? 660,
            visibility: pos ? "visible" : "hidden",
            zIndex:200,
            background:"var(--bg-card)", border:"1px solid var(--border-md)",
          }}>

          {/* Presets panel */}
          <div className="flex flex-col w-40 flex-shrink-0" style={{ borderRight:"1px solid var(--border)" }}>
            <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color:"var(--text-4)" }}>{t("filter.quickSelect")}</div>
            <div className="flex-1">
              {presets.map(p => (
                <button key={p.label} onClick={() => handlePreset(p)}
                  className="w-full text-left px-3 py-2 text-xs transition-colors"
                  style={btnStyle(activeP===p.label)}
                  onMouseEnter={e => { if (activeP!==p.label) e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (activeP!==p.label) e.currentTarget.style.background="transparent"; }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="px-3 py-3 space-y-1.5" style={{ borderTop:"1px solid var(--border)" }}>
              <button onClick={handleApply} disabled={!tempFrom}
                className="w-full py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
                style={{ background:"var(--brand)", color:"#fff" }}>
                {t("filter.apply")}
              </button>
              <button onClick={() => setOpen(false)}
                className="w-full py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ color:"var(--text-2)" }}>
                {t("filter.cancel")}
              </button>
            </div>
          </div>

          {/* Calendars panel */}
          <div className="flex-1 p-4">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setPhase("from")}
                className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left"
                style={{ background:"var(--bg-inner)", border:inputBorder(phase==="from"), color:tempFrom?"var(--text-1)":"var(--text-3)" }}>
                <CalendarDays size={12} style={{ color:"var(--text-4)" }} />
                {tempFrom ? fmtInput(tempFrom) : t("filter.startDate")}
              </button>
              <span className="text-xs" style={{ color:"var(--text-4)" }}>→</span>
              <button onClick={() => { if (tempFrom) setPhase("to"); }}
                className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left"
                style={{ background:"var(--bg-inner)", border:inputBorder(phase==="to"), color:tempTo?"var(--text-1)":"var(--text-3)" }}>
                <CalendarDays size={12} style={{ color:"var(--text-4)" }} />
                {tempTo ? fmtInput(tempTo) : t("filter.endDate")}
              </button>
            </div>

            <div className="flex items-center mb-3">
              <button onClick={() => { const [ny,nm]=navMo(leftY,leftM,-1); setLeftY(ny); setLeftM(nm); }}
                className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0" style={{ color:"var(--text-3)" }}>
                <ChevronLeft size={15} />
              </button>
              <div className="flex-1 grid grid-cols-2 gap-6 px-2">
                <div className="text-xs font-semibold text-center" style={{ color:"var(--text-1)" }}>{t(`cal.m${leftM}`)} {leftY}</div>
                <div className="text-xs font-semibold text-center" style={{ color:"var(--text-1)" }}>{t(`cal.m${rightM}`)} {rightY}</div>
              </div>
              <button onClick={() => { const [ny,nm]=navMo(leftY,leftM,1); setLeftY(ny); setLeftM(nm); }}
                className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0" style={{ color:"var(--text-3)" }}>
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6" onMouseLeave={() => setHover(null)}>
              <MonthGrid year={leftY} month={leftM} from={tempFrom} to={tempTo} hover={hover} onPick={handlePick} onHover={setHover} t={t} />
              <MonthGrid year={rightY} month={rightM} from={tempFrom} to={tempTo} hover={hover} onPick={handlePick} onHover={setHover} t={t} />
            </div>

            <div className="mt-3 text-[10px] text-center" style={{ color:"var(--text-4)" }}>
              {phase==="from" ? t("filter.clickToSetStart") : t("filter.clickToSetEnd")}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
