import React from "react";
import { AlertTriangle } from "lucide-react";
import dict from "../../i18n/translations";

/**
 * App-wide error boundary.
 *
 * A render-time exception anywhere below this point would otherwise unmount the
 * whole React tree (white screen). Here we catch it and show a calm, branded
 * recovery card — mirroring the boot recovery screen in index.html — with a
 * reload button and the technical details tucked behind a toggle instead of in
 * the user's face. Kept dependency-light (no context/hooks) so it still works
 * even if a provider is what threw — it reads the language from localStorage and
 * looks keys up in the static dictionary directly (mirroring the t() fallback
 * chain: lang → uz for uz_cyrl → en → key).
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
    this.state = { hasError: false, showDetails: false, detail: "" };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in console for remote debugging via Telegram Desktop devtools.
    console.error("[ErrorBoundary]", error, info?.componentStack);
    const detail = [String(error?.stack || error), info?.componentStack]
      .filter(Boolean)
      .join("\n");
    this.setState({ detail });
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
          background: "var(--bg-inner)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 9999,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(239,68,68,0.12)",
            }}
          >
            <AlertTriangle size={28} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: "var(--text-1)" }}>
            {tStatic("error.title")}
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20, color: "var(--text-3)" }}>
            {tStatic("error.message")}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: "var(--brand)",
              color: "#1a1206",
            }}
          >
            {tStatic("error.reload")}
          </button>
          <button
            onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
            style={{
              marginTop: 12,
              background: "none",
              border: "none",
              color: "var(--text-3)",
              fontSize: 12,
              cursor: "pointer",
              opacity: 0.75,
            }}
          >
            {tStatic("error.details")}
          </button>
          {this.state.showDetails && (
            <pre
              style={{
                marginTop: 10,
                textAlign: "left",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--text-3)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {this.state.detail || "—"}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
