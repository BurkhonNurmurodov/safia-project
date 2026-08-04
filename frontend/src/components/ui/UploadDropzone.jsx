import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useLang } from "../../context/LangContext";

/**
 * UploadDropzone + FileStateList + useFileStates — THE template for every file
 * upload surface in the panel.
 *
 * The three upload tabs used to each own a different answer to the same task:
 * two carried near-verbatim copies of one dropzone (already drifted — one
 * translated its row counts, the other emitted raw English) and the third used a
 * bare <input type="file"> with no drag-drop and no progress at all. An admin
 * doing all three uploads in one morning met three interaction models for one
 * job. This is the single model; each tab keeps its own POST logic and passes
 * results back in.
 *
 * Fixes baked in that the forks all lacked:
 *   • rejected files are never silent — a wrong-extension drop renders a red row
 *     instead of nothing happening;
 *   • rows are keyed by a generated id, not the filename, so two files with the
 *     same name can't cross-wire each other's progress;
 *   • the result detail wraps onto its own line instead of being nowrap and
 *     clipped, so long backend errors are readable on a 390px screen;
 *   • the bar carries progressbar ARIA;
 *   • once bytes reach 100% the label flips to "processing" — the parse and the
 *     whole-date replace happen after the transfer, and a bar frozen at 100%
 *     reads as a hang and invites a re-drop.
 */

let seq = 0;
const nextId = () => `f${++seq}`;

/** State container for a batch of uploads. Pages drive it from their POST loop. */
export function useFileStates() {
  const [states, setStates] = useState([]);
  const idsRef = useRef([]);

  /** Seed rows for a batch; returns [{id, file}] so the caller can post them. */
  const begin = useCallback((files) => {
    const entries = files.map((file) => ({ id: nextId(), file }));
    idsRef.current = entries.map((e) => e.id);
    setStates(entries.map(({ id, file }) => ({
      id, name: file.name, status: "pending", progress: 0, detail: "",
    })));
    return entries;
  }, []);

  const patch = useCallback((id, next) => {
    setStates((prev) => prev.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  /** Append react-dropzone rejections as red rows so nothing fails silently. */
  const addRejections = useCallback((rejections, detail) => {
    if (!rejections?.length) return;
    setStates((prev) => [
      ...prev,
      ...rejections.map((r) => ({
        id: nextId(),
        name: r.file?.name ?? "",
        status: "error",
        progress: 100,
        detail: detail || r.errors?.[0]?.message || "",
      })),
    ]);
  }, []);

  const clear = useCallback(() => setStates([]), []);

  return { states, begin, patch, addRejections, clear };
}

export function UploadDropzone({
  accept,
  multiple = true,
  disabled = false,
  busy = false,
  onFiles,
  onRejected,
  label,
  activeLabel,
  busyLabel,
  hint = null,
  className = "",
}) {
  const { t } = useLang();
  const [rejected, setRejected] = useState([]);

  const onDrop = useCallback((accepted) => {
    setRejected([]);
    if (accepted.length) onFiles?.(accepted);
  }, [onFiles]);

  // A rejected drop must always leave a mark. Pages may take over the display by
  // passing onRejected, but the default is never "nothing happened".
  const onDropRejected = useCallback((rejections) => {
    if (onRejected) { onRejected(rejections); setRejected([]); return; }
    setRejected(rejections.map((r) => r.file?.name ?? ""));
  }, [onRejected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, onDropRejected, accept, multiple, disabled: disabled || busy,
  });

  const isBusy = disabled || busy;

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl px-5 py-7 text-center transition-colors ${
          isBusy       ? "border-[var(--border)] opacity-50 cursor-not-allowed" :
          isDragActive ? "border-[var(--brand)] bg-[var(--brand-bg)] cursor-pointer" :
                         "border-[var(--border-md)] hover:border-[var(--brand-border)] cursor-pointer"
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={26} className="mx-auto mb-2.5 text-[var(--text-3)]" />
        <div className="text-sm text-[var(--text-2)]">
          {busy ? (busyLabel ?? t("admin.uploading"))
                : isDragActive ? (activeLabel ?? t("admin.dropActive"))
                : (label ?? t("admin.dropzone"))}
        </div>
        {/* The filename contract is the only guard against filing a day under the
            wrong supervisor — it reads at body size, not as 11px small print. */}
        {hint && <div className="text-xs text-[var(--text-3)] mt-1.5 leading-snug">{hint}</div>}
      </div>

      {rejected.length > 0 && (
        <div
          className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "#ef4444" }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="break-words">
            {t("admin.upload.rejected")}
            <span className="opacity-80"> — {rejected.join(", ")}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Per-file progress + result rows, with the succeeded/failed summary and Clear. */
export function FileStateList({ states = [], onClear, busy = false, className = "" }) {
  const { t } = useLang();
  if (!states.length) return null;

  const done = states.filter((f) => f.status === "ok").length;
  const failed = states.filter((f) => f.status === "error").length;

  return (
    <div className={`space-y-2 ${className}`}>
      {!busy && (
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="font-semibold" style={{ color: "#22c55e" }}>
            {t("admin.succeeded").replace("{n}", done)}
          </span>
          {failed > 0 && (
            <span className="font-semibold" style={{ color: "#ef4444" }}>
              {t("admin.failed").replace("{n}", failed)}
            </span>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto px-2 py-1 rounded-md text-[var(--text-3)] hover:text-[var(--text-2)]"
            >
              {t("admin.clear")}
            </button>
          )}
        </div>
      )}

      {states.map((f) => (
        <div key={f.id ?? f.name} className="bg-[var(--bg-inner)] rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            {f.status === "uploading"  && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
            {f.status === "processing" && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
            {f.status === "ok"         && <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: "#22c55e" }} />}
            {f.status === "error"      && <XCircle size={13} className="flex-shrink-0" style={{ color: "#ef4444" }} />}
            {f.status === "pending"    && <div className="w-3 h-3 rounded-full border border-[var(--border-md)] flex-shrink-0" />}
            <span className="font-mono text-xs text-[var(--text-2)] flex-1 min-w-0 truncate">{f.name}</span>
            <span
              className="text-[11px] flex-shrink-0"
              style={{
                color: f.status === "uploading" || f.status === "processing"
                  ? "var(--brand-text)" : "var(--text-4)",
              }}
            >
              {f.status === "uploading"  ? `${f.progress}%` :
               f.status === "processing" ? t("admin.processing") :
               f.status === "pending"    ? t("admin.waiting") : ""}
            </span>
          </div>

          {/* Detail gets its own full-width line: backend validation messages are
              long, and as a nowrap sibling they were clipped by the panel. */}
          {f.detail && (
            <div
              className="text-[11px] leading-snug mb-1.5 break-words"
              style={{ color: f.status === "error" ? "#ef4444" : "#22c55e" }}
            >
              {f.detail}
            </div>
          )}

          <div
            className="h-1 bg-[var(--bg-accent)] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={f.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={f.name}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${f.progress}%`,
                background: f.status === "ok" ? "#22c55e" : f.status === "error" ? "#ef4444" : "var(--brand)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default UploadDropzone;
