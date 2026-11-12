import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Building2, CalendarClock, Clock, LogIn, LogOut, PlugZap, TriangleAlert, UserX } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
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

/** Today hour by hour: how many people were at work at the start of each hour,
 *  then — dashed, in a lighter figure — how many the shift schedules put there. The numbers are
 *  printed: nothing hides behind a hover a phone does not have. */
function Hours({ hours, T }) {
  const box = useRef(null);
  const max = Math.max(1, ...hours.map((h) => h.n));
  const nowAt = hours.reduce((a, h, i) => (h.plan ? a : i), 0);    // the hour we are in
  // Wider than a phone or a laptop: open on the current hour, the hours ahead in view.
  useEffect(() => {
    const el = box.current;
    const col = el?.querySelector("[data-now]");
    if (col) el.scrollLeft = col.offsetLeft - el.clientWidth / 3;
  }, [nowAt]);
  const swatch = (plan) => (
    <span className="inline-block w-3 h-3 rounded-sm" aria-hidden
      style={plan ? { border: "1.5px dashed var(--brand)" } : { background: "var(--brand)" }} />
  );
  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={CalendarClock} title={T.hoursTitle}
        right={(
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5">{swatch(false)}{T.legendFact}</span>
            <span className="inline-flex items-center gap-1.5">{swatch(true)}{T.legendPlan}</span>
          </div>
        )}
      />
      <div ref={box} className="overflow-x-auto px-4 pt-4 pb-2">
        <ol className="flex items-end gap-[3px] min-w-[1024px]" aria-label={T.hoursTitle}>
          {hours.map((h, i) => {
            const now = i === nowAt;
            return (
              <li
                key={h.t} data-now={now ? "" : undefined}
                className="flex-1 flex flex-col items-center gap-1 rounded-lg pt-1.5 pb-1"
                style={now ? { background: "var(--bg-inner)" } : undefined}
              >
                <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: h.plan ? "var(--text-3)" : "var(--text-1)", fontWeight: now ? 700 : 500 }}>
                  {num(h.n)}
                </span>
                <span className="w-full h-24 flex items-end px-[3px]" aria-hidden>
                  <span
                    className="w-full rounded-t overflow-hidden"
                    style={{
                      height: `${Math.max(2, (h.n / max) * 100)}%`,
                      ...(h.plan ? { border: "1.5px dashed var(--brand)", borderBottom: "none" } : null),
                    }}
                  >
                    <span className="block h-full" style={{ background: "var(--brand)", opacity: h.plan ? 0.14 : now ? 1 : 0.5 }} />
                  </span>
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: now ? "var(--text-1)" : "var(--text-3)", fontWeight: now ? 700 : 400 }}>{h.t}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="px-4 pb-3.5 text-xs" style={{ color: "var(--text-3)" }}>{T.hoursSub}</p>
    </section>
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
        <SkeletonBlock className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
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
        {/* Now: the number, and beside it what it is made of. */}
        <section
          className="rounded-2xl p-5 sm:p-7 grid gap-x-12 gap-y-3 lg:grid-cols-[auto_1fr] lg:items-end"
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
          </div>
          <div className="min-w-0 lg:pb-2">
            <p className="text-sm max-w-[60ch]" style={{ color: "var(--text-2)" }}>
              {fill(T.cameLine, { came: num(d.came), left: num(d.left) })}
              {d.night > 0 && <> {fill(T.nightLine, { n: num(d.night) })}</>}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: stale ? "var(--status-warn)" : "var(--text-3)" }} role={stale ? "status" : undefined}>
              {stale && <TriangleAlert size={14} aria-hidden />}
              {fill(stale ? T.stale : T.asOf, { t: at })}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KPICard label={T.kCame} value={num(d.came)} sub={T.kCameSub} icon={LogIn} color="#22c55e" valueColor="var(--text-1)" />
          <KPICard label={T.kLeft} value={num(d.left)} sub={T.kLeftSub} icon={LogOut} color="#94a3b8" valueColor="var(--text-1)" />
          <KPICard label={T.kNotYet} value={num(d.not_yet)} sub={T.kNotYetSub} icon={Clock} color="#3b82f6" valueColor="var(--text-1)" />
          <KPICard label={T.kAbsent} value={num(d.absent)} sub={T.kAbsentSub} icon={UserX} color="#ef4444" valueColor="var(--text-1)" />
        </div>

        <Hours hours={d.hours || []} T={T} />

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
