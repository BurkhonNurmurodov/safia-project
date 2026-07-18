import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Users, History, Send, Paperclip, X, Image as ImageIcon, Video,
  FileText, CheckCircle, Loader2, Type, Sparkles,
} from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import RichTextEditor from "../../components/ui/RichTextEditor";
import CheckboxTree, { collectLeafKeys } from "../../components/ui/CheckboxTree";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { buildRecipientGroups } from "../../utils/broadcastTree";

const ATTACH_ICONS = { photo: ImageIcon, video: Video, document: FileText };

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

  const [mode, setMode] = useState("normal");
  const [msg, setMsg] = useState({ html: "", text: "", media: [] });
  const [editorKey, setEditorKey] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const [selected, setSelected] = useState([]);
  const [treeFilter, setTreeFilter] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(false);

  const { data: recip, isLoading: listLoading } = useQuery({
    queryKey: ["broadcast-recipients"],
    queryFn: () => api.get("/api/broadcast/recipients").then((r) => r.data),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["broadcast-history"],
    queryFn: () => api.get("/api/broadcast/history").then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "sending") ? 2000 : false,
  });

  const groups = useMemo(
    () => buildRecipientGroups(recip?.tree, t, tl, t("admin.broadcast.notRegistered")),
    [recip, t, tl],
  );
  const allEnabledKeys = useMemo(() => collectLeafKeys(groups), [groups]);

  const rich = mode === "rich";
  const maxLen = rich ? 32768 : attachment ? 1024 : 4096;
  const len = msg.text.length;
  const over = len > maxLen;
  const canSend = (!!msg.text.trim() || (rich && msg.media.length > 0)) &&
    selected.length > 0 && !over;

  const sendMut = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("text", msg.html);
      form.append("targets", JSON.stringify(selected));
      form.append("mode", mode);
      if (rich) {
        form.append("media_meta", JSON.stringify(msg.media.map(({ id, kind }) => ({ id, kind }))));
        msg.media.forEach((m) => form.append("media_files", m.file, m.name));
      } else if (attachment) {
        form.append("file", attachment);
      }
      return api.post("/api/broadcast/send", form);
    },
    onSuccess: () => {
      setConfirmOpen(false);
      setMsg({ html: "", text: "", media: [] });
      setEditorKey((k) => k + 1);
      setAttachment(null);
      setSelected([]);
      setToast(true);
      setTimeout(() => setToast(false), 3000);
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => {
      setConfirmOpen(false);
      alert(e?.response?.data?.detail || t("admin.broadcast.sendFailed"));
    },
  });

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const limit = attachKind(f) === "photo" ? 10 * 1048576 : 50 * 1048576;
    if (f.size > limit) { alert(t("admin.broadcast.attachTooLarge")); return; }
    setAttachment(f);
  };

  const AttachIcon = attachment ? ATTACH_ICONS[attachKind(attachment)] : null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
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
            />

            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
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

            <div className="flex items-center justify-end gap-3 pt-1" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
              <span className="text-xs" style={{ color: selected.length ? "var(--text-3)" : "var(--text-4)" }}>
                {t("admin.broadcast.selected").replace("{n}", selected.length)}
              </span>
              <Button
                size="lg"
                icon={<Send size={14} />}
                disabled={!canSend}
                loading={sendMut.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {t("admin.broadcast.send")}
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
              <Button variant="ghost" size="sm" onClick={() => setSelected(allEnabledKeys)}>
                {t("admin.broadcast.selectAll")}
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
                  {r.status === "sending" ? (
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--brand-text)" }}>
                      <Loader2 size={12} className="animate-spin" /> {t("admin.broadcast.statusSending")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5" style={{ color: "#22c55e" }}>
                      <CheckCircle size={12} /> {t("admin.broadcast.statusDone")}
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
        onCancel={() => !sendMut.isPending && setConfirmOpen(false)}
        onConfirm={() => sendMut.mutate()}
        title={t("admin.broadcast.confirmTitle")}
        message={t("admin.broadcast.confirmMsg").replace("{n}", selected.length)}
        confirmLabel={t("admin.broadcast.send")}
        cancelLabel={t("admin.broadcast.cancel")}
        icon={<Megaphone size={20} />}
        loading={sendMut.isPending}
      />

      {/* ── Detail modal ────────────────────────────────────────────────────── */}
      {detail && (
        <Modal
          onClose={() => setDetail(null)}
          title={t("admin.broadcast.detailTitle")}
          subtitle={`${fmtDT(detail.created_at)}${detail.sender_name ? ` · ${detail.sender_name}` : ""}`}
          icon={<Megaphone size={16} style={{ color: "var(--brand-text)" }} />}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>{t("admin.broadcast.close")}</Button>}
        >
          <div
            className={`tg-msg text-sm rounded-xl px-3 py-2.5${detail.mode === "rich" ? " tg-msg-rich" : ""}`}
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
            dangerouslySetInnerHTML={{ __html: detail.text_html }}
          />
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
      {toast && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 320,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("admin.broadcast.queuedToast")}</span>
        </div>
      )}
    </div>
  );
}
