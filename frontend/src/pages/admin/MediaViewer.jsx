import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Eye, Copy, Check, Download, FileQuestion, AlertTriangle } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";

/** Bytes → "1.4 MB". */
function humanSize(bytes) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

/**
 * «Media» admin tab — paste a Telegram file_id (the bot replies with one for
 * every attachment an admin sends it) and view the file. Telegram's download
 * URL embeds the bot token, so the backend proxies the bytes: metadata from
 * /admin/tg-file, the file itself from /admin/tg-file/raw fetched as a blob
 * (the JWT rides on the Authorization header, so a bare <img src> can't work).
 */
export default function MediaViewer() {
  const { t } = useLang();

  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [meta, setMeta]       = useState(null);
  const [blobUrl, setBlobUrl] = useState("");
  const [copied, setCopied]   = useState(false);

  // One live object URL at a time — revoke the previous one on every swap and
  // on unmount, else each lookup leaks the whole file into memory.
  const urlRef = useRef("");
  function setPreviewUrl(next) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setBlobUrl(next);
  }
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function load() {
    const fileId = input.trim();
    if (!fileId || loading) return;
    setLoading(true);
    setError("");
    setMeta(null);
    setPreviewUrl("");
    try {
      const { data } = await api.get("/admin/tg-file", { params: { file_id: fileId } });
      setMeta(data);
      const res = await api.get("/admin/tg-file/raw", {
        params: { file_id: fileId },
        responseType: "blob",
      });
      setPreviewUrl(URL.createObjectURL(res.data));
    } catch (e) {
      setError(e?.response?.data?.detail || t("media.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!blobUrl || !meta) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = meta.file_name || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function copyId() {
    if (!meta?.file_id) return;
    navigator.clipboard?.writeText(meta.file_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  const rowCls   = "flex items-start justify-between gap-3 px-4 py-2 text-xs";
  const labelCls = "uppercase tracking-wider text-[11px] flex-shrink-0";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-4">
      {/* ── Lookup ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ImageIcon} title={t("media.title")} subtitle={t("media.subtitle")} />
        <div className="p-4 space-y-3">
          <FormField label={t("media.fileIdLabel")}>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); load(); } }}
              placeholder={t("media.placeholder")}
              spellCheck={false}
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-xs font-mono resize-y focus:outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Button size="lg" icon={<Eye size={14} />} loading={loading} disabled={!input.trim()} onClick={load}>
              {t("media.show")}
            </Button>
            {(meta || error) && !loading && (
              <Button size="lg" variant="secondary" onClick={() => { setInput(""); setMeta(null); setError(""); setPreviewUrl(""); }}>
                {t("media.clear")}
              </Button>
            )}
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SkeletonBlock className="h-56 w-full rounded-lg" />
          <SkeletonBlock className="h-3 w-1/2 rounded" />
        </div>
      )}

      {!loading && meta && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead
            icon={ImageIcon}
            title={t("media.preview")}
            right={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" icon={copied ? <Check size={12} /> : <Copy size={12} />} onClick={copyId}>
                  {copied ? t("media.copied") : t("media.copyId")}
                </Button>
                {blobUrl && (
                  <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={download}>
                    {t("media.download")}
                  </Button>
                )}
              </div>
            }
          />

          <div className="p-4 flex items-center justify-center" style={{ background: "var(--bg-inner)" }}>
            {blobUrl && meta.kind === "image" && (
              <img src={blobUrl} alt={meta.file_name} className="max-h-[60vh] max-w-full rounded-lg" />
            )}
            {blobUrl && meta.kind === "video" && (
              <video src={blobUrl} controls className="max-h-[60vh] max-w-full rounded-lg" />
            )}
            {blobUrl && meta.kind === "audio" && (
              <audio src={blobUrl} controls className="w-full" />
            )}
            {blobUrl && meta.kind === "file" && (
              <div className="flex flex-col items-center gap-2 py-8">
                <FileQuestion size={28} style={{ color: "var(--text-4)" }} />
                <div className="text-xs" style={{ color: "var(--text-3)" }}>{t("media.notRenderable")}</div>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {[
              [t("media.metaName"), meta.file_name],
              [t("media.metaType"), meta.mime_type],
              [t("media.metaSize"), humanSize(meta.file_size)],
              [t("media.metaUniqueId"), meta.file_unique_id || "—"],
              [t("media.metaPath"), meta.file_path || "—"],
            ].map(([label, value], i) => (
              <div key={label} className={rowCls} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <span className={labelCls} style={{ color: "var(--text-3)" }}>{label}</span>
                <span className="font-mono text-right break-all" style={{ color: "var(--text-2)" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
