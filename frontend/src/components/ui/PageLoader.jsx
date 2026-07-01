import logoSrc from "../../assets/logo.png";

/**
 * Full-screen branded loading state — Safia logo + spinner.
 * Used as the Suspense fallback while a page's code chunk loads, and while
 * auth is being resolved. Keep this component eager (never lazy) so it is
 * always available to render as a fallback.
 */
export default function PageLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-5"
      style={{ background: "var(--bg-base)" }}
    >
      <img
        src={logoSrc}
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
