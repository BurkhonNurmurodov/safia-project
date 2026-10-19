// «Liderlar KPI» — the top of the board: the podium (the three best cells,
// their owners' photos, medal inks) and four equal tiles that answer «how is
// the team doing»: the average total, how many cells sit in the green band on
// every KPI, how many have a KPI in the red band, and the team's average score
// per KPI. Both zones are the score tones every chip on these pages wears,
// counted — never a threshold of their own (no band exists for a total).
// A zone tile is a toggle: pressed, the ranking below shows only its cells.
// Everything is read off the board payload; nothing here computes a score.
import { AlertTriangle, BarChart3, CheckCircle2, Crown, Gauge, Trophy, X } from "lucide-react";
import ProfileAvatar from "../ui/ProfileAvatar";
import { TONE_HEX } from "../../utils/statusBands";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { fill } from "../../pages/leadersKpiText";
import { Delta, ScorePips } from "./KpiBits";
import { MAX_POINTS, avgTone, hexA, maxScore, medalOf, scoreOf } from "./kpiUtil";

// ── the podium ──────────────────────────────────────────────────────────────
function PodiumCard({ x, first, keys, rules, T, tl, move, phone, theme, onPick }) {
  const medal = medalOf(x.rank, theme) || medalOf(3, theme);
  const owner = x.owner ? tl(x.owner) : "—";
  const size = phone ? (first ? 56 : 46) : (first ? 92 : 74);
  return (
    <button type="button" onClick={() => onPick(x)}
      aria-label={`${fill(T.bdRank, { r: x.rank })}: ${owner}, ${x.code} — ${Number(x.total).toFixed(2)} / ${MAX_POINTS}`}
      className="group relative w-full rounded-2xl overflow-hidden text-center outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${hexA(medal, first ? 0.55 : 0.32)}`,
        boxShadow: first ? `0 22px 48px -24px ${hexA(medal, 0.65)}` : "none",
      }}>
      <span aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(130% 75% at 50% -12%, ${hexA(medal, first ? 0.3 : 0.17)} 0%, transparent 70%)` }} />
      <span aria-hidden className="absolute top-0 h-px pointer-events-none"
        style={{ left: 28, right: 28, background: `linear-gradient(90deg, transparent, ${hexA(medal, 0.95)}, transparent)` }} />

      <div className="relative flex flex-col items-center" style={{ padding: phone ? (first ? "22px 6px 12px" : "16px 6px 10px") : (first ? "30px 18px 18px" : "22px 16px 16px") }}>
        <span className="absolute flex items-center gap-1.5" style={{ top: phone ? 6 : 12, left: phone ? 9 : 16 }}>
          <span className="font-black leading-none tabular-nums" style={{ color: medal, fontSize: phone ? 20 : (first ? 34 : 28) }}>{x.rank}</span>
          {move != null && !phone && <Delta d={move} size="sm" title={T.bdVsPrev} />}
        </span>
        {!phone && (
          <span className="absolute inline-grid place-items-center rounded-lg" aria-hidden
            style={{ top: 14, right: 14, width: 30, height: 30, color: medal, background: hexA(medal, 0.14), boxShadow: `inset 0 0 0 1px ${hexA(medal, 0.35)}` }}>
            {first ? <Crown size={16} /> : <Trophy size={15} />}
          </span>
        )}

        <span className="relative rounded-full" style={{ padding: 3, background: `linear-gradient(160deg, ${hexA(medal, 1)}, ${hexA(medal, 0.35)})` }}>
          <span className="block rounded-full" style={{ padding: 2, background: "var(--bg-card)" }}>
            <ProfileAvatar name={owner} colorKey={x.owner || ""} profileKey={x.owner_key} photoVer={x.photo_ver} size={size} />
          </span>
        </span>

        {/* a phone card keeps two lines for the name, so the three cards
            stand on one floor whatever the names' lengths */}
        <div className={`mt-2.5 font-semibold max-w-full ${phone ? "text-[12.5px] leading-tight min-h-[2.5em] flex items-center justify-center" : "text-[15px] truncate"}`}
          style={{ color: "var(--text-1)" }}><span className={phone ? "line-clamp-2" : undefined}>{owner}</span></div>
        <div className={`mt-0.5 max-w-full truncate ${phone ? "text-[11px]" : "text-xs"}`} style={{ color: "var(--text-3)" }}>
          {phone ? x.code : [x.code, x.brigadir ? tl(x.brigadir) : null].filter(Boolean).join(" · ")}
        </div>

        <div className={`flex items-baseline gap-1 ${phone ? "mt-1.5" : "mt-3"}`}>
          <span className="font-bold leading-none" style={{ color: "var(--text-1)", letterSpacing: "-0.02em",
            fontSize: phone ? (first ? 22 : 19) : (first ? 36 : 30) }}>{Number(x.total).toFixed(2)}</span>
          <span className={phone ? "text-[11px]" : "text-sm"} style={{ color: "var(--text-3)" }}>/ {MAX_POINTS}</span>
        </div>

        {!phone && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-1.5 w-full mt-4 pt-3 text-left"
            style={{ borderTop: `1px solid ${hexA(medal, 0.18)}` }}>
            {keys.map((k) => (
              <div key={k} className="flex items-center justify-between gap-2 min-w-0">
                <span className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{T.tabs[k]}</span>
                <ScorePips score={scoreOf(x, k)} max={maxScore(rules, k)} size="sm" label={`${T.kpi[k]}: ${scoreOf(x, k) ?? "—"}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export function BoardPodium({ rows, keys, rules, T, tl, moves, onPick }) {
  const { theme } = useTheme();
  const phone = useIsMobile();
  const top = rows.filter((x) => x.total > 0).slice(0, 3);
  // The board's medals on the board's terms: a podium only above three, or it
  // would hand a medal to everybody on the list.
  if (rows.length <= 3 || top.length < 3) return null;
  const order = [top[1], top[0], top[2]];
  return (
    <div className="grid items-end gap-2 sm:gap-4 pt-2 mb-4" style={{ gridTemplateColumns: "1fr 1.14fr 1fr" }}>
      {order.map((x, i) => (
        <div key={x.key} style={{ transform: i === 1 ? `translateY(-${phone ? 6 : 10}px)` : undefined }}>
          <PodiumCard x={x} first={i === 1} keys={keys} rules={rules} T={T} tl={tl} move={moves?.get(x.key) ?? null}
            phone={phone} theme={theme} onPick={onPick} />
        </div>
      ))}
    </div>
  );
}

// ── the four tiles ──────────────────────────────────────────────────────────
function Label({ children, dot }) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-[11px] font-semibold sm:uppercase sm:tracking-[0.07em]" style={{ color: "var(--text-3)" }}>
      {dot}
      <span className="truncate">{children}</span>
    </div>
  );
}

function Bar({ value, color }) {
  return (
    <span className="block h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--border-md)" }} aria-hidden>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </span>
  );
}

function Hero({ value, unit, extra }) {
  return (
    <div className="flex items-baseline gap-1.5 mt-2.5">
      <span className="text-[26px] sm:text-[30px] font-semibold leading-none" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>{value}</span>
      {unit && <span className="text-sm" style={{ color: "var(--text-3)" }}>{unit}</span>}
      {extra}
    </div>
  );
}

const tileBox = "relative flex flex-col rounded-2xl p-4 min-w-0 text-left";

function ZoneTile({ label, Icon, tone, count, total, def, pressed, onToggle, T }) {
  const hex = TONE_HEX[tone];
  return (
    <button type="button" onClick={onToggle} aria-pressed={pressed}
      className={`${tileBox} outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] hover:bg-[var(--bg-accent)]`}
      style={{ background: pressed ? hexA(hex, 0.08) : "var(--bg-card)", border: `1px solid ${pressed ? hexA(hex, 0.6) : "var(--border)"}` }}>
      <div className="flex items-center justify-between gap-2">
        <Label dot={<Icon size={14} style={{ color: hex }} aria-hidden />}>{label}</Label>
        {pressed && <X size={14} style={{ color: "var(--text-3)" }} aria-hidden />}
      </div>
      <Hero value={count} unit={`/ ${total}`} />
      <div className="mt-3"><Bar value={total ? count / total : 0} color={hex} /></div>
      <div className="mt-auto pt-2.5 text-xs leading-snug" style={{ color: pressed ? "var(--text-2)" : "var(--text-3)" }}>
        {pressed ? T.bdFilterOn : def}
      </div>
    </button>
  );
}

export function BoardTiles({ data, keys, T, prev, zones, zone, onZone }) {
  const tot = data?.totals || {};
  const rows = data?.rows || [];
  const avg = tot.avg_total;
  const n = rows.length;
  const dAvg = prev && avg != null && prev.totals?.avg_total != null ? avg - prev.totals.avg_total : null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
      <div className={`${tileBox} col-span-2 lg:col-span-1`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <Label dot={<Gauge size={14} style={{ color: "var(--brand-text)" }} aria-hidden />}>{T.bdTeamAvg}</Label>
        <Hero value={avg == null ? "—" : Number(avg).toFixed(2)} unit={`/ ${MAX_POINTS}`} />
        <div className="mt-3"><Bar value={avg == null ? 0 : avg / MAX_POINTS} color="var(--brand)" /></div>
        <div className="mt-auto pt-2.5 text-xs leading-snug flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-3)" }}>
          {dAvg != null && <span className="inline-flex items-center gap-1"><Delta d={dAvg} digits={2} />{T.bdVsPrev}</span>}
          {dAvg == null && fill(T.bdCellsBest, { n, best: tot.best == null ? "—" : Number(tot.best).toFixed(2) })}
        </div>
      </div>

      <ZoneTile label={T.bdGreen} Icon={CheckCircle2} tone="ok" count={zones.green} total={n} def={T.bdGreenDef}
        pressed={zone === "green"} onToggle={() => onZone(zone === "green" ? null : "green")} T={T} />
      <ZoneTile label={T.bdAttn} Icon={AlertTriangle} tone="bad" count={zones.attention} total={n} def={T.bdAttnDef}
        pressed={zone === "attention"} onToggle={() => onZone(zone === "attention" ? null : "attention")} T={T} />

      <div className={`${tileBox} col-span-2 lg:col-span-1`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <Label dot={<BarChart3 size={14} style={{ color: "var(--text-3)" }} aria-hidden />}>{T.bdByKpi}</Label>
        <div className="mt-3 space-y-2">
          {keys.map((k) => {
            const v = tot.by_kpi?.[k]?.avg_score ?? null;
            const max = maxScore(data?.rules, k);
            const tone = avgTone(v, max);
            const pv = prev?.totals?.by_kpi?.[k]?.avg_score;
            return (
              <div key={k} className="flex items-center gap-2 text-xs" title={T.kpi[k]}>
                <span className="w-[34%] lg:w-[40%] truncate" style={{ color: "var(--text-2)" }}>{T.tabs[k]}</span>
                <span className="flex-1 min-w-0"><Bar value={v == null ? 0 : v / max} color={tone ? TONE_HEX[tone] : "var(--border-md)"} /></span>
                <span className="w-7 text-right font-semibold tabular-nums" style={{ color: v == null ? "var(--text-4)" : "var(--text-1)" }}>
                  {v == null ? "—" : Number(v).toFixed(1)}
                </span>
                {prev && (
                  <span className="w-9 flex-shrink-0">{v != null && pv != null && <Delta d={v - pv} digits={1} title={T.bdVsPrev} />}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
