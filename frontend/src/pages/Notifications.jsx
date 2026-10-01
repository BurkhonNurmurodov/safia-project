import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, Inbox, Layers, Settings } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { useToast } from "../components/ui/Toast";
import FeedEntry from "../components/notifications/FeedEntry";
import QueueItem from "../components/notifications/QueueItem";
import NotifPrefsModal from "../components/notifications/NotifPrefsModal";
import { CATEGORIES, QUEUE_KINDS, dayLabel, queueIcon } from "../components/notifications/notifMeta";
import {
  QUEUE_KEY, useMarkAllRead, useMarkRead, useNotifSummary,
} from "../components/notifications/useNotifCenter";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import api from "../utils/api";
import { pushSeen } from "../utils/androidPush";

/**
 * /notifications — the bell's full page (2026-10-01). Two views over the
 * notification centre: everything WAITING on the viewer, grouped by kind, and
 * the whole HISTORY, folded, by day, searchable. Auth-only, like /profile:
 * every session has notifications, so no page grant gates it.
 */
export default function Notifications() {
  const { t } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = usePersistentState("notif_page_tab", "queue");
  const { data: sum } = useNotifSummary();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const toast = useToast();

  // Reading the list here is reading the phone's notifications too.
  useEffect(() => { pushSeen(); }, []);

  // The bell links here with ?tab= — read it on every arrival, not only on
  // mount: the route is not keyed, so a second link from the bell while this
  // page is open would otherwise be ignored.
  useEffect(() => {
    const v = new URLSearchParams(location.search).get("tab");
    if (v === "queue" || v === "history") {
      setTab(v);
      navigate({ pathname: location.pathname }, { replace: true });
    }
  }, [location.search, location.pathname, navigate, setTab]);

  const view = tab === "history" ? "history" : "queue";
  const waiting = sum?.queue ?? 0;
  const qc = useQueryClient();
  const markAll = useMarkAllRead();

  return (
    <Layout title={t("notif.title")}>
      <div className="w-full max-w-3xl mx-auto space-y-4">
        {/* The view tabs, and the two actions that are about the whole page
            rather than its filters — so the filter row below stays one row. */}
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedToggle
            asTabs
            ariaLabel={t("notif.title")}
            value={view}
            onChange={setTab}
            options={[
              ["queue", (
                <span className="inline-flex items-center gap-1.5">
                  {t("notif.tabQueue")}
                  {waiting > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={{ background: view === "queue" ? "rgba(255,255,255,0.3)" : "#ef4444", color: "#fff" }}>
                      {waiting > 99 ? "99+" : waiting}
                    </span>
                  )}
                </span>
              )],
              ["history", t("notif.tabHistory")],
            ]}
          />
          <div className="flex items-center gap-2 ml-auto">
            {view === "history" && (sum?.unread ?? 0) > 0 && (
              <Button variant="secondary" size="lg" loading={markAll.isPending}
                onClick={() => markAll.mutate(undefined, {
                  onSuccess: () => qc.invalidateQueries({ queryKey: ["notif", "feed"] }),
                })}>
                {t("notif.markAllRead")}
              </Button>
            )}
            <Button variant="secondary" size="lg" aria-label={t("notif.settings")} title={t("notif.settings")}
              style={{ paddingLeft: 11, paddingRight: 11 }} onClick={() => setPrefsOpen(true)}>
              <Settings size={16} />
            </Button>
          </div>
        </div>
        {view === "queue" ? <QueueView /> : <HistoryView />}
      </div>
      {prefsOpen && (
        <NotifPrefsModal onClose={() => setPrefsOpen(false)}
          onSaved={() => toast.success(t("notif.prefs.saved"))} />
      )}
      {toast.node}
    </Layout>
  );
}

function Card({ children }) {
  return (
    <section className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {children}
    </section>
  );
}

function RowsSkeleton({ rows = 4 }) {
  return (
    <Card>
      <div className="px-4 py-3 space-y-4" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-3">
            <SkeletonBlock className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-3.5 w-3/4" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LoadError({ onRetry }) {
  const { t } = useLang();
  return (
    <Card>
      <div className="px-4 py-10 text-center">
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{t("notif.loadError")}</p>
        <Button variant="secondary" size="lg" className="mt-3" onClick={onRetry}>{t("notif.retry")}</Button>
      </div>
    </Card>
  );
}

// ── everything waiting on the viewer ─────────────────────────────────────────

function QueueView() {
  const { t } = useLang();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => api.get("/api/notifications/queue").then((r) => r.data),
    // Not refetched under the reader: a decided item keeps its place, showing
    // its outcome, until the view is opened again.
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    staleTime: Infinity,
  });
  const [decided, setDecided] = useState({});
  const onDecided = (key, v) => setDecided((d) => {
    const n = { ...d };
    if (v) n[key] = v; else delete n[key];
    return n;
  });

  const groups = useMemo(() => {
    const by = new Map();
    for (const it of data?.items || []) {
      if (!by.has(it.kind)) by.set(it.kind, []);
      by.get(it.kind).push(it);
    }
    return QUEUE_KINDS.filter((k) => by.has(k)).map((k) => ({ kind: k, items: by.get(k) }));
  }, [data]);

  if (isLoading) return <RowsSkeleton />;
  if (isError) return <LoadError onRetry={() => refetch()} />;
  if (!groups.length) {
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title={t("notif.queueEmptyTitle")}
          message={t("notif.queueEmptyText")} showUploadLink={false} height="h-48" />
      </Card>
    );
  }
  return groups.map((g) => (
    <Card key={g.kind}>
      <SectionHead
        icon={queueIcon(g.items[0])}
        title={t(`notif.kind.${g.kind}`)}
        right={<span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>{g.items.length}</span>}
      />
      <div className="-mt-px">
        {g.items.map((it) => (
          <QueueItem key={it.key} item={it} decided={decided[it.key]} onDecided={onDecided} />
        ))}
      </div>
    </Card>
  ));
}

// ── the history ──────────────────────────────────────────────────────────────

function HistoryView() {
  const { t, lang } = useLang();
  const [cats, setCats] = usePersistentState("notif_page_cats", []);
  const [state, setState] = usePersistentState("notif_page_state", "all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const catSel = (cats || []).filter((c) => CATEGORIES.includes(c));
  const filtered = catSel.length > 0 || state === "unread" || !!q;

  const feed = useInfiniteQuery({
    queryKey: ["notif", "feed", lang, catSel.join(","), state, q],
    queryFn: ({ pageParam }) => api.get("/api/notifications/feed", {
      params: {
        lang,
        before: pageParam || undefined,
        cats: catSel.length ? catSel.join(",") : undefined,
        unread: state === "unread" || undefined,
        q: q || undefined,
      },
    }).then((r) => r.data),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next_before || undefined,
    refetchOnWindowFocus: false,
  });

  const markRead = useMarkRead();
  const [readIds, setReadIds] = useState(() => new Set());
  const read = (ids) => {
    setReadIds((s) => { const n = new Set(s); ids.forEach((i) => n.add(i)); return n; });
    markRead.mutate(ids);
  };
  const isUnread = (e) => e.unread && !e.ids.every((i) => readIds.has(i));

  const pages = feed.data?.pages || [];
  const today = pages[0]?.today;
  const days = useMemo(() => {
    const out = [];
    for (const e of pages.flatMap((p) => p.entries || [])) {
      const last = out[out.length - 1];
      if (last && last.day === e.day) last.items.push(e);
      else out.push({ day: e.day, items: [e] });
    }
    return out;
  }, [pages]);

  const sections = [
    {
      key: "cat", icon: Layers, label: t("notif.filterCategory"),
      active: catSel.length > 0,
      display: catSel.length === 1 ? t(`notif.cat.${catSel[0]}`) : `${catSel.length} ${t("filter.selected2")}`,
      onClear: () => setCats([]),
      render: () => (
        <OptsFilter opts={CATEGORIES} sel={catSel} onChange={setCats}
          render={(c) => t(`notif.cat.${c}`)} labelOf={(c) => t(`notif.cat.${c}`)} />
      ),
    },
    {
      key: "state", icon: CircleDot, label: t("notif.filterState"),
      active: state === "unread",
      display: t("notif.stateUnread"),
      onClear: () => setState("all"),
      render: ({ close }) => (
        <PickFilter value={state} onChange={setState} close={close}
          opts={[{ value: "all", label: t("notif.stateAll") }, { value: "unread", label: t("notif.stateUnread") }]} />
      ),
    },
  ];
  const clearAll = () => { setCats([]); setState("all"); setSearch(""); };

  return (
    <>
      <div className="flex items-center gap-2">
        <FilterPanel sections={sections} />
        <SearchInput value={search} onChange={setSearch} placeholder={t("notif.search")}
          className="flex-1 min-w-0" />
      </div>

      {feed.isLoading ? (
        <RowsSkeleton rows={6} />
      ) : feed.isError ? (
        <LoadError onRetry={() => feed.refetch()} />
      ) : days.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={Inbox} title={t("notif.filteredEmptyTitle")} message={t("notif.filteredEmptyText")}
              showUploadLink={false} height="h-48"
              action={<Button variant="secondary" onClick={clearAll}>{t("notif.clearFilters")}</Button>} />
          ) : (
            <EmptyState icon={Inbox} title={t("notif.emptyTitle")} message={t("notif.emptyText")}
              showUploadLink={false} height="h-48" />
          )}
        </Card>
      ) : (
        <>
          {days.map((d) => (
            <div key={d.day || "x"}>
              <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                {dayLabel(d.day, today, t)}
              </h2>
              <Card>
                <div className="-mt-px">
                  {d.items.map((e) => (
                    <FeedEntry key={e.key} entry={e} unread={isUnread(e)} onRead={read} />
                  ))}
                </div>
              </Card>
            </div>
          ))}
          <div className="flex justify-center py-2">
            {feed.hasNextPage ? (
              <Button variant="secondary" size="lg" loading={feed.isFetchingNextPage}
                onClick={() => feed.fetchNextPage()}>
                {t("notif.loadMore")}
              </Button>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--text-3)" }}>{t("notif.end")}</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
