import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { KanbanSquare, ListTree, Tag, RotateCw, RefreshCw, AlertTriangle, Info, Database, ExternalLink } from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { SkeletonCard, SkeletonChart, SkeletonBlock } from "../components/ui/Skeleton";
import TrelloBoardView from "../components/trello/TrelloBoardView";
import { useTT, fill, stamp, errText, labelHex, ddmmyy, openExt } from "../components/trello/trelloUtil";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";

const NO_LIST = [];

// «Trello» (/trello) — a Trello board's analytics: the board as it stands (cards
// per list and label, how old the open ones are), the cards open the longest,
// and the flow over a period (created vs finished, time to finish). The server
// reads every board through Trello's API every 15 minutes
// (services/trello.py) and computes the page from the stored copy
// (services/trello_analytics.py). The connection and the boards are set on
// the admin panel's «Trello» card.
//
// ONE request feeds the page (GET /api/trello/analysis). The period moves only
// the flow; the board, list and label filters narrow everything.
export default function TrelloAnalytics() {
  const T = useTT();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [boardSel, setBoardSel] = usePersistentState("trello_board", null);
  const [range, setRange] = useState(null);                 // null = the last twelve weeks
  const [listSel, setListSel] = usePersistentState("trello_lists", NO_LIST);
  const [labelSel, setLabelSel] = usePersistentState("trello_labels", NO_LIST);

  const reqParams = useMemo(() => {
    const p = {};
    if (boardSel) p.board = boardSel;
    if (range?.from) p.date_from = range.from;
    if (range?.to) p.date_to = range.to;
    if (listSel.length) p.list = listSel;
    if (labelSel.length) p.label = labelSel;
    return p;
  }, [boardSel, range, listSel, labelSel]);

  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["trello", reqParams],
    queryFn: () => api.get("/api/trello/analysis", { params: reqParams }).then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // A remembered board that is gone (removed on the admin card) falls back to
  // the first one — and its list / label picks with it, which name another
  // board's ids.
  const boardId = data?.board?.id || null;
  useEffect(() => {
    if (!data || !boardSel || boardId === boardSel) return;
    setBoardSel(boardId);
    setListSel([]);
    setLabelSel([]);
  }, [data, boardSel, boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the read: while one runs, watch it land ───────────────────────────────
  const running = !!data?.read?.running;
  const [watching, setWatching] = useState(false);
  const { data: readNow } = useQuery({
    queryKey: ["trello-read"],
    queryFn: () => api.get("/api/trello/read").then((r) => r.data),
    enabled: running || watching,
    refetchInterval: 3000,
  });
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!readNow) return;
    if (readNow.running) { wasRunning.current = true; return; }
    if (wasRunning.current || watching) {
      wasRunning.current = false;
      setWatching(false);
      qc.invalidateQueries({ queryKey: ["trello"] });
      const failed = (readNow.boards || []).find((b) => b.error);
      if (failed) toast.error(fill(T.readFailedToast, { e: errText(T, failed.error) }));
      else toast.success(T.readDone);
    }
  }, [readNow]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRead() {
    try {
      const { data: r } = await api.post("/api/trello/read");
      if (r.started) { toast.info(T.readStarted); setWatching(true); wasRunning.current = true; }
      else toast.info(T.readBusy);
      qc.invalidateQueries({ queryKey: ["trello-read"] });
    } catch (err) {
      toast.error(err?.response?.data?.detail?.code === "not_configured" ? T.notConfiguredTitle : T.loadError);
    }
  }

  // ── filters ───────────────────────────────────────────────────────────────
  const boards = data?.read?.boards || NO_LIST;
  const optLists = data?.options?.lists || NO_LIST;
  const optLabels = data?.options?.labels || NO_LIST;
  const listName = useMemo(() => new Map(optLists.map((l) => [l.id, l.name])), [optLists]);
  const labelBy = useMemo(() => new Map(optLabels.map((l) => [l.id, l])), [optLabels]);
  const listKeys = useMemo(() => [...listSel.filter((k) => !listName.has(k)), ...optLists.map((l) => l.id)], [optLists, listSel, listName]);
  const labelKeys = useMemo(() => [...optLabels.map((l) => l.id), "none"], [optLabels]);
  const listLabel = (k) => listName.get(k) || "·";
  const labelLabel = (k) => (k === "none" ? T.noLabel : labelBy.get(k)?.name || "·");
  const labelRender = (k) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {k !== "none" && <span aria-hidden className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: labelHex(labelBy.get(k)?.color) }} />}
      <span className="truncate">{labelLabel(k)}</span>
    </span>
  );
  const brief = (sel, label) => (sel.length === 1 ? label(sel[0]) : sel.length ? fill(T.nSelected, { n: sel.length }) : "");

  const sections = [];
  if (boards.length > 1) {
    sections.push({
      key: "board", icon: KanbanSquare, label: T.fBoard, group: T.grpScope, pinned: true,
      active: true, display: data?.board?.name || "",
      render: ({ close }) => (
        <PickFilter opts={boards.map((b) => ({ value: b.id, label: b.name || b.id }))} value={boardId}
          onChange={(v) => { if (v !== boardId) { setBoardSel(v); setListSel([]); setLabelSel([]); } }} close={close} />
      ),
    });
  }
  sections.push(
    {
      key: "list", icon: ListTree, label: T.fList, group: T.grpScope,
      active: listSel.length > 0, display: brief(listSel, listLabel),
      onClear: () => setListSel([]),
      render: () => (
        <OptsFilter searchable opts={listKeys} sel={listSel} onChange={setListSel}
          labelOf={listLabel} render={listLabel} note={fill(T.listsNote, { n: optLists.length })} />
      ),
    },
    {
      key: "label", icon: Tag, label: T.fLabel, group: T.grpScope,
      active: labelSel.length > 0, display: brief(labelSel, labelLabel),
      onClear: () => setLabelSel([]),
      render: () => (
        <OptsFilter searchable opts={labelKeys} sel={labelSel} onChange={setLabelSel}
          labelOf={labelLabel} render={labelRender} note={fill(T.labelsNote, { n: optLabels.length })} />
      ),
    },
  );
  const narrowed = listSel.length || labelSel.length;
  const clearPicks = () => { setListSel([]); setLabelSel([]); };

  // ── what the page says about the data under it ────────────────────────────
  const board = data?.board;
  const isAdmin = !!data?.is_admin;
  const reading = running || !!readNow?.running;
  const freshness = reading ? T.readRunning : board?.read_at ? fill(T.readAt, { at: stamp(board.read_at) }) : T.readNever;
  const failed = board?.error && board?.tried_at;

  const notices = [];
  if (failed) {
    notices.push({ icon: AlertTriangle, warn: true, text: fill(T.readFailed, {
      at: stamp(board.tried_at), e: errText(T, board.error), ok: board.read_at ? stamp(board.read_at) : "—" }) });
  }
  if (data?.totals) {
    const names = (data.done_lists || []).map((l) => `«${l.name}»`).join(", ");
    const doneLine = !names ? T.doneNone : data.done_auto ? fill(T.doneAuto, { l: names }) : fill(T.doneSet, { l: names });
    notices.push({ icon: Info, warn: !names,
      text: `${doneLine} ${data.archived_done ? T.archivedDone : T.archivedOut} ${T.doneChange}`,
      action: isAdmin ? { label: T.openSettings, onClick: () => navigate("/admin/upload?tab=trello") } : null });
    if (data.history_truncated && data.history_from) {
      notices.push({ icon: Info, text: fill(T.historyNote, { d: ddmmyy(data.history_from.slice(0, 10)) }) });
    }
  }

  const notConfigured = data && !data.read?.configured && !board?.read_at;
  const noBoards = data && data.read?.configured && !board;
  const neverRead = data && board && !board.read_at;
  const empty = data && data.totals && data.totals.cards === 0;

  return (
    <Layout title={T.title}>
      {/* ONE-ROW filter bar: the period (it moves the flow chart), the scope in
          the panel, and on the right where the data comes from. */}
      {/* Only over a board that has been read: before that there is nothing to
          narrow, and the empty state below carries the one action there is. */}
      {data?.totals && <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DateRangePicker
          dateFrom={range?.from ?? data?.date_from ?? null}
          dateTo={range?.to ?? data?.date_to ?? null}
          setDateFrom={(v) => setRange((r) => ({ from: v, to: r?.to ?? data?.date_to ?? v }))}
          setDateTo={(v) => setRange((r) => ({ from: r?.from ?? data?.date_from ?? v, to: v }))}
          compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        {/* The board pick is always «on» (there is no «all boards»), so it is
            never counted as a narrowing and never cleared with the rest. */}
        <FilterPanel sections={sections} chipsWrap
          activeCount={(listSel.length ? 1 : 0) + (labelSel.length ? 1 : 0)}
          anyActive={!!narrowed} onClearAll={clearPicks} />
        <div className="flex-1" />
        {board?.url && (
          <a href={board.url} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, board.url)}
            className="hidden sm:inline-flex text-[11px] whitespace-nowrap items-center gap-1 hover:underline underline-offset-2"
            style={{ color: "var(--text-3)" }} title={T.openInTrello}>
            <ExternalLink size={12} /> {board.name}
          </a>
        )}
        <span className="text-[11px] whitespace-nowrap flex items-center gap-1.5" style={{ color: failed ? "var(--status-warn)" : "var(--text-3)" }}>
          <Database size={12} /> {freshness}
        </span>
        {isAdmin && (
          <Button size="lg" variant="secondary" onClick={startRead} loading={reading}
            disabled={!data?.read?.configured || !board} title={T.readNow} aria-label={T.readNow}>
            <RefreshCw size={14} />
          </Button>
        )}
      </div>}

      {notices.length > 0 && !isPending && (
        <div className="mb-4 space-y-2">
          {notices.map((n, i) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--bg-inner)", border: `1px solid ${n.warn ? "var(--status-warn)" : "var(--border)"}`, color: "var(--text-2)" }}>
              <n.icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: n.warn ? "var(--status-warn)" : "var(--text-3)" }} />
              <span className="flex-1 min-w-0 basis-[calc(100%-1.5rem)] sm:basis-auto">{n.text}</span>
              {n.action && (
                <button type="button" onClick={n.action.onClick}
                  className="flex-shrink-0 font-semibold underline underline-offset-2 sm:-my-2 py-2 px-1 min-h-[36px] max-sm:ml-5 max-sm:-mt-1"
                  style={{ color: "var(--brand-text)" }}>
                  {n.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isError && !data ? (
        <EmptyState tone="danger" title={T.loadError} message={T.loadErrorMsg} showUploadLink={false}
          action={<Button size="sm" variant="secondary" onClick={() => refetch()}><RotateCw size={12} /> {T.retry}</Button>} />
      ) : isPending || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <SkeletonChart className="h-80 lg:col-span-2" />
            <SkeletonChart className="h-80" />
          </div>
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      ) : notConfigured || noBoards ? (
        <EmptyState icon={KanbanSquare} title={notConfigured ? T.notConfiguredTitle : T.noBoardsTitle}
          message={isAdmin ? (notConfigured ? T.notConfiguredAdmin : T.noBoardsAdmin) : T.notConfiguredUser}
          showUploadLink={false}
          action={isAdmin ? <Button size="sm" variant="secondary" onClick={() => navigate("/admin/upload?tab=trello")}>{T.openSettings}</Button> : null} />
      ) : neverRead ? (
        <EmptyState icon={Database} title={reading ? T.readRunning : T.neverReadTitle} message={T.neverReadMsg} showUploadLink={false}
          action={isAdmin && !reading ? <Button size="sm" variant="secondary" onClick={startRead}><RefreshCw size={12} /> {T.readNow}</Button> : null} />
      ) : empty ? (
        <EmptyState icon={KanbanSquare} title={narrowed ? T.emptyFiltered : T.emptyBoard} showUploadLink={false}
          action={narrowed ? <Button size="sm" variant="secondary" onClick={clearPicks}>{T.clearPicks}</Button> : null} />
      ) : (
        // Dimmed only while the figures on screen belong to the PREVIOUS filters.
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={isPlaceholderData}>
          <TrelloBoardView data={data} />
        </div>
      )}
      {toast.node}
    </Layout>
  );
}
