import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Download } from "lucide-react";
import { Meter } from "../ui/Meter";
import { useLang } from "../../context/LangContext";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { leaveRef } from "../../utils/leave";

const SIZE = 30;      // the bell's own box beside it
const R = 12.5;
const LEN = 2 * Math.PI * R;
const PANEL_W = 320;   // the longest title and its version on ONE line (checked on a 384px phone)

/**
 * «A new version is downloading» — DRAWN, not written (the operator,
 * 2026-11-20: a person had to read a two-line toast to learn «9%», and the
 * toast covered the header for something nobody asked about).
 *
 * A small ring in the header, left of the bell, only while the Android app is
 * fetching a newer build: the arc is the percent (APK 1.8.0+), or turns while
 * the app cannot say how far it is (older apps — most phones). Pressed, it
 * opens the short labelled form: the name with the version, a bar, the
 * percent. It covers nothing, so it has no ×. The moment the build is whole
 * the ring goes and UpdatePrompt's «ready — Yangilash» toast says so itself.
 */
export default function UpdateRing() {
  const { show, showComing, comingVersion, comingPct, comingFailed } = useAppUpdate();
  if (show || !showComing) return null;
  // Its own component, so an open panel's state goes when the ring does.
  return <Ring version={comingVersion ? `v${comingVersion}` : ""} pct={comingPct} failed={comingFailed} />;
}

function Ring({ version, pct, failed }) {
  const { t } = useLang();
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);   // null = closed
  const close = useCallback(() => setPos(null), []);

  // The panel is fixed under the ring, kept inside the screen: the ring is not
  // the rightmost thing in the bar, so a right-anchored box ran off the left
  // edge of a 360px phone.
  function toggle() {
    if (pos) { close(); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(PANEL_W, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - width, window.innerWidth - 12 - width));
    setPos({ top: r.bottom + 8, left, width, originX: r.left + r.width / 2 - left });
  }

  useEffect(() => {
    if (!pos) return undefined;
    const onDown = (e) => { if (!btnRef.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  const known = pct !== null && !failed;
  const title = t("ui.version.downloading");
  const failedText = t("ui.version.comingFailed").replace("{v}", version);
  const label = failed ? failedText : [title, version, known ? `${pct}%` : ""].filter(Boolean).join(", ");
  const Icon = failed ? AlertTriangle : Download;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="relative flex items-center justify-center rounded-full after:absolute after:-inset-2 after:content-['']"
        style={{ width: SIZE, height: SIZE, color: failed ? "var(--status-warn)" : "var(--brand)" }}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={Boolean(pos)}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden
             className={`absolute inset-0 ${known || failed ? "" : "animate-spin"}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                  stroke={failed ? "currentColor" : "var(--border-md)"} strokeWidth="2.5" />
          {!failed && (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    strokeDasharray={`${(known ? Math.max(2, pct) / 100 : 0.25) * LEN} ${LEN}`} />
          )}
        </svg>
        <Icon size={14} />
      </button>

      {pos && createPortal(
        <div
          ref={leaveRef}
          role="dialog"
          aria-label={title}
          className="pop rounded-xl px-3.5 py-3"
          style={{
            position: "fixed",
            zIndex: 60,
            top: pos.top,
            left: pos.left,
            width: pos.width,
            transformOrigin: `${pos.originX}px 0`,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          }}
        >
          {failed ? (
            <div className="text-sm" style={{ color: "var(--text-1)" }}>{failedText}</div>
          ) : (
            <>
              <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                {title}
                {version && <span className="ml-1.5 text-xs font-normal tabular-nums" style={{ color: "var(--text-3)" }}>{version}</span>}
              </div>
              {known && (
                <div className="flex items-center gap-3 mt-2.5">
                  <div className="flex-1 min-w-0"><Meter value={pct} label={`${pct}%`} /></div>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{pct}%</span>
                </div>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
