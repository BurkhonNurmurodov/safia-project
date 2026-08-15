import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Sparkles, CheckCircle2, XCircle, MessageSquare, Inbox,
  ChevronLeft, ChevronRight, ChevronDown, Undo2, Keyboard, X, Gauge,
  ClipboardCheck, Flag, SearchX, Settings2, Gavel, RotateCcw,
  ImageOff,
} from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import StyledSelect from "../ui/StyledSelect";
import SegmentedToggle from "../ui/SegmentedToggle";
import { FilterPanel, PickFilter } from "../ui/ColumnFilter";
import { SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { usePersistentState } from "../../hooks/usePersistentState";
import { QueuePhoto } from "./ProofPhoto";
import api from "../../utils/api";

/* ══ AI proof review ══════════════════════════════════════════════════════════
 *
 * The register badge told an admin a report was suspect; finding out WHY meant
 * opening the report, scrolling to the right task card and reading a 10px strip
 * — about eight interactions per flag, with no way to filter to the flagged
 * rows in the first place. At roughly a hundred flags a day that is not a
 * workflow, and because a verdict had no terminal state the same flags came
 * back every session.
 *
 * So this is a queue, not a decoration. Three panes: what is left (rail), the
 * photo (as large as the pane allows), and the verdict WITH the decision. Every
 * fact needed to rule — the clock the model read, the window it was measured
 * against, the criteria an admin wrote, the leader's own answer — is on screen
 * at once, because the reviewer's actual task is a comparison and a comparison
 * needs both sides visible.
 *
 * One keystroke dispatches. Undo is not a nicety: without it a one-key decision
 * makes people hesitate, and hesitation costs more than the keystroke saves.
 *
 * ── it is now a REGISTER as well as a queue ──────────────────────────────────
 * It used to show unresolved flags and nothing else, which made it a worklist
 * that erased its own history: a proof the AI cleared never appeared, and a
 * flag somebody had ruled on vanished at the keystroke. So «has this day been
 * looked at», «what did I decide last week» and «show me this leader's actual
 * photos» had no answer anywhere in the app, and the emptied queue looked
 * identical to a period nobody had ever checked.
 *
 * Now the feed carries every JUDGED proof — flagged and clean, decided and
 * undecided — newest first, and «Holat → Ko'rilmagan» is the old queue one pick
 * away. Two consequences run through everything below:
 *   · a decision no longer removes the card, it re-badges it, so the cursor has
 *     to advance by itself or the triage rhythm dies at the first row;
 *   · every row is rulable, clean ones included — the machine finding nothing
 *     is a recommendation, and an admin who can see the photo must be able to
 *     overrule it in the same keystroke as everywhere else.
 */

const C_AI = "#eab308";      // amber — needs a look, not a failure
const C_GOOD = "#22c55e";
const C_BAD = "#ef4444";
const C_FLAT = "#94a3b8";
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Decision → the tone and the icon it dispatches under. `approved` is the only
// one that costs nobody anything, so it is the only green.
const ACTS = {
  approved:  { tone: C_GOOD, Icon: CheckCircle2,  key: "A" },
  rejected:  { tone: C_BAD,  Icon: XCircle,       key: "D" },
  requeried: { tone: "#C8973F", Icon: MessageSquare, key: "R" },
};

/* ══ the scope bar ════════════════════════════════════════════════════════════
 *
 * A queue of 337 flags is not one job. It is "yesterday's shift", "everything
 * Sevara filed", "task 4 across the week" — and the reviewer pays for mixing
 * them: every card in the old rail arrived with a different date window, a
 * different person's camera and a different definition-of-done to hold in the
 * head. That context switch, not the clicking, is what made the queue slow.
 *
 * So the filters are exactly the axes a verdict is judged on — period, leader,
 * supervisor, task, shift, and the flag itself, finer than the bucket tabs.
 * Batch on any one of them and the reviewer holds ONE context for a run of
 * cards, which is where the speed actually comes from.
 *
 * Four of those axes are now the PAGE's, not this tab's: period, leader,
 * supervisor and shift arrive as `scope` from the bar above the tab strip, and
 * every other leaders tab reads the same values. They were duplicated here
 * before — the same five controls on two tabs, each remembering its own
 * answer, so an admin narrowing the dashboard to one brigadir came to a queue
 * still pointed at the whole factory and had no way to tell. What stays local
 * is what only exists HERE: the task and the flag, dimensions the dashboard
 * has no notion of.
 *
 * Every dimension is evaluated SERVER-side. Filtering the page the browser
 * happens to hold would answer "Sevara's flags" with "Sevara's flags among the
 * 300 that fit", and on an older date it would answer "none" for a day holding
 * forty. The option lists come back from the same pass, each counted against
 * the other active filters, so no option in the panel is ever a dead end.
 */
const EMPTY_FLT = { task: null, flag: null, bucket: null, state: null };
const EMPTY_SCOPE = { from: "", to: "", leader: null, supervisor: null, shift: null };
const FLAGS = ["off_topic", "not_proven", "date_mismatch", "no_date", "unreadable"];
// What the HUMAN said. A separate axis from the buckets — a rejected fake is
// `forged` AND `rejected` — so it gets a panel section, never a tab.
const STATES = ["open", "approved", "rejected", "requeried"];
// Strip order: «Hammasi» → the clean band → the flagged bands worst-first. Clean
// sits second because it is the one tab that answers "what did the AI pass", and
// reading it against «Hammasi» is how the reviewer sizes the rest; the flagged
// four keep their severity order (a forged proof outranks a technical read) so
// walking right walks down the queue. NOT the rail's sort — that stays the
// server's `_BUCKET_RANK`, which never ranks clean at all.
const BUCKETS = ["clean", "forged", "undone", "date", "tech"];
// One helping of the rail, matching the server's own PAGE. «Ko'proq» asks for
// another on top of it rather than turning a page: the rail is one list under
// one J/K cursor, and a page boundary is exactly where that cursor would die.
const PAGE = 150;

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
// The queue is a work surface, not a register: a window is only useful here as
// "did the clock fall inside it", so the redundant year is dropped and the two
// halves are shown as the times they are.
const shortWin = (w) => (w || "").replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `${d}.${m}`);

/** The verdict exists but its photos no longer resolve — the report was deleted
 *  underneath it. NOT the same as a report with no photos, which cannot reach
 *  this queue at all: a review is only ever written from images it actually
 *  read, so `photosJudged > 0` on an empty list means the source went away, not
 *  that the leader filed nothing. Printing a bare «0 rasm» for that blamed the
 *  leader for an admin's cleanup — the one reading the queue cannot tell the two
 *  apart, and the wrong one is the one that gets someone's score rejected. */
const srcLost = (it) => !!it && it.photos.length === 0 && (it.photosJudged || 0) > 0;

/** `actions` — the «request a check» control, injected from Leaders.jsx so this
 *  component needs no overview query of its own. It belongs on THIS tab: it
 *  used to live only in the register header on Monitoring, gated on the feature
 *  being enabled, so the admin who came to the AI tab to start a check found no
 *  way to start one. */
export default function AiTriage({ T, lang, taskDetail, nm, actions, scope, onClearScope }) {
  const qc = useQueryClient();
  // `position="bottom"`: this is a dense editing surface and the eye lives at
  // the decision bar, not the page head.
  const { show: showToast, hide: hideToast, node: toastNode } = useToast({ position: "bottom" });

  // Persisted like every other page's filters: a triage session gets
  // interrupted, and coming back to "all 337" after narrowing to one leader
  // means re-doing the narrowing every time. Merged over EMPTY_FLT so a stored
  // shape written before a dimension existed cannot arrive missing a key —
  // which is why `bucket` and `state` could join it without a key bump.
  // Key bumped when period/leader/supervisor/shift moved up to the page bar:
  // a blob written under the old shape would keep re-applying a leader nobody
  // can see a control for.
  const [stored, setStored] = usePersistentState("leaders.ai.flt2", EMPTY_FLT);
  // How many helpings of the rail have been asked for. Part of the query key,
  // so «Ko'proq» is a refetch of one longer list rather than a second list to
  // stitch — which is what keeps the optimistic writes below single-target.
  const [pages, setPages] = useState(1);
  const [i, setI] = useState(0);
  const [photoIx, setPhotoIx] = useState(0);
  const [zoom, setZoom] = useState(null);       // object URL of the enlarged photo
  const [keysOpen, setKeysOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  // The last dispatch, kept until the next one so Z can put it back. Only one
  // deep on purpose: an undo stack nobody can see is a worse promise than a
  // single step everybody understands.
  const [undoable, setUndoable] = useState(null);
  const zoomUrls = useRef({});
  const gridRef = useRef(null);       // the three-pane grid — the phone scroll target
  const activeRowRef = useRef(null);  // the rail row under the cursor
  const firstShow = useRef(true);     // the initial render must not yank the page

  const f = useMemo(() => ({ ...EMPTY_FLT, ...(stored || {}) }), [stored]);
  const sc = useMemo(() => ({ ...EMPTY_SCOPE, ...(scope || {}) }), [scope]);
  const anyLocal = useMemo(
    () => Object.keys(EMPTY_FLT).some((k) => f[k] !== EMPTY_FLT[k]),
    [f],
  );
  const anyScope = useMemo(
    () => Object.keys(EMPTY_SCOPE).some((k) => sc[k] !== EMPTY_SCOPE[k]),
    [sc],
  );
  // «Nothing matched» has to hand back EVERY control that could have caused it,
  // and after the move most of them are the page's, not this tab's.
  const anyFlt = anyLocal || anyScope;
  // Patching, not replacing — and both cursors go home, because the row under
  // the old index belongs to a queue that no longer exists. The rail goes back
  // to one helping too: a narrowed set may be shorter than what was already
  // loaded, and re-asking for 1 200 rows to show forty is pure waste.
  const setF = useCallback((patch) => {
    setStored((p) => ({ ...EMPTY_FLT, ...(p || {}), ...patch }));
    setI(0);
    setPhotoIx(0);
    setPages(1);
  }, [setStored]);

  // Same reasoning for the PAGE's scope, which arrives as a prop and so cannot
  // go through `setF`. An effect is safe for this one piece of state and not
  // for the cursors below: `pages` only decides how much to ask the server for,
  // so a frame rendered against the previous value shows a longer list, never
  // somebody else's photo.
  const scopeKey = JSON.stringify(sc);
  useEffect(() => { setPages(1); }, [scopeKey]);

  // The filters are PART of the cache key, so every mutation that writes the
  // queue back optimistically has to use this exact key — a bare
  // ["leader-ai-queue"] would write a cache entry nothing renders, and the
  // dispatched card would sit on screen until the next refetch.
  const qkey = useMemo(() => ["leader-ai-queue", sc, f, pages], [sc, f, pages]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qkey,
    queryFn: () => api.get("/api/leader-ai/queue", {
      params: {
        date_from: sc.from || undefined,
        date_to: sc.to || undefined,
        leader: sc.leader ?? undefined,
        supervisor: sc.supervisor ?? undefined,
        shift: sc.shift ?? undefined,
        task_id: f.task ?? undefined,
        flag: f.flag ?? undefined,
        bucket: f.bucket ?? undefined,
        state: f.state ?? undefined,
        limit: PAGE * pages,
      },
    }).then((r) => r.data),
    refetchOnWindowFocus: true,
    // Adjusting a filter keeps the current rail on screen until the new one
    // lands. A skeleton between every pick turns a narrowing pass into a
    // sequence of blank screens.
    placeholderData: keepPreviousData,
  });

  // The rail IS what the server sent. The tab strip used to filter this list in
  // the browser, which is why the page slice had to hand every bucket a
  // guaranteed share — a tab reading «3» over an empty rail. `bucket` is a
  // server-side dimension now, counted in the same pass as every other filter,
  // so the tab numbers and the rows under them cannot disagree.
  const items = useMemo(() => data?.items ?? [], [data]);
  const facets = data?.facets || {};
  const buckets = data?.buckets || {};
  // Both cursors are CLAMPED during render rather than reset from an effect.
  // A dispatch shortens the list under the index and a new item may carry fewer
  // photos than the last — resetting those in effects meant a frame rendered
  // against the stale value first, which on this screen is a frame of somebody
  // else's photo. Deriving cannot show that frame at all. It also means the
  // index stays put as items leave, so the next card slides into place under
  // the cursor, which is what makes the queue feel like an inbox.
  const ix = Math.min(i, Math.max(0, items.length - 1));
  const cur = items[ix] || null;
  const pIx = Math.min(photoIx, Math.max(0, (cur?.photos.length || 1) - 1));

  // Keyed by ref, so a stale entry can never hand the zoom overlay the previous
  // item's image — and no reset pass is needed when the card changes.
  const zoomKey = cur ? `${cur.ref}:${pIx}` : "";

  const pickBucket = useCallback((b) => setF({ bucket: b === "all" ? null : b }), [setF]);

  const move = useCallback((d) => {
    setI((p) => {
      const n = items.length;
      if (!n) return 0;
      return (Math.min(p, n - 1) + d + n) % n;
    });
    setPhotoIx(0);
  }, [items.length]);

  /** Does this ruling take the row OUT of what is on screen?
   *
   *  Only ever true inside a state filter the new ruling contradicts — reading
   *  «Ko'rilmagan» and approving something. Everywhere else the row belongs to
   *  the view it is already in, and removing it would be a lie: the feed shows
   *  decided work now, so a decision changes the badge, not the membership. */
  const leaves = useCallback(
    (resolution) => f.state != null && f.state !== resolution,
    [f.state],
  );

  const resolveMut = useMutation({
    mutationFn: ({ ref, resolution }) =>
      api.post("/api/leader-ai/resolve", { ref, resolution }).then((r) => r.data),
    // Optimistic: the whole point is a 5-second loop, and waiting ~400ms for a
    // round-trip before the next card appears is what turns a rhythm back into
    // a series of clicks. A failure puts the item back and says so.
    //
    // No invalidation on success either, for the same reason — a triage run is
    // five decisions in five seconds, and each one refetching a 150-row payload
    // would spend the whole session re-downloading the list being worked.
    onMutate: async ({ ref, resolution, bucket }) => {
      await qc.cancelQueries({ queryKey: ["leader-ai-queue"] });
      const prev = qc.getQueryData(qkey);
      const gone = leaves(resolution);
      const res = resolution === "open" ? null : resolution;
      qc.setQueryData(qkey, (old) => old && ({
        ...old,
        items: gone
          ? old.items.filter((x) => x.ref !== ref)
          : old.items.map((x) => (x.ref === ref
            ? { ...x, resolution: res, resolutionNote: null,
                // The server stamps the real actor; this is only what the card
                // shows for the second before the next read confirms it.
                resolvedBy: res ? T.aiYou : null,
                resolvedAt: res ? new Date().toISOString() : null }
            : x)),
        // The counters the row just left. Patched rather than refetched, and
        // floored: a tab counting below zero is worse than one running stale.
        total: gone ? Math.max(0, (old.total || 1) - 1) : old.total,
        buckets: gone && bucket
          ? { ...old.buckets, [bucket]: Math.max(0, (old.buckets?.[bucket] || 1) - 1) }
          : old.buckets,
      }));
      return { prev };
    },
    onError: (e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qkey, ctx.prev);
      setUndoable(null);
      // Errors persist until dismissed — you cannot re-read a toast that left.
      showToast(e?.response?.data?.detail || String(e?.message || e), "error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
      // The register and the leaderboard both move when a proof is rejected.
      qc.invalidateQueries({ queryKey: ["leaders"] });
    },
  });

  const dispatch = useCallback((resolution) => {
    if (!cur) return;
    // The item as it stood BEFORE the ruling — including whatever it was
    // decided as last time. That snapshot is what undo restores, so undoing a
    // correction puts back the original decision rather than clearing it.
    setUndoable({ item: cur, resolution });
    showToast(
      `${T[`aiAct_${resolution}`]} — ${nm(cur.leader)}, ${T.task} ${cur.taskId}`,
      resolution === "rejected" ? "warning" : "success",
    );
    resolveMut.mutate({ ref: cur.ref, resolution, bucket: cur.bucket });
    // The card no longer disappears out from under the cursor, so the cursor
    // has to move by itself. Without this a decision looks like nothing
    // happened and every second keystroke has to be a J — which is precisely
    // the rhythm the one-key dispatch exists to buy.
    if (!leaves(resolution)) move(1);
  }, [cur, resolveMut, showToast, T, nm, leaves, move]);

  const undo = useCallback(() => {
    if (!undoable) return;
    const { item } = undoable;
    // Restore what the row WAS — `open` when nobody had ruled on it, the
    // previous ruling when this was a correction. Undoing by writing
    // "approved" would have been a lie in the first case: "nobody has looked at
    // this yet" and "somebody looked and cleared it" are different facts, and
    // the calibration stats read exactly that difference.
    const back = item.resolution || "open";
    api.post("/api/leader-ai/resolve", { ref: item.ref, resolution: back })
      .then(() => qc.invalidateQueries({ queryKey: ["leader-ai-overview"] }))
      // Only a FAILED undo needs the server's word for where the row belongs.
      .catch(() => qc.invalidateQueries({ queryKey: ["leader-ai-queue"] }));
    // Patch in place while the row is still on screen; only one the ruling
    // actually removed comes back at the head — and only then does the cursor
    // go home to it. Moving the cursor for a row that never left would yank the
    // reader back up the rail from wherever they had got to.
    const here = (qc.getQueryData(qkey)?.items || []).some((x) => x.ref === item.ref);
    qc.setQueryData(qkey, (old) => old && ({
      ...old,
      items: here ? old.items.map((x) => (x.ref === item.ref ? item : x))
        : [item, ...old.items],
    }));
    setUndoable(null);
    if (!here) setI(0);
    setPhotoIx(0);
    hideToast();
  }, [undoable, qc, qkey, hideToast]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  // The order-of-magnitude change. Guarded against firing while somebody is
  // typing in a field, and against the browser's own chord shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") { setZoom(null); setKeysOpen(false); return; }
      if (e.key === " ") {
        e.preventDefault();
        setZoom((z) => (z ? null : zoomUrls.current[zoomKey] || null));
        return;
      }
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (k === "a") dispatch("approved");
      else if (k === "d") dispatch("rejected");
      else if (k === "r") dispatch("requeried");
      else if (k === "s") move(1);
      else if (k === "z") undo();
      else if (k === "?") setKeysOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, dispatch, undo, zoomKey]);

  // Follow the cursor. Desktop: J/K walks past the rail's own viewport, so the
  // active row is kept in sight (block "nearest" — the page itself never
  // jumps). Phone: the rail lives BELOW the card, so after a dispatch or a
  // step the next item must come to the reader — scroll the card back under
  // the thumb instead of leaving them staring at where the previous card's
  // buttons used to be.
  useEffect(() => {
    if (!cur) { firstShow.current = true; return; }
    if (window.matchMedia("(min-width: 1024px)").matches) {
      activeRowRef.current?.scrollIntoView({ block: "nearest" });
    } else if (!firstShow.current) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gridRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    firstShow.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.ref]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_340px] gap-3">
        <SkeletonBlock className="h-[420px] rounded-2xl" />
        <SkeletonBlock className="h-[420px] rounded-2xl" />
        <SkeletonBlock className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (data && !data.enabled) return <KeySetup T={T} qc={qc} />;

  // Every tab counts the whole scanned set inside the OTHER filters — the
  // strip's own pick excluded — so the tabs stay a way back out of a narrow
  // one instead of collapsing to it. `total` is what the current tab holds.
  const total = data?.total ?? items.length;
  // «Hammasi» counts the strip, not the rail: with a tab open, `total` is that
  // tab's own length, and printing it beside «Hammasi» would tell the reader
  // the whole set had shrunk to the one band they are standing in.
  const bucketAll = BUCKETS.reduce((n, b) => n + (buckets[b] || 0), 0);
  const bucketOpts = [
    { value: "all", label: `${T.aiBall} ${bucketAll}` },
    // A tab that has run to zero under the other filters stays visible while it
    // is the one selected — dropping it would leave the strip with nothing
    // selected over a rail that is very much narrowed.
    ...BUCKETS
      .filter((b) => buckets[b] || f.bucket === b)
      .map((b) => ({ value: b, label: `${T[`aiB_${b}`]} ${buckets[b] || 0}`, title: T[`aiBt_${b}`] })),
  ];

  // Options come from the server's facet pass, so a name only appears while it
  // still has flags behind it, and the count says how many. Busiest first —
  // ninety leaders sorted alphabetically bury the one worth opening.
  const facetN = (dim, v) => (facets[dim] || []).find((o) => o.v === v)?.n;
  // A task is named by its NUMBER here — «Vazifa 3» — exactly as the cards,
  // the toasts and the day report already call it, not by its wording. The
  // wording («Фиксация ежедневной загрузки ячеек…») truncates in the list to
  // a run of near-identical prefixes and differs per unit (a supervisor may
  // rename it); the number is the one handle every surface shares. The
  // wording is not lost: it is the tooltip, and the search box matches it.
  const taskName = (id) => `${T.task} ${id}`;
  const taskTitle = (id) => {
    const wording = (facets.task || []).find((o) => o.v === id)?.label;
    return wording ? `${taskName(id)} · ${wording}` : taskName(id);
  };

  /** `[«All …», …live options]` — with the CURRENT pick forced in even when the
   *  other filters have starved it to zero. A list that silently drops what is
   *  selected leaves the control showing no selection at all, which reads as
   *  "no filter" over a queue that is very much filtered. Numbered labels read
   *  in NUMBER order (1, 2, 3 …), so the busiest-first order the server ships
   *  the facet in is re-sorted here — the count beside each still says which
   *  ones carry the work. */
  const optList = (dim, allLabel, name, title = name) => {
    const live = (facets[dim] || [])
      .map((o) => ({ value: o.v, label: `${name(o.v)} · ${o.n}`, title: title(o.v) }))
      .sort((a, b) => Number(a.value) - Number(b.value));
    const pick = f[dim];            // the state keys ARE the dimension names
    const missing = pick != null && !live.some((o) => o.value === pick);
    return [
      { value: null, label: allLabel },
      ...(missing ? [{ value: pick, label: `${name(pick)} · 0`, title: title(pick) }] : []),
      ...live,
    ];
  };

  return (
    <>
      {/* ── the toolbar: ONE row, 38px baseline ─────────────────────────────
          Route → axes → actions, left to right, in the order the reviewer
          narrows. WHO and WHEN are no longer here at all — they are the page
          scope bar above the tab strip, shared with every other tab — so this
          row is down to what only this queue knows: which task, which flag.
          This was two stacked rows (buckets+dispatch, then scope), and with
          the tab strip and the progress bar above them the photo started four
          bands down — on a phone, below the fold. Chrome touched once a
          session must not out-rank the surface used hundreds of times, so the
          rows share the line and wrap only when space runs out. Buckets stay
          a control of their own, not a panel section:
          technical failures are a SEPARATE queue on purpose — an unreadable
          Drive link is the server's problem, and mixing it into a discipline
          queue is how a reviewer learns to distrust the queue. FilterPanel
          must stay a DIRECT child of this flex row — it measures the row's
          children to decide whether to unfold. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SegmentedToggle scrollable value={f.bucket || "all"} onChange={pickBucket} options={bucketOpts} />
        <FilterPanel
          sections={[
            {
              // FIRST, because it is the one that turns a register back into a
              // worklist: «Ko'rilmagan» is the queue this tab used to be, and
              // an admin coming here to work rather than to look reaches for it
              // before anything else.
              key: "state", icon: Gavel, label: T.aiState,
              active: f.state != null, display: f.state ? T[`aiSt_${f.state}`] : "",
              onClear: () => setF({ state: null }),
              render: ({ close } = {}) => (
                <PickFilter close={close} value={f.state}
                  opts={[
                    { value: null, label: T.aiStAll },
                    ...STATES.filter((k) => facetN("state", k) || f.state === k)
                      .map((k) => ({
                        value: k, title: T[`aiSt_${k}`],
                        label: `${T[`aiSt_${k}`]} · ${facetN("state", k) || 0}`,
                      })),
                  ]}
                  onChange={(v) => setF({ state: v })} />
              ),
            },
            {
              key: "task", icon: ClipboardCheck, label: T.task,
              active: f.task != null, display: f.task != null ? taskName(f.task) : "",
              onClear: () => setF({ task: null }),
              render: ({ close } = {}) => (
                <PickFilter searchable close={close} value={f.task}
                  opts={optList("task", T.aiFAllTasks, taskName, taskTitle)}
                  onChange={(v) => setF({ task: v })} />
              ),
            },
            {
              // Finer than the bucket tabs: «Sana 333» is two different jobs —
              // "no clock on the photo" is a two-second call, "clock outside
              // the window" needs the window read. Splitting them is worth a
              // section of its own.
              key: "flag", icon: Flag, label: T.aiFlag,
              active: !!f.flag, display: f.flag ? T[`aiF_${f.flag}`] : "",
              onClear: () => setF({ flag: null }),
              render: ({ close } = {}) => (
                <PickFilter close={close} value={f.flag}
                  opts={[
                    { value: null, label: T.aiFAllFlags },
                    ...FLAGS.filter((k) => facetN("flag", k) || f.flag === k)
                      .map((k) => ({
                        value: k, title: T[`aiF_${k}`],
                        label: `${T[`aiF_${k}`]} · ${facetN("flag", k) || 0}`,
                      })),
                  ]}
                  onChange={(v) => setF({ flag: v })} />
              ),
            },
          ]}
        />
        <div className="flex-1" />
        {actions}
        {undoable && (
          <Button size="lg" variant="secondary" tint icon={<Undo2 size={14} />} onClick={undo}>
            {T.aiUndo}
          </Button>
        )}
        {/* Key + model, reachable WITH a key configured. The setup card only
            ever rendered in the disabled state, so once a key existed there
            was no way to rotate it, clear it or see which one was in use —
            and swapping to a different billing account is exactly the errand
            an operator has when a spend cap stops the queue. */}
        <Button size="lg" variant="ghost" icon={<Settings2 size={15} />}
          title={T.aiSettings} onClick={() => setCfgOpen(true)} />
        {/* Shortcut chrome only exists where a keyboard does — on a phone this
            button answered a question nobody there can act on. */}
        <Button size="lg" variant="ghost" icon={<Keyboard size={15} />}
          className="hidden lg:inline-flex" title={T.aiKeys}
          onClick={() => setKeysOpen((o) => !o)} />
      </div>

      {/* Past the scan cap the counts stop being totals and become floors.
          Said out loud, because a number nobody flagged as partial is a number
          people plan against. */}
      {data?.scanCapped && (
        <p className="text-[11px] mb-3" style={{ color: "#eab308" }}>{T.aiScanCap}</p>
      )}

      {keysOpen && <KeyLegend T={T} />}

      {cfgOpen && (
        <Modal open onClose={() => setCfgOpen(false)} title={T.aiSettings}
          icon={Sparkles} maxWidth="max-w-lg">
          <KeySetup T={T} qc={qc} embedded />
        </Modal>
      )}

      {!cur ? (
        /* THREE different emptinesses, and reading one as another is the trap.
           An emptied worklist is the goal and reads as praise — but only under
           «Ko'rilmagan», which is the only filter that makes "nothing left"
           mean "nothing left to decide". Without it an empty rail means the
           period holds no judged proof at all, which is a fact about the data,
           not an achievement. And "nothing matched" is neither: a dead end that
           has to hand back the control that caused it. */
        f.state === "open" ? (
          <EmptyState icon={Inbox} title={T.aiDoneTitle} message={T.aiDoneBody}
            showUploadLink={false} height="h-64"
            action={
              <Button size="lg" variant="secondary" tint onClick={() => setF({ state: null })}>
                {T.aiShowAll}
              </Button>
            } />
        ) : anyFlt ? (
          <EmptyState icon={SearchX} title={T.aiNoMatchTitle} message={T.aiNoMatchBody}
            showUploadLink={false} height="h-64"
            action={
              <Button size="lg" variant="secondary" tint
                onClick={() => { setF(EMPTY_FLT); onClearScope?.(); }}>
                {T.aiClearFlt}
              </Button>
            } />
        ) : (
          <EmptyState icon={Inbox} title={T.aiNoRowsTitle} message={T.aiNoRowsBody}
            showUploadLink={false} height="h-64" />
        )
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_340px] gap-3 items-start"
          style={{ scrollMarginTop: "calc(var(--tg-safe-top, 0px) + 8px)" }}>
          {/* ── the inbox ─────────────────────────────────────────────────── */}
          <Card className="order-3 lg:order-1">
            {/* «150 / 1 204» while the rest is still one button away. A rail
                that holds fewer rows than the tab above it claims has to say
                so — otherwise the ones it has not fetched read as resolved. */}
            <SectionHead icon={Inbox} title={T.aiQueue}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {total > items.length ? `${items.length} / ${total}` : items.length}
              </span>} />
            <div className="overflow-y-auto" style={{ maxHeight: "min(62vh, 560px)" }}>
              {/* Grouped by leader run. Forty flags from one person used to
                  print the same name forty times, three lines per row — a rail
                  that is 80% the same word reads as noise, not as a queue. The
                  name is now a sticky group header (scrolling a long run you
                  always know whose flags these are) and each row keeps only
                  what varies: date, task, photo count, flags — one line. */}
              {items.map((it, k) => (
                <div key={it.ref}>
                  {(k === 0 || items[k - 1].leader !== it.leader) && (
                    <div className="sticky top-0 z-[1] px-3 py-1.5 text-xs font-semibold truncate"
                      style={{ background: "var(--bg-card)", color: "var(--text-1)",
                               borderBottom: "1px solid var(--border)" }}>
                      {nm(it.leader)}
                    </div>
                  )}
                  <button onClick={() => { setI(k); setPhotoIx(0); }}
                    ref={k === ix ? activeRowRef : undefined}
                    aria-current={k === ix}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      borderLeft: `3px solid ${k === ix ? "var(--brand)" : "transparent"}`,
                      background: k === ix ? "var(--brand-bg)" : "transparent",
                      // Decided rows recede. With the whole judged set in one
                      // rail the only thing worth finding at a glance is what
                      // still has no ruling, and dimming does that without
                      // hiding anything or costing a column.
                      opacity: it.resolution && k !== ix ? 0.5 : 1,
                    }}>
                    <span className="text-[11px] tabular-nums truncate flex-1"
                      style={{ color: k === ix ? "var(--text-2)" : "var(--text-4)" }}>
                      {ddmm(it.date)} · {T.task} {it.taskId} ·{" "}
                      {srcLost(it) ? (
                        <span style={{ color: C_AI }}>{T.aiSrcLostShort}</span>
                      ) : (
                        `${it.photos.length} ${T.aiPhotoN}`
                      )}
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {/* What the AI said… */}
                      {it.flags.length
                        ? it.flags.map((fl) => <FlagDot key={fl} flag={fl} />)
                        : <FlagDot flag="clean" title={T.aiB_clean} />}
                      {/* …and, when there is one, what a person said after it.
                          Both, never one instead of the other: a rejected fake
                          that stops showing its flags loses the reason it was
                          rejected. */}
                      {it.resolution && <ResIcon res={it.resolution} T={T} />}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            {/* One list, one cursor: this asks for more of the SAME rail rather
                than turning a page, so J keeps walking straight through the
                join. */}
            {data?.hasMore && (
              <div className="p-2" style={{ borderTop: "1px solid var(--border)" }}>
                <Button size="sm" variant="secondary" tint className="w-full"
                  icon={<ChevronDown size={14} />} loading={isFetching}
                  onClick={() => setPages((p) => p + 1)}>
                  {T.aiMore}
                </Button>
              </div>
            )}
          </Card>

          {/* ── the photo: the decision gets the pixels ───────────────────── */}
          <Card className="order-1 lg:order-2">
            <SectionHead icon={Sparkles} title={taskDetail(cur.taskId, lang).n || cur.taskLabel}
              subtitle={`${nm(cur.leader)} · ${cur.supervisor} · ${ddmm(cur.date)}${cur.shift ? ` · ${cur.shift}-${T.shiftAbbr}` : ""}`}
              right={
                /* The cursor, ON the card it moves. On a phone this is the only
                   way to walk the queue at all — the rail sits below the fold —
                   and on desktop it is the mouse twin of J/K. The bare counter
                   this replaces sat in the toolbar, a full pane away from the
                   card it counted. */
                <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                  <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} />}
                    title={T.aiPrev} onClick={() => move(-1)} />
                  <span className="text-[11px] tabular-nums px-1" style={{ color: "var(--text-4)" }}>
                    {ix + 1} / {items.length}
                  </span>
                  <Button size="sm" variant="ghost" icon={<ChevronRight size={15} />}
                    title={T.aiNext} onClick={() => move(1)} />
                </span>
              } />
            <div className="p-3 flex flex-col items-center gap-3">
              {cur.photos.length === 0 ? (
                /* Two different failures wore the same sentence. «No photo
                   found» is the truth only when there was never one to find;
                   for a verdict written FROM photos it is a lie that reads as
                   the leader's fault, so the source-lost case says what
                   happened and how many images the verdict actually rests on. */
                srcLost(cur) ? (
                  <div className="py-9 px-4 flex flex-col items-center gap-2 text-center">
                    <ImageOff size={22} style={{ color: C_AI }} />
                    <p className="text-sm" style={{ color: "var(--text-2)" }}>{T.aiSrcLost}</p>
                    <p className="text-[11px] max-w-xs" style={{ color: "var(--text-4)" }}>
                      {(T.aiSrcLostHint || "").replace("{n}", cur.photosJudged)}
                    </p>
                  </div>
                ) : (
                  <p className="py-10 text-sm" style={{ color: "var(--text-4)" }}>{T.aiNoPhoto}</p>
                )
              ) : (
                /* `pIx`, not `photoIx`: moving from a 3-photo card to a 1-photo
                   one leaves the raw index out of range, and an undefined photo
                   takes the whole pane down. */
                <QueuePhoto key={zoomKey} photo={cur.photos[pIx]} T={T}
                  className="" fit="contain" maxHeight={420}
                  onReady={(u) => { zoomUrls.current[zoomKey] = u; }}
                  onClick={(u) => setZoom(u)} />
              )}
              {cur.photos.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {/* Stepped off the CLAMPED index, so the counter can never
                      read "3 / 1" on a card that carries one photo. */}
                  <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />}
                    onClick={() => setPhotoIx((pIx - 1 + cur.photos.length) % cur.photos.length)} />
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                    {pIx + 1} / {cur.photos.length}
                  </span>
                  <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />}
                    onClick={() => setPhotoIx((pIx + 1) % cur.photos.length)} />
                </div>
              )}
            </div>
          </Card>

          {/* ── verdict + decision ────────────────────────────────────────── */}
          <Card className="order-2 lg:order-3">
            <Verdict item={cur} T={T} lang={lang} />
            <Decide T={T} item={cur} onAct={dispatch} busy={resolveMut.isPending}
              onUndo={undoable ? undo : null} />
          </Card>
        </div>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={T.aiZoom}
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 cursor-zoom-out"
          style={{ background: "rgba(0,0,0,0.85)" }}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" />
          {/* position via style: Button's own `relative` class outranks a passed
              `absolute` in the stylesheet, dropping the X into the flex flow */}
          <Button size="sm" variant="secondary"
            style={{ position: "absolute", right: "1rem",
              top: "calc(var(--tg-safe-top, 0px) + 1rem)" }}
            icon={<X size={15} />} onClick={() => setZoom(null)} />
        </div>
      )}

      {toastNode}
    </>
  );
}

/* ══ setup ════════════════════════════════════════════════════════════════════
 * With no API key the whole feature is inert, and until now the only ways to
 * supply one were an SSH session on the VPS or repo-admin rights on the CI. An
 * operator with neither could not switch on a feature built for them — so it
 * shipped and sat dark. This is the third way: the person who runs the plant
 * pastes their own key here.
 *
 * The value is sent once and never comes back. The server seals it (keyed off
 * SECRET_KEY, which lives in .env and never in the database, so a dbdump is
 * ciphertext) and afterwards will only ever say "configured", plus a
 * first4…last4 preview — enough to spot a bad paste, useless to a shoulder. */
function KeySetup({ T, qc, embedded = false }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const { show: toast, node } = useToast({ position: "bottom" });

  const { data: st } = useQuery({
    queryKey: ["leader-ai-key"],
    queryFn: () => api.get("/api/leader-ai/key").then((r) => r.data),
  });

  // The model is the other half of "what will this cost and how well will it
  // judge", and which half binds flips with the billing account — free tier or
  // a spent cap makes requests-per-day the constraint, and the cheap model
  // suddenly beats the accurate one. It lived in config.py behind a push,
  // which meant it needed repo access at the exact moment the quota ran out.
  const setModel = useMutation({
    mutationFn: (m) => api.post("/api/leader-ai/model", { model: m }).then((r) => r.data),
    onSuccess: () => {
      toast(T.aiModelSaved, "success");
      qc.invalidateQueries({ queryKey: ["leader-ai-key"] });
    },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const modelOpts = (st?.models || []).map((m) => ({
    value: m,
    label: m.includes("lite") ? T.aiModelLite : T.aiModelFlash,
    title: m,
  }));

  const save = useMutation({
    // The value is an ARGUMENT, not read from state: «Clear» sets the field
    // empty and submits in the same tick, and state would still hold the old
    // text at that point — so clearing would have re-saved what was typed.
    mutationFn: (value) => api.post("/api/leader-ai/key", { key: value }).then((r) => r.data),
    onSuccess: (_res, value) => {
      setKey("");
      toast(value ? T.aiKeySaved : T.aiKeyCleared, "success");
      // The tab badge, the queue and the register strip all read `enabled`.
      qc.invalidateQueries({ queryKey: ["leader-ai-key"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-queue"] });
    },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  // A key pinned in backend/.env wins server-side. Saying so beats letting
  // somebody type a value that silently never takes effect.
  const locked = st?.source === "env";

  const body = (
    <div className={embedded ? "flex flex-col gap-3" : "p-4 flex flex-col gap-3"}>
          {!embedded && (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              {T.aiOffBody}
            </p>
          )}

          {locked ? (
            <p className="text-xs rounded-lg p-2.5"
              style={{ color: "var(--text-3)", background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              {T.aiKeyEnvPinned}
            </p>
          ) : (
            <>
              <label className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: "var(--text-4)" }} htmlFor="gkey">
                {T.aiKeyLabel}
              </label>
              <div className="flex gap-2">
                <input id="gkey" type={show ? "text" : "password"} value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off" spellCheck={false} placeholder="AIza…"
                  className="flex-1 min-w-0 px-3 rounded-lg text-sm font-mono"
                  style={{ height: 38, background: "var(--bg-inner)",
                           border: "1px solid var(--border)", color: "var(--text-1)" }} />
                <Button size="lg" variant="secondary" onClick={() => setShow((s) => !s)}
                  title={show ? T.aiKeyHide : T.aiKeyShow}>
                  {show ? T.aiKeyHide : T.aiKeyShow}
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="lg" variant="primary" loading={save.isPending}
                  disabled={!key.trim()} onClick={() => save.mutate(key.trim())}>
                  {T.aiKeySave}
                </Button>
                {st?.configured && (
                  <>
                    <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-4)" }}>
                      {st.preview}
                    </span>
                    <Button size="lg" variant="ghost" onClick={() => save.mutate("")}>
                      {T.aiKeyClear}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>
                {T.aiKeyHint}
              </p>
            </>
          )}

          {/* The model. Shown even when the key is env-pinned — the two are
              stored separately and a locked key is no reason to lock the
              choice that decides how far the day's quota goes. */}
          {!!modelOpts.length && (
            <div className="flex flex-col gap-1.5 pt-1"
              style={{ borderTop: "1px solid var(--border)" }}>
              <label className="text-[11px] font-bold uppercase tracking-wide pt-2"
                style={{ color: "var(--text-4)" }}>
                {T.aiModelLabel}
              </label>
              <StyledSelect value={st?.model} options={modelOpts}
                disabled={setModel.isPending}
                onChange={(v) => v && v !== st?.model && setModel.mutate(v)} />
              {/* The hint carries the consequence, at --text-3 rather than
                  --text-4: this is the line that says which model to pick and
                  why, and at the fainter weight the eye skips exactly it. */}
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                {T.aiModelHint}
              </p>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>
                {st?.model}{st?.modelSource === "config" ? ` · ${T.aiModelCfg}` : ""}
              </p>
            </div>
          )}
    </div>
  );

  return (
    <>
      {embedded ? body : (
        <div className="rounded-2xl overflow-hidden max-w-xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Sparkles} title={T.aiOffTitle} />
          {body}
        </div>
      )}
      {node}
    </>
  );
}

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl overflow-hidden ${className}`}
    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
    {children}
  </div>
);

// Colour alone never carries the meaning — every dot has a title, and the panel
// beside it spells the same flags out in words. `clean` is a dot too rather than
// an absence: a row with nothing on its right edge reads as a row still
// loading, and "the AI looked and found nothing" is a real answer that has to
// look like one.
const FLAG_TONE = {
  off_topic: C_BAD, not_proven: C_BAD, date_mismatch: C_AI, no_date: C_AI,
  unreadable: C_FLAT, clean: C_GOOD,
};
const FlagDot = ({ flag, title }) => (
  <i className="inline-block w-1.5 h-1.5 rounded-full" title={title}
    style={{ background: FLAG_TONE[flag] || C_FLAT }} />
);

/** The human ruling, at rail size. Icon + colour, no text: the row is one line
 *  and the words for these live in the panel beside it. */
const ResIcon = ({ res, T }) => {
  const { tone, Icon } = ACTS[res] || {};
  return Icon ? <Icon size={12} color={tone} title={T[`aiSt_${res}`]} /> : null;
};

/** The questions as a checklist, prose second. People triage on glyphs. */
function Verdict({ item, T, lang }) {
  const f = new Set(item.flags);
  const bTone = item.bucket === "clean" ? C_GOOD : C_AI;
  const reason = item.reason?.[lang] || item.reason?.ru || item.reason?.en || "";
  // The date sentence comes from the BACKEND, not the model — the model is only
  // a transcriber now and never learns what the window is. Rendered as its own
  // line so it re-reads correctly after a window edit, which model prose could
  // not: that text was written once and froze.
  const dateWhy = item.dateReason?.[lang] || item.dateReason?.ru || item.dateReason?.en || "";
  const rows = [
    { ok: !f.has("no_date") && !f.has("unreadable"), label: T.aiQ_read, val: item.imageDate || "—" },
    { ok: !f.has("date_mismatch") && !f.has("no_date"), label: T.aiQ_window, val: shortWin(item.expected) },
    // Subject before completeness: a reviewer who sees "wrong subject" ticked
    // red stops reading, and asking "does it prove the work" about a photo of
    // something else is a question with no meaning.
    { ok: !f.has("off_topic"), label: T.aiQ_match, val: "" },
    { ok: !f.has("not_proven"), label: T.aiQ_done, val: "" },
  ];
  return (
    <>
      <div className="px-3 py-2.5 flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-inner)" }}>
        <Sparkles size={14} color={C_AI} />
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          {T.aiTitle}
        </span>
        {/* A clean verdict is not a warning, so it does not wear the warning
            colour — the badge carries the bucket's own tone. */}
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: hexA(bTone, 0.15), color: bTone }}>
          {T[`aiB_${item.bucket}`]}
        </span>
      </div>

      {/* Already decided? Say so ABOVE the verdict, not below it. The reader
          arrives to judge a photo, and "somebody already ruled on this" changes
          what they are doing — printing it after the four questions means they
          have formed the opinion before learning it was not needed. */}
      {item.resolution && (
        <div className="px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ borderBottom: "1px solid var(--border)",
                   background: hexA(ACTS[item.resolution]?.tone || C_FLAT, 0.1) }}>
          <ResIcon res={item.resolution} T={T} />
          <span className="text-xs font-semibold"
            style={{ color: ACTS[item.resolution]?.tone || C_FLAT }}>
            {T[`aiSt_${item.resolution}`]}
          </span>
          <span className="ml-auto text-[10px] truncate" style={{ color: "var(--text-4)" }}>
            {[item.resolvedBy, item.resolvedAt && ddmm(item.resolvedAt.slice(0, 10))]
              .filter(Boolean).join(" · ")}
          </span>
          {item.resolutionNote && (
            <p className="w-full text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              {item.resolutionNote}
            </p>
          )}
        </div>
      )}

      <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start gap-2 text-[13px]">
              {r.ok ? <CheckCircle2 size={16} color={C_GOOD} className="flex-shrink-0 mt-px" />
                : <XCircle size={16} color={C_BAD} className="flex-shrink-0 mt-px" />}
              <span style={{ color: "var(--text-2)" }}>
                <b className="font-semibold" style={{ color: "var(--text-1)" }}>{r.label}</b>
                {r.val && <span className="tabular-nums" style={{ color: "var(--text-3)" }}> · {r.val}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(reason || dateWhy) && (
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Lbl>{T.aiWhy}</Lbl>
          {dateWhy && (
            <p className="text-[13px] leading-relaxed mb-1.5"
              style={{ color: f.has("date_mismatch") || f.has("no_date") ? "var(--text-1)" : "var(--text-2)" }}>
              {dateWhy}
            </p>
          )}
          {reason && <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>{reason}</p>}
        </div>
      )}

      {/* The leader's own answer, next to the machine's — a task can be honestly
          done and badly photographed, and only both sides together say which. */}
      {(item.leaderReason || item.leaderDone != null) && (
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Lbl>{T.aiLeaderSaid}</Lbl>
          <p className="text-xs leading-relaxed pl-2.5"
            style={{ color: "var(--text-3)", borderLeft: "2px solid var(--border)" }}>
            {item.leaderReason?.trim() || (item.leaderDone ? T.noIssues : T.noReason)}
          </p>
        </div>
      )}

      {/* The yardstick. Asking a reviewer to agree with a judgment while hiding
          its criterion is why the old card could only be taken on faith. */}
      <details className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <summary className="text-xs cursor-pointer select-none" style={{ color: "var(--text-3)" }}>
          {T.aiCriteria}
        </summary>
        <p className="text-xs leading-relaxed mt-2 rounded-lg p-2.5"
          style={{ color: "var(--text-3)", background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
          {item.criteria?.trim() || T.aiNoCriteria}
        </p>
      </details>
    </>
  );
}

const Lbl = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-4)" }}>
    {children}
  </div>
);

/** The dispatch bar — on a phone this IS the keyboard: 44px targets, and the
 *  one place undo can reach a thumb. The toolbar's undo button is a full page
 *  of scroll away once the card has been brought into view, and an undo nobody
 *  can reach makes every one-tap decision feel unsafe. Desktop keeps the
 *  toolbar button and the Z key, so this copy hides at lg.
 *
 *  Every button stays live on a row that already carries a ruling, and on a
 *  CLEAN row that the AI never flagged. A decision here is a judgement call,
 *  and a judgement call you cannot revise is not one — the standing ruling is
 *  shown filled instead, so re-deciding is a visible correction rather than a
 *  blind second press. «Qaytarib ochish» is the way back to no ruling at all,
 *  which is a different fact from "somebody approved it" and the one the
 *  calibration stats read. */
function Decide({ T, item, onAct, onUndo, busy }) {
  const cur = item?.resolution || null;
  return (
    <div className="p-3 flex flex-col gap-2" style={{ background: "var(--bg-inner)" }}>
      {onUndo && (
        <Button size="sm" variant="secondary" tint icon={<Undo2 size={14} />}
          className="lg:hidden self-end" onClick={onUndo}>
          {T.aiUndo}
        </Button>
      )}
      {["approved", "rejected", "requeried"].map((a) => {
        const { tone, Icon, key } = ACTS[a];
        const on = cur === a;
        return (
          <button key={a} onClick={() => onAct(a)} disabled={busy}
            aria-pressed={on}
            className="w-full flex items-center gap-2.5 px-3 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50"
            style={{
              minHeight: 44, color: tone,
              background: hexA(tone, on ? 0.24 : 0.11),
              border: `1px solid ${hexA(tone, on ? 0.75 : 0.34)}`,
            }}>
            <Icon size={17} className="flex-shrink-0" />
            {T[`aiAct_${a}`]}
            <kbd className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded hidden lg:inline-block"
              style={{ background: hexA(tone, 0.16), border: `1px solid ${hexA(tone, 0.3)}` }}>
              {key}
            </kbd>
          </button>
        );
      })}
      {cur && (
        <Button size="sm" variant="secondary" tint icon={<RotateCcw size={14} />}
          disabled={busy} onClick={() => onAct("open")}>
          {T.aiReopen}
        </Button>
      )}
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-4)" }}>{T.aiActHint}</p>
    </div>
  );
}

function KeyLegend({ T }) {
  const keys = [
    ["J / K", T.aiKeyMove], ["A", T.aiAct_approved], ["D", T.aiAct_rejected],
    ["R", T.aiAct_requeried], ["S", T.aiKeySkip], ["Space", T.aiKeyZoom], ["Z", T.aiUndo],
  ];
  return (
    <div className="rounded-xl px-3 py-2.5 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {keys.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            {k}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

/** Agreement rate — for a pilot, the number that actually decides its future.
 *
 *  Prints its own noun. This used to render «100% · 3», with what the percent
 *  was OF and what the 3 counted available only in a hover title, on a page
 *  read inside Telegram on a phone. The sample size stays visible beside the
 *  rate on purpose: 100% of three rulings is not a measurement, and a reader
 *  who cannot see the denominator has no way to know that. */
export function AiCalibration({ cal, T }) {
  if (!cal || !cal.resolved) return null;
  const tone = cal.rate >= 70 ? C_GOOD : cal.rate >= 40 ? C_AI : C_BAD;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" title={T.aiCalTip}>
      <Gauge size={13} style={{ color: tone }} className="flex-shrink-0" />
      <span style={{ color: "var(--text-3)" }}>{T.aiCalLabel}</span>
      <b className="font-bold tabular-nums" style={{ color: tone }}>{cal.rate}%</b>
      <span className="tabular-nums" style={{ color: "var(--text-4)" }}>
        {T.aiCalOf.replace("{n}", cal.resolved)}
      </span>
    </span>
  );
}
