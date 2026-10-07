// Inlined base64 logo baked into the JS bundle — no network fetch, so it can
// never get stuck on a poisoned cache entry for the stable /logo.png URL. See
// assets/logoChrome.js for the full rationale.
import { RotateCw } from "lucide-react";
import LOGO_SRC from "../../assets/logoChrome.js";
import Button from "./Button";
import { useLang } from "../../context/LangContext";
import { useStallWatch } from "../../utils/stallReport";

// Read straight off the bundle when no LangProvider is above (never the case
// today, but this component must render anywhere, before anything else).
const FALLBACK = {
  "loader.waiting": "Server javobi kutilmoqda…",
  "loader.reported": "Bu kutish haqida xabar yuborildi.",
  "loader.reload": "Qayta yuklash",
};

/**
 * Branded loading state — Safia logo + spinner.
 * Full-screen by default: the Suspense fallback while a page's code chunk
 * loads, and while auth is being resolved. With `overlay` it absolutely fills
 * the nearest positioned ancestor — Layout uses this to cover just the
 * content area during page switches so the header and sidebar stay visible.
 * Keep this component eager (never lazy) so it is always available to render
 * as a fallback.
 *
 * `where` names what it stands in front of — "auth" (the session check),
 * "access" (page access), "caps" (capabilities), "page" (a page's code) — and
 * travels in the stall report (utils/stallReport.js). A wait past HINT_MS says
 * it is waiting for the server, past RELOAD_MS it offers a reload. Nothing on
 * screen moves when they appear: they hang below the spinner, out of the flow.
 */
export default function PageLoader({ overlay = false, where = "page" }) {
  const { phase, reported } = useStallWatch(where);
  const lang = useLang();
  const t = (k) => (lang?.t ? lang.t(k) : FALLBACK[k]);
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 ${
        overlay ? "absolute inset-0 z-30" : "min-h-screen"
      }`}
      style={{ background: "var(--bg-base)" }}
    >
      {/* The hint hangs BELOW the spinner, out of the flow: the logo and the
          spinner sit exactly where they always did, from the first frame to
          the last, whatever the hint says. */}
      <div className="relative flex flex-col items-center gap-5">
        <img
          src={LOGO_SRC}
          alt="Safia"
          className="w-24 h-24 rounded-full object-cover animate-pulse"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        />
        <div
          className="w-6 h-6 border-[3px] border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--brand) transparent var(--brand) var(--brand)" }}
        />
        <div className="absolute top-full mt-5 w-72 max-w-[85vw] flex flex-col items-center gap-2 text-center"
          aria-live="polite">
          {phase >= 1 && (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              {t("loader.waiting")}
            </p>
          )}
          {phase >= 1 && reported && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("loader.reported")}
            </p>
          )}
          {phase >= 2 && (
            <Button variant="secondary" size="lg" icon={<RotateCw size={14} />}
              onClick={() => window.location.reload()}>
              {t("loader.reload")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
