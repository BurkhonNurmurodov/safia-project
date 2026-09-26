import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, Send, Pencil, Trash2, Check, XCircle, Loader2, Paperclip,
  ImageOff, RefreshCw, UploadCloud,
} from "lucide-react";
import Modal from "./Modal";
import Lightbox from "./Lightbox";
import { SkeletonBlock } from "./Skeleton";
import { useToast } from "./Toast";
import { FileTile } from "./FileIcon";
import api from "../../utils/api";
import { saveBlob } from "../../utils/exportXlsx";
import { isWebSession } from "../../utils/session";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

/**
 * CommentsModal + CommentsThread — THE chat-thread template. One record, one
 * discussion: the thread hangs off any REST resource that exposes the four
 * standard endpoints
 *
 *     GET    {endpoint}                → [{id, author_name, text, created_at,
 *                                          edited_at, is_own, kind?, files?,
 *                                          author_role?, can_edit?}]
 *     POST   {endpoint}       {text}   (multipart {text, files[]} with `attachments`)
 *     PUT    {endpoint}/{id}  {text}
 *     DELETE {endpoint}/{id}
 *
 * so a page adds comments by pointing this at its own endpoint — never by
 * re-implementing bubbles, a composer and an edit mode of its own (the tasks
 * board, the concerns register and the appeal chat are the same conversation
 * about a different row).
 *
 * `CommentsModal` is the thread in a dialog (tasks, concerns). `CommentsThread`
 * is the thread itself, for a page that shows a record ABOVE its conversation —
 * the appeal chat on /leaders (objections and late proofs, 2026-09-26), where
 * the ruling buttons and the evidence lead and the chat follows. `layout`
 * "page" lets the page scroll and pins the composer to the bottom edge.
 *
 * Ownership is decided SERVER-side and arrives as `is_own` per message: a
 * message belongs to the PROFILE that wrote it, and one Telegram account can
 * hold several profiles, so the client must not re-derive it from the account.
 * `can_edit`, when the server sends it, is the whole answer to whether the
 * pencil and the bin are drawn (a closed appeal, a ruling entry).
 *
 * `kind` (optional, server-set) says what a message IS. "resolution" marks the
 * mandatory note a record was CLOSED with (the concerns register) — green ✓
 * header, no delete. A page names its own kinds through `kinds`
 * ({kind: {label, color, Icon, system}}): the appeal chat's filing and rulings
 * carry a coloured header, and a `system` kind with no words (an undo) renders
 * as a centred line rather than as somebody speaking.
 *
 * `attachments` (appeal chat): any file type, at most 10 per message and 20 MB
 * each — the server's own limits, checked here first so a file that cannot go
 * never looks sent. Files are dropped anywhere on the thread or picked with the
 * clip; a refused one stays on screen as a red tile until dismissed, never
 * silently dropped. Every file wears its extension's icon (`FileIcon`); an
 * image the server proved to be one is shown as a thumbnail. Opening a file
 * downloads it in a browser and, inside Telegram — whose WebView has no
 * downloads folder — asks the bot to put it in the reader's chat.
 *
 * Props (thread):
 *   endpoint, queryKey  – the thread's REST base and react-query key
 *   refreshKeys         – keys invalidated after a write (badges, cards)
 *   canComment          – false hides the composer
 *   closedText          – shown where the composer would be when it is hidden
 *   layout              – "modal" (list scrolls inside) | "page"
 *   attachments         – files on messages and in the composer
 *   filesEndpoint       – GET {…}/{id} streams one file; POST {…}/{id}/send
 *   kinds, roleLabel    – how server kinds and author roles are named
 *   placeholder, emptyText
 *   pollMs              – re-read the thread on this interval (a live chat)
 *   Composing the FIRST message of a record that does not exist yet (filing
 *   an objection IS the opening message of its chat):
 *   listEnabled=false   – nothing to read yet
 *   postEndpoint, postFields, textField – where the text goes and under which
 *                         field, plus whatever the filing needs beside it
 *   requireText, minText – the text is required even with files, this long
 *   onPosted(data)      – the server's answer (the page opens the new chat)
 */

const MAX_FILES = 10;
const MAX_BYTES = 20 * 1024 * 1024;

let seq = 0;
const nextId = () => `p${++seq}`;

export default function CommentsModal({
  endpoint,
  queryKey,
  refreshKeys = [],
  title,
  subtitle,
  canComment = true,
  onClose,
  zIndex,
}) {
  const { t } = useLang();
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-md"
      zIndex={zIndex}
      icon={<MessageSquare size={15} className="flex-shrink-0 text-[var(--brand-text)]" />}
      title={title || t("ui.comments.title")}
      subtitle={subtitle}
      bodyClassName="p-0 flex flex-col"
    >
      <CommentsThread endpoint={endpoint} queryKey={queryKey}
        refreshKeys={refreshKeys} canComment={canComment} />
    </Modal>
  );
}

/** One image attachment, fetched with the session's own auth (a plain <img
 *  src> carries no JWT), shown as a thumbnail that opens the lightbox. */
function AttachmentImage({ url, name, onOpen, T }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let obj = "";
    let alive = true;
    setFailed(false);
    api.get(url, { responseType: "blob" })
      .then((r) => {
        obj = URL.createObjectURL(r.data);
        if (alive) setSrc(obj); else URL.revokeObjectURL(obj);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [url, attempt]);
  if (failed) {
    return (
      <button type="button" onClick={() => setAttempt((a) => a + 1)} title={T.fileFailed}
        className="w-24 h-24 rounded-lg flex flex-col items-center justify-center gap-1"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <ImageOff size={16} color="var(--text-4)" />
        <RefreshCw size={12} color="var(--brand)" />
      </button>
    );
  }
  if (!src) return <SkeletonBlock className="w-24 h-24 rounded-lg" />;
  return (
    <button type="button" onClick={() => onOpen(src)} title={name}
      className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0"
      style={{ border: "1px solid var(--border)" }}>
      <img src={src} alt={name} className="w-full h-full object-cover" />
    </button>
  );
}

export function CommentsThread({
  endpoint,
  queryKey,
  refreshKeys = [],
  canComment = true,
  closedText,
  layout = "modal",
  attachments = false,
  filesEndpoint,
  kinds = {},
  roleLabel,
  placeholder,
  emptyText,
  pollMs,
  listEnabled = true,
  postEndpoint,
  postFields,
  textField = "text",
  requireText = false,
  minText = 1,
  onPosted,
}) {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });
  const myId = auth?.telegram_id ? String(auth.telegram_id) : null;
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);       // [{id, file, error}]
  const [progress, setProgress] = useState(null);   // null | 0..100
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [shot, setShot] = useState(null);
  const [openingFile, setOpeningFile] = useState(null);
  const listEndRef = useRef(null);
  const scrollAfterPost = useRef(false);
  const page = layout === "page";

  const T = {
    fileFailed: t("ui.comments.fileFailed"),
  };

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(endpoint).then((r) => r.data),
    enabled: listEnabled,
    refetchInterval: pollMs || false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    refreshKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
  // A failed write must SAY so: this thread is often opened inside Telegram's
  // WebView, where window.alert is silently swallowed.
  const onError = (e) =>
    toast.error(e?.response?.data?.detail || t("ui.comments.failed"));

  const valid = pending.filter((p) => !p.error);

  const target = postEndpoint || endpoint;
  const addMutation = useMutation({
    mutationFn: () => {
      if (attachments && valid.length) {
        const fd = new FormData();
        fd.append(textField, text);
        Object.entries(postFields || {}).forEach(([k, v]) => fd.append(k, String(v)));
        valid.forEach((p) => fd.append("files", p.file, p.file.name));
        setProgress(0);
        return api.post(target, fd, {
          onUploadProgress: (e) =>
            setProgress(Math.min(100, Math.round((e.loaded * 100) / (e.total || e.loaded || 1)))),
        });
      }
      return api.post(target, { ...(postFields || {}), [textField]: text });
    },
    onSuccess: (res) => {
      setText("");
      setPending([]);
      scrollAfterPost.current = true;
      invalidate();
      onPosted?.(res?.data);
    },
    onError,
    onSettled: () => setProgress(null),
  });
  const editMutation = useMutation({
    mutationFn: (id) => api.put(`${endpoint}/${id}`, { text: editText }),
    onSuccess: () => { setEditingId(null); setEditText(""); invalidate(); },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`${endpoint}/${id}`),
    onSuccess: invalidate,
    onError,
  });

  // Keep the newest message in view. In a dialog, on every load; on a page —
  // which OPENS on the record above the chat — only after the reader's own post.
  useEffect(() => {
    if (!page || scrollAfterPost.current) {
      listEndRef.current?.scrollIntoView({ block: "end", behavior: page ? "smooth" : "auto" });
      scrollAfterPost.current = false;
    }
  }, [comments.length, isLoading, page]);

  // Server-resolved: ownership is per-profile (one account can hold several
  // profiles). Fallback for responses cached before is_own existed.
  const isOwn = (c) => c.is_own ?? (myId && String(c.author_telegram_id) === myId);

  const addFiles = useCallback((files) => {
    setPending((prev) => {
      const next = [...prev];
      let room = MAX_FILES - prev.filter((p) => !p.error).length;
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          next.push({ id: nextId(), file, error: t("ui.comments.tooBig") });
        } else if (room <= 0) {
          next.push({ id: nextId(), file, error: t("ui.comments.tooMany") });
        } else {
          next.push({ id: nextId(), file, error: "" });
          room -= 1;
        }
      }
      return next;
    });
  }, [t]);

  const dropOn = attachments && canComment;
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: addFiles, noClick: true, noKeyboard: true, multiple: true,
    disabled: !dropOn,
  });

  const openFile = async (f) => {
    if (!filesEndpoint || openingFile) return;
    setOpeningFile(f.id);
    try {
      if (isWebSession()) {
        const r = await api.get(`${filesEndpoint}/${f.id}`, { responseType: "blob" });
        saveBlob(r.data, f.name);
      } else {
        await api.post(`${filesEndpoint}/${f.id}/send`);
        toast.success(t("ui.comments.sentToChat"));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("ui.comments.fileFailed"));
    } finally {
      setOpeningFile(null);
    }
  };

  const textOk = text.trim().length >= minText;
  const canSend = requireText ? textOk : (textOk || valid.length > 0);

  function send() {
    if (!canSend || addMutation.isPending) return;
    addMutation.mutate();
  }

  const allKinds = {
    resolution: { label: t("ui.comments.resolution"), color: "#22c55e", Icon: Check },
    ...kinds,
  };

  const renderFiles = (c) => {
    const files = c.files || [];
    if (!files.length) return null;
    const images = files.filter((f) => f.image && filesEndpoint);
    const others = files.filter((f) => !(f.image && filesEndpoint));
    return (
      <div className="mt-1.5 space-y-1.5">
        {!!images.length && (
          <div className="flex flex-wrap gap-1.5">
            {images.map((f) => (
              <AttachmentImage key={f.id} url={`${filesEndpoint}/${f.id}`} name={f.name}
                onOpen={setShot} T={T} />
            ))}
          </div>
        )}
        {others.map((f) => (
          <FileTile key={f.id} name={f.name} bytes={f.size}
            loading={openingFile === f.id}
            title={isWebSession() ? t("ui.comments.download") : t("ui.comments.sendToChat")}
            onClick={filesEndpoint ? () => openFile(f) : undefined} />
        ))}
      </div>
    );
  };

  const list = (
    <>
      {isLoading && listEnabled ? (
        <div className="space-y-2.5">
          <SkeletonBlock className="h-14 w-3/4" />
          <SkeletonBlock className="h-14 w-3/4 ml-auto" />
          <SkeletonBlock className="h-14 w-2/3" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-center py-8" style={{ color: "var(--text-4)" }}>
          {emptyText || t("ui.comments.none")}
        </div>
      ) : (
        comments.map((c) => {
          const own = isOwn(c);
          const kind = allKinds[c.kind];
          const editable = c.can_edit ?? own;
          const deletable = c.can_edit ?? (own && c.kind !== "resolution");
          const when = `${fmtDate(c.created_at, lang)} · ${fmtTime(c.created_at)}`;
          if (kind?.system && !(c.text || "").trim() && !(c.files || []).length) {
            const Icon = kind.Icon;
            return (
              <div key={c.id} className="flex justify-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                           color: "var(--text-3)" }}>
                  {Icon && <Icon size={11} style={{ color: kind.color }} />}
                  <span className="font-semibold" style={{ color: kind.color }}>{kind.label}</span>
                  <span>· {tl(c.author_name) || "—"} · {when}</span>
                </span>
              </div>
            );
          }
          const role = roleLabel ? roleLabel(c.author_role) : "";
          return (
            <div key={c.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-xl px-3 py-2 min-w-0"
                style={{
                  ...(own
                    ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }
                    : { background: "var(--bg-inner)", border: "1px solid var(--border)" }),
                  ...(kind ? { borderLeft: `3px solid ${kind.color}` } : {}),
                }}
              >
                {kind && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold mb-1"
                       style={{ color: kind.color }}>
                    {kind.Icon && <kind.Icon size={11} className="flex-shrink-0" />}
                    {kind.label}
                  </div>
                )}
                <div className="flex items-baseline gap-1.5 mb-0.5 min-w-0">
                  <span className="text-[10px] font-semibold truncate" style={{ color: "var(--brand-text)" }}>
                    {tl(c.author_name) || "—"}
                  </span>
                  {role && (
                    <span className="text-[9px] uppercase tracking-wide flex-shrink-0"
                      style={{ color: "var(--text-4)" }}>{role}</span>
                  )}
                </div>
                {editingId === c.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none resize-none"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)", minWidth: 180 }}
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => editMutation.mutate(c.id)}
                        disabled={(!editText.trim() && !(c.files || []).length) || editMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[var(--brand)] text-white disabled:opacity-40"
                      >
                        {editMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        {t("ui.comments.save")}
                      </button>
                      <button onClick={() => { setEditingId(null); setEditText(""); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px]" style={{ color: "var(--text-3)" }}>
                        <XCircle size={11} /> {t("ui.comments.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  (c.text || "").trim() && (
                    <div className="text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{c.text}</div>
                  )
                )}
                {renderFiles(c)}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                    {when}
                    {c.edited_at && <> · {t("ui.comments.edited")}</>}
                  </span>
                  {(editable || deletable) && editingId !== c.id && (
                    <span className="flex items-center gap-1.5 ml-auto">
                      {editable && (
                        <button onClick={() => { setEditingId(c.id); setEditText(c.text || ""); }}
                          style={{ color: "var(--text-4)" }} aria-label={t("ui.comments.save")}
                          className="hover:text-[var(--brand-text)] transition-colors">
                          <Pencil size={11} />
                        </button>
                      )}
                      {deletable && (
                        <button
                          onClick={() => deleteMutation.mutate(c.id)}
                          disabled={deleteMutation.isPending}
                          style={{ color: "var(--text-4)" }}
                          aria-label={t("ui.comments.remove")}
                          className="hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      <div ref={listEndRef} />
    </>
  );

  const composer = canComment ? (
    <div className={`px-4 py-3 flex-shrink-0 ${page ? "sticky bottom-0 z-10" : ""}`}
      style={{
        borderTop: "1px solid var(--border)",
        background: page ? "var(--bg-card)" : undefined,
        paddingBottom: page ? "calc(0.75rem + var(--tg-safe-bottom, 0px))" : undefined,
      }}>
      {!!pending.length && (
        <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {pending.map((p) => (
            <FileTile key={p.id} name={p.file.name} bytes={p.file.size} error={p.error}
              removeLabel={t("ui.comments.remove")}
              onRemove={addMutation.isPending ? undefined
                : () => setPending((prev) => prev.filter((x) => x.id !== p.id))} />
          ))}
        </div>
      )}
      {progress !== null && (
        <div className="mb-2">
          <div className="text-[10px] mb-1" style={{ color: "var(--brand-text)" }}>
            {progress >= 100 ? t("ui.comments.processing")
              : t("ui.comments.uploading").replace("{p}", progress)}
          </div>
          <div className="h-1 bg-[var(--bg-accent)] rounded-full overflow-hidden" role="progressbar"
            aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
            aria-label={t("ui.comments.attach")}>
            <div className="h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, background: "var(--brand)" }} />
          </div>
        </div>
      )}
      <div className="flex items-end gap-2">
        {attachments && (
          <button type="button" onClick={open} disabled={addMutation.isPending}
            className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 transition-colors hover:border-[var(--brand)] disabled:opacity-40"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
            aria-label={t("ui.comments.attach")} title={t("ui.comments.attach")}>
            <Paperclip size={15} />
          </button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={placeholder || t("ui.comments.placeholder")}
          rows={2}
          maxLength={2000}
          className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none resize-none"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
        />
        <button
          onClick={send}
          disabled={!canSend || addMutation.isPending}
          className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white disabled:opacity-40 transition-colors"
          aria-label={placeholder || t("ui.comments.placeholder")}
        >
          {addMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  ) : closedText ? (
    <div className="px-4 py-3 text-[11px] text-center flex-shrink-0"
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
      {closedText}
    </div>
  ) : null;

  return (
    <div {...(dropOn ? getRootProps() : {})}
      className={`relative ${page ? "" : "flex flex-col min-h-0 flex-1"}`}>
      {dropOn && <input {...getInputProps()} />}
      {isDragActive && (
        <div className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ background: "rgba(var(--brand-rgb), 0.10)", border: "2px dashed var(--brand)" }}>
          <UploadCloud size={26} style={{ color: "var(--brand-text)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
            {t("ui.comments.drop")}
          </span>
        </div>
      )}
      {page ? (
        <div className="px-4 py-3 space-y-2.5">{list}</div>
      ) : (
        <div className="overflow-y-auto px-4 py-3 space-y-2.5" style={{ flex: "1 1 auto", minHeight: 160 }}>
          {list}
        </div>
      )}
      {composer}
      <Lightbox src={shot} onClose={() => setShot(null)} />
      {toast.node}
    </div>
  );
}


/**
 * CommentsButton — the table-cell trigger: a compact pill carrying the thread
 * size, gold once the thread has anything in it. Same cell on every page that
 * grows a Comments column, so the badge always reads the same way.
 */
export function CommentsButton({ count = 0, onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors hover:border-[var(--brand)]"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-md)",
        color: count ? "var(--brand-text)" : "var(--text-3)",
      }}
    >
      <MessageSquare size={12} />
      <span className="tabular-nums">{count || 0}</span>
    </button>
  );
}


// Localized ISO-date formatter (same shape as the pages that host this modal).
const MONTHS = {
  en:      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru:      ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz:      ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};

const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en" || lang === "ru") return `${d} ${mn} ${y}`;
  return `${d}-${mn}, ${y}`;
};

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
