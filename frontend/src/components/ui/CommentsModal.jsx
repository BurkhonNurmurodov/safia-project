import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, MessageCircle, SendHorizontal, Pencil, Trash2, Check, CheckCheck,
  Loader2, Paperclip, ImageOff, RefreshCw, UploadCloud, Lock,
} from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Lightbox from "./Lightbox";
import ConfirmDialog from "./ConfirmDialog";
import ProfileAvatar, { nameHue } from "./ProfileAvatar";
import { SkeletonBlock } from "./Skeleton";
import { useToast } from "./Toast";
import { FileTile } from "./FileIcon";
import useIsMobile from "../../hooks/useIsMobile";
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
 *                                          author_role?, can_edit?, author_key?,
 *                                          author_photo?, seen?}]
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
 * THE LOOK (the «Muhokama» design, 2026-09-26) — a messenger, because that is
 * what the people using it already read all day:
 *   - somebody else's message is a bubble on the LEFT under their avatar
 *     (`ProfileAvatar` — their photo, else initials on their hue), opened by
 *     their name in that same hue and their role; the reader's own messages sit
 *     on the RIGHT in the warm bubble, with no avatar and no name;
 *   - a day divider opens every calendar day, so the time on a bubble can be
 *     the clock alone;
 *   - a message's `kind` is a tinted TAG inside its bubble, above the words;
 *   - the time sits in the bubble's bottom corner, and on the reader's own
 *     messages a ✓ / ✓✓ says whether any other party has read it yet (`seen`,
 *     when the server sends it — no tick is drawn otherwise, never a guess);
 *   - the composer is one rounded field with the clip inside it, beside a round
 *     send button; it grows with its text.
 * The hues are theme-safe through `.chat-ink` (index.css): a speaker's hue and
 * a kind's hue are pulled toward the text colour, so one hue reads on both
 * themes. The surfaces are the `--chat-bubble*` tokens.
 *
 * Ownership is decided SERVER-side and arrives as `is_own` per message: a
 * message belongs to the PROFILE that wrote it, and one Telegram account can
 * hold several profiles, so the client must not re-derive it from the account.
 * `can_edit`, when the server sends it, is the whole answer to whether the
 * pencil and the bin are drawn (a closed appeal, a ruling entry). Deleting asks
 * first (`ConfirmDialog`, danger) — the bin sits beside the clock and a message
 * removed is removed for every reader.
 *
 * `kind` (optional, server-set) says what a message IS. "resolution" marks the
 * mandatory note a record was CLOSED with (the concerns register) — a green ✓
 * tag, no delete. A page names its own kinds through `kinds`
 * ({kind: {label, color, Icon, system}}): the appeal chat's filing and rulings
 * carry a tag, and a `system` kind with no words (an undo) renders as a centred
 * line rather than as somebody speaking.
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
// The composer grows with its text up to this height, then scrolls.
const COMPOSER_MAX = 140;

let seq = 0;
const nextId = () => `p${++seq}`;

// A kind's tint behind its tag — the hue at 12%, the house status-pill recipe.
const tint = (hex, a = 0.12) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "var(--hover-bg)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// A speaker's hue — the one `ProfileAvatar` paints their initials on, so the
// name above a bubble and the avatar beside it are visibly the same person.
const personInk = (name) => `hsl(${nameHue(name || "")}, 58%, 55%)`;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2";

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
 *  src> carries no JWT), shown as a thumbnail that opens the lightbox. A lone
 *  image is drawn large, as a messenger does; several share a strip. */
function AttachmentImage({ url, name, onOpen, T, big = false }) {
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
  const box = big ? "w-56 h-40 max-w-full" : "w-24 h-24";
  if (failed) {
    return (
      <button type="button" onClick={() => setAttempt((a) => a + 1)} title={T.fileFailed}
        className={`${box} rounded-xl flex flex-col items-center justify-center gap-1`}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <ImageOff size={16} color="var(--text-4)" />
        <RefreshCw size={12} color="var(--brand)" />
      </button>
    );
  }
  if (!src) return <SkeletonBlock className={`${box} rounded-xl`} />;
  return (
    <button type="button" onClick={() => onOpen(src)} title={name}
      className={`${box} rounded-xl overflow-hidden flex-shrink-0`}
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
  const isMobile = useIsMobile();
  const myId = auth?.telegram_id ? String(auth.telegram_id) : null;
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);       // [{id, file, error}]
  const [progress, setProgress] = useState(null);   // null | 0..100
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [shot, setShot] = useState(null);
  const [openingFile, setOpeningFile] = useState(null);
  const [toDelete, setToDelete] = useState(null);   // the message awaiting a confirm
  const listEndRef = useRef(null);
  const inputRef = useRef(null);
  const scrollAfterPost = useRef(false);
  const page = layout === "page";
  // The design's roomy layout is a page on a wide screen; a dialog is as
  // narrow as a phone, so both take the compact one.
  const roomy = page && !isMobile;
  const padX = roomy ? "px-6" : "px-3";
  const avatarSize = roomy ? 40 : 34;

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
  const errText = (e) => {
    const d = e?.response?.data?.detail;
    return typeof d === "string" && d ? d : t("ui.comments.failed");
  };
  // A failed write must SAY so: this thread is often opened inside Telegram's
  // WebView, where window.alert is silently swallowed.
  const onError = (e) => toast.error(errText(e));

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
  // A failed delete stays INSIDE its confirm, with the reason (ConfirmDialog's
  // contract) — never a closed dialog and a toast somewhere else.
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => { setToDelete(null); invalidate(); },
  });

  // Keep the newest message in view. In a dialog, on every load; on a page —
  // which OPENS on the record above the chat — only after the reader's own post.
  useEffect(() => {
    if (!page || scrollAfterPost.current) {
      listEndRef.current?.scrollIntoView({ block: "end", behavior: page ? "smooth" : "auto" });
      scrollAfterPost.current = false;
    }
  }, [comments.length, isLoading, page]);

  // The composer grows with what is typed, up to COMPOSER_MAX, then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX)}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX ? "auto" : "hidden";
  }, [text, canComment]);

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

  const startEdit = (c) => { setEditingId(c.id); setEditText(c.text || ""); };
  const stopEdit = () => { setEditingId(null); setEditText(""); };
  const askDelete = (c) => { deleteMutation.reset(); setToDelete(c); };

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
                onOpen={setShot} T={T} big={images.length === 1} />
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

  /** The bubble's corner: the pencil and the bin on the reader's own words,
   *  "edited", the clock, and — on their own messages, where the server said —
   *  whether any other party has read it. `floated` sits it on the last line
   *  of the text, the way a messenger does. */
  const meta = (c, own, editable, deletable, floated) => (
    <span
      className={`${floated ? "float-right ml-3 mt-1.5 relative top-1" : ""} inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap select-none`}
      style={{ color: "var(--text-3)" }}>
      {editable && editingId !== c.id && (
        <button type="button" onClick={() => startEdit(c)}
          className={`-my-1 w-6 h-6 grid place-items-center rounded-full transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-1)] ${FOCUS}`}
          style={{ outlineColor: "var(--brand)" }}
          aria-label={t("ui.comments.edit")} title={t("ui.comments.edit")}>
          <Pencil size={12} />
        </button>
      )}
      {deletable && editingId !== c.id && (
        <button type="button" onClick={() => askDelete(c)}
          className={`-my-1 w-6 h-6 grid place-items-center rounded-full transition-colors hover:bg-[var(--hover-bg)] hover:text-[#ef4444] ${FOCUS}`}
          style={{ outlineColor: "var(--brand)" }}
          aria-label={t("ui.comments.delete")} title={t("ui.comments.delete")}>
          <Trash2 size={12} />
        </button>
      )}
      {c.edited_at && <span>{t("ui.comments.edited")}</span>}
      <time dateTime={c.created_at || undefined}
        title={`${fmtDate(localDay(c.created_at), lang)} ${fmtTime(c.created_at)}`}>
        {fmtTime(c.created_at)}
      </time>
      {own && c.seen != null && (
        <span role="img" className="inline-flex -mr-0.5"
          aria-label={c.seen ? t("ui.comments.seen") : t("ui.comments.sent")}
          title={c.seen ? t("ui.comments.seen") : t("ui.comments.sent")}>
          {c.seen ? <CheckCheck size={14} strokeWidth={2.2} /> : <Check size={14} strokeWidth={2.2} />}
        </span>
      )}
    </span>
  );

  const renderMessage = (c) => {
    const own = isOwn(c);
    const kind = allKinds[c.kind];
    const hasText = !!(c.text || "").trim();
    const hasFiles = !!(c.files || []).length;
    const name = tl(c.author_name) || "—";

    if (kind?.system && !hasText && !hasFiles) {
      const Icon = kind.Icon;
      return (
        <div key={c.id} className="self-center max-w-full my-1">
          <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-3 py-1 rounded-full text-xs text-center"
            style={{ background: "var(--hover-bg)", color: "var(--text-2)" }}>
            {Icon && <Icon size={12} className="chat-ink flex-shrink-0" style={{ "--ink": kind.color }} />}
            <span className="chat-ink font-semibold" style={{ "--ink": kind.color }}>{kind.label}</span>
            <span>· {name} · {fmtTime(c.created_at)}</span>
          </span>
        </div>
      );
    }

    const role = roleLabel ? roleLabel(c.author_role) : "";
    const editable = c.can_edit ?? own;
    const deletable = c.can_edit ?? (own && c.kind !== "resolution");
    const editing = editingId === c.id;
    const KindIcon = kind?.Icon;

    return (
      <article key={c.id}
        className={`flex items-end gap-2 ${own ? "self-end" : "self-start"} ${roomy ? "max-w-[78%]" : "max-w-[92%]"}`}>
        {!own && (
          <ProfileAvatar name={name} colorKey={c.author_name || name}
            profileKey={c.author_key} photoVer={c.author_photo} size={avatarSize} />
        )}
        <div className="px-3 pt-2 pb-1.5"
          style={{
            background: own ? "var(--chat-bubble-own)" : "var(--chat-bubble)",
            borderRadius: own ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
            minWidth: editing ? 240 : 180,
            maxWidth: "100%",
          }}>
          {!own && (
            <div className="flex items-center gap-x-2 gap-y-0 flex-wrap mb-0.5 min-w-0">
              <span className="chat-ink text-base font-semibold leading-[1.3] truncate max-w-full"
                style={{ "--ink": personInk(c.author_name || name) }}>
                {name}
              </span>
              {role && (
                <span className="text-[11px] font-medium tracking-[.02em]" style={{ color: "var(--text-2)" }}>
                  {role}
                </span>
              )}
            </div>
          )}
          {kind && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 mb-1"
              style={{ background: tint(kind.color) }}>
              {KindIcon && <KindIcon size={12} className="chat-ink flex-shrink-0" style={{ "--ink": kind.color }} />}
              <span className="chat-ink" style={{ "--ink": kind.color }}>{kind.label}</span>
            </span>
          )}
          {editing ? (
            <div className="mt-1">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") stopEdit();
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) editMutation.mutate(c.id);
                }}
                rows={3}
                autoFocus
                maxLength={2000}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none border border-[var(--border-md)] focus:border-[var(--brand)] transition-colors"
                style={{ background: "var(--bg-card)", color: "var(--text-1)" }}
              />
              <div className="flex justify-end gap-2 mt-1.5">
                <Button size="sm" variant="secondary" onClick={stopEdit}>{t("ui.comments.cancel")}</Button>
                <Button size="sm" variant="primary" loading={editMutation.isPending}
                  disabled={!editText.trim() && !hasFiles}
                  onClick={() => editMutation.mutate(c.id)}>
                  <Check size={13} />{t("ui.comments.save")}
                </Button>
              </div>
            </div>
          ) : hasText ? (
            <p className="m-0 text-[15px] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere]"
              style={{ color: "var(--text-1)" }}>
              {c.text}
              {!hasFiles && meta(c, own, editable, deletable, true)}
            </p>
          ) : null}
          {renderFiles(c)}
          {(editing || !hasText || hasFiles) && (
            <div className="flex justify-end mt-1.5">{meta(c, own, editable, deletable, false)}</div>
          )}
        </div>
      </article>
    );
  };

  // The feed: a day divider before the first message of every calendar day.
  const feed = [];
  let lastDay = "";
  for (const c of comments) {
    const d = localDay(c.created_at);
    if (d && d !== lastDay) {
      feed.push(
        <div key={`day-${d}`} className="self-center my-1 px-2.5 py-[3px] rounded-full text-xs"
          style={{ background: "var(--hover-bg)", color: "var(--text-2)" }}>
          {fmtDate(d, lang)}
        </div>,
      );
      lastDay = d;
    }
    feed.push(renderMessage(c));
  }

  const list = (
    <div role="log" aria-label={t("ui.comments.title")}
      className={`flex flex-col gap-3 ${padX} py-4`}>
      {isLoading && listEnabled ? (
        <>
          <div className="flex items-end gap-2">
            <SkeletonBlock className="rounded-full flex-shrink-0" style={{ width: avatarSize, height: avatarSize }} />
            <SkeletonBlock className="h-16 w-3/5 rounded-2xl" />
          </div>
          <SkeletonBlock className="h-11 w-2/5 rounded-2xl self-end" />
          <div className="flex items-end gap-2">
            <SkeletonBlock className="rounded-full flex-shrink-0" style={{ width: avatarSize, height: avatarSize }} />
            <SkeletonBlock className="h-12 w-1/2 rounded-2xl" />
          </div>
        </>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <MessageCircle size={22} style={{ color: "var(--text-4)" }} />
          <span className="text-[13px]" style={{ color: "var(--text-3)" }}>
            {emptyText || t("ui.comments.none")}
          </span>
        </div>
      ) : feed}
      <div ref={listEndRef} />
    </div>
  );

  const composer = canComment ? (
    <div className={`${padX} pt-3 flex-shrink-0 ${page ? "sticky bottom-0 z-10" : ""}`}
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card)",
        paddingBottom: page ? "calc(1rem + var(--tg-safe-bottom, 0px))" : "1rem",
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
          <div className="text-[11px] mb-1" style={{ color: "var(--brand-text)" }}>
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
        <div className="flex-1 min-w-0 flex items-end gap-1 rounded-[22px] pl-4 pr-1 py-1 border border-[var(--border-md)] focus-within:border-[var(--brand)] transition-colors"
          style={{ background: "var(--chat-bubble)" }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder || t("ui.comments.placeholder")}
            aria-label={placeholder || t("ui.comments.placeholder")}
            rows={1}
            maxLength={2000}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none resize-none text-[15px] leading-5 py-[9px] placeholder:text-[var(--text-3)]"
            style={{ color: "var(--text-1)", maxHeight: COMPOSER_MAX }}
          />
          {attachments && (
            <button type="button" onClick={open} disabled={addMutation.isPending}
              className={`w-9 h-9 rounded-full grid place-items-center flex-shrink-0 transition-colors text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--hover-bg)] disabled:opacity-40 ${FOCUS}`}
              style={{ outlineColor: "var(--brand)" }}
              aria-label={t("ui.comments.attach")} title={t("ui.comments.attach")}>
              <Paperclip size={20} strokeWidth={1.9} />
            </button>
          )}
        </div>
        <button type="button"
          onClick={send}
          disabled={!canSend || addMutation.isPending}
          className={`w-11 h-11 rounded-full grid place-items-center flex-shrink-0 transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 ${FOCUS}`}
          style={{ background: "var(--brand)", color: "var(--bg-card)", outlineColor: "var(--brand)" }}
          aria-label={t("ui.comments.send")} title={t("ui.comments.send")}
        >
          {addMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
        </button>
      </div>
    </div>
  ) : closedText ? (
    <div className={`${padX} py-3 flex items-center justify-center gap-1.5 text-xs text-center flex-shrink-0`}
      style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
      <Lock size={12} className="flex-shrink-0" />
      <span>{closedText}</span>
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
      {page ? list : (
        <div className="overflow-y-auto" style={{ flex: "1 1 auto", minHeight: 160 }}>
          {list}
        </div>
      )}
      {composer}
      <Lightbox src={shot} onClose={() => setShot(null)} />
      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        title={t("ui.comments.deleteTitle")}
        message={t("ui.comments.deleteBody")}
        confirmLabel={t("ui.comments.delete")}
        loading={deleteMutation.isPending}
        error={deleteMutation.isError ? errText(deleteMutation.error) : null}
        onCancel={() => { setToDelete(null); deleteMutation.reset(); }}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />
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

// The reader's calendar day of an instant, "YYYY-MM-DD" — what a day divider
// groups by. Read off the same clock `fmtTime` prints, so a message sent at
// 01:30 sits under the day its own clock names.
const localDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).split(/[T ]/)[0];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
