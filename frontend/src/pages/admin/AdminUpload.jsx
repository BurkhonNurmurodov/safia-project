import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, CheckCircle2, XCircle, Database, Loader2, RefreshCw, Sliders, Languages, Users, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import TranslationsEditor from "./TranslationsEditor";
import UsersManagement from "./UsersManagement";
import PageAccess from "./PageAccess";
import { fillDescs } from "../../utils/segments";

// ─── Shared ───────────────────────────────────────────────────────────────────

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b", "#C8973F",
];

function btnClass(st) {
  return `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
    st === "ok"      ? "bg-green-500/20 text-green-400 border border-green-500/30"  :
    st === "error"   ? "bg-red-500/20 text-red-400 border border-red-500/30"        :
    st === "saving"  ? "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed" :
    st === "add"     ? "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10" :
                       "bg-[var(--brand)] hover:bg-[var(--brand-text)] text-gray-900 border border-transparent"
  }`;
}

// ─── SegmentBar ───────────────────────────────────────────────────────────────
// Reusable drag-handle color bar.
// Props:
//   segments    [{from, color}]  — sorted ascending by `from`
//   setSegments  fn
//   rangeMin     number          — left edge of bar (can be negative for diff)
//   rangeMax     number          — right edge of bar

function SegmentBar({ segments, setSegments, rangeMin, rangeMax }) {
  const { languages } = useLang();
  const barRef = useRef(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const span = (rangeMax - rangeMin) || 1;

  // pixel position → value
  const toVal  = (pct) => Math.round(rangeMin + pct * span);
  // value → % along bar (clamp segment[0].from to rangeMin for display)
  const toPct  = (v)   => ((Math.max(v, rangeMin) - rangeMin) / span) * 100;

  function startDrag(e, handleIdx) {
    e.preventDefault();
    e.stopPropagation();
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();

    function onMove(ev) {
      const frac   = Math.max(0, Math.min((ev.clientX - rect.left) / rect.width, 1));
      const rawVal = toVal(frac);
      const minVal = Math.max(segments[handleIdx - 1].from + 1, rangeMin);
      const maxVal = Math.min((segments[handleIdx + 1]?.from ?? rangeMax + 1) - 1, rangeMax);
      const clamped = Math.max(minVal, Math.min(rawVal, maxVal));
      setSegments((prev) => prev.map((s, i) => i === handleIdx ? { ...s, from: clamped } : s));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  function addSegment() {
    const last     = segments[segments.length - 1];
    const newFrom  = Math.min(last.from + Math.ceil((rangeMax - last.from) / 2), rangeMax - 1);
    const used     = new Set(segments.map((s) => s.color));
    const color    = PALETTE.find((c) => !used.has(c)) ?? PALETTE[segments.length % PALETTE.length];
    const next     = [...segments, { from: newFrom, color }];
    setSegments(next);
    setSelectedIdx(next.length - 1);
  }

  function deleteSegment(idx) {
    if (segments.length <= 1 || idx === 0) return; // never delete the floor segment
    setSegments((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }

  function setColor(idx, color) {
    setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, color } : s));
  }

  function setDesc(idx, code, value) {
    setSegments((prev) => prev.map((s, i) =>
      i === idx ? { ...s, desc: { ...(s.desc || {}), [code]: value } } : s));
  }

  return (
    <div>
      {/* Colored bar */}
      <div
        ref={barRef}
        className="relative h-12 rounded-lg overflow-visible select-none"
        style={{ background: "#0f1117" }}
        onClick={() => setSelectedIdx(null)}
      >
        {segments.map((seg, i) => {
          const fromPct   = toPct(seg.from);
          const toPct_    = i < segments.length - 1 ? toPct(segments[i + 1].from) : 100;
          const widthPct  = toPct_ - fromPct;
          const isSelected = selectedIdx === i;
          const displayFrom = Math.max(seg.from, rangeMin);
          const displayTo   = i < segments.length - 1 ? segments[i + 1].from - 1 : rangeMax;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${fromPct}%`, width: `${widthPct}%`,
                height: "100%", background: seg.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                outline: isSelected ? "2px solid #fff" : "none", outlineOffset: "-2px",
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
          return (
            <div
              key={handleIdx}
              style={{
                position: "absolute", left: `${pct}%`, top: -4, bottom: -4, width: 10,
                transform: "translateX(-50%)", cursor: "ew-resize", zIndex: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseDown={(e) => startDrag(e, handleIdx)}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 4, height: "100%", background: "#0f1117", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 2, height: "40%", background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tick labels */}
      <div className="relative h-5 mt-1 mb-1">
        <span style={{ position: "absolute", left: 0, fontSize: 10, color: "#6b7280" }}>{rangeMin}%</span>
        {segments.slice(1).map((seg, i) => (
          <span key={i} style={{ position: "absolute", left: `${toPct(seg.from)}%`, transform: "translateX(-50%)", fontSize: 10, color: "#6b7280" }}>
            {seg.from}%
          </span>
        ))}
        <span style={{ position: "absolute", right: 0, fontSize: 10, color: "#6b7280" }}>{rangeMax}%</span>
      </div>

      {/* Add range + selected segment controls */}
      <div className="flex items-center justify-end mb-1">
        <button onClick={addSegment} className={btnClass("add")} style={{ fontSize: 11, padding: "3px 10px" }}>
          + Add range
        </button>
      </div>

      {selectedIdx !== null && (
        <div className="mt-1 pt-3 border-t border-white/5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] text-gray-400">
              Range&nbsp;
              <span style={{ color: segments[selectedIdx].color }}>■</span>&nbsp;
              {Math.max(segments[selectedIdx].from, rangeMin)}–{selectedIdx < segments.length - 1 ? segments[selectedIdx + 1].from - 1 : rangeMax}% — pick color
            </span>
            {selectedIdx > 0 && (
              <button onClick={() => deleteSegment(selectedIdx)} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">
                Delete range
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PALETTE.map((color) => (
              <button
                key={color}
                style={{
                  background: color, width: 28, height: 28, borderRadius: 6,
                  outline: segments[selectedIdx].color === color ? "2px solid #fff" : "none",
                  outlineOffset: 2,
                  transform: segments[selectedIdx].color === color ? "scale(1.2)" : "scale(1)",
                  transition: "transform .1s",
                }}
                onClick={() => setColor(selectedIdx, color)}
              />
            ))}
          </div>

          {/* Per-language description shown in the color-guide modal */}
          <div className="mt-3.5 pt-3 border-t border-white/5">
            <div className="text-[11px] text-gray-400 mb-2">
              Description (shown in the color guide) — leave a language blank to show only the range
            </div>
            <div className="space-y-1.5">
              {languages.map(({ code, name }) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20 flex-shrink-0 text-right">{name}</span>
                  <input
                    type="text"
                    value={segments[selectedIdx].desc?.[code] || ""}
                    onChange={(e) => setDesc(selectedIdx, code, e.target.value)}
                    placeholder="—"
                    className="flex-1 min-w-0 bg-[#0f1117] border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-white/25"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sheet source editor ──────────────────────────────────────────────────────

function SheetSourceEditor() {
  const { t } = useLang();
  const qc = useQueryClient();
  const { data: sources = [] } = useQuery({
    queryKey: ["sheet-sources"],
    queryFn: () => api.get("/admin/sheet-sources").then((r) => r.data),
  });
  const [editing, setEditing] = useState({});
  const [refreshState, setRefreshState] = useState({});
  const [refreshMsg,   setRefreshMsg]   = useState({});
  const [refreshMsgOk, setRefreshMsgOk] = useState({});

  async function save(name) {
    await api.put(`/admin/sheet-sources/${name}`, { sheet_id: editing[name] });
    qc.invalidateQueries(["sheet-sources"]);
  }

  async function refresh(name) {
    setRefreshState((p) => ({ ...p, [name]: "loading" }));
    setRefreshMsg  ((p) => ({ ...p, [name]: "" }));
    try {
      const { data } = await api.post(`/admin/refresh-sheet/${name}`);
      const detail = name === "source"
        ? `${data.production_rows ?? 0} production rows, ${data.headcount_rows ?? 0} headcount rows saved`
        : `${data.downtime_rows ?? 0} downtime rows saved (${data.managers_synced ?? 0} managers)`;
      setRefreshState ((p) => ({ ...p, [name]: "ok" }));
      setRefreshMsg   ((p) => ({ ...p, [name]: detail }));
      setRefreshMsgOk ((p) => ({ ...p, [name]: true }));
      setTimeout(() => setRefreshState((p) => ({ ...p, [name]: "idle" })), 3000);
    } catch (err) {
      const detail = err.response?.data?.detail || t("admin.refreshFailed");
      setRefreshState ((p) => ({ ...p, [name]: "error" }));
      setRefreshMsg   ((p) => ({ ...p, [name]: detail }));
      setRefreshMsgOk ((p) => ({ ...p, [name]: false }));
      setTimeout(() => setRefreshState((p) => ({ ...p, [name]: "idle" })), 4000);
    }
  }

  return (
    <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Database size={15} className="text-[var(--brand-text)]" />
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("admin.sheetSources")}</div>
      </div>
      <div className="space-y-4">
        {["source", "shift_report"].map((name) => {
          const current = sources.find((s) => s.name === name)?.sheet_id || "";
          const rs    = refreshState[name] || "idle";
          const msg   = refreshMsg[name]   || "";
          const msgOk = refreshMsgOk[name] ?? true;
          return (
            <div key={name}>
              <div className="text-[11px] text-gray-500 mb-1 capitalize">
                {name === "source" ? t("admin.source") : t("admin.shiftReport")}
              </div>
              <div className="flex gap-2">
                <input
                  defaultValue={current}
                  onChange={(e) => setEditing((p) => ({ ...p, [name]: e.target.value }))}
                  placeholder={t("admin.sheetId")}
                  className="min-w-0 flex-1 bg-[#12151f] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 outline-none font-mono"
                />
                <button onClick={() => save(name)} className="flex-shrink-0 text-xs bg-[var(--brand)] hover:bg-[var(--brand-text)] text-gray-900 font-semibold px-3 rounded-lg transition-colors">
                  {t("admin.save")}
                </button>
                <button
                  onClick={() => refresh(name)}
                  disabled={rs === "loading"}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    rs === "ok"      ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                    rs === "error"   ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    rs === "loading" ? "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed" :
                                       "bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10"
                  }`}
                >
                  {rs === "loading" ? <Loader2 size={13} className="animate-spin" /> :
                   rs === "ok"      ? <CheckCircle2 size={13} />                     :
                   rs === "error"   ? <XCircle size={13} />                          :
                                      <RefreshCw size={13} />}
                  {t("admin.refresh")}
                </button>
              </div>
              {msg && (
                <div className={`text-[11px] mt-1.5 ${msgOk ? "text-green-400" : "text-red-400"}`}>{msg}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fleet Heatmap threshold editor ──────────────────────────────────────────

const HEATMAP_DEFAULT_SEGMENTS = [
  { from: 0,   color: "#ef4444" },
  { from: 85,  color: "#22c55e" },
  { from: 101, color: "#3b82f6" },
];

function HeatmapThresholdEditor() {
  const { t } = useLang();
  const qc = useQueryClient();

  const { data: savedData } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
  });

  // Reuse the same heatmap fetch used by ComparisonThresholdEditor
  const today    = useMemo(() => new Date().toISOString().split("T")[0], []);
  const sixtyAgo = useMemo(() => new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], []);

  const { data: heatmapRaw } = useQuery({
    queryKey: ["heatmap-for-max"],
    queryFn: () => api.get(`/api/heatmap?date_from=${sixtyAgo}&date_to=${today}`).then((r) => r.data),
    staleTime: 300_000,
  });

  const dataMax = useMemo(() => {
    if (!heatmapRaw?.data) return 200;
    let max = 200;
    for (const mgr of Object.values(heatmapRaw.data))
      for (const cell of Object.values(mgr))
        if (cell.net_util != null) max = Math.max(max, Math.round(cell.net_util * 100));
    return max;
  }, [heatmapRaw]);

  const [segments,   setSegments]   = useState(() => fillDescs(HEATMAP_DEFAULT_SEGMENTS, "load"));
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (savedData?.segments?.length) setSegments(fillDescs(savedData.segments, "load"));
  }, [savedData]);

  async function save() {
    setSaveStatus("saving");
    try {
      await api.put("/admin/settings", { heatmap_segments: JSON.stringify(segments) });
      qc.invalidateQueries(["heatmap-thresholds"]);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  return (
    <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sliders size={15} className="text-[var(--brand-text)]" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("admin.heatmapRanges")}</span>
        </div>
        <button onClick={save} disabled={saveStatus === "saving"} className={btnClass(saveStatus)}>
          {saveStatus === "saving" ? <Loader2 size={12} className="animate-spin" /> :
           saveStatus === "ok"     ? <CheckCircle2 size={12} />                     :
           saveStatus === "error"  ? <XCircle size={12} />                          : null}
          {saveStatus === "ok" ? t("admin.saved") : saveStatus === "error" ? t("admin.refreshFailed") : t("admin.save")}
        </button>
      </div>

      <SegmentBar
        segments={segments}
        setSegments={setSegments}
        rangeMin={0}
        rangeMax={dataMax}
      />
    </div>
  );
}

// ─── Comparison Table threshold editor ───────────────────────────────────────

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

function ComparisonThresholdEditor() {
  const { t } = useLang();
  const qc = useQueryClient();

  const { data: savedData } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    retry: false,
    staleTime: 60_000,
  });

  // Reuse the same heatmap data (cached by React Query)
  const today    = useMemo(() => new Date().toISOString().split("T")[0], []);
  const sixtyAgo = useMemo(() => new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], []);

  const { data: heatmapRaw } = useQuery({
    queryKey: ["heatmap-for-max"],
    queryFn: () => api.get(`/api/heatmap?date_from=${sixtyAgo}&date_to=${today}`).then((r) => r.data),
    staleTime: 300_000,
  });

  // P range: 0 → max planned % seen in data
  const pMax = useMemo(() => {
    if (!heatmapRaw?.data) return 130;
    let max = 130;
    for (const mgr of Object.values(heatmapRaw.data))
      for (const cell of Object.values(mgr))
        if (cell.baseline_util != null)
          max = Math.max(max, Math.round(cell.baseline_util * 100));
    return max;
  }, [heatmapRaw]);

  // D range: computed from actual P−A diff values, padded to nearest 5
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
    return {
      min: Math.floor(min / 5) * 5 - 5,
      max: Math.ceil(max  / 5) * 5 + 5,
    };
  }, [heatmapRaw]);

  const [pSegs,      setPSegs]      = useState(() => fillDescs(COMP_DEFAULT_P_SEGS, "load"));
  const [diffSegs,   setDiffSegs]   = useState(() => fillDescs(COMP_DEFAULT_DIFF_SEGS, "diff"));
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (savedData?.p_segments?.length)    setPSegs(fillDescs(savedData.p_segments, "load"));
    if (savedData?.diff_segments?.length) setDiffSegs(fillDescs(savedData.diff_segments, "diff"));
  }, [savedData]);

  async function save() {
    setSaveStatus("saving");
    try {
      await api.put("/admin/settings", {
        comparison_p_segments:    JSON.stringify(pSegs),
        comparison_diff_segments: JSON.stringify(diffSegs),
      });
      qc.invalidateQueries(["comparison-thresholds"]);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  return (
    <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sliders size={15} className="text-[var(--brand-text)]" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t("admin.comparisonRanges")}
          </span>
        </div>
        <button onClick={save} disabled={saveStatus === "saving"} className={btnClass(saveStatus)}>
          {saveStatus === "saving" ? <Loader2 size={12} className="animate-spin" /> :
           saveStatus === "ok"     ? <CheckCircle2 size={12} />                     :
           saveStatus === "error"  ? <XCircle size={12} />                          : null}
          {saveStatus === "ok" ? t("admin.saved") : saveStatus === "error" ? t("admin.error") : t("admin.save")}
        </button>
      </div>

      {/* P — Planned % */}
      <div className="mb-7">
        <div className="text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          {t("admin.pPlanned")}
          <span className="ml-1.5 normal-case font-normal text-gray-600">{t("admin.perCellUtil")}</span>
        </div>
        <SegmentBar
          segments={pSegs}
          setSegments={setPSegs}
          rangeMin={0}
          rangeMax={pMax}
        />
      </div>

      {/* D — Difference P−A */}
      <div>
        <div className="text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          {t("admin.dDifference")}
          <span className="ml-1.5 normal-case font-normal text-gray-600">{t("admin.positiveAhead")}</span>
        </div>
        <SegmentBar
          segments={diffSegs}
          setSegments={setDiffSegs}
          rangeMin={diffRange.min}
          rangeMax={diffRange.max}
        />
      </div>
    </div>
  );
}

// ─── Upload panel ─────────────────────────────────────────────────────────────

const ADMIN_TABS = ["data", "translations", "users", "access"];

export default function AdminUpload() {
  const navigate = useNavigate();
  const { t } = useLang();
  // ?tab=users deep-links a specific tab (used by the bot's notification button)
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [adminTab, setAdminTab] = useState(ADMIN_TABS.includes(urlTab) ? urlTab : "data");
  const [fileStates, setFileStates] = useState([]);
  const [uploading,  setUploading]  = useState(false);

  function setFileState(name, patch) {
    setFileStates((prev) => prev.map((f) => f.name === name ? { ...f, ...patch } : f));
  }

  async function uploadFiles(files) {
    setFileStates(files.map((f) => ({ name: f.name, status: "pending", progress: 0, detail: "" })));
    setUploading(true);

    for (const file of files) {
      setFileState(file.name, { status: "uploading", progress: 0 });
      const form = new FormData();
      form.append("files", file);
      try {
        const { data } = await api.post("/admin/upload", form, {
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
            setFileState(file.name, { progress: pct });
          },
        });
        const result = data.results[0];
        if (result.status === "ok") {
          setFileState(file.name, { status: "ok", progress: 100, detail: `${result.rows_inserted} rows inserted` });
        } else {
          setFileState(file.name, { status: "error", progress: 100, detail: result.detail });
        }
      } catch {
        setFileState(file.name, { status: "error", progress: 100, detail: t("admin.uploadFailed") });
      }
    }
    setUploading(false);
  }

  const onDrop = useCallback((accepted) => { if (accepted.length) uploadFiles(accepted); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: true,
    disabled: uploading,
  });

  const doneCount  = fileStates.filter((f) => f.status === "ok").length;
  const errorCount = fileStates.filter((f) => f.status === "error").length;

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100 overflow-x-hidden">
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#12151f]"
        style={{ paddingTop: "calc(var(--tg-safe-top, 0px) + 0.75rem)" }}
      >
        <div>
          <div className="text-[var(--brand-text)] text-xs font-bold uppercase tracking-widest">Zagruzka</div>
          <div className="text-sm font-semibold text-[var(--text-1)]">{t("admin.title")}</div>
        </div>
        <button onClick={() => navigate("/")} className="text-xs text-gray-400 hover:text-[var(--text-1)]">
          {t("admin.toDashboard")}
        </button>
      </header>

      {/* Admin tabs */}
      <div className="no-scrollbar flex gap-1 px-6 pt-4 overflow-x-auto">
        {[["data", t("admin.tabData"), Database], ["translations", t("admin.tabTranslations"), Languages], ["users", t("admin.tabUsers"), Users], ["access", t("admin.tabAccess"), ShieldCheck]].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setAdminTab(id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={adminTab === id
              ? { background: "var(--brand)", color: "#fff" }
              : { color: "#9ca3af", background: "#1a1d27", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {adminTab === "translations" && (
        <div className="max-w-6xl mx-auto p-4 sm:p-8">
          <TranslationsEditor />
        </div>
      )}

      {adminTab === "users" && <UsersManagement />}

      {adminTab === "access" && <PageAccess />}

      {adminTab === "data" && (
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        {/* Upload drop zone */}
        <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Upload size={15} className="text-[var(--brand-text)]" />
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("admin.uploadTitle")}</div>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
              uploading     ? "border-white/5 opacity-50 cursor-not-allowed"          :
              isDragActive  ? "border-[var(--brand)] bg-[var(--brand-bg)] cursor-pointer"       :
                              "border-white/10 hover:border-[var(--brand-border)] cursor-pointer"
            }`}
          >
            <input {...getInputProps()} />
            <Upload size={32} className="mx-auto mb-3 text-gray-500" />
            <div className="text-sm text-gray-400">
              {uploading ? t("admin.uploading") : isDragActive ? t("admin.dropActive") : t("admin.dropzone")}
            </div>
            <div className="text-[11px] text-gray-600 mt-1">Format: {"{manager_id}_{DD.MM.YYYY}.xlsx"}</div>
          </div>

          {fileStates.length > 0 && (
            <div className="mt-5 space-y-2">
              {!uploading && (
                <div className="flex items-center gap-3 text-xs mb-3">
                  <span className="text-green-400 font-semibold">{t("admin.succeeded").replace("{n}", doneCount)}</span>
                  {errorCount > 0 && <span className="text-red-400 font-semibold">{t("admin.failed").replace("{n}", errorCount)}</span>}
                  <button onClick={() => setFileStates([])} className="ml-auto text-gray-500 hover:text-gray-300">
                    {t("admin.clear")}
                  </button>
                </div>
              )}
              {fileStates.map((f) => (
                <div key={f.name} className="bg-[#12151f] rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    {f.status === "uploading" && <Loader2    size={13} className="text-[var(--brand-text)] animate-spin flex-shrink-0" />}
                    {f.status === "ok"        && <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />}
                    {f.status === "error"     && <XCircle    size={13} className="text-red-400 flex-shrink-0" />}
                    {f.status === "pending"   && <div className="w-3 h-3 rounded-full border border-gray-600 flex-shrink-0" />}
                    <span className="font-mono text-xs text-gray-300 flex-1 truncate">{f.name}</span>
                    <span className={`text-[11px] flex-shrink-0 ${
                      f.status === "ok"       ? "text-green-400"  :
                      f.status === "error"    ? "text-red-400"    :
                      f.status === "uploading"? "text-[var(--brand-text)]" : "text-gray-600"
                    }`}>
                      {f.status === "ok"        ? f.detail           :
                       f.status === "error"     ? f.detail           :
                       f.status === "uploading" ? `${f.progress}%`   : t("admin.waiting")}
                    </span>
                  </div>
                  <div className="h-1 bg-[#1e2235] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        f.status === "ok"    ? "bg-green-500" :
                        f.status === "error" ? "bg-red-500"   : "bg-[var(--brand)]"
                      }`}
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetSourceEditor />
        <HeatmapThresholdEditor />
        <ComparisonThresholdEditor />
      </div>
      )}
    </div>
  );
}
