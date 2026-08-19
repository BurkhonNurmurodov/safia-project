import React from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import dict from "../../i18n/translations";
import ErrorScreen from "./ErrorScreen";
import api from "../../utils/api";
import { APP_VERSION } from "../../utils/version";
import { useAuth } from "../../context/AuthContext";

/**
 * Error boundary.
 *
 * A render-time exception below this point would otherwise unmount the whole
 * React tree (white screen). Here we catch it and show a calm, branded recovery
 * card — mirroring the boot recovery screen in index.html.
 *
 * Three rules this screen is built around, all learned the same way (a crash
 * reached an ordinary user, who reported it by screenshot):
 *
 *  1. It is a LAST resort, not the first one. Boundaries are scoped — see
 *     ScopedErrorBoundary below — so a page that throws costs that page, not
 *     the session. Navigating away recovers with no reload at all.
 *  2. It says nothing technical to a person who cannot act on it. The minified
 *     stack behind «Texnik ma'lumot» is developer material and is shown only to
 *     admins; everyone else gets one sentence and a button.
 *  3. It tells us itself. componentDidCatch posts to /api/crash-report, so the
 *     failure arrives with its component stack, its page and its version
 *     BEFORE a user thinks to mention it. Reporting is fire-and-forget and can
 *     never throw — the second failure in an error handler is how a recovery
 *     screen turns back into a white one.
 *
 * Kept dependency-light (no hooks/context of its own) so it still works when a
 * provider is what threw: it reads the language from localStorage and looks
 * keys up in the static dictionary directly, mirroring the t() fallback chain
 * (lang → uz for uz_cyrl → en → key). The hooks live in the wrapper.
 */
function tStatic(key) {
  let lang = "uz";
  try { lang = localStorage.getItem("lang") || "uz"; } catch { /* storage blocked */ }
  return (
    dict[lang]?.[key] ??
    (lang === "uz_cyrl" ? dict["uz"]?.[key] : undefined) ??
    dict["en"]?.[key] ??
    key
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, detail: "", reported: false, key: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /**
   * Leaving the page that broke is the cheapest recovery there is, so a change
   * of resetKey (the route path) clears the boundary. Without this the screen
   * outlives the thing it was about: the user taps another section, the URL
   * changes, and the crash card stays up until a reload.
   */
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey === state.key) return null;
    return { key: props.resetKey, hasError: false, detail: "", reported: false };
  }

  componentDidCatch(error, info) {
    // Surface in console for remote debugging via Telegram Desktop devtools.
    console.error("[ErrorBoundary]", error, info?.componentStack);
    const detail = [String(error?.stack || error), info?.componentStack]
      .filter(Boolean)
      .join("\n");
    this.setState({ detail });

    try {
      api.post("/api/crash-report", {
        message: String(error?.message || error || "").slice(0, 500),
        stack: String(error?.stack || "").slice(0, 3000),
        component: String(info?.componentStack || "").slice(0, 2000),
        url: String(window.location.pathname + window.location.search).slice(0, 500),
        version: APP_VERSION,
        ua: String(navigator.userAgent || "").slice(0, 500),
      })
        // Only claim it was reported once it actually was. "We know about this"
        // is the one reassurance on the screen; saying it on a request that
        // never landed would make the screen a liar on the worst minute of
        // someone's shift.
        .then(() => this.setState({ reported: true }))
        .catch(() => { /* offline, throttled, logged server-side either way */ });
    } catch { /* reporting must never become the second failure */ }
  }

  handleReload = () => {
    this.setState({ hasError: false });
    const tg = window.Telegram?.WebApp;
    // In Telegram we can't truly reload the bundle; a soft state reset + route
    // to root is the safest recovery. Fall back to a hard reload in a browser.
    if (tg) {
      window.location.assign("/");
    } else {
      window.location.reload();
    }
  };

  handleRetry = () => this.setState({ hasError: false, detail: "", reported: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    const { inline = false, showDetail = false } = this.props;
    const atRoot = window.location.pathname === "/";

    return (
      <ErrorScreen
        tone="danger"
        icon={AlertTriangle}
        inline={inline}
        title={tStatic(inline ? "error.pageTitle" : "error.title")}
        message={tStatic(inline ? "error.pageMessage" : "error.message")}
        // Inline, the chrome around this card is still alive and the nav IS the
        // escape hatch (same reasoning as the in-Layout 404), so one button is
        // enough — and it re-renders rather than reloading, which keeps every
        // other page's fetched data.
        action={
          inline
            ? { label: tStatic("error.retry"), onClick: this.handleRetry }
            : { label: tStatic("error.reload"), onClick: this.handleReload }
        }
        secondary={
          !inline && !atRoot
            ? { label: tStatic("error.home"), onClick: () => window.location.assign("/") }
            : null
        }
        // A minified React stack is not information to a brigadir on a phone —
        // it is noise that makes a handled failure look like a broken product.
        detail={showDetail ? (this.state.detail || "—") : null}
        detailLabel={tStatic("error.details")}
      >
        {this.state.reported && (
          <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {tStatic("error.reported")}
          </p>
        )}
      </ErrorScreen>
    );
  }
}

/**
 * THE boundary to use anywhere inside the app shell — never hand-place the bare
 * class. It supplies the two things the class deliberately cannot read itself:
 * the current route (so navigating away clears the screen) and whether the
 * viewer is an admin (so the stack is shown to the one person who can act on
 * it). `inline` picks the in-Layout card over the full-screen one.
 */
export function ScopedErrorBoundary({ inline = false, children }) {
  const { pathname } = useLocation();
  const { auth } = useAuth() || {};
  return (
    <ErrorBoundary resetKey={pathname} inline={inline} showDetail={auth?.role === "admin"}>
      {children}
    </ErrorBoundary>
  );
}
