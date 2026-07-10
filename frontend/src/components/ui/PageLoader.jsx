// Stable public path (frontend/public/logo.png), NOT the content-hashed
// `import ... from assets/logo.png`. The hashed URL changes every build and,
// right after a redeploy, the Engintron microcache can serve a stale/negative
// entry for the new /assets/logo-<hash>.png while the long-lived /logo.png
// stays warm in every client + cache. This is the same asset the ES5 boot
// overlay in index.html uses, so all three loaders share one warm file.
const LOGO_SRC = "/logo.png";

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
