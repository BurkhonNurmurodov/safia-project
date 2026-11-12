import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Building2, Clock, LogIn, LogOut, PlugZap, TriangleAlert, UserX } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { SkeletonBlock, SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";
import { TXT, fill } from "./kitchenText";

// «Oshxona» (/kitchen) — how many people are at work in the factory right now,
// for the kitchen that cooks for them. Counts and department names only, read
// from Verifix by the server (services/kitchen.py) and re-asked every minute.

const STALE_S = 600;                                  // older than this = Verifix is silent
const num = (n) => (n ?? 0).toLocaleString("ru-RU");  // 1 482
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

/** The day so far, one bar an hour. Hover, focus or tap a bar to read it. */
function DayBars({ hours, T }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...hours.map((h) => h.n));
  const peak = hours.reduce((a, h) => (h.n > a.n ? h : a), hours[0] || { t: "00:00", n: 0 });
  const shown = sel != null && hours[sel] ? hours[sel] : null;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.dayTitle}</div>
          <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.daySub}</div>
        </div>
        <div className="text-xs font-medium tabular-nums" style={{ color: "var(--text-2)" }} aria-live="polite">
          {fill(shown ? T.at : T.peak, { t: (shown || peak).t, n: num((shown || peak).n) })}
        </div>
      </div>
      <div className="mt-4 flex items-end gap-[2px] sm:gap-1 h-28" onMouseLeave={() => setSel(null)}>
        {HOURS.map((t, i) => {
          const h = hours[i];
          const last = i === hours.length - 1;
          return (
            <button
              key={t} type="button" disabled={!h}
              aria-label={h ? fill(T.at, { t, n: num(h.n) }) : t}
              onMouseEnter={() => h && setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}
              className="group flex-1 h-full flex items-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]"
              style={{ background: "none", border: "none", padding: 0, cursor: h ? "pointer" : "default" }}
            >
              <span
                className="w-full rounded-t-sm transition-opacity duration-150"
                style={{
                  height: h ? `${Math.max(2, (h.n / max) * 100)}%` : 2,
                  background: h ? "var(--brand)" : "var(--border)",
                  opacity: !h || last || sel === i ? 1 : 0.45,
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] sm:gap-1 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }} aria-hidden>
        {HOURS.map((t, i) => (
          <span key={t} className="flex-1 w-0 whitespace-nowrap">
            <span className={i % 6 === 0 ? "" : i % 3 === 0 ? "hidden sm:inline" : "hidden"}>{t}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Kitchen() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tx } = useTranslit();
  const navigate = useNavigate();
  const isAdmin = useAuth()?.auth?.role === "admin";

  const q = useQuery({
    queryKey: ["kitchen-now"],
    queryFn: () => api.get("/api/kitchen/now").then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  let body;
  if (!d && q.isLoading) {
    body = (
      <div className="space-y-4">
        <SkeletonBlock className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={6} />
      </div>
    );
  } else if (!d) {
    body = (
      <EmptyState
        tone="danger" icon={TriangleAlert} height="h-72" showUploadLink={false}
        title={T.errTitle} message={T.errText}
        action={<Button variant="secondary" loading={q.isFetching} onClick={() => q.refetch()}>{T.retry}</Button>}
      />
    );
  } else if (!d.configured) {
    body = (
      <EmptyState
        icon={PlugZap} height="h-72" showUploadLink={false} title={T.offTitle} message={T.offText}
        action={isAdmin && <Button variant="secondary" onClick={() => navigate("/panel/verifix")}>{T.offOpen}</Button>}
      />
    );
  } else {
    const stale = d.age_s > STALE_S;
    const at = (d.read_at || "").slice(11, 16);
    const live = stale ? "var(--status-warn)" : "var(--status-ok)";
    const deps = d.departments || [];
    const top = Math.max(1, ...deps.map((r) => r.inside));
    body = (
      <div className="space-y-4">
        {/* Now, and the day that led to it — one card, split inside. */}
        <section
          className="rounded-2xl p-5 sm:p-7 grid gap-6 lg:grid-cols-[minmax(340px,2fr)_3fr] lg:items-end"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              <span className="relative flex h-2.5 w-2.5">
                {!stale && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping motion-reduce:hidden" style={{ background: live }} />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: live }} />
              </span>
              {T.nowLabel}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="text-[64px] sm:text-[88px] leading-none font-bold font-mono tabular-nums" style={{ color: "var(--text-1)" }}>
                {num(d.inside)}
              </span>
              <span className="text-base" style={{ color: "var(--text-3)" }}>{T.people}</span>
            </div>
            <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
              {fill(T.cameLine, { came: num(d.came), left: num(d.left) })}
              {d.night > 0 && <> {fill(T.nightLine, { n: num(d.night) })}</>}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: stale ? "var(--status-warn)" : "var(--text-3)" }} role={stale ? "status" : undefined}>
              {stale && <TriangleAlert size={14} aria-hidden />}
              {fill(stale ? T.stale : T.asOf, { t: at })}
            </p>
          </div>
          <DayBars hours={d.hours || []} T={T} />
        </section>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KPICard label={T.kCame} value={num(d.came)} sub={T.kCameSub} icon={LogIn} color="#22c55e" valueColor="var(--text-1)" />
          <KPICard label={T.kLeft} value={num(d.left)} sub={T.kLeftSub} icon={LogOut} color="#94a3b8" valueColor="var(--text-1)" />
          <KPICard label={T.kNotYet} value={num(d.not_yet)} sub={T.kNotYetSub} icon={Clock} color="#3b82f6" valueColor="var(--text-1)" />
          <KPICard label={T.kAbsent} value={num(d.absent)} sub={T.kAbsentSub} icon={UserX} color="#ef4444" valueColor="var(--text-1)" />
        </div>

        <TableCard
          icon={Building2} title={T.depTitle} right={deps.length || null} mobileMaxHeight="none"
          mobile={deps.length ? (
            <div>
              <div className="flex justify-between px-4 py-2 text-[11px] font-semibold uppercase" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                <span>{T.cDep}</span><span>{T.cInside}</span>
              </div>
              {deps.map((r) => (
                <div key={r.name} className="flex items-center gap-3 px-4 min-h-[44px] text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="flex-1 truncate" style={{ color: "var(--text-1)" }}>{tx(r.name) || T.noDep}</span>
                  <span className="text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.cameShort, { n: num(r.came) })}</span>
                  <span className="w-12 text-right font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{num(r.inside)}</span>
                </div>
              ))}
            </div>
          ) : <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.depEmpty}</div>}
        >
          <thead>
            <tr>
              <Th label={T.cDep} />
              <Th label={T.cInside} align="right" cls="w-[240px]" />
              <Th label={T.cCame} align="right" />
              <Th label={T.cLeft} align="right" />
              <Th label={T.cNotYet} align="right" />
              <Th label={T.cAbsent} align="right" />
            </tr>
          </thead>
          <tbody>
            {deps.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 max-w-[360px] truncate" title={tx(r.name) || T.noDep}>{tx(r.name) || T.noDep}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <span className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }} aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${(r.inside / top) * 100}%`, background: "var(--brand)" }} />
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums">{num(r.inside)}</span>
                  </div>
                </td>
                {["came", "left", "not_yet", "absent"].map((k) => (
                  <td key={k} className="px-3 py-2 text-right tabular-nums" style={{ color: r[k] ? "var(--text-1)" : "var(--text-3)" }}>{num(r[k])}</td>
                ))}
              </tr>
            ))}
            {!deps.length && (
              <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{T.depEmpty}</td></tr>
            )}
          </tbody>
        </TableCard>
      </div>
    );
  }

  return <Layout title={T.title}>{body}</Layout>;
}
