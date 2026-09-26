// Where the autosave stands, said quietly beside the content it concerns:
// «Saving…» while a write is in flight, «Saved» once it landed, and — the one
// state that must not be quiet — «Not saved» with a way to try again. Renders
// nothing until the reader has changed something.
import { Check, Loader2, CloudOff } from "lucide-react";
import { useSaveState, retrySave } from "./useGoals";
import { RED } from "../../utils/statusBands";

export default function SaveState({ t, className = "" }) {
  const { status } = useSaveState();
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`} style={{ color: RED }} role="status">
        <CloudOff size={13} aria-hidden />
        {t("targets.notSaved")}
        <button
          type="button" onClick={retrySave}
          className="underline underline-offset-2 rounded px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
        >
          {t("targets.retry")}
        </button>
      </span>
    );
  }
  const saving = status === "saving";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${className}`} style={{ color: "var(--text-2)" }} role="status" aria-live="polite">
      {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
      {saving ? t("targets.saving") : t("targets.saved")}
    </span>
  );
}
