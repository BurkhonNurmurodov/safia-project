/**
 * Live shift monitor — the wall screen for shift managers (`/live`, Laboratory).
 *
 * One question, asked every 30 seconds: what is going wrong on this shift
 * RIGHT NOW? Idle time per brigadir and per cell (the cells' own filed
 * intervals, the unit figure being the platform's headcount-weighted mean)
 * and plan pace against the shift clock (ПЛАН/ФАКТ minutes off the Positions
 * table's own resolution). The backend (`routers/live_overview.py` →
 * `services/live_overview.py`) decides what is critical; this page makes the
 * change VISIBLE: numbers count to their new value, the board reorders with a
 * FLIP animation, a new alert slides in, a stopped cell pulses.
 *
 * Page key `live` — admin-only until the operator opens it. A supervisor or
 * leader is locked to their own unit server-side; everyone else picks a shift;
 * admins may replay a finished day (`?date=`) to look at the screen when nothing runs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { BookOpenText, RefreshCw } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import LiveHeader from "../components/live/LiveHeader";
import ShiftRace from "../components/live/ShiftRace";
import KpiTiles from "../components/live/KpiTiles";
import UnitBoard from "../components/live/UnitBoard";
import AlertFeed from "../components/live/AlertFeed";
import CellGrid from "../components/live/CellGrid";
import { useFullscreen, useNewKeys, useTick } from "../components/live/liveHooks";
import { tp } from "../components/live/liveUtils";
import { useFactory, useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useIsMobile from "../hooks/useIsMobile";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const INTERVAL = 30_000;

export default function LiveOverview() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const mobile = useIsMobile(768);
  const { ready } = useFactory();
  const factorySection = useFactorySection();

  const [shiftPick, setShiftPick] = usePersistentState("live.shift", null);
  const [onlyProblems, setOnlyProblems] = usePersistentState("live.onlyProblems", false);
  const [replay, setReplay] = useState(null);
  const [showRules, setShowRules] = useState(false);

  const baseParams = useMemo(() => ({
    ...(shiftPick ? { shift: shiftPick } : {}),
    ...(replay ? { date: replay } : {}),
  }), [shiftPick, replay]);
  const params = useFactoryParams(baseParams);

  const q = useQuery({
    queryKey: ["live-overview", params],
    queryFn: () => api.get("/api/live-overview", { params }).then((r) => r.data),
    enabled: ready,
    refetchInterval: INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: 1,
    staleTime: INTERVAL - 5_000,
  });
  const data = q.data;
  const offline = q.isError && !!data;
  const now = useTick(1000);
  const newKeys = useNewKeys((data?.alerts || []).map((a) => a.key));

  const rootRef = useRef(null);
  const fs = useFullscreen(rootRef);

  // A critical count in the tab title, so a monitor minimised behind another
  // window still says something.
  const crit = data?.kpi?.alerts?.crit || 0;
  const warn = data?.kpi?.alerts?.warn || 0;
  useEffect(() => {
    if (!data) return undefined;
    const base = document.title.replace(/^\(\d+[!·]\d*\)\s*/, "");
    document.title = crit || warn ? `(${crit}!${warn}) ${base}` : base;
    return () => { document.title = base; };
  }, [crit, warn, data]);

  // A replay picked on the live day IS live.
  const liveDay = data?.shifts?.[data?.scope?.shift]?.day;
  const onReplay = (iso) => setReplay(!iso || iso === liveDay ? null : iso);

  const shiftValue = data?.scope?.shift ?? shiftPick ?? 1;
  const th = data?.thresholds || {};

  const factoryPanel = factorySection ? <FilterPanel sections={[factorySection]} /> : null;

  return (
    <Layout title={t("nav.live")}>
      <div ref={rootRef} className="live-root flex flex-col gap-4">
        <LiveHeader
          data={data} t={t} offline={offline}
          isFs={fs.on} fsSupported={fs.supported} onToggleFs={fs.toggle}
          shiftValue={shiftValue} onShift={(v) => setShiftPick(Number(v))}
          canPickShift={!!data && !data.scope?.shift_locked}
          replay={replay} onReplay={onReplay} canReplay={!!data?.scope?.can_replay}
          factoryPanel={factoryPanel}
          onRules={data ? () => setShowRules(true) : null}
        />

        {!data && q.isLoading && (
          <>
            <SkeletonBlock className="h-[196px] rounded-2xl" />
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-[132px] rounded-2xl" />)}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <SkeletonBlock className="h-[420px] rounded-2xl" />
              <SkeletonBlock className="h-[420px] rounded-2xl" />
            </div>
          </>
        )}

        {!data && q.isError && (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState
              title={t("live.errTitle")}
              message={String(q.error?.response?.data?.detail || q.error?.message || "")}
              showUploadLink={false}
              action={<Button variant="secondary" icon={RefreshCw} onClick={() => q.refetch()}>{t("live.retry")}</Button>}
            />
          </div>
        )}

        {data && (
          <>
            <ShiftRace frame={data.frame} kpi={data.kpi} thresholds={th} t={t} now={now}
              refreshedAt={q.dataUpdatedAt || null} interval={INTERVAL} fetching={q.isFetching}
              offline={offline} mobile={mobile} />

            <KpiTiles kpi={data.kpi} cells={data.cells} thresholds={th} t={t} />

            {/* The board and the floor plan on the left, the attention column
                on the right, sticky while the map scrolls. Below xl it is one
                column — and the attention list comes FIRST: exceptions before
                the full roll-call. */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
              <div className="min-w-0 flex flex-col gap-4">
                <UnitBoard units={data.units} thresholds={th} frame={data.frame} t={t} tl={tl} mobile={mobile} />
                <CellGrid cells={data.cells} units={data.units} frame={data.frame} now={now} mobile={mobile}
                  onlyProblems={!!onlyProblems} onToggleOnly={setOnlyProblems} t={t} tl={tl} />
              </div>
              <div className="min-w-0 order-first xl:order-none xl:sticky xl:top-4">
                <AlertFeed alerts={data.alerts} cells={data.cells} frame={data.frame} now={now} newKeys={newKeys} t={t} tl={tl} />
              </div>
            </div>
          </>
        )}
      </div>

      {showRules && (
        <Modal title={t("live.legend")} icon={BookOpenText} onClose={() => setShowRules(false)}
          footer={<Button variant="secondary" onClick={() => setShowRules(false)}>{t("live.close")}</Button>}>
          <ul className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
            {[
              tp(t, "live.legend.unit", { u: th.unit_idle_flag, uw: th.unit_idle_warn }),
              tp(t, "live.legend.cell", { s: th.stopped_now_crit, c: th.cell_idle_crit, cw: th.cell_idle_warn }),
              tp(t, "live.legend.pace", { pc: Math.round((th.pace_crit || 0) * 100), pw: Math.round((th.pace_warn || 0) * 100), g: Math.round((th.pace_grace || 0) * 100) }),
              tp(t, "live.legend.fresh", { m: th.plan_stale_min }),
              t("live.windowNote"),
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-[9px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--text-4)" }} aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </Layout>
  );
}
