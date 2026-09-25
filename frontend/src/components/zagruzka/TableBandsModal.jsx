import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Plus, Trash2 } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import LangTextInput from "../ui/LangTextInput";
import { SkeletonBlock } from "../ui/Skeleton";
import { DEFAULT_SEGMENTS } from "../charts/HeatmapChart";
import { DEFAULT_P_SEGMENTS, DEFAULT_DIFF_SEGMENTS } from "../charts/ComparisonTable";
import { useLang } from "../../context/LangContext";
import { fillDescs } from "../../utils/segments";
import { fulfilUtil, effUtil, simplePlanUtil, simpleActualUtil, full90ActualUtil } from "../../utils/formulas";
import api from "../../utils/api";

/**
 * Every table on /zagruzka owns its colour bands, and an ADMIN edits them from
 * a button on the table itself (the operator's directive, 2026-09-24). They
 * used to live on the admin panel's «Ko'rinish» tab, where two editors served
 * five tables: the three heatmaps shared one set of bands and the two
 * comparison tables another, so a colour could not be moved on one table
 * without moving it on its neighbours — and an admin asking «why is this table
 * red?» had no path from the table to the answer.
 *
 * The backend registry (`routers/settings.ZAGRUZKA_BANDS`) owns which setting
 * key each table saves under and serves it on `GET /api/zagruzka-bands`, so a
 * key has one spelling. Two tables hold the platform-wide keys other pages read
 * — the load heatmap and the full comparison table — and the modal says so
 * before anybody saves (`shared`).
 */

export const BANDS_QUERY = ["zagruzka-bands"];

// Brand gold is an accent, never a status — and a threshold range is exactly
// status semantics, so it is not offered here.
const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b",
];

// ─── SegmentBar ───────────────────────────────────────────────────────────────
// Draggable colour-range bar.
//   segments    [{from, color, desc}] — sorted ascending by `from`
//   setSegments fn
//   rangeMin/rangeMax  bar edges (min can be negative for the diff bar)

function SegmentBar({ segments, setSegments, rangeMin, rangeMax }) {
  const { t, languages } = useLang();
  const barRef = useRef(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const span = (rangeMax - rangeMin) || 1;

  const toVal = (pct) => Math.round(rangeMin + pct * span);
  const toPct = (v) => ((Math.max(v, rangeMin) - rangeMin) / span) * 100;

  const boundsOf = (idx) => ({
    min: Math.max(segments[idx - 1].from + 1, rangeMin),
    max: Math.min((segments[idx + 1]?.from ?? rangeMax + 1) - 1, rangeMax),
  });

  function moveHandle(idx, value) {
    const { min, max } = boundsOf(idx);
    const clamped = Math.max(min, Math.min(value, max));
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, from: clamped } : s)));
  }

  /**
   * Pointer events, not mouse events. The old handler bound mousedown +
   * document mousemove/mouseup, so inside Telegram's WebView — this app's
   * primary runtime — the handles simply could not be moved: the editors
   * rendered but were inoperable on a phone. One pointer path covers mouse,
   * touch and stylus; pointer capture keeps the drag alive outside the handle.
   */
  function startDrag(e, handleIdx) {
    e.preventDefault();
    e.stopPropagation();
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      const frac = Math.max(0, Math.min((ev.clientX - rect.left) / rect.width, 1));
      moveHandle(handleIdx, toVal(frac));
    };
    const onUp = (ev) => {
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function onHandleKey(e, idx) {
    const step = e.shiftKey ? 5 : 1;
    const { min, max } = boundsOf(idx);
    let next = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = segments[idx].from - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = segments[idx].from + step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next == null) return;
    e.preventDefault();
    moveHandle(idx, next);
  }

  function addSegment() {
    const last = segments[segments.length - 1];
    const newFrom = Math.min(last.from + Math.ceil((rangeMax - last.from) / 2), rangeMax - 1);
    const used = new Set(segments.map((s) => s.color));
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[segments.length % PALETTE.length];
    const next = [...segments, { from: newFrom, color }];
    setSegments(next);
    setSelectedIdx(next.length - 1);
  }

  function deleteSegment(idx) {
    if (segments.length <= 1 || idx === 0) return; // never delete the floor segment
    setSegments((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }

  const setColor = (idx, color) =>
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, color } : s)));

  const setDesc = (idx, code, value) =>
    setSegments((prev) => prev.map((s, i) =>
      (i === idx ? { ...s, desc: { ...(s.desc || {}), [code]: value } } : s)));

  const sel = selectedIdx !== null ? segments[selectedIdx] : null;
  const selTo = selectedIdx !== null && selectedIdx < segments.length - 1
    ? segments[selectedIdx + 1].from - 1
    : rangeMax;

  return (
    <div>
      <div
        ref={barRef}
        className="relative h-12 rounded-lg overflow-visible select-none"
        style={{ background: "var(--bg-base)" }}
        onClick={() => setSelectedIdx(null)}
      >
        {segments.map((seg, i) => {
          const fromPct = toPct(seg.from);
          const toPct_ = i < segments.length - 1 ? toPct(segments[i + 1].from) : 100;
          const widthPct = toPct_ - fromPct;
          const isSelected = selectedIdx === i;
          const displayFrom = Math.max(seg.from, rangeMin);
          const displayTo = i < segments.length - 1 ? segments[i + 1].from - 1 : rangeMax;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${fromPct}%`, width: `${widthPct}%`,
                height: "100%", background: seg.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                // Was a hardcoded white outline — invisible on a light-theme card.
                outline: isSelected ? "2px solid var(--text-1)" : "none",
                outlineOffset: "-2px",
                borderRadius: i === 0 ? "8px 0 0 8px" : i === segments.length - 1 ? "0 8px 8px 0" : 0,
                zIndex: isSelected ? 2 : 1,
              }}
              onClick={(e) => { e.stopPropagation(); setSelectedIdx(isSelected ? null : i); }}
            >
              {widthPct > 8 && (
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,.6)", pointerEvents: "none" }}>
                  {displayFrom}–{displayTo}%
                </span>
              )}
            </div>
          );
        })}

        {/* Drag handles (between segments) */}
        {segments.slice(1).map((seg, i) => {
          const handleIdx = i + 1;
          const pct = toPct(seg.from);
          const { min, max } = boundsOf(handleIdx);
          return (
            <div
              key={handleIdx}
              role="slider"
              tabIndex={0}
              aria-label={t("admin.thresholds.handle").replace("{n}", handleIdx)}
              aria-valuenow={seg.from}
              aria-valuemin={min}
              aria-valuemax={max}
              style={{
                position: "absolute", left: `${pct}%`, top: -10, bottom: -10,
                // 44px hit area for touch; the visible grip stays 4px.
                width: 44,
                transform: "translateX(-50%)", cursor: "ew-resize", zIndex: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                touchAction: "none",
              }}
              onPointerDown={(e) => startDrag(e, handleIdx)}
              onKeyDown={(e) => onHandleKey(e, handleIdx)}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 4, height: "100%", background: "var(--bg-base)", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 2, height: "40%", background: "var(--text-3)", borderRadius: 1 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tick labels */}
      <div className="relative h-5 mt-1 mb-1">
        <span style={{ position: "absolute", left: 0, fontSize: 10, color: "var(--text-3)" }}>{rangeMin}%</span>
        {segments.slice(1).map((seg, i) => (
          <span key={i} style={{ position: "absolute", left: `${toPct(seg.from)}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--text-3)" }}>
            {seg.from}%
          </span>
        ))}
        <span style={{ position: "absolute", right: 0, fontSize: 10, color: "var(--text-3)" }}>{rangeMax}%</span>
      </div>

      <div className="flex items-center justify-end mb-1">
        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={addSegment}>
          {t("admin.thresholds.addRange")}
        </Button>
      </div>

      {sel && (
        <div className="mt-1 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
            <span className="text-[11px]" style={{ color: "var(--text-2)" }}>
              <span style={{ color: sel.color }}>■</span>{" "}
              {Math.max(sel.from, rangeMin)}–{selTo}% — {t("admin.thresholds.pickColor")}
            </span>
            {selectedIdx > 0 && (
              <Button size="sm" variant="danger" tint icon={<Trash2 size={12} />} onClick={() => deleteSegment(selectedIdx)}>
                {t("admin.thresholds.deleteRange")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={sel.color === color}
                onClick={() => setColor(selectedIdx, color)}
                // Padding gives a ~44px hit area while the swatch stays 28px.
                className="p-2 rounded-lg"
                style={{ background: sel.color === color ? "var(--bg-accent)" : "transparent" }}
              >
                <span
                  className="block"
                  style={{
                    background: color, width: 28, height: 28, borderRadius: 6,
                    outline: sel.color === color ? "2px solid var(--text-1)" : "none",
                    outlineOffset: 2,
                  }}
                />
              </button>
            ))}
          </div>

          {/* Per-language description shown in the colour-guide modal. Was four
              stacked inputs — the exact pattern LangTextInput exists to replace. */}
          <div className="mt-3.5 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="text-[11px] mb-2" style={{ color: "var(--text-2)" }}>
              {t("admin.thresholds.descLabel")}
            </div>
            <LangTextInput
              langs={languages.map((l) => l.code)}
              value={sel.desc || {}}
              onChange={(code, value) => setDesc(selectedIdx, code, value)}
              placeholder="—"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── The tables ───────────────────────────────────────────────────────────────
// One entry per table card on /zagruzka, its bars in the order the modal shows
// them. `read(cell)` returns the values that bar colours, read through the very
// functions the table itself reads with, so the bar reaches the highest value
// the period actually shows. `kind` picks the starter band descriptions
// (`utils/segments` — a kind with no templates starts blank rather than
// borrowing the workload wording). `min`/`max` are the reach a bar never falls
// short of; a D bar is sized around its data instead.
const pct = (v) => (v != null && Number.isFinite(v) ? Math.round(v * 100) : null);
const gap = (p, a) => (pct(p) != null && pct(a) != null ? pct(p) - pct(a) : null);

// A comparison table's two bars are headed as its own colour guide heads them;
// the D bands paint the A column as well as D.
const P_BAR = {
  field: "p_segments", kind: "load", min: 0, max: 130,
  head: (t) => t("zagruzka.guide.pSection"), hint: (t) => t("admin.perCellUtil"),
};
const D_BAR = {
  field: "diff_segments", kind: "diff", diff: true,
  head: (t) => t("zagruzka.guide.adSection"), hint: (t) => `D = P−A · ${t("admin.positiveAhead")}`,
};

export const BAND_TABLES = {
  full: {
    titleKey: "zagruzka.fullTable",
    bars: [
      { ...P_BAR, read: (c) => [pct(c?.baseline_util)] },
      { ...D_BAR, read: (c) => [gap(c?.baseline_util, c?.net_util)] },
    ],
  },
  full90: {
    titleKey: "zagruzka.full90Table",
    bars: [
      { ...P_BAR, read: (c) => [pct(c?.baseline_util)] },
      { ...D_BAR, read: (c) => [gap(c?.baseline_util, full90ActualUtil(c))] },
    ],
  },
  simple: {
    titleKey: "zagruzka.simpleTable",
    bars: [
      { ...P_BAR, read: (c) => [pct(simplePlanUtil(c))] },
      { ...D_BAR, read: (c) => [gap(simplePlanUtil(c), simpleActualUtil(c))] },
    ],
  },
  load: {
    titleKey: "zagruzka.fleetHeatmap",
    bars: [{ field: "segments", kind: "load", min: 0, max: 200, read: (c) => [pct(c?.baseline_util), pct(c?.net_util)] }],
  },
  fulfil: {
    titleKey: "zagruzka.fulfilTable",
    bars: [{ field: "segments", kind: "fulfil", min: 0, max: 200, read: (c) => [pct(fulfilUtil(c))] }],
  },
  eff: {
    titleKey: "zagruzka.effTable",
    bars: [{ field: "segments", kind: "eff", min: 0, max: 200, read: (c) => [pct(effUtil(c))] }],
  },
};

// What a table paints with until the bands have loaded — the backend's own
// defaults, which the two chart components already ship.
const FALLBACK = {
  segments: DEFAULT_SEGMENTS,
  p_segments: DEFAULT_P_SEGMENTS,
  diff_segments: DEFAULT_DIFF_SEGMENTS,
};

/**
 * The bands every /zagruzka table paints with: `bands[table][field]`, plus the
 * setting `keys` a save writes (null until loaded — nothing can be saved
 * before the server has named them) and the `shared` tables.
 */
export function useZagruzkaBands() {
  const { data } = useQuery({
    queryKey: BANDS_QUERY,
    queryFn: () => api.get("/api/zagruzka-bands").then((r) => r.data),
    staleTime: 60_000,
  });
  const bands = {};
  for (const [table, def] of Object.entries(BAND_TABLES)) {
    bands[table] = {};
    for (const bar of def.bars) {
      const saved = data?.tables?.[table]?.[bar.field];
      bands[table][bar.field] = saved?.length ? saved : FALLBACK[bar.field];
    }
  }
  return { bands, keys: data?.keys ?? null, shared: data?.shared ?? [] };
}

// How far a bar reaches: never short of its floor, far enough for every value
// the period shows, and past every stored edge — a handle drawn beyond the end
// of its bar cannot be grabbed. The −9999 floor of a D bar is a sentinel for
// «everything below», never an edge.
function barRange(bar, segs, data) {
  let lo = bar.diff ? 0 : bar.min;
  let hi = bar.diff ? 10 : bar.max;
  for (const row of Object.values(data || {}))
    for (const cell of Object.values(row || {}))
      for (const v of bar.read(cell))
        if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const s of segs)
    if (s.from > -9999) { lo = Math.min(lo, s.from - 5); hi = Math.max(hi, s.from + 5); }
  return bar.diff
    ? { min: Math.floor(lo / 5) * 5 - 5, max: Math.ceil(hi / 5) * 5 + 5 }
    : { min: bar.min, max: hi };
}

// ─── The modal ────────────────────────────────────────────────────────────────
// Opened by the table's own button. A DRAFT until Save — one PUT for all the
// table's bars, through `PUT /admin/settings` (admin-only, action-logged,
// undoable). It re-mounts on every open, so a half-dragged edge never comes
// back as though it had been saved. A failed save stays IN the modal with its
// reason; a saved one closes it and the table repaints.
export default function TableBandsModal({ table, bands, keys, shared = [], data, onClose, onSaved, zIndex }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const def = BAND_TABLES[table];
  const seed = () => (def ? def.bars.map((bar) => fillDescs(bands[table][bar.field], bar.kind)) : []);
  // Seeded once the server has answered FOR THIS TABLE, never from the
  // fallback: a draft started from the defaults would save them over the
  // table's real bands. Per table, because a backend older than the bundle
  // (the seconds a deploy takes to restart) names no key for a table it has
  // not heard of yet.
  const tableKeys = keys?.[table];
  const [draft, setDraft] = useState(() => (tableKeys ? seed() : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tableKeys && draft == null) setDraft(seed());
  }, [tableKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!def) return null;

  const setBar = (i) => (next) => setDraft((d) => d.map((segs, j) => (
    j === i ? (typeof next === "function" ? next(segs) : next) : segs)));

  // A platform-wide table names every page its save re-colours, BEFORE the
  // save — the pages that read `/heatmap-thresholds` / `/comparison-thresholds`.
  const scope = shared.includes(table)
    ? t(table === "full" ? "zagruzka.bands.sharedFull" : "zagruzka.bands.sharedLoad").replace(
      "{pages}",
      [t("nav.overview"), t("nav.daily"), t("nav.shiftDaily"), t("nav.zagruzkaCell")]
        .map((p) => `«${p}»`).join(", "),
    )
    : t("zagruzka.bands.own");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {};
      def.bars.forEach((bar, i) => { body[tableKeys[bar.field]] = JSON.stringify(draft[i]); });
      await api.put("/admin/settings", body);
      // The two platform-wide tables write keys every other page reads, so
      // those caches go stale with this one.
      await Promise.all([
        qc.invalidateQueries({ queryKey: BANDS_QUERY }),
        qc.invalidateQueries({ queryKey: ["heatmap-thresholds"] }),
        qc.invalidateQueries({ queryKey: ["comparison-thresholds"] }),
      ]);
      setSaving(false);
      onSaved?.();
    } catch (err) {
      setError(err?.response?.data?.detail || t("admin.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      dismissable={!saving}
      icon={SlidersHorizontal}
      title={t("zagruzka.bands.title")}
      subtitle={t(def.titleKey)}
      maxWidth="max-w-xl"
      zIndex={zIndex}
      bodyClassName="px-5 py-4 space-y-5"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button size="md" onClick={save} loading={saving} disabled={!draft || !tableKeys}>{t("admin.save")}</Button>
        </>
      }
    >
      <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        {scope}
      </p>

      {!draft ? (
        <SkeletonBlock className="h-24 rounded-lg" />
      ) : def.bars.map((bar, i) => {
        // Sized off the SAVED bands, never the draft: a bar that grew as an
        // edge was dragged toward its end would rescale under the pointer.
        const range = barRange(bar, bands[table][bar.field], data);
        return (
          <div key={bar.field}>
            {bar.head && (
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                {bar.head(t)}
                <span className="ml-1.5 normal-case font-normal">{bar.hint(t)}</span>
              </div>
            )}
            <SegmentBar segments={draft[i]} setSegments={setBar(i)} rangeMin={range.min} rangeMax={range.max} />
          </div>
        );
      })}

      {error && (
        <p role="alert" className="text-xs font-medium" style={{ color: "var(--status-bad)" }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
