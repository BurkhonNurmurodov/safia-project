import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Users, History, Send, Paperclip, X, Image as ImageIcon, Video,
  FileText, CheckCircle, Loader2, Type, Sparkles, RotateCcw, CalendarClock,
  Clock, Ban,
} from "lucide-react";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import DateRangePicker from "../../components/ui/DateRangePicker";
import SearchInput from "../../components/ui/SearchInput";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import RichTextEditor from "../../components/ui/RichTextEditor";
import CheckboxTree, { collectLeafKeys, filterGroups } from "../../components/ui/CheckboxTree";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import Toast, { useToast } from "../../components/ui/Toast";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { buildRecipientGroups } from "../../utils/broadcastTree";

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

const attachKind = (f) =>
  f.type.startsWith("image/") ? "photo" : f.type.startsWith("video/") ? "video" : "document";

const fmtSize = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const fmtDT = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function Broadcast() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const fileRef = useRef(null);

  const [mode, setMode] = usePersistentState("broadcast_mode", "normal");
  const [msg, setMsg] = useState({ html: "", text: "", media: [] });
  const [editorKey, setEditorKey] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const [selected, setSelected] = useState([]);
  const [treeFilter, setTreeFilter] = usePersistentState("broadcast_search", "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
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
  const toastCtl = useToast();

  const { data: recip, isLoading: listLoading } = useQuery({
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
    onError: (e) => toastCtl.error(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
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
  // groups, not just a total.
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

  const canSend = (!!msg.text.trim() || (rich && msg.media.length > 0)) &&
    selected.length > 0 && !over && (!later || (!!schedAt && !schedPast));

  const sendMut = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("text", msg.html);
      // Selection keys are telegram_ids (the tree keys leaves by telegram_id).
      form.append("targets", JSON.stringify(selected.map(Number)));
      form.append("mode", mode);
      if (rich) {
        form.append("media_meta", JSON.stringify(msg.media.map(({ id, kind }) => ({ id, kind }))));
        msg.media.forEach((m) => form.append("media_files", m.file, m.name));
      } else if (attachment) {
        form.append("file", attachment);
      }
      // UTC, so the send time survives an admin on a different device clock.
      if (schedAt) form.append("scheduled_at", schedAt.toISOString());
      return api.post("/api/broadcast/send", form);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      // Read the schedule BEFORE the reset below clears it — "queued" and
      // "scheduled for Tuesday" are not the same promise to make.
      setToastMsg(schedAt
        ? t("admin.broadcast.scheduledToast").replace("{when}", fmtDT(schedAt))
        : t("admin.broadcast.queuedToast"));
      setMsg({ html: "", text: "", media: [] });
      setEditorKey((k) => k + 1);
      setAttachment(null);
      setSelected([]);
      setSchedMode("now");
      setSchedDate("");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    // A failed mass-DM through window.alert was invisible on Telegram iOS: the
    // confirm closed, nothing else happened, and the admin could not tell
    // whether 100 people got the message or nobody did.
    onError: (e) => setSendError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  // Re-send to the recipients whose DM failed; the row flips back to
  // 'sending' and the history poll shows delivered climbing toward the total.
  const retryMut = useMutation({
    mutationFn: (id) => api.post(`/api/broadcast/${id}/retry`),
    onSuccess: () => {
      setRetryTarget(null);
      setRetryError("");
      toastCtl.success(t("admin.broadcast.retryQueued"));
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
      toastCtl.success(t("admin.broadcast.cancelDone"));
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => setCancelError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!BROADCAST_ALLOWED_EXT.has(ext)) { toastCtl.error(t("admin.broadcast.attachBadType")); return; }
    const limit = attachKind(f) === "photo" ? 10 * 1048576 : 50 * 1048576;
    if (f.size > limit) { toastCtl.error(t("admin.broadcast.attachTooLarge")); return; }
    setAttachment(f);
  };

  const AttachIcon = attachment ? ATTACH_ICONS[attachKind(attachment)] : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">

        {/* ── Compose ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Megaphone} title={t("admin.broadcast.composeTitle")} />
          <div className="p-4 space-y-3">
            <SegmentedToggle
              value={mode}
              onChange={setMode}
              options={[
                { value: "normal", label: <span className="inline-flex items-center gap-1.5"><Type size={14} /> {t("admin.broadcast.modeNormal")}</span> },
                { value: "rich", label: <span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> {t("admin.broadcast.modeRich")}</span> },
              ]}
            />

            <RichTextEditor
              key={editorKey}
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
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg text-xs max-w-full"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                >
                  {AttachIcon && <AttachIcon size={13} className="flex-shrink-0" />}
                  <span className="truncate max-w-[220px]">{attachment.name}</span>
                  <span className="opacity-70 flex-shrink-0">{fmtSize(attachment.size)}</span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="rounded-md p-0.5 hover:bg-[var(--bg-accent)] transition-colors flex-shrink-0"
                    title={t("admin.broadcast.removeAttach")}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              <span
                className="ml-auto text-[11px] tabular-nums flex-shrink-0"
                style={{ color: over ? "#ef4444" : "var(--text-4)", fontWeight: over ? 600 : 400 }}
              >
                {len} / {maxLen}
              </span>
            </div>
            {!rich && attachment && (
              <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
                {t("admin.broadcast.attachLimit")}
              </div>
            )}
            {rich && (
              <div className="text-[11px]" style={{ color: "#d97706" }}>
                {t("admin.broadcast.richHint")}
              </div>
            )}

            {/* ── When to send ──────────────────────────────────────────── */}
            {/* The date/time row only exists once "later" is picked, so sending
                now stays exactly as immediate as it was. */}
            <div className="space-y-2" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
              <SegmentedToggle
                size="sm"
                value={schedMode}
                onChange={setSchedMode}
                options={[
                  { value: "now", label: <span className="inline-flex items-center gap-1.5"><Send size={13} /> {t("admin.broadcast.sendNow")}</span> },
                  { value: "later", label: <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} /> {t("admin.broadcast.sendLater")}</span> },
                ]}
              />
              {later && (
                <>
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
                      className="rounded-xl px-3 py-2 text-sm tabular-nums outline-none"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                    />
                    {schedAt && !schedPast && (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                        <Clock size={11} /> {fmtDT(schedAt)}
                      </span>
                    )}
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

            <div className="flex items-center justify-end gap-3 pt-1">
              <span className="text-xs" style={{ color: selected.length ? "var(--text-3)" : "var(--text-4)" }}>
                {t("admin.broadcast.selected").replace("{n}", selected.length)}
              </span>
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
        </div>

        {/* ── Recipients ──────────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead
            icon={Users}
            title={t("admin.broadcast.recipientsTitle")}
            right={
              <span
                className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                style={selected.length
                  ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                  : { background: "var(--bg-inner)", color: "var(--text-4)" }}
              >
                {selected.length}/{allEnabledKeys.length}
              </span>
            }
          />
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
          <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 460 }}>
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
        </div>
      </div>

      {/* ── History ─────────────────────────────────────────────────────────── */}
      <TableCard
        icon={History}
        title={t("admin.broadcast.historyTitle")}
        right={history?.length ? (
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{history.length}</span>
        ) : null}
      >
        <thead>
          <tr>
            <Th label={t("admin.broadcast.colDate")} />
            <Th label={t("admin.broadcast.colMessage")} />
            <Th label={t("admin.broadcast.colFile")} />
            <Th label={t("admin.broadcast.colRecipients")} align="right" />
            <Th label={t("admin.broadcast.colDelivered")} align="right" />
            <Th label={t("admin.broadcast.colSender")} />
            <Th label={t("admin.broadcast.colStatus")} />
          </tr>
        </thead>
        <tbody>
          {historyLoading && Array.from({ length: 3 }).map((_, i) => (
            <tr key={i}><td colSpan={7} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>
          ))}
          {!historyLoading && !(history || []).length && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {t("admin.broadcast.empty")}
              </td>
            </tr>
          )}
          {!historyLoading && (history || []).map((r) => {
            const RowAttach = r.attachment_kind ? ATTACH_ICONS[r.attachment_kind] : null;
            return (
              <tr key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDT(r.created_at)}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 max-w-[300px]">
                    {r.mode === "rich" && (
                      <span
                        className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
                      >
                        <Sparkles size={9} /> {t("admin.broadcast.modeRich")}
                      </span>
                    )}
                    <span className="truncate" title={r.text_plain}>{r.text_plain}</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  {RowAttach ? (
                    <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                      <RowAttach size={12} style={{ color: "var(--brand-text)" }} />
                      <span className="max-w-[140px] truncate">{r.attachment_name}</span>
                    </span>
                  ) : r.media_names?.length ? (
                    <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                      <ImageIcon size={12} style={{ color: "var(--brand-text)" }} />
                      <span className="max-w-[140px] truncate">{r.media_names[0]}</span>
                      {r.media_names.length > 1 && <span style={{ color: "var(--text-4)" }}>+{r.media_names.length - 1}</span>}
                    </span>
                  ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.recipient_total}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span style={{ color: "#22c55e", fontWeight: 600 }}>{r.sent_count}</span>
                  {r.failed_count > 0 && (
                    <span className="ml-1.5" style={{ color: "#ef4444", fontWeight: 600 }}>
                      {t("admin.broadcast.failedN").replace("{n}", r.failed_count)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.sender_name || "—"}</td>
                <td className="px-3 py-2">
                  {r.status === "scheduled" ? (
                    /* Amber = armed and waiting. Deliberately not the grey a
                       canceled row gets — the two must not read alike. */
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: "#eab308" }}>
                        <CalendarClock size={12} /> {r.scheduled_at ? fmtDT(r.scheduled_at) : t("admin.broadcast.statusScheduled")}
                      </span>
                      {r.can_cancel && (
                        <Button
                          variant="danger"
                          tint
                          size="sm"
                          icon={<Ban size={12} />}
                          onClick={(e) => { e.stopPropagation(); setCancelError(""); setCancelTarget(r); }}
                        >
                          {t("admin.broadcast.cancelSend")}
                        </Button>
                      )}
                    </span>
                  ) : r.status === "canceled" ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-4)" }}>
                      <Ban size={12} /> {t("admin.broadcast.statusCanceled")}
                    </span>
                  ) : r.status === "sending" ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--brand-text)" }}>
                      <Loader2 size={12} className="animate-spin" /> {t("admin.broadcast.statusSending")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5" style={{ color: "#22c55e" }}>
                        <CheckCircle size={12} /> {t("admin.broadcast.statusDone")}
                      </span>
                      {r.can_retry && (
                        <Button
                          variant="primary"
                          tint
                          size="sm"
                          icon={<RotateCcw size={12} />}
                          onClick={(e) => { e.stopPropagation(); setRetryError(""); setRetryTarget(r); }}
                        >
                          {t("admin.broadcast.retry")}
                        </Button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      {/* ── Confirm send ────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        error={sendError}
        onCancel={() => { if (!sendMut.isPending) { setConfirmOpen(false); setSendError(""); } }}
        onConfirm={() => { setSendError(""); sendMut.mutate(); }}
        title={later ? t("admin.broadcast.confirmSchedTitle") : t("admin.broadcast.confirmTitle")}
        /* Confirming a bare number gives friction but no verification value —
           especially next to a "select all" that ignores the active filter.
           The readback now names the groups and quotes the message. */
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
              <ul className="mb-2 space-y-0.5">
                {groupBreakdown.map(({ label, n }) => (
                  <li key={label} style={{ color: "var(--text-2)" }}>· {label} — {n}</li>
                ))}
              </ul>
            )}
            {excerpt && (
              <p className="italic px-2 py-1.5 rounded-md" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                “{excerpt}”
              </p>
            )}
            {attachment && (
              <p className="mt-1.5" style={{ color: "var(--text-3)" }}>📎 {attachment.name}</p>
            )}
          </>
        }
        confirmLabel={later ? t("admin.broadcast.schedule") : t("admin.broadcast.send")}
        icon={later ? <CalendarClock size={20} /> : <Megaphone size={20} />}
        loading={sendMut.isPending}
      />

      {/* ── Confirm retry of failed recipients ──────────────────────────────── */}
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

      {/* ── Confirm cancel of a scheduled broadcast ─────────────────────────── */}
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

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      {detail && (
        <Modal
          onClose={() => setDetail(null)}
          title={t("admin.broadcast.detailTitle")}
          subtitle={`${fmtDT(detail.created_at)}${detail.sender_name ? ` · ${detail.sender_name}` : ""}`}
          icon={<Megaphone size={16} style={{ color: "var(--brand-text)" }} />}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>{t("admin.broadcast.close")}</Button>
              {detail.can_cancel && (
                <Button
                  variant="danger"
                  icon={<Ban size={14} />}
                  onClick={() => { setDetail(null); setCancelError(""); setCancelTarget(detail); }}
                >
                  {t("admin.broadcast.cancelSend")}
                </Button>
              )}
              {detail.can_retry && (
                <Button
                  icon={<RotateCcw size={14} />}
                  onClick={() => { setDetail(null); setRetryError(""); setRetryTarget(detail); }}
                >
                  {t("admin.broadcast.retry")}
                </Button>
              )}
            </>
          }
        >
          <div
            className={`tg-msg text-sm rounded-xl px-3 py-2.5${detail.mode === "rich" ? " tg-msg-rich" : ""}`}
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
            dangerouslySetInnerHTML={{ __html: detail.text_html }}
          />
          {detail.status === "scheduled" && detail.scheduled_at && (
            <div
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
              style={{ background: "rgba(234,179,8,0.12)", color: "#a16207", border: "1px solid rgba(234,179,8,0.25)" }}
            >
              <CalendarClock size={12} />
              {t("admin.broadcast.scheduledFor").replace("{when}", fmtDT(detail.scheduled_at))}
            </div>
          )}
          {detail.attachment_kind && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
              <Paperclip size={12} style={{ color: "var(--brand-text)" }} />
              {detail.attachment_name}
            </div>
          )}
          {detail.media_names?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.media_names.map((n, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
                >
                  <Paperclip size={9} /> {n}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-3)" }}>
            <span>{t("admin.broadcast.colRecipients")}: <b className="tabular-nums">{detail.recipient_total}</b></span>
            <span style={{ color: "#22c55e" }}>{t("admin.broadcast.colDelivered")}: <b className="tabular-nums">{detail.sent_count}</b></span>
            {detail.failed_count > 0 && (
              <span style={{ color: "#ef4444" }}>{t("admin.broadcast.failedN").replace("{n}", detail.failed_count)}</span>
            )}
          </div>
          {detail.failed_names?.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
                {t("admin.broadcast.failedList")}
              </div>
              <div className="flex flex-wrap gap-1">
                {detail.failed_names.map((n, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    {tl(n)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Queued toast — same pattern as the Staff export toast ──────────── */}
      <Toast open={toast} message={toastMsg} onClose={() => setToast(false)} />
      {toastCtl.node}
    </div>
  );
}
