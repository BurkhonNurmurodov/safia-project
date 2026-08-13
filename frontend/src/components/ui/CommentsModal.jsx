import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Pencil, Trash2, Check, XCircle, Loader2 } from "lucide-react";
import Modal from "./Modal";
import { SkeletonBlock } from "./Skeleton";
import { useToast } from "./Toast";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

/**
 * CommentsModal — THE chat-thread template. One record, one discussion: the
 * thread hangs off any REST resource that exposes the four standard endpoints
 *
 *     GET    {endpoint}                → [{id, author_name, text, created_at,
 *                                          edited_at, is_own}]
 *     POST   {endpoint}       {text}
 *     PUT    {endpoint}/{id}  {text}
 *     DELETE {endpoint}/{id}
 *
 * so a page adds comments by pointing this at its own endpoint — never by
 * re-implementing bubbles, a composer and an edit mode of its own (the tasks
 * board and the concerns register are the same conversation about a different
 * row, and used to be two copies of this markup).
 *
 * Ownership is decided SERVER-side and arrives as `is_own` per message: a
 * message belongs to the PROFILE that wrote it, and one Telegram account can
 * hold several profiles, so the client must not re-derive it from the account.
 *
 * Props:
 *   endpoint     – thread base path, e.g. `/api/concerns/12/comments`
 *   queryKey     – react-query key for the thread itself
 *   refreshKeys  – keys to invalidate after a write so the row's comment badge
 *                  re-counts (array of query keys)
 *   title/subtitle – modal header; subtitle is usually the record's own text
 *   canComment   – false hides the composer (read-only viewer)
 *   onClose      – close handler
 *   zIndex       – pass 60+ when opened on top of another modal
 */
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
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });
  const myId = auth?.telegram_id ? String(auth.telegram_id) : null;
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const listEndRef = useRef(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(endpoint).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    refreshKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };
  // A failed write must SAY so: this modal is often opened inside Telegram's
  // WebView, where window.alert is silently swallowed.
  const onError = (e) =>
    toast.error(e?.response?.data?.detail || t("ui.comments.failed"));

  const addMutation = useMutation({
    mutationFn: () => api.post(endpoint, { text }),
    onSuccess: () => { setText(""); invalidate(); },
    onError,
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

  // Keep the newest message in view when the thread loads or grows.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [comments.length, isLoading]);

  // Server-resolved: ownership is per-profile (one account can hold several
  // profiles). Fallback for responses cached before is_own existed.
  const isOwn = (c) => c.is_own ?? (myId && String(c.author_telegram_id) === myId);

  function send() {
    if (!text.trim() || addMutation.isPending) return;
    addMutation.mutate();
  }

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
        {/* Thread */}
        <div className="overflow-y-auto px-4 py-3 space-y-2.5" style={{ flex: "1 1 auto", minHeight: 160 }}>
          {isLoading ? (
            <div className="space-y-2.5">
              <SkeletonBlock className="h-14 w-3/4" />
              <SkeletonBlock className="h-14 w-3/4 ml-auto" />
              <SkeletonBlock className="h-14 w-2/3" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-xs text-center py-8" style={{ color: "var(--text-4)" }}>{t("ui.comments.none")}</div>
          ) : (
            comments.map((c) => {
              const own = isOwn(c);
              return (
                <div key={c.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2"
                    style={own
                      ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }
                      : { background: "var(--bg-inner)", border: "1px solid var(--border)" }}
                  >
                    <div className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--brand-text)" }}>
                      {tl(c.author_name) || "—"}
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
                            disabled={!editText.trim() || editMutation.isPending}
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
                      <div className="text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{c.text}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                        {fmtDate(c.created_at, lang)} · {fmtTime(c.created_at)}
                        {c.edited_at && <> · {t("ui.comments.edited")}</>}
                      </span>
                      {own && editingId !== c.id && (
                        <span className="flex items-center gap-1.5 ml-auto">
                          <button onClick={() => { setEditingId(c.id); setEditText(c.text); }} style={{ color: "var(--text-4)" }} className="hover:text-[var(--brand-text)] transition-colors">
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                            style={{ color: "var(--text-4)" }}
                            className="hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer */}
        {canComment && (
          <div className="px-4 py-3 flex items-end gap-2 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("ui.comments.placeholder")}
              rows={2}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
            <button
              onClick={send}
              disabled={!text.trim() || addMutation.isPending}
              className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white disabled:opacity-40 transition-colors"
              aria-label={t("ui.comments.placeholder")}
            >
              {addMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        )}
        {toast.node}
    </Modal>
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
