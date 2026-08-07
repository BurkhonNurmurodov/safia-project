// Inlined base64 logo baked into the JS bundle — no network fetch, so it can
// never get stuck on a poisoned cache entry for the stable /logo.png URL. See
// assets/logoChrome.js for the full rationale.
import LOGO_SRC from "../../assets/logoChrome.js";

/**
 * Branded loading state — Safia logo + spinner.
 * Full-screen by default: the Suspense fallback while a page's code chunk
 * loads, and while auth is being resolved. With `overlay` it absolutely fills
 * the nearest positioned ancestor — Layout uses this to cover just the
 * content area during page switches so the header and sidebar stay visible.
 * Keep this component eager (never lazy) so it is always available to render
 * as a fallback.
 */
export default function PageLoader({ overlay = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 ${
        overlay ? "absolute inset-0 z-30" : "min-h-screen"
      }`}
      style={{ background: "var(--bg-base)" }}
    >
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
    </div>
  );
}
