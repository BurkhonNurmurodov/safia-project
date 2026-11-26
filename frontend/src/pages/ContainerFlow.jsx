import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, PackagePlus } from "lucide-react";
import Layout from "../components/layout/Layout";
import DayStepper from "../components/ui/DayStepper";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { useFactorySection, useFactoryIn } from "../components/ui/FactorySelect";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { tashkentNow } from "../components/production/HourlyContainers";
import { errText, refreshFlow, LIVE_LIST, requestsEvery, useExtras, extraWaiting, liveDay, ASK_LEAD_MIN, SPLIT_LEAD_MIN } from "../components/containers/flowUtil";
import FlowReport from "../components/containers/FlowReport";
import FlowSettings from "../components/containers/FlowSettings";
import { RequestsTab, NewRequestModal, PreparedModal, isFresh } from "../components/containers/FlowRequests";
import FlowReceive from "../components/containers/FlowReceive";
import FlowAnalytics from "../components/containers/FlowAnalytics";
import { usePersistentState } from "../hooks/usePersistentState";
import { useOpenParam } from "../hooks/useOpenParam";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

// «Konteyner berish» (/containers/flow, 2026-11-14): every container a line
// works with comes from AXO. AXO sends a REQUEST — counts and an hour — to a
// logistics person or to all of them; one splits it across brigadirs; each
// brigadir confirms what arrived. docs/containers-flow.md.
//
// Who sees what comes from the server (`/settings` → admin / axo / logistics):
// `container-flow` is AXO (Fozilova Dilafruz) — requests, the stock, a
// brigadir's extra; `container-logistics` is Logistics (Nuriddin aka, Yusuf
// aka) — splitting a request across brigadirs; `container-receive` is a
// brigadir confirming what reached their line («Qabul», their own unit only);
// `container-extra` a brigadir asking AXO for extra; `container-watch` is the
// shift- and top-managers WATCHING (2026-11-15): every reading tab, no
// button; the settings are admins'. The automatic batches («Partiyalar») were
// removed on 2026-11-18.
//
// TWO menu rows since 2026-11-21 (the operator: «add another row for logistics
// to splitting the containers … the thing related to the logistics bring to
// the new row»). `side="logistics"` is «Konteyner taqsimlash»
// (/containers/split): the requests to split, the split, «Tahlil», «Hisobot» —
// and every split read cell by cell with its workshop name, on every screen.
// «Konteyner berish» keeps AXO, the brigadirs and the managers watching, and
// splits nothing any more: an admin splits on the new row too, and somebody
// holding only `container-logistics` who opens the old address (a bookmark, a
// Telegram card from before) is sent across.
const REFRESH_MS = 60_000;
// The page's tabs (2026-11-15, rebuilt): the request flow people use every
// hour first — «So'rovlar», «Qabul» — then what it adds up to — «Tahlil» (the
// graphs), «Hisobot» (the tables, Excel) — and the admins' «Sozlamalar».
const TABS = ["requests", "receive", "analytics", "report", "settings"];
const LOGI_TABS = ["requests", "analytics", "report"];
const tabsFor = (r, logiSide) => (logiSide ? LOGI_TABS : TABS.filter((k) => r.admin
  || ((k === "requests" || k === "analytics" || k === "report") && (r.axo || r.logistics || r.watch))
  // «Sozlamalar» also holds «Jo'natish jadvali», which AXO keeps (2026-11-19)
  || (k === "settings" && r.axo)
  // «Qabul» also holds a brigadir's EXTRA request (`container-extra`, 2026-11-18)
  || (k === "receive" && (r.receive || r.watch || r.extra))));

export default function ContainerFlow({ side = "flow" }) {
  const logiSide = side === "logistics";
  const location = useLocation();
  const { t } = useLang();
  const toast = useToast();
  const qc = useQueryClient();
  const [tabSaved, setTab] = usePersistentState(logiSide ? "cflow_split_tab" : "cflow_tab", "requests");
  // a link from a brigadir's Telegram card: ?tab=receive&rcv=<request id> opens
  // «Qabul» on that request's card (`flow._brig_markup`)
  const [tabParam, tabDone] = useOpenParam("tab");
  const [rcv, rcvDone] = useOpenParam("rcv");
  useEffect(() => { if (tabParam) { setTab(tabParam); tabDone(); } }, [tabParam, setTab, tabDone]);
  const roleAdmin = useAuth()?.auth?.role === "admin";
  const [picked, setPicked] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // null = closed; {hour} = open (hour null → the next hour)
  const [newOpen, setNewOpen] = useState(null);
  const openNew = (hour = null) => setNewOpen({ hour });

  const settings = useQuery({
    queryKey: ["cflow-settings"],
    queryFn: () => api.get("/api/container-flow/settings").then((r) => r.data),
  });
  // An admin, or a holder of `page.admin.container-flow` — the server says so
  // (`_roles`), since a grant is not in the token.
  const isAdmin = roleAdmin || !!settings.data?.admin;
  const has = (k) => isAdmin || !!settings.data?.[k];
  // The plant (2026-11-23, the operator: «put the factories too»): the flow
  // serves Uchtepa and Almaty (`settings.factories`) with one AXO and the same
  // logistics people, so a request stays shared and the plant narrows the
  // BRIGADIR side — «Qabul»'s list, «Tahlil» and «Hisobot». docs/containers-flow.md.
  const flowPlants = settings.data?.factories ?? [];
  const plantSection = useFactorySection({ only: flowPlants });
  const plant = useFactoryIn(flowPlants);
  // each row is ONE side of the flow: the split lives on the logistics row
  // only, and that row carries nothing of AXO's or a brigadir's
  const roles = logiSide
    ? { admin: isAdmin, axo: false, logistics: true, receive: false, watch: false, extra: false }
    : { admin: isAdmin, axo: has("axo"), logistics: false, receive: has("receive"), watch: has("watch"), extra: has("extra") };
  // a logistics person with nothing else here: their page is the other row
  const toSplit = !logiSide && !isAdmin && !!settings.data?.logistics
    && !(roles.axo || roles.receive || roles.watch || roles.extra);
  // a brigadir holding only «Qabul» reads nothing of the AXO / logistics side
  const flowSide = roles.axo || roles.logistics || roles.watch;
  // who reads every brigadir's «Qabul» (a brigadir reads their own unit only)
  const seesAll = isAdmin || roles.watch || roles.axo;
  const tabs = tabsFor(roles, logiSide);
  // a tab remembered from before «Partiyalar» was removed falls back to the first
  const tab = tabs.includes(tabSaved) ? tabSaved : tabs[0];
  // The day this side works on NOW (2026-11-26, `liveDay`): AXO's «So'rovlar»
  // turns to the new production day at 06:00 — it asks for 08:00 then —, the
  // logistics row at 07:00, «Qabul» and the rest at 08:00.
  const lead = logiSide ? SPLIT_LEAD_MIN : tab === "requests" ? ASK_LEAD_MIN : 0;
  const live = liveDay(tashkentNow(), lead);
  const day = picked ?? live;
  // The «So'rovlar» tab counts the requests its viewer has not opened yet
  // (the same query the tab reads — fetched once).
  const reqs = useQuery({
    queryKey: ["cflow-requests", day],
    queryFn: () => api.get("/api/container-flow/requests", { params: { day } }).then((r) => r.data),
    refetchInterval: requestsEvery(logiSide),
    enabled: flowSide,
    ...LIVE_LIST,
  });
  const freshN = (reqs.data?.requests ?? []).filter((r) => isFresh(r, reqs.data?.me, !!reqs.data?.logistics)).length;
  // AXO: brigadirs' extra asks still waiting for her answer — on the same badge
  const extras = useExtras(day, roles.axo);
  const askedN = roles.axo ? extraWaiting(extras.data) : 0;
  const badgeN = freshN + askedN;
  const badgeTitle = [freshN ? t("cflow.req.freshCount").replace("{n}", freshN) : null,
    askedN ? t("cflow.ex.badge").replace("{n}", askedN) : null].filter(Boolean).join(" · ");
  // AXO: the hours still ahead that need containers and have no request yet —
  // the brigadirs' and, from 2026-11-19, the dispatch areas' (`send`)
  const prep = useQuery({
    queryKey: ["cflow-prepared2", day],
    queryFn: () => api.get("/api/container-flow/requests/prepared", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
    enabled: roles.axo,
    ...LIVE_LIST,
  });
  const prepHours = [...(prep.data?.hours ?? []), ...(prep.data?.send ?? [])]
    .sort((a, b) => a.hour - b.hour || (a.area_id != null) - (b.area_id != null));
  const [prepOpen, setPrepOpen] = useState(false);
  const fail = (e) => toast.error(errText(t, e));

  if (toSplit) return <Navigate to={`/containers/split${location.search}`} replace />;

  return (
    <Layout title={t(logiSide ? "nav.containerSplit" : "nav.containerFlow")}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* The tabs first: they never move when a tab drops the day control. */}
        {tabs.length > 1 && <SegmentedToggle asTabs value={tab} onChange={setTab}
          options={tabs.map((k) => ({
            value: k,
            label: k === "requests" && badgeN > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {t(`cflow.tab.${k}`)}
                <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] text-center tabular-nums"
                  title={badgeTitle}
                  style={tab === "requests"
                    ? { background: "var(--bg-card)", color: "var(--text-1)" }
                    : { background: "var(--brand)", color: "var(--on-brand)" }}>
                  {badgeN}
                </span>
              </span>
            ) : t(`cflow.tab.${k}`),
          }))} />}
        {!["report", "analytics"].includes(tab) && <DayStepper value={day} onChange={(d) => setPicked(d === live ? null : d)} />}
        {/* «Qabul» of every brigadir (not a brigadir's own) is read per plant */}
        {tab === "receive" && plantSection && seesAll && <FilterPanel sections={[plantSection]} />}
        {roles.axo && tab === "requests" && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {/* always drawn, with its count, so the bar never shifts */}
            <Button size="lg" variant="secondary" icon={<ListChecks size={15} />}
              title={t("cflow.prep.sub")} onClick={() => setPrepOpen(true)}>
              {t("cflow.prep.btn")}
              <span className="ml-1.5 tabular-nums font-semibold">{prep.isLoading ? "…" : prepHours.length}</span>
            </Button>
            <Button size="lg" icon={<PackagePlus size={15} />} onClick={() => openNew()}>
              {t("cflow.req.new")}
            </Button>
          </span>
        )}
      </div>

      {settings.isLoading && !isAdmin ? <Loading />
        : !tab ? <EmptyState tone="danger" showUploadLink={false} title={t("cflow.loadFailed")} message={errText(t, settings.error)} />
        : tab === "requests" ? <RequestsTab t={t} day={day} roles={roles} toast={toast} onNew={openNew} logiSide={logiSide} />
        : tab === "receive" ? (
          <FlowReceive t={t} day={day} toast={toast} isAdmin={isAdmin} openId={rcv} onOpened={rcvDone}
            factory={seesAll ? plant : null}
            canReceive={roles.receive || roles.watch}
            extra={{
              // a brigadir asks for their own unit, an admin names one; the managers watching read
              ask: isAdmin || (roles.extra && settings.data?.unit != null),
              read: roles.extra || roles.watch || roles.axo,
              unit: isAdmin ? null : settings.data?.unit ?? null,
            }} />
        )
        : tab === "analytics" ? <FlowAnalytics t={t} canStock={roles.axo} toast={toast} factory={plant} plantSection={plantSection} />
        : tab === "report" ? <FlowReport t={t} toast={toast} factory={plant} plantSection={plantSection} />
        : <FlowSettings t={t} toast={toast} day={day} data={settings.data} loading={settings.isLoading} isAdmin={roles.admin}
            onSaved={() => qc.invalidateQueries({ queryKey: ["cflow-settings"] })} />}

      {newOpen && (
        <NewRequestModal t={t} day={day} initialHour={newOpen.hour} onClose={() => setNewOpen(null)}
          onDone={() => {
            setNewOpen(null); setTab("requests"); toast.success(t("cflow.req.sent"));
            refreshFlow(qc);
          }} onFail={fail} />
      )}
      {prepOpen && (
        <PreparedModal t={t} day={day} hours={prepHours} onClose={() => setPrepOpen(false)}
          onDone={(n) => {
            setPrepOpen(false); setTab("requests");
            toast.success(t("cflow.prep.sent").replace("{n}", n)); refreshFlow(qc);
          }} onFail={(e) => { fail(e); refreshFlow(qc); }} />
      )}
      {toast.node}
    </Layout>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => <SkeletonBlock key={i} className="h-40 w-full rounded-2xl" />)}
    </div>
  );
}
