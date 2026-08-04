import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sliders, Plus, Trash2 } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import Button from "../../components/ui/Button";
import LangTextInput from "../../components/ui/LangTextInput";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fillDescs } from "../../utils/segments";

/**
 * «Ko'rinish» — the colour-threshold editors for the fleet heatmap and the
 * comparison table.
 *
 * These used to sit below the fold of the daily upload tab, under a heading that
 * said "Data": an admin asking "why is the heatmap red?" had no scent trail to
 * them at all, and an admin uploading attendance had to scroll past chart
 * configuration to reach the sheet sources. Same controls, findable place.
 */

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

// ─── Shared data for both editors ────────────────────────────────────────────

function useHeatmapExtent() {
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const sixtyAgo = useMemo(
    () => new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    [],
  );
  return useQuery({
    queryKey: ["heatmap-for-max"],
    queryFn: () => api.get(`/api/heatmap?date_from=${sixtyAgo}&date_to=${today}`).then((r) => r.data),
    staleTime: 300_000,
  });
}

// ─── Fleet heatmap thresholds ────────────────────────────────────────────────

const HEATMAP_DEFAULT_SEGMENTS = [
  { from: 0,   color: "#ef4444" },
  { from: 85,  color: "#22c55e" },
  { from: 101, color: "#3b82f6" },
];

function HeatmapThresholdEditor({ toast }) {
  const { t } = useLang();
  const qc = useQueryClient();

  const { data: savedData, isLoading } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
  });
  const { data: heatmapRaw } = useHeatmapExtent();

  const dataMax = useMemo(() => {
    if (!heatmapRaw?.data) return 200;
    let max = 200;
    for (const mgr of Object.values(heatmapRaw.data))
      for (const cell of Object.values(mgr))
        if (cell.net_util != null) max = Math.max(max, Math.round(cell.net_util * 100));
    return max;
  }, [heatmapRaw]);

  const [segments, setSegments] = useState(() => fillDescs(HEATMAP_DEFAULT_SEGMENTS, "load"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (savedData?.segments?.length) setSegments(fillDescs(savedData.segments, "load"));
  }, [savedData]);

  async function save() {
    setSaving(true);
    try {
      await api.put("/admin/settings", { heatmap_segments: JSON.stringify(segments) });
      qc.invalidateQueries({ queryKey: ["heatmap-thresholds"] });
      toast.success(t("admin.saved"));
    } catch (err) {
      // Used to report t("admin.refreshFailed") — a message about SYNCING — on a
      // failed SAVE, sending admins off to re-sync sheets instead of retrying.
      toast.error(err?.response?.data?.detail || t("admin.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={Sliders}
        title={t("admin.heatmapRanges")}
        right={<Button size="lg" onClick={save} loading={saving}>{t("admin.save")}</Button>}
      />
      <div className="p-4">
        {isLoading
          ? <SkeletonBlock className="h-24 rounded-lg" />
          : <SegmentBar segments={segments} setSegments={setSegments} rangeMin={0} rangeMax={dataMax} />}
      </div>
    </div>
  );
}

// ─── Comparison table thresholds ─────────────────────────────────────────────

const COMP_DEFAULT_P_SEGS = [
  { from: 0,  color: "#ef4444" },
  { from: 80, color: "#eab308" },
  { from: 85, color: "#22c55e" },
];

const COMP_DEFAULT_DIFF_SEGS = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from: 1,     color: "#eab308" },
  { from: 6,     color: "#ef4444" },
];

function ComparisonThresholdEditor({ toast }) {
  const { t } = useLang();
  const qc = useQueryClient();

  const { data: savedData, isLoading } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    retry: false,
    staleTime: 60_000,
  });
  const { data: heatmapRaw } = useHeatmapExtent();

  const pMax = useMemo(() => {
    if (!heatmapRaw?.data) return 130;
    let max = 130;
    for (const mgr of Object.values(heatmapRaw.data))
      for (const cell of Object.values(mgr))
        if (cell.baseline_util != null) max = Math.max(max, Math.round(cell.baseline_util * 100));
    return max;
  }, [heatmapRaw]);

  const diffRange = useMemo(() => {
    if (!heatmapRaw?.data) return { min: -30, max: 15 };
    let min = 0, max = 10;
    for (const mgr of Object.values(heatmapRaw.data))
      for (const cell of Object.values(mgr))
        if (cell.baseline_util != null && cell.net_util != null) {
          const d = Math.round((cell.baseline_util - cell.net_util) * 100);
          min = Math.min(min, d);
          max = Math.max(max, d);
        }
    return { min: Math.floor(min / 5) * 5 - 5, max: Math.ceil(max / 5) * 5 + 5 };
  }, [heatmapRaw]);

  const [pSegs, setPSegs] = useState(() => fillDescs(COMP_DEFAULT_P_SEGS, "load"));
  const [diffSegs, setDiffSegs] = useState(() => fillDescs(COMP_DEFAULT_DIFF_SEGS, "diff"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (savedData?.p_segments?.length) setPSegs(fillDescs(savedData.p_segments, "load"));
    if (savedData?.diff_segments?.length) setDiffSegs(fillDescs(savedData.diff_segments, "diff"));
  }, [savedData]);

  async function save() {
    setSaving(true);
    try {
      await api.put("/admin/settings", {
        comparison_p_segments: JSON.stringify(pSegs),
        comparison_diff_segments: JSON.stringify(diffSegs),
      });
      qc.invalidateQueries({ queryKey: ["comparison-thresholds"] });
      toast.success(t("admin.saved"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={Sliders}
        title={t("admin.comparisonRanges")}
        right={<Button size="lg" onClick={save} loading={saving}>{t("admin.save")}</Button>}
      />
      <div className="p-4">
        {isLoading ? (
          <SkeletonBlock className="h-48 rounded-lg" />
        ) : (
          <>
            <div className="mb-7">
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                {t("admin.pPlanned")}
                <span className="ml-1.5 normal-case font-normal" style={{ color: "var(--text-4)" }}>{t("admin.perCellUtil")}</span>
              </div>
              <SegmentBar segments={pSegs} setSegments={setPSegs} rangeMin={0} rangeMax={pMax} />
            </div>
            <div>
              <div className="text-[11px] font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                {t("admin.dDifference")}
                <span className="ml-1.5 normal-case font-normal" style={{ color: "var(--text-4)" }}>{t("admin.positiveAhead")}</span>
              </div>
              <SegmentBar segments={diffSegs} setSegments={setDiffSegs} rangeMin={diffRange.min} rangeMax={diffRange.max} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DisplaySettings() {
  const toast = useToast();
  return (
    <div className="space-y-4">
      <HeatmapThresholdEditor toast={toast} />
      <ComparisonThresholdEditor toast={toast} />
      {toast.node}
    </div>
  );
}
