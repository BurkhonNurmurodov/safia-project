import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Layers, Package, Tv, X, Radio, Users, Clock, ArrowRight, AlertTriangle } from "lucide-react";
import Layout from "../components/layout/Layout";
import DayStepper from "../components/ui/DayStepper";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { HourlyTable } from "../components/overview/ContainerTotalsCard";
import { DAY, hourLabel, tashkentNow, prevISO } from "../components/production/HourlyContainers";
import { hasOpenDialog } from "../components/ui/dialogLayers";
import { useFilters } from "../context/FilterContext";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

// «Konteynerlar» (/containers, 2026-11-13, the operator): the plant's containers
// for one production day, laid out to hang on a TV on the shop floor — the day's
// totals, what this hour and the NEXT hour need (the one to prepare now), the
// hour-by-hour table and every brigadir's share. Admin-only until the operator
// opens it for the people who handle containers.
//
// Every figure is the server's: `/api/shift-report/containers` (totals and
// `by_unit`, the «Pozitsiyalar» «soni» count summed) and `/containers-hourly`
// (the «Soatlik» timelines summed) — the same numbers «Smena kunligi» prints.
// Nothing is computed here but sums of those.
//
// Without a picked day the page follows the LIVE production day (shift 1's
// start to the same clock next morning — 08:00, the platform default), and
// re-reads every minute, so a TV left on it needs nobody.
const KEYS = ["yellow", "round", "grey", "bucket", "box"];
const REFRESH_MS = 60_000;
const DAY_START_MIN = 8 * 60;
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));
const heat = (n, max) => (n > 0 && max > 0 ? `rgba(200,151,63,${(0.06 + 0.34 * (n / max)).toFixed(3)})` : "transparent");
const toDMY = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const liveDay = (now) => (now.min < DAY_START_MIN ? prevISO(now.iso) : now.iso);

function useMinuteTick(ms = 30_000) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function Containers() {
  const { t } = useLang();
  const { shift, setShift } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const tv = searchParams.get("tv") === "1";
  useMinuteTick();

  // null = live: the board moves to the next production day by itself.
  const [picked, setPicked] = useState(null);
  const now = tashkentNow();
  const live = liveDay(now);
  const day = picked ?? live;
  const isLive = day === live;

  const base = useMemo(() => (shift ? { shift } : {}), [shift]);
  const params = useFactoryParams(base);

  const setTv = useCallback((on) => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (on) n.set("tv", "1"); else n.delete("tv");
      return n;
    }, { replace: true });
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch?.(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
    } catch { /* a browser without the Fullscreen API still gets the overlay */ }
  }, [setSearchParams]);

  // Escape leaves TV mode — unless a dialog is open above it, which answers first.
  useEffect(() => {
    if (!tv) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !hasOpenDialog()) setTv(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tv, setTv]);

  const factorySection = useFactorySection();
  const shiftSection = {
    key: "shift", icon: Layers, label: t("filter.shift"),
    active: shift != null,
    display: shift != null ? `S${shift}` : "",
    onClear: () => setShift(null),
    render: () => (
      <SegmentedToggle fill value={shift} onChange={setShift}
        options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
    ),
  };

  const board = <Board day={day} params={params} isLive={isLive} tv={tv} t={t} />;

  return (
    <Layout title={t("nav.containers")}>
      <div className="flex flex-wrap items-center gap-2 max-[359px]:gap-1.5 mb-5">
        <DayStepper value={day} onChange={(d) => setPicked(d === live ? null : d)} fillPhone />
        <FilterPanel sections={[factorySection, shiftSection].filter(Boolean)} chipsWrap />
        {!isLive && (
          <Button variant="success" tint size="lg" onClick={() => setPicked(null)} title={t("containers.liveHint")}>
            <Radio size={15} /> {t("containers.live")}
          </Button>
        )}
        <Button className="ml-auto" variant="primary" size="lg" onClick={() => setTv(true)}>
          <Tv size={16} /> {t("containers.tv")}
        </Button>
      </div>
      {!tv && board}
      {tv && (
        <TvFrame day={day} isLive={isLive} shift={shift} t={t} onExit={() => setTv(false)}>
          {board}
        </TvFrame>
      )}
    </Layout>
  );
}

// The TV: the board alone over the whole screen (the app's shell hidden),
// PORTALED to <body> — Layout's page wrapper carries a transform (its enter
// animation), which makes a `fixed` child fixed to the wrapper, not the
// screen: rendered in place it was a 74px strip inside the shell. Its
// own header — what is shown, the clock, when it was read — and everything
// scaled to the screen with CSS zoom, so a 1080p TV reads it from across the
// floor without a second set of sizes in the components.
function TvFrame({ day, isLive, shift, t, onExit, children }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.min(2.4, Math.max(1, window.innerWidth / 1440)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // The page under the overlay must not scroll along with it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const now = tashkentNow();
  const clockText = `${hourLabel(Math.floor(now.min / 60))}:${String(now.min % 60).padStart(2, "0")}`;
  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ zoom }} className="p-5">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(200,151,63,0.14)", color: "var(--brand-text)" }}>
            <Package size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{t("nav.containers")}</div>
            <div className="text-sm" style={{ color: "var(--text-3)" }}>
              {toDMY(day)}{shift ? ` · ${t("production.contTotals.shiftN").replace("{n}", String(shift))}` : ""}
              {isLive && <span className="ml-2 font-semibold" style={{ color: "#22c55e" }}>● {t("containers.live")}</span>}
            </div>
          </div>
          <div className="ml-auto text-4xl font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{clockText}</div>
          <Button variant="ghost" size="lg" onClick={onExit} aria-label={t("containers.tvExit")} title={t("containers.tvExit")}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Board({ day, params, isLive, tv, t }) {
  const refetch = isLive ? REFRESH_MS : false;
  const totalsQ = useQuery({
    queryKey: ["containers-page", day, params],
    queryFn: () => api.get("/api/shift-report/containers", { params: { ...params, day } }).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: refetch,
  });
  // Same key and request as the hourly table below, so it is read once.
  const hourlyQ = useQuery({
    queryKey: ["shift-daily-containers-hourly", day, params],
    queryFn: () => api.get("/api/shift-report/containers-hourly", { params: { ...params, day } }).then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: refetch,
  });
  const data = totalsQ.data;
  const totals = data?.totals ?? {};
  const grand = KEYS.reduce((s, k) => s + (totals[k] ?? 0), 0);
  const nothing = data && !KEYS.some((k) => totals[k]);
  const updated = totalsQ.dataUpdatedAt
    ? new Date(totalsQ.dataUpdatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })
    : null;

  if (totalsQ.isError) {
    return <EmptyState tone="danger" icon={Package} title={t("production.contTotals.failed")} message="" showUploadLink={false} />;
  }

  return (
    <div className="space-y-5">
      {/* The day's totals — one tile per container, the sum last. */}
      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{t("containers.dayTotals")}</span>
          {updated && <span className="ml-auto text-[12px] tabular-nums" style={{ color: "var(--text-3)" }}>{t("containers.updated").replace("{t}", updated)}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {KEYS.map((k) => (
            <Tile key={k} label={t(`production.cont.${k}`)} value={totals[k]} loading={!data}
              sub={data ? t("production.contTotals.lines").replace("{n}", String(data.lines?.[k] ?? 0)) : null} tv={tv} />
          ))}
          <Tile accent label={t("production.cont.grandTotal")} value={data ? grand : null} loading={!data}
            sub={data ? t("containers.unitsN").replace("{n}", String(data.units ?? 0)) : null} tv={tv} />
        </div>
      </section>

      {nothing ? (
        <EmptyState icon={Package} title={t("containers.noData")} message={t("containers.noDataHint")} showUploadLink={false} />
      ) : (
        <>
          {isLive && <HourStrip q={hourlyQ} day={day} t={t} tv={tv} />}
          {isLive && <NextByUnit q={hourlyQ} day={day} t={t} tv={tv} />}
          <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 pb-4 pt-1">
            <HourlyTable day={day} params={params} t={t} refetchInterval={refetch}
              around={tv ? { before: 1, after: 6 } : null} size={tv ? "lg" : "md"} />
            <Coverage totals={data} hourly={hourlyQ.data} t={t} />
          </section>
          <UnitTable data={data} loading={!data} t={t} tv={tv} />
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, loading, accent = false, tv }) {
  return (
    <div className="rounded-xl p-4 min-w-0"
      style={{
        background: accent ? "rgba(200,151,63,0.10)" : "var(--bg-card)",
        border: `1px solid ${accent ? "rgba(200,151,63,0.45)" : "var(--border)"}`,
      }}>
      <div className="text-[13px] leading-snug min-h-[2.5em]" style={{ color: accent ? "var(--brand-text)" : "var(--text-3)" }}>{label}</div>
      {loading ? (
        <SkeletonBlock className="h-9 w-20 mt-1" />
      ) : (
        <>
          <div className={`${tv ? "text-5xl" : "text-4xl"} font-bold tabular-nums mt-1 leading-none`}
            style={{ color: value == null ? "var(--text-4)" : "var(--text-1)" }}>{fmt(value)}</div>
          {sub && <div className="text-[12px] mt-2" style={{ color: "var(--text-3)" }}>{sub}</div>}
        </>
      )}
    </div>
  );
}

// This hour and the next — what the floor needs now and what to prepare for.
function HourStrip({ q, day, t, tv }) {
  const now = tashkentNow();
  const nowMin = day === now.iso ? now.min : day === prevISO(now.iso) ? now.min + DAY : null;
  if (nowMin == null) return null;
  const h = Math.floor(nowMin / 60);
  const byH = Object.fromEntries((q.data?.hours ?? []).map((x) => [x.h, x.counts || {}]));
  const span = (x) => `${hourLabel(x)}:00–${hourLabel(x + 1)}:00`;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <HourCard title={t("containers.nowHour")} span={span(h)} counts={byH[h]} loading={q.isLoading} t={t} tv={tv} icon={Clock} />
      <HourCard title={t("containers.nextHour")} span={span(h + 1)} counts={byH[h + 1]} loading={q.isLoading} t={t} tv={tv} icon={ArrowRight} next />
    </div>
  );
}

function HourCard({ title, span, counts, loading, t, tv, icon: Icon, next = false }) {
  const keys = KEYS.filter((k) => counts?.[k]);
  const sum = keys.reduce((s, k) => s + counts[k], 0);
  return (
    <div className="rounded-xl p-4"
      style={{
        background: next ? "rgba(200,151,63,0.10)" : "var(--bg-card)",
        border: `${next ? 2 : 1}px solid ${next ? "var(--brand)" : "var(--border)"}`,
      }}>
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: next ? "var(--brand-text)" : "var(--text-3)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: next ? "var(--brand-text)" : "var(--text-2)" }}>{title}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{span}</span>
      </div>
      {loading ? (
        <SkeletonBlock className="h-16 w-full mt-3" />
      ) : !keys.length ? (
        <div className="text-sm mt-3" style={{ color: "var(--text-3)" }}>{t("production.hourly.noneThisHour")}</div>
      ) : (
        <div className="flex items-end gap-6 mt-3">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 min-w-0 flex-1">
          {keys.map((k) => (
            <div key={k} className="min-w-0">
              <div className="text-[12px] truncate max-w-[140px]" style={{ color: "var(--text-3)" }} title={t(`production.cont.${k}`)}>{t(`production.cont.${k}`)}</div>
              <div className={`${tv ? "text-4xl" : "text-3xl"} font-bold tabular-nums leading-tight`} style={{ color: "var(--text-1)" }}>{fmt(counts[k])}</div>
            </div>
          ))}
          </div>
          <div className="shrink-0 text-right pl-4" style={{ borderLeft: "1px solid var(--border)" }}>
            <div className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.cont.total")}</div>
            <div className={`${tv ? "text-4xl" : "text-3xl"} font-bold tabular-nums leading-tight`}
              style={{ color: next ? "var(--brand-text)" : "var(--text-1)" }}>{fmt(sum)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Every brigadir's containers for the day, the most first; each cell tinted by
// its size within its column, the last column the brigadir's share of the day.
function UnitTable({ data, loading, t, tv }) {
  const { tl } = useTranslit();
  const rows = data?.by_unit ?? [];
  const keys = KEYS.filter((k) => rows.some((u) => u.totals?.[k]));
  const sumOf = (u) => keys.reduce((s, k) => s + (u.totals?.[k] ?? 0), 0);
  const colMax = Object.fromEntries(keys.map((k) => [k, Math.max(0, ...rows.map((u) => u.totals?.[k] ?? 0))]));
  const grand = rows.reduce((s, u) => s + sumOf(u), 0);
  const scrollRef = useRef(null);
  return (
    <TableCard icon={Users} title={t("containers.byUnit")} subtitle={t("containers.byUnitSub")} headSize="lg"
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length}</span>}
      maxHeight="none" scrollRef={scrollRef}>
      <thead>
        <tr>
          <Th label="#" align="right" cls="w-10" />
          <Th label={t("containers.brigadir")} />
          <Th label={t("filter.shift")} align="center" />
          {keys.map((k) => <Th key={k} label={t(`production.cont.${k}`)} align="right" />)}
          <Th label={t("production.cont.total")} align="right" />
          <Th label={t("containers.share")} cls="min-w-[160px]" />
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}><td colSpan={keys.length + 5} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          ))
        ) : !rows.length ? (
          <tr><td colSpan={keys.length + 5} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("containers.noData")}</td></tr>
        ) : rows.map((u, i) => {
          const sum = sumOf(u);
          const pct = grand ? (sum / grand) * 100 : 0;
          return (
            <tr key={u.id} className={tv ? "text-lg [&>td]:py-3" : "text-sm"}>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{i + 1}</td>
              <td className="px-3 py-2 max-w-[260px] truncate font-medium" title={tl(u.name)}>{tl(u.name)}</td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>{u.shift ? `S${u.shift}` : "—"}</td>
              {keys.map((k) => {
                const n = u.totals?.[k] ?? 0;
                return (
                  <td key={k} className="px-3 py-2 text-right tabular-nums"
                    style={{ background: heat(n, colMax[k]), color: n ? "var(--text-1)" : "var(--text-4)", fontWeight: n ? 600 : 400 }}>
                    {n ? fmt(n) : "·"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(sum)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--brand)" }} />
                  </div>
                  <span className="w-11 text-right tabular-nums text-xs" style={{ color: "var(--text-2)" }}>{pct.toFixed(0)}%</span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );
}

// Who needs the NEXT hour's containers — the hour to prepare for, split by
// brigadir (each unit's own «Soatlik» timeline, `by_unit` of
// /containers-hourly), the most first, with what the current hour already
// takes beside it. Units with nothing in either hour are left out.
function NextByUnit({ q, day, t, tv }) {
  const { tl } = useTranslit();
  const now = tashkentNow();
  const nowMin = day === now.iso ? now.min : day === prevISO(now.iso) ? now.min + DAY : null;
  if (nowMin == null) return null;
  const h = Math.floor(nowMin / 60);
  const units = q.data?.by_unit ?? [];
  const at = (u, hr) => (u.hours ?? []).find((x) => x.h === hr)?.counts ?? {};
  const rows = units.map((u) => {
    const next = at(u, h + 1), cur = at(u, h);
    const sum = (c) => KEYS.reduce((s, k) => s + (c[k] ?? 0), 0);
    return { ...u, next, nextSum: sum(next), curSum: sum(cur) };
  }).filter((u) => u.nextSum || u.curSum).sort((a, b) => b.nextSum - a.nextSum || b.curSum - a.curSum);
  const keys = KEYS.filter((k) => rows.some((u) => u.next[k]));
  const colMax = Object.fromEntries(keys.map((k) => [k, Math.max(0, ...rows.map((u) => u.next[k] ?? 0))]));
  const span = `${hourLabel(h + 1)}:00–${hourLabel(h + 2)}:00`;
  const rowCls = tv ? "text-lg [&>td]:py-3" : "text-sm";
  return (
    <TableCard icon={ArrowRight} title={t("containers.nextByUnit")} subtitle={t("containers.nextByUnitSub")} headSize="lg"
      right={<span className="text-sm font-semibold tabular-nums" style={{ color: "var(--brand-text)" }}>{span}</span>}
      maxHeight="none">
      <thead>
        <tr>
          <Th label={t("containers.brigadir")} />
          <Th label={t("filter.shift")} align="center" />
          {keys.map((k) => <Th key={k} label={t(`production.cont.${k}`)} align="right" />)}
          <Th label={t("containers.nextTotal")} align="right" />
          <Th label={t("containers.nowTotal")} align="right" />
        </tr>
      </thead>
      <tbody>
        {q.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <tr key={i}><td colSpan={keys.length + 4} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          ))
        ) : !rows.length ? (
          <tr><td colSpan={keys.length + 4} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("production.hourly.noneThisHour")}</td></tr>
        ) : rows.map((u) => (
          <tr key={u.id} className={rowCls}>
            <td className="px-3 py-2 max-w-[260px] truncate font-medium" title={tl(u.name)}>{tl(u.name)}</td>
            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>{u.shift ? `S${u.shift}` : "—"}</td>
            {keys.map((k) => {
              const n = u.next[k] ?? 0;
              return (
                <td key={k} className="px-3 py-2 text-right tabular-nums"
                  style={{ background: heat(n, colMax[k]), color: n ? "var(--text-1)" : "var(--text-4)", fontWeight: n ? 600 : 400 }}>
                  {n ? fmt(n) : "·"}
                </td>
              );
            })}
            <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: u.nextSum ? "var(--brand-text)" : "var(--text-4)" }}>{u.nextSum ? fmt(u.nextSum) : "·"}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.curSum ? "var(--text-2)" : "var(--text-4)" }}>{u.curSum ? fmt(u.curSum) : "·"}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// The hours cover only units with «Zagruzka fayli» set up (a unit needs its
// dashboard to have a timeline), while the tiles count every unit — so the
// two totals can differ. Said where it shows, in words, never left to a
// footnote: how much of the day the hours place, and which brigadirs they
// leave out.
function Coverage({ totals, hourly, t }) {
  const { tl } = useTranslit();
  if (!totals || !hourly) return null;
  const day = KEYS.reduce((s, k) => s + (totals.totals?.[k] ?? 0), 0);
  let placed = 0;
  for (const x of hourly.hours ?? []) for (const k of KEYS) placed += x.counts?.[k] ?? 0;
  for (const k of KEYS) placed += hourly.untimed?.[k] ?? 0;
  const inHours = new Set((hourly.by_unit ?? []).map((u) => u.id));
  const missing = (totals.by_unit ?? []).filter((u) => !inHours.has(u.id));
  if (!day) return null;
  const gap = missing.length > 0 || placed !== day;
  const names = missing.map((u) => tl(u.name)).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[13px]">
      <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
        {t("containers.coverage").replace("{a}", fmt(placed)).replace("{b}", fmt(day))}
      </span>
      {gap && missing.length > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md min-w-0 max-w-full"
          style={{ color: "#eab308", background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)" }}
          title={names}>
          <AlertTriangle size={13} className="shrink-0" />
          <span className="truncate">{t("containers.notInHours").replace("{n}", String(missing.length)).replace("{names}", names)}</span>
        </span>
      )}
    </div>
  );
}
