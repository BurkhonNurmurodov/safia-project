import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Users, History, Send, Paperclip, X, Image as ImageIcon, Video,
  FileText, CheckCircle, Loader2, Type, Sparkles, RotateCcw, CalendarClock,
  Clock, Ban, AlertTriangle, Trash2, Inbox, MessageSquare, UserCheck,
} from "lucide-react";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import DateRangePicker from "../../components/ui/DateRangePicker";
import SearchInput from "../../components/ui/SearchInput";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import RichTextEditor from "../../components/ui/RichTextEditor";
import CheckboxTree, { collectLeafKeys, filterGroups } from "../../components/ui/CheckboxTree";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { buildRecipientGroups } from "../../utils/broadcastTree";

/**
 * Broadcast — compose a Telegram DM to selected profiles, then watch it land.
 *
 * TWO VIEWS, because these are two jobs that never happen at the same moment:
 * «Yangi xabar» composes one, «Tarix» monitors many. They used to share one
 * scroll, so a send in flight was two cards below the composer nobody was using.
 *
 * The compose column runs Message → Recipients → Delivery with the action bar
 * LAST at every breakpoint. That order is the whole point: the previous layout
 * collapsed to Compose → Send → Recipients on a phone, putting a dead primary
 * button above the very control that enables it.
 *
 * A send does not end here — it navigates to /broadcast/:id, the record page,
 * so "send" hands off to "watch this send" instead of to a toast that vanishes.
 */

const ATTACH_ICONS = { photo: ImageIcon, video: Video, document: FileText };

// Attachment whitelist — MUST mirror BROADCAST_EXTS in backend/app/upload_guard.py.
// `accept` filters the OS picker; the Set re-checks (drag-drop / "all files")
// and the backend re-checks again on /api/broadcast/send.
const BROADCAST_ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.7z";
const BROADCAST_ALLOWED_EXT = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "svg",
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp",
  "mp3", "ogg", "oga", "wav", "m4a", "aac", "flac", "opus",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "csv", "rtf", "zip", "rar", "7z",
]);

// Draft autosave. OFFERED on return, never applied: the composer's own
// scheduling state is deliberately not persisted because a stale send time
// silently re-arming is the failure mode worth designing out — a silently
// restored MESSAGE is the same class of surprise. Media are File objects and
// cannot survive localStorage, so a draft that had them says so.
const DRAFT_KEY = "broadcast_draft_v1";
const DRAFT_TTL = 24 * 3600 * 1000;

const attachKind = (f) =>
  f.type.startsWith("image/") ? "photo" : f.type.startsWith("video/") ? "video" : "document";

const fmtSize = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const p2 = (n) => String(n).padStart(2, "0");

const fmtDT = (iso) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const isoDate = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d?.savedAt || Date.now() - d.savedAt > DRAFT_TTL) return null;
    if (!(d.text || "").trim() && !(d.selected || []).length) return null;
    return d;
  } catch {
    return null;
  }
};
const dropDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
};

const smoothly = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";

// ── shared bits ───────────────────────────────────────────────────────────────

// Section header summary: what this section currently amounts to, so the whole
// composer can be judged without scrolling into each part of it.
function Summary({ children, active = false, warn = false }) {
  return (
    <span
      className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full whitespace-nowrap"
      style={warn
        ? { background: "rgba(239,68,68,0.12)", color: "#ef4444" }
        : active
          ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
          : { background: "var(--bg-inner)", color: "var(--text-4)" }}
    >
      {children}
    </span>
  );
}

function Card({ icon, title, right, children, className = "", innerRef }) {
  return (
    <div
      ref={innerRef}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <SectionHead icon={icon} title={title} right={right} />
      {children}
    </div>
  );
}

// Delivery proportion. Rendered ONLY while sending (live progress) or when
// something failed — a full green bar on every finished row is decoration, and
// a table of full bars means nothing stands out when one genuinely should.
function DeliveryBar({ sent, failed, total }) {
  const pct = (n) => (total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0);
  return (
    <div
      className="flex h-1.5 w-full min-w-[56px] rounded-full overflow-hidden mt-1"
      style={{ background: "var(--bg-inner)" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={sent + failed}
    >
      <div style={{ width: `${pct(sent)}%`, background: "#22c55e", transition: "width 240ms ease" }} />
      <div style={{ width: `${pct(failed)}%`, background: "#ef4444", transition: "width 240ms ease" }} />
    </div>
  );
}

function StatusChip({ row, t }) {
  if (row.status === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "#eab308" }}>
        <CalendarClock size={12} />
        {row.scheduled_at ? fmtDT(row.scheduled_at) : t("admin.broadcast.statusScheduled")}
      </span>
    );
  }
  if (row.status === "canceled") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "var(--text-4)" }}>
        <Ban size={12} /> {t("admin.broadcast.statusCanceled")}
      </span>
    );
  }
  if (row.status === "sending") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "var(--brand-text)" }}>
        <Loader2 size={12} className="animate-spin" /> {t("admin.broadcast.statusSending")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "#22c55e" }}>
      <CheckCircle size={12} /> {t("admin.broadcast.statusDone")}
    </span>
  );
}

// Message cell / card line: mode badge, attachment marker, excerpt — one line
// instead of the separate «Fayl» column it replaces.
function MessageCell({ row, t }) {
  const A = row.attachment_kind ? ATTACH_ICONS[row.attachment_kind] : null;
  const media = !A && row.media_names?.length ? row.media_names.length : 0;
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {row.mode === "rich" && (
        <span
          className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
        >
          <Sparkles size={9} /> {t("admin.broadcast.modeRich")}
        </span>
      )}
      {row.mode === "copy" && (
        <span
          className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
        >
          <MessageSquare size={9} /> {t("admin.broadcast.modeCopy")}
        </span>
      )}
      {A && <A size={12} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
      {media > 0 && (
        <span className="flex-shrink-0 inline-flex items-center gap-0.5" style={{ color: "var(--brand-text)" }}>
          <Paperclip size={11} />
          {media > 1 && <span className="text-[10px] tabular-nums">{media}</span>}
        </span>
      )}
      <span className="truncate" title={row.text_plain}>
        {row.text_plain || <span style={{ color: "var(--text-4)" }}>—</span>}
      </span>
    </span>
  );
}

export default function Broadcast() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef(null);
  const recipRef = useRef(null);

  const [view, setView] = usePersistentState("broadcast_view", "compose");
  const [mode, setMode] = usePersistentState("broadcast_mode", "normal");
  const [msg, setMsg] = useState({ html: "", text: "", media: [] });
  const [seedHtml, setSeedHtml] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const [selected, setSelected] = useState([]);
  const [treeFilter, setTreeFilter] = usePersistentState("broadcast_search", "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendError, setSendError] = useState("");
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryError, setRetryError] = useState("");
  // Deferred send. The date+time are the admin's OWN wall clock — what they
  // read off their screen is the instant that gets sent, converted to UTC on
  // the way out. Not persisted: a leftover send time from last week silently
  // re-arming on a fresh compose is the one failure mode worth designing out.
  const [schedMode, setSchedMode] = useState("now");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("09:00");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState("");
  const [draftOffer, setDraftOffer] = useState(() => readDraft());
  const [pendingTargets, setPendingTargets] = useState(null);
  const [dupNote, setDupNote] = useState("");
  const [histFilter, setHistFilter] = usePersistentState("broadcast_hist_filter", "all");
  const [histQuery, setHistQuery] = useState("");
  const toast = useToast();

  const { data: recip, isLoading: listLoading, isError: listError, refetch: refetchList } = useQuery({
    queryKey: ["broadcast-recipients"],
    queryFn: () => api.get("/api/broadcast/recipients").then((r) => r.data),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["broadcast-history"],
    queryFn: () => api.get("/api/broadcast/history").then((r) => r.data),
    refetchInterval: (query) => {
      const rows = query.state.data || [];
      if (rows.some((r) => r.status === "sending")) return 2000;
      // A scheduled row past its time is mid-handover to the sender; poll
      // slowly so it doesn't sit at "scheduled" long after it actually fired.
      if (rows.some((r) => r.status === "scheduled" && r.scheduled_at &&
                           new Date(r.scheduled_at).getTime() <= Date.now())) return 10_000;
      return false;
    },
  });

  // Saved premium (custom) emoji palette for the composer.
  const { data: emojis } = useQuery({
    queryKey: ["broadcast-emojis"],
    queryFn: () => api.get("/api/broadcast/emojis").then((r) => r.data),
  });
  const addEmojiMut = useMutation({
    mutationFn: (body) => api.post("/api/broadcast/emojis", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcast-emojis"] }),
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });
  const delEmojiMut = useMutation({
    mutationFn: (id) => api.delete(`/api/broadcast/emojis/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcast-emojis"] }),
  });

  const groups = useMemo(
    () => buildRecipientGroups(recip?.tree, t, tl, t("admin.broadcast.notRegistered")),
    [recip, t, tl],
  );
  const allEnabledKeys = useMemo(() => collectLeafKeys(groups), [groups]);

  // Top-level rollup for the send confirm: "who am I about to DM" answered as
  // groups, not just a total. A person holding profiles in two groups is
  // counted under each, so these can sum past the deduped total — the confirm
  // says so rather than letting the reader add them up wrong.
  const groupBreakdown = useMemo(() => {
    const chosen = new Set(selected);
    return groups
      .map((g) => ({ label: g.label, n: collectLeafKeys([g]).filter((k) => chosen.has(k)).length }))
      .filter((g) => g.n > 0);
  }, [groups, selected]);

  // Select-all must mean "everyone I can currently see".
  const visibleKeys = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    if (!q) return allEnabledKeys;
    return collectLeafKeys(filterGroups(groups, q));
  }, [groups, allEnabledKeys, treeFilter]);

  const excerpt = useMemo(() => {
    const plain = (msg.text || "").trim().replace(/\s+/g, " ");
    return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain;
  }, [msg.text]);

  const rich = mode === "rich";
  const maxLen = rich ? 32768 : attachment ? 1024 : 4096;
  const len = msg.text.length;
  const over = len > maxLen;
  const hasMessage = !!msg.text.trim() || (rich && msg.media.length > 0);

  const later = schedMode === "later";
  // Local wall-clock → a real instant. Built with the Date constructor rather
  // than parsing a string so the browser's own zone does the conversion.
  const schedAt = useMemo(() => {
    if (!later || !schedDate || !/^\d{2}:\d{2}$/.test(schedTime)) return null;
    const [y, mo, d] = schedDate.split("-").map(Number);
    const [h, mi] = schedTime.split(":").map(Number);
    const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }, [later, schedDate, schedTime]);
  // The backend rejects a past time outright; catching it here means the
  // admin sees why the button is dead instead of getting a 422 after confirm.
  const schedPast = !!schedAt && schedAt.getTime() < Date.now() + 30_000;

  // ONE prioritized reason the primary action is dead. A disabled button that
  // explains nothing is the state a first-time operator gets stuck in, and this
  // page folds five independent conditions into that single button.
  const blocker = listError ? "admin.broadcast.whyListFailed"
    : !hasMessage ? "admin.broadcast.whyEmpty"
    : over ? "admin.broadcast.whyTooLong"
    : !selected.length ? "admin.broadcast.whyNoOne"
    : later && !schedAt ? "admin.broadcast.whyNoTime"
    : later && schedPast ? "admin.broadcast.schedPast"
    : null;
  const canSend = !blocker;

  // Switching admin destinations unmounts this component; without the guard a
  // composed message and a 300-person selection vanish with one mistap.
  useAdminDirty(hasMessage || selected.length > 0);

  // Autosave (debounced). Text + selection + mode only — never the schedule.
  useEffect(() => {
    if (!hasMessage && !selected.length) return undefined;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          html: msg.html, text: msg.text, mode, selected,
          hadMedia: msg.media.length > 0 || !!attachment,
          savedAt: Date.now(),
        }));
      } catch { /* private mode / quota — the draft is a convenience */ }
    }, 800);
    return () => clearTimeout(id);
  }, [msg.html, msg.text, msg.media.length, mode, selected, attachment, hasMessage]);

  // Duplicate: /broadcast/:id sends the old message and its targets here.
  useEffect(() => {
    const dup = location.state?.duplicate;
    if (!dup) return;
    setMode(dup.mode === "rich" ? "rich" : "normal");
    setSeedHtml(dup.html || "");
    setEditorKey((k) => k + 1);
    setPendingTargets((dup.targets || []).map(String));
    setDraftOffer(null);
    setView("compose");
    if (dup.hadMedia) setDupNote(t("admin.broadcast.dupMedia"));
    // Consume it, so a refresh or a back-navigation doesn't re-seed the form.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Targets can only be intersected once the tree has loaded. A recipient who
  // left is REPORTED, never silently dropped from a duplicated send.
  useEffect(() => {
    if (!pendingTargets || !allEnabledKeys.length) return;
    const known = new Set(allEnabledKeys.map(String));
    const keep = pendingTargets.filter((k) => known.has(k));
    setSelected(keep);
    const lost = pendingTargets.length - keep.length;
    if (lost > 0) toast.warning(t("admin.broadcast.dupMissing").replace("{n}", String(lost)));
    setPendingTargets(null);
  }, [pendingTargets, allEnabledKeys, toast, t]);

  const resetComposer = () => {
    setMsg({ html: "", text: "", media: [] });
    setSeedHtml("");
    setEditorKey((k) => k + 1);
    setAttachment(null);
    setSelected([]);
    setSchedMode("now");
    setSchedDate("");
    setDupNote("");
    dropDraft();
  };

  const buildForm = (withTargets) => {
    const form = new FormData();
    form.append("text", msg.html);
    form.append("mode", mode);
    if (withTargets) form.append("targets", JSON.stringify(selected.map(Number)));
    if (rich) {
      form.append("media_meta", JSON.stringify(msg.media.map(({ id, kind }) => ({ id, kind }))));
      msg.media.forEach((m) => form.append("media_files", m.file, m.name));
    } else if (attachment) {
      form.append("file", attachment);
    }
    return form;
  };

  const sendMut = useMutation({
    mutationFn: () => {
      const form = buildForm(true);
      // UTC, so the send time survives an admin on a different device clock.
      if (schedAt) form.append("scheduled_at", schedAt.toISOString());
      return api.post("/api/broadcast/send", form).then((r) => r.data);
    },
    onSuccess: (data) => {
      setConfirmOpen(false);
      resetComposer();
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
      // Send hands off to WATCH THIS SEND. For a scheduled one the armed record
      // with its own Cancel button is better proof than a toast promising
      // "Tuesday 09:00" and disappearing.
      if (data?.id) navigate(`/broadcast/${data.id}`);
      else setView("history");
    },
    // A failed mass-DM through window.alert was invisible on Telegram iOS: the
    // confirm closed, nothing else happened, and the admin could not tell
    // whether 100 people got the message or nobody did.
    onError: (e) => setSendError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  // Rehearsal. The only honest preview of a Telegram message is a Telegram
  // message — the composer bubble approximates entities and rich mode renders
  // per client — so this DMs the real thing to the composer alone.
  const testMut = useMutation({
    mutationFn: () => api.post("/api/broadcast/test", buildForm(false)).then((r) => r.data),
    onSuccess: (d) => {
      if (d?.degraded) toast.warning(t("admin.broadcast.testDegraded"));
      else toast.success(t("admin.broadcast.testSent"));
    },
    onError: (e) => toast.error(
      t("admin.broadcast.testFailed").replace("{err}", e?.response?.data?.detail || "")),
  });

  // Re-send to the recipients whose DM failed; the row flips back to
  // 'sending' and the history poll shows delivered climbing toward the total.
  const retryMut = useMutation({
    mutationFn: (id) => api.post(`/api/broadcast/${id}/retry`),
    onSuccess: () => {
      setRetryTarget(null);
      setRetryError("");
      toast.success(t("admin.broadcast.retryQueued"));
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => setRetryError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  // Call off a broadcast that has not fired. Loses cleanly against a send that
  // just started — the backend answers 409 and the error stays on the dialog.
  const cancelMut = useMutation({
    mutationFn: (id) => api.post(`/api/broadcast/${id}/cancel`),
    onSuccess: () => {
      setCancelTarget(null);
      setCancelError("");
      toast.success(t("admin.broadcast.cancelDone"));
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => setCancelError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!BROADCAST_ALLOWED_EXT.has(ext)) { toast.error(t("admin.broadcast.attachBadType")); return; }
    const limit = attachKind(f) === "photo" ? 10 * 1048576 : 50 * 1048576;
    if (f.size > limit) { toast.error(t("admin.broadcast.attachTooLarge")); return; }
    setAttachment(f);
  };

  const restoreDraft = () => {
    const d = draftOffer;
    if (!d) return;
    setMode(d.mode === "rich" ? "rich" : "normal");
    setSeedHtml(d.html || "");
    setEditorKey((k) => k + 1);
    setSelected(d.selected || []);
    if (d.hadMedia) setDupNote(t("admin.broadcast.draftMediaNote"));
    setDraftOffer(null);
  };

  // Schedule presets — "tomorrow morning" is the dominant real case, and two
  // chips kill most of the picker interaction. A preset already in the past
  // simply doesn't render.
  const presets = useMemo(() => {
    const now = new Date();
    const mk = (dayOffset, hh, mm, key) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm, 0, 0);
      return d.getTime() > now.getTime() + 60_000
        ? { key, label: t(key).replace("{time}", `${p2(hh)}:${p2(mm)}`), date: isoDate(d), time: `${p2(hh)}:${p2(mm)}` }
        : null;
    };
    return [mk(0, 17, 0, "admin.broadcast.presetToday"),
            mk(1, 9, 0, "admin.broadcast.presetTomorrow")].filter(Boolean);
  }, [t]);

  const liveCount = (history || []).filter(
    (r) => r.status === "sending" || r.status === "scheduled").length;

  const historyRows = useMemo(() => {
    let list = history || [];
    if (histFilter !== "all") list = list.filter((r) => r.status === histFilter);
    const q = histQuery.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.text_plain || "").toLowerCase().includes(q)
      || (r.sender_name || "").toLowerCase().includes(q));
    // Scheduled first: the only rows carrying a consequence that has not
    // happened yet. Sort is stable, so id-desc order holds inside each group.
    return [...list].sort((a, b) =>
      (a.status === "scheduled" ? 0 : 1) - (b.status === "scheduled" ? 0 : 1));
  }, [history, histFilter, histQuery]);

  const AttachIcon = attachment ? ATTACH_ICONS[attachKind(attachment)] : null;

  const scrollToRecipients = () =>
    recipRef.current?.scrollIntoView({ behavior: smoothly(), block: "start" });

  // ── Compose ─────────────────────────────────────────────────────────────────

  const compose = (
    <>
      {draftOffer && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)" }}
        >
          <Clock size={13} style={{ color: "#a16207" }} className="flex-shrink-0" />
          <span className="text-xs flex-1 min-w-0" style={{ color: "#a16207" }}>
            {t("admin.broadcast.draftFound").replace("{when}", fmtDT(draftOffer.savedAt))}
          </span>
          <Button size="sm" variant="secondary" onClick={restoreDraft}>
            {t("admin.broadcast.draftRestore")}
          </Button>
          <Button
            size="sm"
            variant="danger"
            tint
            icon={<Trash2 size={12} />}
            onClick={() => { dropDraft(); setDraftOffer(null); }}
          >
            {t("admin.broadcast.draftDiscard")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">

        {/* 1 · Message — mode stays HERE, at the tool it reconfigures: it swaps
            the editor toolbar and the length cap, so hiding it under "delivery"
            would mean an operator never discovers rich formatting exists. */}
        <Card
          icon={Megaphone}
          title={t("admin.broadcast.composeTitle")}
          right={<Summary active={hasMessage} warn={over}>{len} / {maxLen}</Summary>}
          className="lg:col-start-1 lg:row-start-1 min-w-0"
        >
          <div className="p-4 space-y-3">
            <SegmentedToggle
              value={mode}
              onChange={setMode}
              ariaLabel={t("admin.broadcast.composeTitle")}
              options={[
                { value: "normal", label: <span className="inline-flex items-center gap-1.5"><Type size={14} /> {t("admin.broadcast.modeNormal")}</span> },
                { value: "rich", label: <span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> {t("admin.broadcast.modeRich")}</span> },
              ]}
            />

            <RichTextEditor
              key={editorKey}
              initialHtml={seedHtml}
              rich={rich}
              placeholder={t("admin.broadcast.placeholder")}
              onChange={setMsg}
              customEmojis={emojis || []}
              onAddEmoji={(body) => addEmojiMut.mutate(body)}
              onDeleteEmoji={(em) => delEmojiMut.mutate(em.id)}
            />

            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" accept={BROADCAST_ACCEPT} className="hidden" onChange={pickFile} />
              {rich ? (
                msg.media.length > 0 && (
                  <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    {t("admin.broadcast.embeddedMedia").replace("{n}", msg.media.length)}
                  </span>
                )
              ) : !attachment ? (
                <Button
                  variant="secondary"
                  icon={<Paperclip size={13} />}
                  onClick={() => fileRef.current?.click()}
                >
                  {t("admin.broadcast.attach")}
                </Button>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-lg text-xs max-w-full"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                >
                  {AttachIcon && <AttachIcon size={13} className="flex-shrink-0" />}
                  <span className="truncate max-w-[220px]">{attachment.name}</span>
                  <span className="opacity-70 flex-shrink-0">{fmtSize(attachment.size)}</span>
                  {/* The ::after inset expands the TAP area to 44px without
                      changing the chip's layout — the visual ✕ was a ~20px
                      target on a phone-first surface. */}
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="relative rounded-md p-1 hover:bg-[var(--bg-accent)] transition-colors flex-shrink-0
                               after:absolute after:content-[''] after:inset-[-11px]"
                    title={t("admin.broadcast.removeAttach")}
                    aria-label={t("admin.broadcast.removeAttach")}
                  >
                    <X size={13} />
                  </button>
                </span>
              )}
            </div>
            {!rich && attachment && (
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {t("admin.broadcast.attachLimit")}
              </div>
            )}
            {rich && (
              <div className="text-[11px]" style={{ color: "#d97706" }}>
                {t("admin.broadcast.richHint")}
              </div>
            )}
            {dupNote && (
              <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "#a16207" }}>
                <AlertTriangle size={12} /> {dupNote}
              </div>
            )}
          </div>
        </Card>

        {/* 2 · Recipients — above the action bar at EVERY breakpoint. */}
        <Card
          innerRef={recipRef}
          icon={Users}
          title={t("admin.broadcast.recipientsTitle")}
          right={<Summary active={selected.length > 0}>{selected.length}/{allEnabledKeys.length}</Summary>}
          className="lg:col-start-2 lg:row-start-1 lg:row-span-2"
        >
          {listError ? (
            /* An empty tree next to "nobody selected" would blame the operator
               for a request that failed. Say which one it was, and offer the fix. */
            <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <AlertTriangle size={24} style={{ color: "#ef4444" }} />
              <div className="text-sm" style={{ color: "var(--text-2)" }}>
                {t("admin.broadcast.listError")}
              </div>
              <Button variant="secondary" icon={<RotateCcw size={13} />} onClick={() => refetchList()}>
                {t("admin.broadcast.retryLoad")}
              </Button>
            </div>
          ) : (
            <>
              <div className="px-3 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <SearchInput
                  value={treeFilter}
                  onChange={setTreeFilter}
                  placeholder={t("admin.broadcast.searchPh")}
                />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(visibleKeys)}>
                    {treeFilter.trim()
                      ? t("admin.broadcast.selectMatches").replace("{n}", visibleKeys.length)
                      : t("admin.broadcast.selectAll")}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={!selected.length} onClick={() => setSelected([])}>
                    {t("admin.broadcast.clearAll")}
                  </Button>
                </div>
              </div>
              {/* Group-level readback: WHO is selected, answerable without
                  scrolling the tree hunting for ticks. Group-level on purpose —
                  300 name chips would be the same problem in a new shape. */}
              {groupBreakdown.length > 0 && (
                <div className="px-3 py-2 flex flex-wrap gap-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  {groupBreakdown.map(({ label, n }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full"
                      style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                    >
                      {label} <b className="tabular-nums">{n}</b>
                      <button
                        type="button"
                        onClick={() => {
                          const g = groups.find((x) => x.label === label);
                          if (!g) return;
                          const drop = new Set(collectLeafKeys([g]));
                          setSelected((prev) => prev.filter((k) => !drop.has(k)));
                        }}
                        className="relative rounded-full p-0.5 hover:bg-[var(--bg-accent)] transition-colors
                                   after:absolute after:content-[''] after:inset-[-12px]"
                        aria-label={`${t("admin.broadcast.clearAll")} — ${label}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: "min(52vh, 460px)" }}>
                {listLoading ? (
                  <div className="space-y-2 px-2 py-1">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-7 w-full" />)}
                  </div>
                ) : (
                  <CheckboxTree
                    groups={groups}
                    selected={selected}
                    onChange={setSelected}
                    filter={treeFilter}
                    emptyText={t("admin.broadcast.noMatch")}
                  />
                )}
              </div>
            </>
          )}
        </Card>

        {/* 3 · Delivery */}
        <Card
          icon={CalendarClock}
          title={t("admin.broadcast.secDelivery")}
          right={
            <Summary active={later}>
              {later ? (schedAt && !schedPast ? fmtDT(schedAt) : t("admin.broadcast.sendLater"))
                     : t("admin.broadcast.summaryNow")}
            </Summary>
          }
          className="lg:col-start-1 lg:row-start-2 min-w-0"
        >
          <div className="p-4 space-y-2">
            <SegmentedToggle
              size="sm"
              value={schedMode}
              onChange={setSchedMode}
              ariaLabel={t("admin.broadcast.secDelivery")}
              options={[
                { value: "now", label: <span className="inline-flex items-center gap-1.5"><Send size={13} /> {t("admin.broadcast.sendNow")}</span> },
                { value: "later", label: <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} /> {t("admin.broadcast.sendLater")}</span> },
              ]}
            />
            {later && (
              <>
                {presets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {presets.map((p) => (
                      <Button
                        key={p.key}
                        size="sm"
                        variant={schedDate === p.date && schedTime === p.time ? "primary" : "secondary"}
                        tint={schedDate === p.date && schedTime === p.time}
                        onClick={() => { setSchedDate(p.date); setSchedTime(p.time); }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <DateRangePicker
                    single
                    dateFrom={schedDate}
                    dateTo={schedDate}
                    setDateFrom={setSchedDate}
                    setDateTo={setSchedDate}
                    triggerClassName="px-3 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    aria-label={t("admin.broadcast.sendLater")}
                    className="rounded-xl px-3 py-2 text-sm tabular-nums outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                  />
                </div>
                {/* Consequential, so it sits under the control at --text-3,
                    not at --text-4 where the eye skips it. */}
                <div className="text-[11px]" style={{ color: schedPast ? "#ef4444" : "var(--text-3)" }}>
                  {!schedDate ? t("admin.broadcast.schedPick")
                    : schedPast ? t("admin.broadcast.schedPast")
                    : t("admin.broadcast.schedHint")}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Action bar — the commitment stated in full, then ONE primary action.
          Sticky so it is reachable from anywhere in the form; last in the DOM
          so the recipient picker is never below the button that needs it. */}
      <div
        className="sticky z-20 rounded-2xl px-3 py-2.5"
        style={{
          bottom: "calc(var(--tg-safe-bottom, 0px) + 8px)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            <button
              type="button"
              onClick={scrollToRecipients}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg transition-colors hover:bg-[var(--bg-inner)]"
              style={{ color: selected.length ? "var(--text-1)" : "var(--text-4)" }}
            >
              <Users size={13} />
              {t("admin.broadcast.summaryPeople").replace("{n}", String(selected.length))}
            </button>
            <span className="text-xs" style={{ color: "var(--text-4)" }}>·</span>
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
              {later ? <CalendarClock size={13} /> : <Send size={13} />}
              {later && schedAt && !schedPast ? fmtDT(schedAt) : t("admin.broadcast.summaryNow")}
            </span>
            <span className="text-xs" style={{ color: "var(--text-4)" }}>·</span>
            <span className="text-xs" style={{ color: "var(--text-2)" }}>
              {rich ? t("admin.broadcast.modeRich") : t("admin.broadcast.modeNormal")}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="lg"
              icon={<UserCheck size={14} />}
              disabled={!hasMessage || over}
              loading={testMut.isPending}
              onClick={() => testMut.mutate()}
              title={t("admin.broadcast.testHint")}
            >
              {t("admin.broadcast.testSend")}
            </Button>
            <Button
              size="lg"
              icon={later ? <CalendarClock size={14} /> : <Send size={14} />}
              disabled={!canSend}
              loading={sendMut.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {later ? t("admin.broadcast.schedule") : t("admin.broadcast.send")}
            </Button>
          </div>
        </div>
        {blocker && (
          <div className="mt-1.5 text-[11px] text-right" style={{ color: "var(--text-3)" }}>
            {t(blocker)}
          </div>
        )}
      </div>
    </>
  );

  // ── History ─────────────────────────────────────────────────────────────────

  const rowActions = (r) => (
    <>
      {r.can_cancel && (
        <Button
          variant="danger"
          tint
          size="sm"
          icon={<Ban size={12} />}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setCancelError(""); setCancelTarget(r); }}
        >
          {t("admin.broadcast.cancelSend")}
        </Button>
      )}
      {r.can_retry && (
        <Button
          variant="primary"
          tint
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setRetryError(""); setRetryTarget(r); }}
        >
          {t("admin.broadcast.retry")}
        </Button>
      )}
    </>
  );

  const delivered = (r) => (
    <>
      <span className="tabular-nums" style={{ color: "var(--text-1)" }}>
        {r.sent_count}
        <span style={{ color: "var(--text-4)" }}> / {r.recipient_total}</span>
      </span>
      {(r.status === "sending" || r.failed_count > 0) && (
        <DeliveryBar sent={r.sent_count} failed={r.failed_count} total={r.recipient_total} />
      )}
    </>
  );

  const historyEmpty = !historyLoading && !historyRows.length;

  const historyView = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <SearchInput
            value={histQuery}
            onChange={setHistQuery}
            placeholder={t("admin.broadcast.searchHistory")}
          />
        </div>
        <SegmentedToggle
          scrollable
          value={histFilter}
          onChange={setHistFilter}
          ariaLabel={t("admin.broadcast.colStatus")}
          options={[
            { value: "all", label: t("admin.broadcast.filterAll") },
            { value: "scheduled", label: t("admin.broadcast.statusScheduled") },
            { value: "sending", label: t("admin.broadcast.statusSending") },
            { value: "done", label: t("admin.broadcast.statusDone") },
            { value: "canceled", label: t("admin.broadcast.statusCanceled") },
          ]}
        />
      </div>

      {historyEmpty ? (
        <div
          className="rounded-2xl px-4 py-10 flex flex-col items-center gap-3 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <Inbox size={26} style={{ color: "var(--text-4)" }} />
          <div className="text-sm" style={{ color: "var(--text-2)" }}>
            {(history || []).length ? t("admin.broadcast.noMatchHistory") : t("admin.broadcast.empty")}
          </div>
          {(history || []).length ? (
            <Button
              variant="secondary"
              onClick={() => { setHistFilter("all"); setHistQuery(""); }}
            >
              {t("admin.broadcast.filterAll")}
            </Button>
          ) : (
            /* An empty state that teaches and invites the first action. */
            <Button icon={<Megaphone size={14} />} onClick={() => setView("compose")}>
              {t("admin.broadcast.writeFirst")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table — sm and up */}
          <div className="hidden sm:block">
            <TableCard
              icon={History}
              title={t("admin.broadcast.historyTitle")}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {historyRows.length}
              </span>}
            >
              <thead>
                <tr>
                  <Th label={t("admin.broadcast.colDate")} />
                  <Th label={t("admin.broadcast.colMessage")} />
                  <Th label={t("admin.broadcast.colRecipients")} align="right" />
                  <Th label={t("admin.broadcast.colDelivered")} align="right" />
                  <Th label={t("admin.broadcast.colStatus")} />
                  <Th label={t("admin.broadcast.colSender")} />
                  <Th label="" />
                </tr>
              </thead>
              <tbody>
                {historyLoading && Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>
                ))}
                {!historyLoading && historyRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>
                      {/* A real link: focusable, Enter-activatable, openable in
                          a new tab — the old row-click modal was none of those. */}
                      <a
                        href={`/broadcast/${r.id}`}
                        onClick={(e) => { e.preventDefault(); navigate(`/broadcast/${r.id}`); }}
                        className="hover:underline"
                        style={{ color: "inherit" }}
                      >
                        {fmtDT(r.created_at)}
                      </a>
                    </td>
                    <td className="px-3 py-2 max-w-[320px]"><MessageCell row={r} t={t} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.recipient_total}</td>
                    <td className="px-3 py-2 text-right min-w-[96px]">{delivered(r)}</td>
                    <td className="px-3 py-2"><StatusChip row={r} t={t} /></td>
                    <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.sender_name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-end gap-1.5">{rowActions(r)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </div>

          {/* Cards — below sm, where seven columns cannot be read. Each card is
              the same link to the record page, which is what makes the
              compressed form sufficient. */}
          <div className="sm:hidden space-y-2">
            {historyLoading && Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-20 w-full rounded-2xl" />
            ))}
            {!historyLoading && historyRows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl px-3 py-2.5 space-y-1.5"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <a
                  href={`/broadcast/${r.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/broadcast/${r.id}`); }}
                  className="block space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      {fmtDT(r.created_at)}
                    </span>
                    <span className="text-[11px]"><StatusChip row={r} t={t} /></span>
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-1)" }}>
                    <MessageCell row={r} t={t} />
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    {delivered(r)}
                  </div>
                </a>
                {(r.can_cancel || r.can_retry) && (
                  <div className="flex items-center gap-1.5 pt-0.5">{rowActions(r)}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // ── Page ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <SegmentedToggle
        asTabs
        value={view}
        onChange={setView}
        ariaLabel={t("admin.tabBroadcast")}
        options={[
          { value: "compose", label: <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> {t("admin.broadcast.tabCompose")}</span> },
          {
            value: "history",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <History size={14} /> {t("admin.broadcast.tabHistory")}
                {/* Awareness without abduction: the tab says something is in
                    flight; it never yanks the operator out of a compose. */}
                {liveCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold tabular-nums"
                    style={{ background: "#eab308", color: "#1a1a1a" }}
                  >
                    {liveCount}
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />

      {view === "compose" ? compose : historyView}

      {/* ── Confirm send ──────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        error={sendError}
        onCancel={() => { if (!sendMut.isPending) { setConfirmOpen(false); setSendError(""); } }}
        onConfirm={() => { setSendError(""); sendMut.mutate(); }}
        title={later ? t("admin.broadcast.confirmSchedTitle") : t("admin.broadcast.confirmTitle")}
        /* A readback, not a ritual. Confirming a bare number gives friction but
           no verification value; naming the groups and quoting the message is
           something the operator can actually check. */
        message={
          <>
            {/* The WHEN leads for a scheduled send: it is the one detail the
                admin cannot check afterwards by re-reading the composer. */}
            {later && schedAt && (
              <p className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold"
                 style={{ background: "rgba(234,179,8,0.12)", color: "#a16207", border: "1px solid rgba(234,179,8,0.25)" }}>
                <CalendarClock size={13} /> {fmtDT(schedAt)}
              </p>
            )}
            <p className="mb-2">{t("admin.broadcast.confirmMsg").replace("{n}", selected.length)}</p>
            {groupBreakdown.length > 0 && (
              <>
                <ul className="mb-1 space-y-0.5">
                  {groupBreakdown.map(({ label, n }) => (
                    <li key={label} style={{ color: "var(--text-2)" }}>· {label} — {n}</li>
                  ))}
                </ul>
                {groupBreakdown.reduce((s, g) => s + g.n, 0) > selected.length && (
                  <p className="mb-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                    {t("admin.broadcast.overlapNote")}
                  </p>
                )}
              </>
            )}
            {excerpt && (
              <p className="italic px-2 py-1.5 rounded-md" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                “{excerpt}”
              </p>
            )}
            {attachment && (
              <p className="mt-1.5 inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                <Paperclip size={12} /> {attachment.name}
              </p>
            )}
          </>
        }
        confirmLabel={later ? t("admin.broadcast.schedule") : t("admin.broadcast.send")}
        icon={later ? <CalendarClock size={20} /> : <Megaphone size={20} />}
        loading={sendMut.isPending}
      />

      {/* ── Confirm retry of failed recipients ────────────────────────────── */}
      <ConfirmDialog
        open={!!retryTarget}
        error={retryError}
        onCancel={() => { if (!retryMut.isPending) { setRetryTarget(null); setRetryError(""); } }}
        onConfirm={() => { setRetryError(""); retryMut.mutate(retryTarget.id); }}
        title={t("admin.broadcast.retryTitle")}
        message={t("admin.broadcast.retryMsg").replace("{n}", retryTarget?.failed_count ?? 0)}
        confirmLabel={t("admin.broadcast.retry")}
        icon={<RotateCcw size={20} />}
        loading={retryMut.isPending}
      />

      {/* ── Confirm cancel of a scheduled broadcast ───────────────────────── */}
      <ConfirmDialog
        open={!!cancelTarget}
        tone="danger"
        error={cancelError}
        onCancel={() => { if (!cancelMut.isPending) { setCancelTarget(null); setCancelError(""); } }}
        onConfirm={() => { setCancelError(""); cancelMut.mutate(cancelTarget.id); }}
        title={t("admin.broadcast.cancelTitle")}
        message={t("admin.broadcast.cancelMsg")
          .replace("{when}", cancelTarget?.scheduled_at ? fmtDT(cancelTarget.scheduled_at) : "—")
          .replace("{n}", cancelTarget?.recipient_total ?? 0)}
        confirmLabel={t("admin.broadcast.cancelConfirm")}
        icon={<Ban size={20} />}
        loading={cancelMut.isPending}
      />

      {toast.node}
    </div>
  );
}
