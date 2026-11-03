// «Brigadirlar KPI» — the top of the board (2026-11-03 redesign). The leaders'
// board opens on a podium and four tiles; a pass / fail KPI has no «best three»
// worth a medal (two counted gates make most brigadirs tie), so its podium is
// an HONOUR WALL — everybody who got through every counted gate, faces first —
// and its tiles are the result in four groups (each a filter on the ranking)
// and one tile per counted gate, where every brigadir is a dot on a fixed scale
// beside the line they had to cross. Nothing here computes a figure: verdicts,
// counts and the rule's own threshold.
import { useMemo, useState } from "react";
import { Award, PieChart, ShieldCheck, UserMinus, X } from "lucide-react";
import ProfileAvatar from "../ui/ProfileAvatar";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import useElementWidth from "../../hooks/useElementWidth";
import { surnameInitial } from "../../utils/personName";
import { fill } from "../../pages/brigadirsKpiText";
import { Delta } from "../kpi/KpiBits";
import { hexA, medalOf } from "../kpi/kpiUtil";
import { GATE_INK, GROUPS, GROUP_INK, LOWER_PASSES, domainOf, figureOfGate, gateOf, groupOf, pct1, thresholdOf } from "./bkpiUtil";

// A brigadir's face: their unit's profile photo, else the tinted initials.
export function BrigAvatar({ row, tl, photoVers, size = 28 }) {
  const key = row.kind === "unit" && row.id ? `supervisor:${row.id}` : null;
  const name = row.name ? tl(row.name) : "—";
  return (
    <ProfileAvatar name={name} colorKey={row.name || row.key} profileKey={key}
      photoVer={key ? photoVers?.[key] : undefined} size={size} />
  );
}

// ── the honour wall ─────────────────────────────────────────────────────────
// A wall tile is narrow (56px of text on a phone), so any word of eight
// letters or more may break — at a soft hyphen, three letters in from either
// end — rather than be cut: «Ibragi-mova S.», never «Ibragimov».
const SHY = "\u00AD";
const wallName = (s) => String(s).replace(/\S{8,}/g, (w) => [...w]
  .map((ch, i, a) => (i >= 3 && a.length - i >= 3 ? SHY + ch : ch)).join(""));

export function HonorWall({ rows, live, T, tl, photoVers, onPick, onShowAll }) {
  const { theme } = useTheme();
  const phone = useIsMobile();
  const gold = medalOf(1, theme);
  const all = rows.filter((x) => groupOf(x, live) === "all");
  // The board's medals on the board's terms: a wall only above three rows.
  if (rows.length <= 3 || all.length === 0) return null;
  const cap = phone ? 7 : 12;
  const shown = all.slice(0, all.length > cap ? cap - 1 : cap);
  const more = all.length - shown.length;
  const size = phone ? 42 : 52;
  return (
    <section className="relative rounded-2xl overflow-hidden mb-4"
      style={{ background: "var(--bg-card)", border: `1px solid ${hexA(gold, 0.4)}` }}
      aria-label={T.bdWall}>
      <span aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(90% 120% at 0% 0%, ${hexA(gold, 0.16)} 0%, transparent 60%)` }} />
      <span aria-hidden className="absolute top-0 h-px pointer-events-none"
        style={{ left: 24, right: 24, background: `linear-gradient(90deg, transparent, ${hexA(gold, 0.9)}, transparent)` }} />
      <div className="relative px-4 sm:px-5 pt-4 pb-3 sm:pb-4">
        <div className="flex items-center gap-3">
          <span className="inline-grid place-items-center w-9 h-9 rounded-xl flex-shrink-0" aria-hidden
            style={{ color: gold, background: hexA(gold, 0.14), boxShadow: `inset 0 0 0 1px ${hexA(gold, 0.35)}` }}>
            <Award size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
              {T.bdWall} <span className="tabular-nums" style={{ color: gold }}>· {all.length}</span>
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{fill(T.bdWallSub, { n: live.length })}</p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-1 gap-y-2 mt-3.5 -mx-1">
          {shown.map((x) => {
            const name = x.name ? tl(x.name) : "—";
            return (
              <li key={x.key}>
                <button type="button" onClick={() => onPick(x)} title={name}
                  aria-label={fill(T.bdWallOpen, { name })}
                  className="flex flex-col items-center rounded-xl px-1 py-1.5 outline-none transition-transform duration-200 motion-safe:hover:-translate-y-0.5 hover:bg-[var(--bg-inner)] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                  style={{ width: phone ? 76 : 88 }}>
                  <span className="rounded-full" style={{ padding: 2.5, background: `linear-gradient(160deg, ${hexA(gold, 1)}, ${hexA(gold, 0.35)})` }}>
                    <span className="block rounded-full" style={{ padding: 2, background: "var(--bg-card)" }}>
                      <BrigAvatar row={x} tl={tl} photoVers={photoVers} size={size} />
                    </span>
                  </span>
                  {/* Two lines at most, never cut (see wallName). */}
                  <span className="mt-1.5 text-xs font-medium leading-tight max-w-full text-center line-clamp-2" style={{ color: "var(--text-1)" }}>
                    {wallName(surnameInitial(name))}
                  </span>
                  <span className="text-[11px] max-w-full truncate" style={{ color: "var(--text-3)" }}>
                    {x.kind === "verifix" ? T.srcVerifix : x.shift ? fill(T.shiftN, { n: x.shift }) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
          {more > 0 && (
            <li>
              <button type="button" onClick={onShowAll} aria-label={fill(T.bdWallMoreAria, { n: more })}
                className="flex flex-col items-center rounded-xl px-1 py-1.5 outline-none hover:bg-[var(--bg-inner)] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                style={{ width: phone ? 76 : 88 }}>
                <span className="inline-grid place-items-center rounded-full text-sm font-semibold tabular-nums"
                  style={{ width: size + 9, height: size + 9, color: gold, background: hexA(gold, 0.1), boxShadow: `inset 0 0 0 1.5px ${hexA(gold, 0.45)}` }}>
                  +{more}
                </span>
                <span className="mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>{T.bdWallMore}</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

// ── tiles ───────────────────────────────────────────────────────────────────
const tileBox = "relative flex flex-col rounded-2xl p-4 min-w-0 text-left";

function Label({ icon: Icon, children, color = "var(--text-3)" }) {
  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-[11px] font-semibold sm:uppercase sm:tracking-[0.07em]" style={{ color: "var(--text-3)" }}>
      <Icon size={14} style={{ color }} aria-hidden />
      <span className="truncate">{children}</span>
    </div>
  );
}

// The change against the month before sits on a line of its own, so a long
// headline word never pushes it — and the tile's bar — down in one tile only.
function Hero({ value, unit, word, delta }) {
  return (
    <>
      <div className="flex items-baseline gap-1.5 mt-2.5 flex-wrap">
        <span className="text-[26px] sm:text-[30px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>{value}</span>
        {unit && <span className="text-sm tabular-nums" style={{ color: "var(--text-3)" }}>{unit}</span>}
        {word && <span className="text-sm" style={{ color: "var(--text-2)" }}>{word}</span>}
      </div>
      {delta && <div className="mt-1">{delta}</div>}
    </>
  );
}

// The result: how many got through every counted gate, the four groups as one
// bar, and each group a toggle that narrows the ranking below.
export function ResultTile({ rows, live, T, group, onGroup, prevCounts }) {
  const counts = useMemo(() => {
    const c = { all: 0, some: 0, none: 0, nodata: 0 };
    for (const x of rows) c[groupOf(x, live)] += 1;
    return c;
  }, [rows, live]);
  const n = rows.length;
  const d = prevCounts ? counts.all - prevCounts.all : null;
  return (
    <div className={tileBox} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <Label icon={PieChart} color="var(--brand-text)">{T.colResult}</Label>
      <Hero value={counts.all} unit={`/ ${n}`} word={T.grpAllShort}
        delta={d != null && <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-3)" }}><Delta d={d} size="sm" />{T.bdVsPrev}</span>} />
      <div className="flex h-2 w-full gap-[2px] mt-3 rounded-full overflow-hidden" aria-hidden>
        {n === 0 ? <span className="flex-1" style={{ background: "var(--border-md)" }} /> : GROUPS.filter((g) => counts[g]).map((g) => (
          <span key={g} className="h-full transition-[flex-grow] duration-500" style={{ flexGrow: counts[g], background: GROUP_INK[g], opacity: group && group !== g ? 0.3 : 1 }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-3" role="group" aria-label={T.bdGroupsAria}>
        {GROUPS.map((g) => {
          const on = group === g;
          return (
            <button key={g} type="button" aria-pressed={on} onClick={() => onGroup(on ? null : g)}
              title={T[`grpDef_${g}`]}
              className="flex items-center gap-2 min-h-[36px] px-2 rounded-lg text-xs text-left outline-none transition-colors hover:bg-[var(--bg-inner)] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              style={{ background: on ? hexA(GROUP_INK[g], 0.12) : undefined, boxShadow: on ? `inset 0 0 0 1px ${hexA(GROUP_INK[g], 0.55)}` : undefined }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: GROUP_INK[g] }} aria-hidden />
              <span className="flex-1 min-w-0 leading-tight break-words" style={{ color: on ? "var(--text-1)" : "var(--text-2)" }}>{T[`grp_${g}`]}</span>
              <span className="font-semibold tabular-nums" style={{ color: counts[g] ? "var(--text-1)" : "var(--text-4)" }}>{counts[g]}</span>
              {on && <X size={12} style={{ color: "var(--text-3)" }} aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── one counted gate: its pass count and every brigadir on the line ─────────
const D = 11;            // a dot's slot: 9px dot + 2px air
const STACK = 5;         // dots per column before the column says «+N»
const PADX = 10;

function Strip({ k, rows, shown, open, rule, live, T, tl, onPick }) {
  const [ref, w] = useElementWidth();
  const [tip, setTip] = useState(null);
  const [lo, hi] = domainOf(rule, k);
  const t = thresholdOf(rule, k);
  const lowerPasses = LOWER_PASSES[k];
  const H = STACK * D + 6;
  const xOf = (v) => PADX + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * Math.max(1, w - PADX * 2);

  // Every brigadir with a figure, binned into columns a dot wide and stacked
  // from the floor — a dot histogram, so ten brigadirs at 100% stand as a
  // column rather than one dot drawn ten times. The columns are laid on a grid
  // anchored at the THRESHOLD, a passed dot always on the passing side and a
  // failed one on the other: a bin must never carry a dot across the line.
  const cols = useMemo(() => {
    if (!w) return [];
    const tx0 = xOf(t);
    const jMax = { "-1": Math.floor((tx0 - PADX) / D - 0.5), 1: Math.floor((w - PADX - tx0) / D - 0.5) };
    const bins = new Map();
    rows.map((x) => ({ x, v: figureOfGate(x, k), s: gateOf(x, k, live) }))
      .filter((p) => p.v != null && (p.s === "pass" || p.s === "fail"))
      .sort((a, b) => Math.abs(a.v - t) - Math.abs(b.v - t))
      .forEach((p) => {
        const side = (p.s === "pass") === lowerPasses ? -1 : 1;
        const j = Math.max(0, Math.min(Math.max(0, jMax[side]), Math.round(Math.abs(xOf(p.v) - tx0) / D - 0.5)));
        const key = side * (j + 1);
        if (!bins.has(key)) bins.set(key, { cx: tx0 + side * (j + 0.5) * D, list: [] });
        bins.get(key).list.push(p);
      });
    return [...bins.values()];
  }, [rows, w, k, lo, hi, t, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const passed = rows.filter((x) => gateOf(x, k, live) === "pass").length;
  const counted = rows.filter((x) => ["pass", "fail"].includes(gateOf(x, k, live))).length;
  const tx = w ? xOf(t) : 0;
  const passFrom = lowerPasses ? xOf(lo) : tx;
  const passTo = lowerPasses ? tx : xOf(hi);
  const failFrom = lowerPasses ? tx : xOf(lo);
  const failTo = lowerPasses ? xOf(hi) : tx;
  const clampedLo = rows.some((x) => (figureOfGate(x, k) ?? lo) < lo);
  const clampedHi = rows.some((x) => (figureOfGate(x, k) ?? hi) > hi);
  const showLo = tx - xOf(lo) > 34;
  const showHi = xOf(hi) - tx > 34;
  const fmt = (v) => `${Math.round(v)}%`;
  const aria = fill(T.bdStripAria, { kpi: T.kpi[k], p: passed, c: counted, rule: fill(k === "turnover" ? T.tvRule : T.okkRule, { max: t, min: t }) });

  const tipRows = tip?.list || [];
  const tipLeft = tip ? Math.max(84, Math.min(w - 84, tip.x)) : 0;
  return (
    <div ref={ref} className="relative mt-3 select-none" style={{ height: H + 22 }} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={H + 4} className="block overflow-visible" role="img" aria-label={aria}>
          <rect x={passFrom} y={0} width={Math.max(0, passTo - passFrom)} height={H} rx={6} fill={GATE_INK.pass} fillOpacity={0.07} />
          <rect x={failFrom} y={0} width={Math.max(0, failTo - failFrom)} height={H} rx={6} fill={GATE_INK.fail} fillOpacity={0.06} />
          <line x1={xOf(lo)} x2={xOf(hi)} y1={H + 2} y2={H + 2} stroke="var(--border-md)" strokeWidth={1} />
          <line x1={tx} x2={tx} y1={-2} y2={H + 4} stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="3 3" />
          {cols.map(({ cx, list }) => {
            const over = list.length > STACK;
            const dots = over ? list.slice(0, STACK - 1) : list;
            return (
              <g key={cx}>
                {dots.map((p, i) => {
                  const s = gateOf(p.x, k, live);
                  const cy = H - D / 2 - i * D;
                  const dim = shown && !shown.has(p.x.key);
                  const isOpen = open?.has(p.x.key);
                  return (
                    <circle key={p.x.key} cx={cx} cy={cy} r={isOpen ? 5 : 4.5} fill={GATE_INK[s] || GATE_INK.nodata}
                      fillOpacity={dim ? 0.22 : 1} stroke={isOpen ? "var(--text-1)" : "var(--bg-card)"} strokeWidth={isOpen ? 1.75 : 1}
                      className="cursor-pointer"
                      onMouseEnter={() => setTip({ x: cx, y: cy, list: [p] })}
                      onClick={() => onPick(p.x, k)} />
                  );
                })}
                {over && (
                  <g className="cursor-default" onMouseEnter={() => setTip({ x: cx, y: H - D / 2 - (STACK - 1) * D, list: list.slice(STACK - 1) })}>
                    <rect x={cx - 9} y={H - D - (STACK - 1) * D + 1} width={18} height={D - 2} rx={4.5} fill="var(--bg-inner)" stroke="var(--border-md)" />
                    <text x={cx} y={H - D / 2 - (STACK - 1) * D + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--text-2)">
                      +{list.length - (STACK - 1)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {w > 0 && (
        <div className="absolute left-0 right-0 text-[11px] tabular-nums" style={{ top: H + 6, color: "var(--text-3)" }} aria-hidden>
          {showLo && <span className="absolute" style={{ left: xOf(lo) - 2 }}>{clampedLo ? `‹${fmt(lo)}` : fmt(lo)}</span>}
          <span className="absolute font-semibold whitespace-nowrap" style={{ left: tx, transform: "translateX(-50%)", color: "var(--text-1)" }}>
            {lowerPasses ? `< ${fmt(t)}` : `> ${fmt(t)}`}
          </span>
          {showHi && <span className="absolute" style={{ right: w - xOf(hi) - 2 }}>{clampedHi ? `${fmt(hi)}›` : fmt(hi)}</span>}
        </div>
      )}
      {tipRows.length > 0 && (
        <div className="absolute z-10 pointer-events-none rounded-lg px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tipLeft, bottom: H + 22 - tip.y + 10, transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-md)", minWidth: 150, maxWidth: 220 }}>
          {tipRows.slice(0, 8).map((p) => {
            const s = gateOf(p.x, k, live);
            return (
              <div key={p.x.key} className="flex items-center gap-2 py-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: GATE_INK[s] }} aria-hidden />
                <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }}>{tl(p.x.name || "—")}</span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{pct1(p.v)}</span>
              </div>
            );
          })}
          {tipRows.length > 8 && <div className="pt-0.5" style={{ color: "var(--text-3)" }}>{fill(T.bdMoreN, { n: tipRows.length - 8 })}</div>}
        </div>
      )}
    </div>
  );
}

const GATE_ICON = { turnover: UserMinus, okk: ShieldCheck };

export function GateTile({ k, data, rows, shown, open, live, T, tl, prevData, onPick }) {
  const rule = data?.rule || {};
  const t = thresholdOf(rule, k);
  const passed = rows.filter((x) => gateOf(x, k, live) === "pass").length;
  const counted = rows.filter((x) => ["pass", "fail"].includes(gateOf(x, k, live))).length;
  const blank = rows.length - counted;
  const notComputed = k === "turnover" && !Array.isArray(data?.turnover?.cells);
  const prevPassed = prevData ? (prevData.rows || []).filter((x) => gateOf(x, k, live) === "pass").length : null;
  const d = prevPassed != null ? passed - prevPassed : null;
  const Icon = GATE_ICON[k] || ShieldCheck;
  return (
    <div className={tileBox} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <Label icon={Icon}>{T.kpi[k]}</Label>
      {notComputed ? (
        <div className="flex-1 flex flex-col justify-center gap-1 mt-3">
          <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{T.tvPast}</p>
          <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{T.tvPastMsg}</p>
        </div>
      ) : (
        <>
          <Hero value={passed} unit={`/ ${counted}`} word={T.bdPassedWord}
            delta={d != null && <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-3)" }}><Delta d={d} size="sm" />{T.bdVsPrev}</span>} />
          <Strip k={k} rows={rows} shown={shown} open={open} rule={rule} live={live} T={T} tl={tl} onPick={onPick} />
          <p className="mt-auto pt-1 text-xs leading-snug" style={{ color: "var(--text-3)" }}>
            {fill(k === "turnover" ? T.tvRule : T.okkRule, { max: t, min: t })}
            {blank > 0 && <> · {fill(T.bdNoFigureN, { n: blank })}</>}
          </p>
        </>
      )}
    </div>
  );
}
