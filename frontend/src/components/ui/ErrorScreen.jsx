import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Button from "./Button";

/**
 * THE template for every full-screen "you cannot see the page you asked for"
 * state — 404, no access, a crash, offline, and each blocked auth status.
 *
 * Before this existed the app had eight hand-rolled copies of the same centred
 * div (seven in App.jsx, one in ErrorBoundary), and they had drifted: three
 * different max-widths, two different button text colours, two different page
 * backgrounds, and a raw emoji as the lead visual on every one of them. These
 * are the screens a user hits on their worst minute of the shift, so they are
 * exactly the ones that must look like the rest of the product.
 *
 * The shape, top to bottom: tinted icon chip → status code → title → one
 * sentence of plain language → ONE primary action → an escape hatch → the
 * technical detail, collapsed. Nothing else. A person who cannot get to their
 * data wants to know what happened and what to tap, in that order.
 *
 * Props:
 *   tone      – "danger"  something broke (crash, 500, rejected)
 *               "warning" blocked but resolvable by the user (offline, update,
 *                         waiting for approval)
 *               "neutral" nothing is broken, the thing just is not there
 *                         (404, no pages assigned) — slate, the same grey the
 *                         status palette uses for "not started"
 *               "brand"   an invitation, not a fault (come and register)
 *   icon      – lucide component (not an element), rendered inside the chip
 *   code      – short status label above the title ("404"). Optional; it gives
 *               the screen an identity without a giant balloon numeral.
 *   title     – the <h1>. One line.
 *   message   – one sentence: what happened, and what it means for them.
 *   action    – primary: { label, onClick } or { label, href }
 *   secondary – escape hatch: { label, onClick } or { label, href }
 *   detail    – technical text behind a disclosure (stack, user agent)
 *   detailLabel – the disclosure's label
 *   footnote  – tiny muted line at the very bottom (version numbers, etc.)
 *   live      – "alert" for a genuine failure, "status" for a calm state
 *   inline    – drop the full-viewport wrapper and the page background, for a
 *               screen rendered INSIDE Layout (the 404 keeps the sidebar, so
 *               the nav itself is the escape hatch). Standalone screens — the
 *               blocked auth states, the crash — render outside Layout and
 *               keep the default.
 *   children  – extra controls between message and action (e.g. the role
 *               switcher on the no-access screen)
 */

const TONES = {
  danger:  "#ef4444",
  warning: "#eab308",
  neutral: "#94a3b8",
  brand:   "var(--brand-text)",
};

const TONE_BG = {
  danger:  "rgba(239,68,68,0.12)",
  warning: "rgba(234,179,8,0.12)",
  neutral: "rgba(148,163,184,0.12)",
  brand:   "var(--brand-bg)",
};

export default function ErrorScreen({
  tone = "danger",
  icon: Icon,
  code = null,
  title = null,
  message = null,
  action = null,
  secondary = null,
  detail = null,
  detailLabel = "Details",
  footnote = null,
  live = "alert",
  inline = false,
  children = null,
}) {
  const [open, setOpen] = useState(false);
  const primaryRef = useRef(null);
  const color = TONES[tone] ?? TONES.danger;

  // Land the caret on the way out. The screen replaces whatever the user was
  // looking at, so without this a keyboard user is left focused on a node that
  // no longer exists and has to tab in from the top of the document.
  useEffect(() => {
    primaryRef.current?.focus?.();
  }, []);

  return (
    <div
      className={`flex items-center justify-center px-6 ${inline ? "" : "min-h-screen"}`}
      style={
        inline
          ? { minHeight: "60vh", paddingTop: 24, paddingBottom: 24 }
          : {
              background: "var(--bg-base)",
              paddingTop: "max(24px, var(--tg-safe-top, 0px))",
              paddingBottom: "max(24px, var(--tg-safe-bottom, 0px))",
            }
      }
    >
      <div className="err-screen w-full text-center page-enter" style={{ maxWidth: 340 }} role={live === "alert" ? "alert" : "status"}>
        {Icon && (
          <div
            className="grid place-items-center rounded-full"
            style={{ width: 64, height: 64, margin: "0 auto 16px", background: TONE_BG[tone] ?? TONE_BG.danger, color }}
          >
            <Icon size={26} strokeWidth={2.2} aria-hidden="true" />
          </div>
        )}

        {code && (
          <div
            className="text-[11px] font-semibold uppercase mb-1.5"
            style={{ color: "var(--text-4)", letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" }}
          >
            {code}
          </div>
        )}

        {title && (
          <h1 className="text-[17px] font-semibold mb-2" style={{ color: "var(--text-1)" }}>
            {title}
          </h1>
        )}

        {/* --text-2, not the --text-3 these screens used to use: on the dark
            base that grey lands at ~4.1:1, under AA, and this sentence is the
            one thing on the page that has to be read — often on a phone, on a
            factory floor, by someone whose shift just stopped working. */}
        {message && (
          <p className="text-[13px] mx-auto" style={{ color: "var(--text-2)", lineHeight: 1.6, maxWidth: "34ch" }}>
            {message}
          </p>
        )}

        {children && <div className="mt-6">{children}</div>}

        {action && (
          <div className="mt-6">
            <Button
              ref={primaryRef}
              size="lg"
              variant="primary"
              className="w-full"
              href={action.href}
              onClick={action.onClick}
              icon={action.icon}
            >
              {action.label}
            </Button>
          </div>
        )}

        {secondary && (
          <div className="mt-2.5">
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              href={secondary.href}
              onClick={secondary.onClick}
              icon={secondary.icon}
            >
              {secondary.label}
            </Button>
          </div>
        )}

        {detail && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-[12px] mx-auto"
              style={{ color: "var(--text-4)" }}
            >
              {detailLabel}
              <ChevronDown
                size={13}
                style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease-io)" }}
                aria-hidden="true"
              />
            </button>
            {open && (
              <pre
                className="mt-2 text-left text-[11px] rounded-xl px-3 py-2.5"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-3)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 180,
                  overflow: "auto",
                }}
              >
                {detail}
              </pre>
            )}
          </div>
        )}

        {footnote && (
          <p className="text-[10px] mt-6" style={{ color: "var(--text-4)", wordBreak: "break-word" }}>
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}
