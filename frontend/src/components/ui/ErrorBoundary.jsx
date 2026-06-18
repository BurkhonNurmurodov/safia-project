import React from "react";
import dict from "../../i18n/translations";

/**
 * App-wide error boundary.
 *
 * A render-time exception anywhere below this point would otherwise unmount the
 * whole React tree (white screen). Here we catch it and show a recoverable card
 * with a reload button instead. Kept dependency-free (no context/hooks) so it
 * still works even if a provider is what threw — so it reads the language from
 * localStorage and looks keys up in the static dictionary directly (mirroring
 * the t() fallback chain: lang → uz for uz_cyrl → en → key).
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
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in console for remote debugging via Telegram Desktop devtools.
    console.error("[ErrorBoundary]", error, info?.componentStack);
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

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "var(--bg-base, #0b0e1a)",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: "var(--text-1, #e2e8f0)" }}>
            {tStatic("error.title")}
          </h2>
          <p style={{ fontSize: 13, marginBottom: 20, color: "var(--text-3, #94a3b8)" }}>
            {tStatic("error.message")}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: "var(--brand, #C8973F)",
              color: "#fff",
            }}
          >
            {tStatic("error.reload")}
          </button>
        </div>
      </div>
    );
  }
}
