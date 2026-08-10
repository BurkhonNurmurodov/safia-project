import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, CheckCircle2, XCircle, MessageSquare, ArrowRight, Inbox,
  ChevronLeft, ChevronRight, Loader2, Undo2, Keyboard, X, Gauge,
} from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import Toast, { useToast } from "../ui/Toast";
import { QueuePhoto } from "./ProofPhoto";
import api from "../../utils/api";

/* ══ AI proof triage ══════════════════════════════════════════════════════════
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

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
// The queue is a work surface, not a register: a window is only useful here as
// "did the clock fall inside it", so the redundant year is dropped and the two
// halves are shown as the times they are.
const shortWin = (w) => (w || "").replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => `${d}.${m}`);

export default function AiTriage({ T, lang, taskDetail, nm }) {
  const qc = useQueryClient();
  const { toast, show: showToast, hide: hideToast } = useToast();

  const [bucket, setBucket] = useState("all");
  const [i, setI] = useState(0);
  const [photoIx, setPhotoIx] = useState(0);
  const [zoom, setZoom] = useState(null);       // object URL of the enlarged photo
  const [keysOpen, setKeysOpen] = useState(false);
  // The last dispatch, kept until the next one so Z can put it back. Only one
  // deep on purpose: an undo stack nobody can see is a worse promise than a
  // single step everybody understands.
  const [undoable, setUndoable] = useState(null);
  const zoomUrls = useRef({});

  const { data, isLoading } = useQuery({
    queryKey: ["leader-ai-queue"],
    queryFn: () => api.get("/api/leader-ai/queue").then((r) => r.data),
    refetchOnWindowFocus: true,
  });

  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(
    () => (bucket === "all" ? all : all.filter((x) => x.bucket === bucket)),
    [all, bucket],
  );
  // The index can outrun the list when a decision removes the last item, or
  // when switching buckets. Clamped here rather than in every handler.
  const ix = Math.min(i, Math.max(0, items.length - 1));
  const cur = items[ix] || null;

  useEffect(() => { setI(0); setPhotoIx(0); }, [bucket]);
  useEffect(() => { setPhotoIx(0); zoomUrls.current = {}; }, [cur?.ref]);

  const move = useCallback((d) => {
    setI((p) => {
      const n = items.length;
      if (!n) return 0;
      return (Math.min(p, n - 1) + d + n) % n;
    });
    setPhotoIx(0);
  }, [items.length]);

  const resolveMut = useMutation({
    mutationFn: ({ ref, resolution }) =>
      api.post("/api/leader-ai/resolve", { ref, resolution }).then((r) => r.data),
    // Optimistic: the whole point is a 5-second loop, and waiting ~400ms for a
    // round-trip before the next card appears is what turns a rhythm back into
    // a series of clicks. A failure puts the item back and says so.
    onMutate: async ({ ref }) => {
      await qc.cancelQueries({ queryKey: ["leader-ai-queue"] });
      const prev = qc.getQueryData(["leader-ai-queue"]);
      qc.setQueryData(["leader-ai-queue"], (old) => old && ({
        ...old,
        items: old.items.filter((x) => x.ref !== ref),
      }));
      return { prev };
    },
    onError: (e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leader-ai-queue"], ctx.prev);
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
    setUndoable({ item: cur, resolution });
    showToast(
      `${T[`aiAct_${resolution}`]} — ${nm(cur.leader)}, ${T.task} ${cur.taskId}`,
      resolution === "rejected" ? "warning" : "success",
    );
    resolveMut.mutate({ ref: cur.ref, resolution });
  }, [cur, resolveMut, showToast, T, nm]);

  const undo = useCallback(() => {
    if (!undoable) return;
    const { item } = undoable;
    // Re-decide back to open. The server treats a re-rule as a normal action,
    // so undo is the same call with a different value — nothing special-cased.
    api.post("/api/leader-ai/resolve", { ref: item.ref, resolution: "approved" })
      .catch(() => {});
    qc.setQueryData(["leader-ai-queue"], (old) => old && ({
      ...old,
      items: [item, ...old.items.filter((x) => x.ref !== item.ref)],
    }));
    qc.invalidateQueries({ queryKey: ["leader-ai-queue"] });
    setUndoable(null);
    setI(0);
    hideToast();
  }, [undoable, qc, hideToast]);

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
        setZoom((z) => (z ? null : zoomUrls.current[photoIx] || null));
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
  }, [move, dispatch, undo, photoIx]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_340px] gap-3">
        <SkeletonBlock className="h-[420px] rounded-2xl" />
        <SkeletonBlock className="h-[420px] rounded-2xl" />
        <SkeletonBlock className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (data && !data.enabled) {
    return <EmptyState icon={Sparkles} title={T.aiOffTitle} description={T.aiOffBody} />;
  }

  const buckets = data?.buckets || {};
  const bucketOpts = [
    { value: "all", label: `${T.aiBall} ${all.length}` },
    ...["forged", "undone", "date", "tech"]
      .filter((b) => buckets[b])
      .map((b) => ({ value: b, label: `${T[`aiB_${b}`]} ${buckets[b]}`, title: T[`aiBt_${b}`] })),
  ];

  return (
    <>
      {/* Bucket router. Technical failures are a SEPARATE queue on purpose —
          an unreadable Drive link is the server's problem, and mixing it into a
          discipline queue is how a reviewer learns to distrust the queue. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SegmentedToggle scrollable value={bucket} onChange={setBucket} options={bucketOpts} />
        <div className="flex-1" />
        {undoable && (
          <Button size="lg" variant="secondary" tint icon={<Undo2 size={14} />} onClick={undo}>
            {T.aiUndo}
          </Button>
        )}
        <span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
          {items.length ? `${ix + 1} / ${items.length}` : "0 / 0"}
        </span>
        <Button size="lg" variant="ghost" icon={<Keyboard size={15} />}
          title={T.aiKeys} onClick={() => setKeysOpen((o) => !o)} />
      </div>

      {keysOpen && <KeyLegend T={T} />}

      {!cur ? (
        <EmptyState icon={Inbox} title={T.aiDoneTitle} description={T.aiDoneBody} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)_340px] gap-3 items-start">
          {/* ── the inbox ─────────────────────────────────────────────────── */}
          <Card className="order-3 lg:order-1">
            <SectionHead icon={Inbox} title={T.aiQueue}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {items.length}
              </span>} />
            <div className="overflow-y-auto" style={{ maxHeight: "min(62vh, 560px)" }}>
              {items.map((it, k) => (
                <button key={it.ref} onClick={() => { setI(k); setPhotoIx(0); }}
                  aria-current={k === ix}
                  className="w-full text-left px-3 py-2 flex flex-col gap-1 transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderLeft: `3px solid ${k === ix ? "var(--brand)" : "transparent"}`,
                    background: k === ix ? "var(--brand-bg)" : "transparent",
                  }}>
                  <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>
                    {nm(it.leader)}
                  </span>
                  <span className="text-[11px] tabular-nums truncate" style={{ color: "var(--text-4)" }}>
                    {ddmm(it.date)} · {T.task} {it.taskId} · {it.photos.length} {T.aiPhotoN}
                  </span>
                  <span className="flex gap-1 flex-wrap">
                    {it.flags.map((f) => <FlagDot key={f} flag={f} />)}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* ── the photo: the decision gets the pixels ───────────────────── */}
          <Card className="order-1 lg:order-2">
            <SectionHead icon={Sparkles} title={taskDetail(cur.taskId, lang).n || cur.taskLabel}
              subtitle={`${nm(cur.leader)} · ${cur.supervisor} · ${ddmm(cur.date)}${cur.shift ? ` · ${cur.shift}-${T.shiftAbbr}` : ""}`} />
            <div className="p-3 flex flex-col items-center gap-3">
              {cur.photos.length === 0 ? (
                <p className="py-10 text-sm" style={{ color: "var(--text-4)" }}>{T.aiNoPhoto}</p>
              ) : (
                <QueuePhoto key={`${cur.ref}-${photoIx}`} photo={cur.photos[photoIx]} T={T}
                  className="" fit="contain" maxHeight={420}
                  onReady={(u) => { zoomUrls.current[photoIx] = u; }}
                  onClick={(u) => setZoom(u)} />
              )}
              {cur.photos.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />}
                    onClick={() => setPhotoIx((p) => (p - 1 + cur.photos.length) % cur.photos.length)} />
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                    {photoIx + 1} / {cur.photos.length}
                  </span>
                  <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />}
                    onClick={() => setPhotoIx((p) => (p + 1) % cur.photos.length)} />
                </div>
              )}
            </div>
          </Card>

          {/* ── verdict + decision ────────────────────────────────────────── */}
          <Card className="order-2 lg:order-3">
            <Verdict item={cur} T={T} lang={lang} />
            <Decide T={T} onAct={dispatch} busy={resolveMut.isPending} />
          </Card>
        </div>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={T.aiZoom}
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 cursor-zoom-out"
          style={{ background: "rgba(0,0,0,0.85)" }}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" />
          <Button size="sm" variant="secondary" className="absolute top-4 right-4"
            icon={<X size={15} />} onClick={() => setZoom(null)} />
        </div>
      )}

      <Toast {...toast} onClose={hideToast} position="bottom" />
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
// beside it spells the same flags out in words.
const FLAG_TONE = { not_proven: C_BAD, date_mismatch: C_AI, no_date: C_AI, unreadable: C_FLAT };
const FlagDot = ({ flag }) => (
  <i className="inline-block w-1.5 h-1.5 rounded-full"
    style={{ background: FLAG_TONE[flag] || C_FLAT }} />
);

/** The three questions as a checklist, prose second. People triage on glyphs. */
function Verdict({ item, T, lang }) {
  const f = new Set(item.flags);
  const reason = item.reason?.[lang] || item.reason?.ru || item.reason?.en || "";
  const rows = [
    { ok: !f.has("no_date") && !f.has("unreadable"), label: T.aiQ_read, val: item.imageDate || "—" },
    { ok: !f.has("date_mismatch") && !f.has("no_date"), label: T.aiQ_window, val: shortWin(item.expected) },
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
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: hexA(C_AI, 0.15), color: C_AI }}>
          {T[`aiB_${item.bucket}`]}
        </span>
      </div>

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

      {reason && (
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Lbl>{T.aiWhy}</Lbl>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>{reason}</p>
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

/** The dispatch bar. On a phone it is the keyboard — fixed to the bottom, padded
 *  for Telegram's inset, targets at 44px. */
function Decide({ T, onAct, busy }) {
  return (
    <div className="p-3 flex flex-col gap-2" style={{ background: "var(--bg-inner)" }}>
      {["approved", "rejected", "requeried"].map((a) => {
        const { tone, Icon, key } = ACTS[a];
        return (
          <button key={a} onClick={() => onAct(a)} disabled={busy}
            className="w-full flex items-center gap-2.5 px-3 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50"
            style={{
              minHeight: 44, color: tone,
              background: hexA(tone, 0.11), border: `1px solid ${hexA(tone, 0.34)}`,
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
      <button onClick={() => onAct(null) || null} disabled
        className="hidden" aria-hidden="true" tabIndex={-1} />
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

/** Agreement rate — for a pilot, the number that actually decides its future. */
export function AiCalibration({ cal, T }) {
  if (!cal || !cal.resolved) return null;
  const tone = cal.rate >= 70 ? C_GOOD : cal.rate >= 40 ? C_AI : C_BAD;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums"
      title={T.aiCalTip} style={{ color: tone }}>
      <Gauge size={13} />
      {cal.rate}% · {cal.resolved}
    </span>
  );
}
