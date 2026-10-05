import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import api from "../../utils/api";
import useAT from "./useAT";
import { useAssistant } from "../../context/AssistantContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import { SkeletonBlock } from "../ui/Skeleton";

/** When a chat was last touched: the time today, the date before that. */
function when(iso, t) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("assistant.yesterday");
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The reader's own chats, newest first. Only the author ever sees these (the
 * operator's call); a chat opened in an «open as» tab is listed in that tab
 * alone. Deleting one asks first — it is the reader's own conversation, not a
 * platform record, so it is theirs to remove.
 */
export default function ThreadList({ onPick, compact = false }) {
  const t = useAT();
  const A = useAssistant();
  const qc = useQueryClient();
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const q = useQuery({
    queryKey: ["assistant", "threads"],
    queryFn: () => api.get("/api/assistant/threads").then((r) => r.data),
    enabled: A.allowed,
    staleTime: 15_000,
  });
  const rows = q.data || [];

  const remove = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.delete(`/api/assistant/threads/${del.id}`);
      if (A.threadId === del.id) A.newChat();
      qc.invalidateQueries({ queryKey: ["assistant", "threads"] });
      setDel(null);
    } catch {
      setErr(t("assistant.err.send"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0">
      <button type="button" onClick={() => { A.newChat(); onPick?.(null); }}
        className="flex items-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-xl mb-2 hover:opacity-90"
        style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
        <Plus size={16} /> {t("assistant.newChat")}
      </button>
      {q.isLoading ? (
        <div className="space-y-2 px-1">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm px-2 py-4" style={{ color: "var(--text-3)" }}>{t("assistant.noChats")}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => {
            const sel = r.id === A.threadId;
            return (
              <li key={r.id} className="group flex items-center gap-1 rounded-lg"
                style={{ background: sel ? "var(--bg-inner)" : "transparent" }}>
                <button type="button" onClick={() => { A.setThreadId(r.id); onPick?.(r.id); }}
                  aria-current={sel ? "true" : undefined}
                  className={`flex-1 min-w-0 flex items-center gap-2.5 text-left px-2.5 ${compact ? "py-2" : "py-2.5"} rounded-lg hover:bg-[var(--bg-inner)]`}>
                  {r.active
                    ? <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />
                    : <MessageSquare size={14} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />}
                  <span className="min-w-0 flex-1 text-sm truncate" style={{ color: "var(--text-1)", fontWeight: sel ? 600 : 400 }}>
                    {r.title || t("assistant.untitled")}
                  </span>
                  <span className="text-[11px] flex-shrink-0 tabular-nums" style={{ color: "var(--text-3)" }}>
                    {when(r.updated_at, t)}
                  </span>
                </button>
                <button type="button" onClick={() => setDel(r)}
                  aria-label={t("assistant.deleteChat")} title={t("assistant.deleteChat")}
                  className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--bg-card)]"
                  style={{ color: "var(--text-3)" }}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog open={!!del} tone="danger"
        title={t("assistant.deleteChat")}
        message={t("assistant.deleteChatMsg", { title: del?.title || t("assistant.untitled") })}
        confirmLabel={t("assistant.deleteChatOk")}
        loading={busy} error={err || null}
        onCancel={() => { setDel(null); setErr(""); }} onConfirm={remove} />
    </div>
  );
}
