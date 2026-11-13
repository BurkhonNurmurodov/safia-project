import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, EyeOff, KeyRound, X } from "lucide-react";
import { useLang } from "../../../context/LangContext";
import { useTranslit } from "../../../utils/transliterate";
import useIsMobile from "../../../hooks/useIsMobile";
import useLeaveRef from "../../../hooks/useLeaveRef";
import { AMBER, CAT_ICON, RED, fmtDay, labelOf, roleLabel, timeAgo, tpl } from "./taxonomy";
import LogDetail, { OutcomeChip, SourceChip } from "./LogDetail";

/**
 * One event, opened beside the register.
 *
 * NOT a modal, and not an in-place expansion either. The reader is scanning a
 * sequence — who did what, then what happened next — and both of the obvious
 * designs break that: a modal hides the sequence, an expansion pushes it down
 * by the height of whatever was opened, so the row under the pointer is never
 * the row that was there a moment ago. The panel takes the right edge, the
 * table stays where it was, and ↑ ↓ walk the rows without leaving it.
 *
 * On a phone there is no "beside": the same content is a bottom sheet, the
 * shape the filters and the old category rail already use.
 */

// Where the shell's header ends — the panel starts under it, never over the
// bell and the profile menu. Read from the one <header> Layout renders rather
// than assumed: the impersonation bar and the Telegram safe-area padding both
// make it taller than its base height.
function useHeaderBottom() {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const read = () => {
      const el = document.querySelector("header");
      setTop(el ? Math.round(el.getBoundingClientRect().bottom) : 0);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return top;
}

// Only the topmost dialog answers Escape (the undo ConfirmDialog sits over this
// panel); a modal that is not our own sheet means "not ours to close".
const modalAbove = (own) => {
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  return !!dlg && dlg !== own && !(own && own.contains(dlg));
};

export default function LogPanel({ r, onClose, onPrev, onNext, hasPrev, hasNext, onUndo, busy = false }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const phone = useIsMobile(768);
  const top = useHeaderBottom();
  const rootRef = useRef(null);
  // The phone form is a bottom sheet: it rides up from the edge and back down.
  // The desktop one slides in from the right edge and back out to it.
  const setSheet = useLeaveRef(rootRef);
  const titleRef = useRef(null);

  // The heading takes focus on every event, so ↑ ↓ keep working from the panel
  // after a click, and a screen reader hears what opened.
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [r?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || modalAbove(rootRef.current)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!r) return null;

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (hasNext) onNext(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (hasPrev) onPrev(); }
  };

  const danger = r.category === "danger";
  const CatIcon = CAT_ICON[r.category];
  const title = labelOf(t, "logs.act.", r.action);

  const inner = (
    <>
      <div className="flex items-start gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: danger ? RED : "var(--text-4)" }}
          >
            {CatIcon && <CatIcon size={11} className="flex-shrink-0" />}
            <span className="truncate">{labelOf(t, "logs.cat.", r.category)}</span>
          </div>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-sm font-semibold leading-snug mt-0.5 outline-none break-words"
            style={{ color: "var(--text-1)" }}
          >
            {title}
          </h2>
        </div>
        <div className="flex-shrink-0 mt-0.5"><OutcomeChip v={r.outcome} t={t} /></div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("logs.panel.close")}
          className="p-1.5 -mr-1.5 rounded-lg flex-shrink-0"
          style={{ color: "var(--text-3)" }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Who · when · where it came from — the three anchors every event has,
          before the handler's own facts. */}
      <div
        className="grid gap-x-3 gap-y-1.5 px-4 py-3 text-xs flex-shrink-0"
        style={{ gridTemplateColumns: "64px minmax(0, 1fr)", borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text-4)" }}>{labelOf(t, "logs.col.", "who")}</span>
        <span className="min-w-0 flex items-center gap-1.5" style={{ color: "var(--text-1)" }}>
          <span className="truncate font-medium">{tl(r.actor) || r.actor_key || "—"}</span>
          {r.actor_role && (
            <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>· {roleLabel(t, r.actor_role)}</span>
          )}
          {r.via_capability && (
            <span title={tpl(t("logs.viaCapability"), { cap: r.via_capability })} className="inline-flex flex-shrink-0">
              <KeyRound size={11} style={{ color: AMBER }} />
            </span>
          )}
          {r.ghost && (
            <span title={t("logs.ghostHint")} className="inline-flex flex-shrink-0" aria-label={t("logs.ghost")}>
              <EyeOff size={11} style={{ color: "var(--text-4)" }} />
            </span>
          )}
        </span>
        <span style={{ color: "var(--text-4)" }}>{labelOf(t, "logs.col.", "time")}</span>
        <span className="tabular-nums min-w-0 truncate" style={{ color: "var(--text-1)" }}>
          {r.time || "—"} · {fmtDay(r.date)}
          <span style={{ color: "var(--text-3)" }}> · {timeAgo(r.at, t)}</span>
        </span>
        <span style={{ color: "var(--text-4)" }}>{labelOf(t, "logs.col.", "source")}</span>
        <span className="min-w-0 truncate"><SourceChip v={r.source} t={t} /></span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <LogDetail r={r} onUndo={onUndo} busy={busy} narrow />
      </div>

      <div
        className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] flex-shrink-0"
        style={{ borderTop: "1px solid var(--border)", color: "var(--text-4)" }}
      >
        <button
          type="button" onClick={onPrev} disabled={!hasPrev} aria-label={t("logs.panel.prev")}
          className="p-1.5 rounded-lg disabled:opacity-40"
          style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button" onClick={onNext} disabled={!hasNext} aria-label={t("logs.panel.next")}
          className="p-1.5 rounded-lg disabled:opacity-40"
          style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}
        >
          <ChevronDown size={13} />
        </button>
        <span className="ml-1.5 truncate hidden sm:inline">{t("logs.panel.keys")}</span>
      </div>
    </>
  );

  if (phone) {
    return createPortal(
      <div
        ref={setSheet}
        className="sheet-backdrop fixed inset-0 flex items-end justify-center"
        style={{ background: "rgba(0,0,0,0.6)", zIndex: 90 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="sheet w-full max-w-lg rounded-t-2xl flex flex-col"
          style={{
            background: "var(--bg-card)",
            borderTop: "1px solid var(--border-md)",
            maxHeight: "88vh",
            paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 0.25rem)",
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKey}
        >
          {inner}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <aside
      ref={setSheet}
      role="complementary"
      aria-label={title}
      onKeyDown={onKey}
      className="side-in fixed right-0 bottom-0 flex flex-col"
      style={{
        top,
        width: 440,
        maxWidth: "100vw",
        // Under the modals (ConfirmDialog at 50+) and the filter popovers
        // (1000); over the page and its sticky table header.
        zIndex: 40,
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border-md)",
        boxShadow: "-16px 0 40px rgba(0,0,0,0.30)",
        paddingBottom: "var(--tg-safe-bottom, 0px)",
      }}
    >
      {inner}
    </aside>,
    document.body,
  );
}
