import { useState } from "react";
import {
  AlertTriangle, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, Database, FileSpreadsheet,
  Loader2, Mic, RotateCcw, Search, BotMessageSquare,
} from "lucide-react";
import { FileTile } from "../ui/FileIcon";
import Markdown from "./Markdown";
import PlanCard from "./PlanCard";
import useAT from "./useAT";
import { ACTIVE } from "../../context/AssistantContext";

const STEP_ICON = { docs: BookOpen, search: Search, data: Database, file: FileSpreadsheet };

/**
 * One message. The user's own words sit on the right in the warm bubble the
 * platform's chats use; the assistant's answer is plain text on the left,
 * under the trail of what it did to get there (live while it works, folded
 * once it has answered — the answer is the point, the trail is the proof).
 */
export default function Message({ m, run, onConfirm, onCancel, onRetry, onFile, onNavigate }) {
  const t = useAT();
  if (m.role === "user") return <UserBubble m={m} onFile={onFile} />;

  const d = m.data || {};
  const status = d.status || "done";
  const working = ACTIVE.includes(status) || status === "running";
  const steps = d.steps || [];
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: "rgba(var(--brand-rgb),0.14)", color: "var(--brand-text)" }} aria-hidden>
        <BotMessageSquare size={14} />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        {steps.length > 0 && <Steps steps={steps} live={working} />}
        {working && d.thinking && (
          <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-3)" }} role="status">
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--brand-text)" }} />
            {t(steps.length ? "assistant.thinkingMore" : "assistant.thinking")}
          </p>
        )}
        {d.plan && (
          <PlanCard plan={d.plan} runId={m.run_id}
            onConfirm={(approve) => onConfirm(m.run_id, approve)}
            onCancel={() => onCancel(m.run_id)} />
        )}
        {/* After the plan: once it has run, the text is the report on it. */}
        {m.text && <Markdown text={m.text} onNavigate={onNavigate} />}
        {(d.links || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {d.links.map((l) => (
              <a key={l.path} href={l.path}
                onClick={(e) => { e.preventDefault(); onNavigate?.(l.path); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>
                {t("assistant.openPage", { name: l.label })}
                <ArrowUpRight size={13} style={{ color: "var(--brand-text)" }} />
              </a>
            ))}
          </div>
        )}
        {(d.files || []).length > 0 && (
          <div className="grid gap-2 max-w-sm">
            {d.files.map((f) => (
              <FileTile key={f.id} name={f.name} bytes={f.size} onClick={() => onFile(f)}
                title={t("assistant.fileOpen")} />
            ))}
          </div>
        )}
        <StatusLine status={status} error={d.error} onRetry={onRetry} last={run?.id === m.run_id} />
      </div>
    </div>
  );
}

function UserBubble({ m, onFile }) {
  const t = useAT();
  const d = m.data || {};
  const atts = d.attachments || [];
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] space-y-1.5">
        {atts.length > 0 && (
          <div className="grid gap-1.5">
            {atts.map((f) => (
              <FileTile key={f.id} name={f.name} bytes={f.size} onClick={() => onFile(f)}
                title={t("assistant.fileOpen")} />
            ))}
          </div>
        )}
        {(m.text || d.voice) && (
          <div className="rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ background: "var(--chat-bubble-own)", color: "var(--text-1)" }}>
            {d.voice && (
              <span className="flex items-center gap-1 text-[11px] mb-0.5" style={{ color: "var(--text-3)" }}>
                <Mic size={12} /> {t("assistant.voiceNote", { s: fmtSecs(d.voice.seconds) })}
              </span>
            )}
            {m.text}
          </div>
        )}
      </div>
    </div>
  );
}

export const fmtSecs = (s) => {
  const n = Math.max(0, Number(s) || 0);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

function Steps({ steps, live }) {
  const t = useAT();
  const [open, setOpen] = useState(false);
  const shown = live || open;
  return (
    <div>
      {!live && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="inline-flex items-center gap-1 text-xs font-medium py-0.5"
          style={{ color: "var(--text-3)" }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t("assistant.steps", { n: steps.length })}
        </button>
      )}
      {shown && (
        <ul className={`space-y-1 ${live ? "" : "mt-1.5 pl-1"}`}>
          {steps.map((s, i) => {
            const Icon = STEP_ICON[s.kind] || Search;
            const running = s.state === "running";
            const failed = s.state === "failed";
            return (
              <li key={i} className="flex items-start gap-2 text-xs leading-snug"
                style={{ color: failed ? "var(--status-bad, #ef4444)" : "var(--text-3)" }}>
                {running
                  ? <Loader2 size={13} className="animate-spin mt-px flex-shrink-0" style={{ color: "var(--brand-text)" }} />
                  : <Icon size={13} className="mt-px flex-shrink-0" />}
                <span className="min-w-0">
                  {s.label}
                  {failed && <span className="block opacity-90">{t("assistant.stepFailed")}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusLine({ status, error, onRetry, last }) {
  const t = useAT();
  if (!["error", "interrupted", "stopped"].includes(status)) return null;
  const key = status === "error" ? `assistant.err.${error || "crash"}` : `assistant.status.${status}`;
  const msg = t(key);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-lg px-3 py-2"
      style={{ background: status === "stopped" ? "var(--bg-inner)" : "rgba(239,68,68,0.08)",
               color: status === "stopped" ? "var(--text-3)" : "var(--status-bad, #ef4444)" }}
      role={status === "error" ? "alert" : undefined}>
      {status !== "stopped" && <AlertTriangle size={14} className="flex-shrink-0" />}
      <span className="min-w-0 flex-1">{msg === key ? t("assistant.err.crash") : msg}</span>
      {last && onRetry && (
        <button type="button" onClick={onRetry}
          className="inline-flex items-center gap-1 text-xs font-semibold py-1"
          style={{ color: "var(--brand-text)" }}>
          <RotateCcw size={12} /> {t("assistant.retry")}
        </button>
      )}
    </div>
  );
}
