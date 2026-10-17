import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../../utils/copyText";
import useAT from "./useAT";

/**
 * Copy something the assistant wrote. `getText` is called on the press, so a
 * long answer is turned into text only when somebody wants it. The result is
 * SAID — «Nusxa olindi», or in red «Nusxa olinmadi» — because a copy that
 * silently failed reads as success, and the reader pastes yesterday's
 * clipboard. `showLabel` keeps the words beside the icon at rest (a table's
 * footer); without it the button is icon-only until it has something to say.
 */
export default function CopyButton({ getText, label, showLabel = false }) {
  const t = useAT();
  const [state, setState] = useState(null);      // null | "ok" | "fail"
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async () => {
    const ok = await copyText(getText());
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), 2000);
  };

  const said = state === "ok" ? t("assistant.copied") : state === "fail" ? t("assistant.copyFailed") : "";
  const Icon = state === "ok" ? Check : Copy;
  return (
    <button type="button" onClick={run} title={label} aria-label={label}
      className="inline-flex items-center gap-1.5 h-8 max-sm:h-10 px-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-inner)]"
      style={{ color: state === "fail" ? "var(--status-bad, #ef4444)" : state === "ok" ? "var(--text-2)" : "var(--text-3)" }}>
      <Icon size={14} className="flex-shrink-0" aria-hidden="true" />
      {(said || showLabel) && <span aria-hidden="true">{said || label}</span>}
      <span className="sr-only" aria-live="polite">{said}</span>
    </button>
  );
}
