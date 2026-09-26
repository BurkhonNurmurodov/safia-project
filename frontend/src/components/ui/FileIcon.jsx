import {
  File, FileText, FileSpreadsheet, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode, Presentation, X, Loader2,
} from "lucide-react";
import { CATEGORY_COLORS, FOLD_COLOR } from "../../utils/chartPalette";

/**
 * FileIcon + FileTile — THE way an attached file is shown (2026-09-26, the
 * appeal chat). A file is recognised at a glance by its TYPE, so every file
 * carries the icon of its extension, tinted by one fixed hue per type, with the
 * extension itself printed on it («PDF», «XLSX») — a bare name in a list reads
 * as text, and «report.xlsx» beside «report.pdf» must look like two different
 * things before anybody reads the names.
 *
 * The hues come from `CATEGORY_COLORS`, one per type and the conventional one
 * where a convention exists (PDF red, spreadsheets green, documents blue,
 * slides orange) — a file type is a category, never a status. Anything the list
 * does not know is slate (`FOLD_COLOR`) with the plain file icon, never blank.
 *
 *   fileKind(name)       → { key, Icon, color, ext }
 *   humanSize(bytes)     → "1.4 MB"
 *   <FileIcon name size> – the tinted chip alone
 *   <FileTile name size bytes onClick onRemove loading error> – chip + name +
 *                          size, the row a chat message and a composer both use
 */

const [RED, GREEN, BLUE, YELLOW, ORANGE, PURPLE, TEAL, PINK, INDIGO] = CATEGORY_COLORS;

const TYPES = [
  { key: "pdf", Icon: FileText, color: RED, exts: ["pdf"] },
  { key: "doc", Icon: FileText, color: BLUE,
    exts: ["doc", "docx", "odt", "rtf", "txt", "md", "pages"] },
  { key: "sheet", Icon: FileSpreadsheet, color: GREEN,
    exts: ["xls", "xlsx", "xlsm", "xlsb", "csv", "ods", "numbers"] },
  { key: "slides", Icon: Presentation, color: ORANGE,
    exts: ["ppt", "pptx", "pps", "ppsx", "odp", "key"] },
  { key: "image", Icon: FileImage, color: PURPLE,
    exts: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tif", "tiff", "svg"] },
  { key: "video", Icon: FileVideo, color: PINK,
    exts: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp", "wmv"] },
  { key: "audio", Icon: FileAudio, color: TEAL,
    exts: ["mp3", "ogg", "oga", "opus", "wav", "m4a", "aac", "flac", "amr"] },
  { key: "archive", Icon: FileArchive, color: YELLOW,
    exts: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"] },
  { key: "code", Icon: FileCode, color: INDIGO,
    exts: ["json", "xml", "html", "htm", "js", "ts", "py", "sql", "yml", "yaml", "log"] },
];

const BY_EXT = Object.fromEntries(TYPES.flatMap((t) => t.exts.map((e) => [e, t])));

export function fileKind(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ""));
  const ext = m ? m[1].toLowerCase() : "";
  const t = BY_EXT[ext];
  return t
    ? { key: t.key, Icon: t.Icon, color: t.color, ext }
    : { key: "file", Icon: File, color: FOLD_COLOR, ext };
}

export function humanSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const hexA = (hex, a) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function FileIcon({ name, size = 36 }) {
  const { Icon, color, ext } = fileKind(name);
  return (
    <span className="relative inline-flex flex-col items-center justify-center rounded-lg flex-shrink-0"
      style={{ width: size, height: size, background: hexA(color, 0.14),
               border: `1px solid ${hexA(color, 0.35)}`, color }}
      aria-hidden="true">
      <Icon size={Math.round(size * 0.42)} strokeWidth={2} />
      {ext && (
        <span className="font-bold uppercase leading-none tracking-tight"
          style={{ fontSize: Math.max(7, Math.round(size * 0.2)), marginTop: 1 }}>
          {ext.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

export function FileTile({ name, bytes, onClick, onRemove, loading = false,
                           error = "", title, removeLabel = "×" }) {
  const Tag = onClick ? "button" : "div";
  return (
    <div className="flex items-center gap-2 min-w-0 rounded-xl px-2 py-1.5"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${error ? "rgba(239,68,68,0.45)" : "var(--border)"}`,
      }}>
      <Tag type={onClick ? "button" : undefined} onClick={onClick}
        title={title || name}
        className={`flex items-center gap-2 min-w-0 flex-1 text-left ${onClick ? "hover:opacity-80" : ""}`}>
        <FileIcon name={name} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>
            {name}
          </span>
          <span className="block text-[10px] break-words"
            style={{ color: error ? "#ef4444" : "var(--text-4)" }}>
            {error || humanSize(bytes)}
          </span>
        </span>
        {loading && <Loader2 size={13} className="animate-spin flex-shrink-0"
          style={{ color: "var(--brand-text)" }} />}
      </Tag>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel}
          className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--bg-inner)]"
          style={{ color: "var(--text-4)" }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}
