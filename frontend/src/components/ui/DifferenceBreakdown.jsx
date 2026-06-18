import { useLang } from "../../context/LangContext";

/**
 * DifferenceBreakdown
 *
 * Decomposes the Planned → Final utilization gap into the four causes.
 * P-A convention: positive = plan exceeded actual (underperformance).
 */

const PIECES = [
  { key: "core",   tKey: "profile.diff.core" },
  { key: "idle",   tKey: "profile.diff.idle" },
  { key: "early",  tKey: "profile.diff.early" },
  { key: "kaizen", tKey: "profile.diff.kaizen" },
];

const POS = "#22c55e";
const NEG = "#ef4444";

// Mirrors the FB_DIFF bands in TripleSpeedometer
const FB_DIFF = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from:  1,    color: "#eab308" },
  { from:  6,    color: "#ef4444" },
];

function segColor(v, segs) {
  const sorted = [...segs].sort((a, b) => a.from - b.from);
  let col = sorted[0]?.color ?? "#6b7280";
  for (const s of sorted) {
    if (v >= s.from) col = s.color;
  }
  return col;
}

function valStr(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}%`;
}

export default function DifferenceBreakdown({ data, height = 260, diffSegments }) {
  const { t } = useLang();
  const segs = diffSegments?.length ? diffSegments : FB_DIFF;

  const b   = data?.baseline_util;
  const adj = data?.adjusted_util;
  const ai  = data?.after_idle_util;
  const ae  = data?.after_early_util;
  const n   = data?.net_util;

  const ready = [b, adj, ai, ae, n].every(v => v !== null && v !== undefined && !isNaN(v));
  if (!ready) {
    return (
      <div className="flex items-center justify-center text-sm" style={{ color: "var(--text-4)", minHeight: height }}>
        {t("profile.notFound")}
      </div>
    );
  }

  // P-A convention: positive = plan exceeded actual (underperformance, bad)
  const pieces = {
    core:   (b - adj) * 100,
    idle:   (adj - ai) * 100,
    early:  (ai - ae) * 100,
    kaizen: (ae - n)  * 100,
  };
  // Round plan/actual to whole percents before subtracting so the total
  // always equals the header's "Final → Planned" gap and the Difference gauge
  const total  = Math.round(b * 100) - Math.round(n * 100);
  const maxAbs = Math.max(0.0001, ...PIECES.map(p => Math.abs(pieces[p.key])));

  return (
    <div className="flex flex-col" style={{ minHeight: height }}>
      {/* Header — Final → Planned + total gap */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <span style={{ color: "var(--text-3)" }}>{t("profile.diff.planned")}</span>
          <span className="font-mono font-semibold" style={{ color: "var(--text-1)" }}>{Math.round(b * 100)}%</span>
          <span style={{ color: "var(--text-4)" }}>→</span>
          <span style={{ color: "var(--text-3)" }}>{t("profile.diff.final")}</span>
          <span className="font-mono font-semibold" style={{ color: "var(--text-1)" }}>{Math.round(n * 100)}%</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
            {t("profile.diff.total")}
          </div>
          <div className="text-lg font-bold font-mono" style={{ color: segColor(total, segs) }}>
            {valStr(total)}
          </div>
        </div>
      </div>

      {/* Rows — Core, Idle, Early, Kaizen (diverging bars from center) */}
      <div className="flex flex-col gap-3.5 flex-1 justify-center">
        {PIECES.map(({ key, tKey }) => {
          const v   = pieces[key];
          const col = v >= 0 ? NEG : POS;
          const w   = (Math.abs(v) / maxAbs) * 50;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-24 text-xs flex-shrink-0" style={{ color: "var(--text-2)" }}>
                {t(tKey)}
              </div>
              <div className="relative flex-1 h-5">
                <div className="absolute inset-0 rounded-md" style={{ background: "var(--bg-inner)" }} />
                <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, background: "var(--border-md)" }} />
                <div
                  className="absolute top-1/2 rounded-sm"
                  style={{
                    height: 12,
                    transform: "translateY(-50%)",
                    background: col,
                    ...(v >= 0
                      ? { left: "50%", width: `${w}%` }
                      : { right: "50%", width: `${w}%` }),
                  }}
                />
              </div>
              <div className="w-16 text-right text-xs font-mono font-bold flex-shrink-0" style={{ color: col }}>
                {valStr(v)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
