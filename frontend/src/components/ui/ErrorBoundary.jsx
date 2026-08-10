import React from "react";
import { AlertTriangle } from "lucide-react";
import dict from "../../i18n/translations";
import ErrorScreen from "./ErrorScreen";

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
 *
 * The layout itself comes from ErrorScreen, the shared template — safe to use
 * here because it reads no context of its own, only React's own hooks, so a
 * blown-up provider still cannot take the recovery screen down with it.
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
    this.state = { hasError: false, detail: "" };
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
      <ErrorScreen
        tone="danger"
        icon={AlertTriangle}
        title={tStatic("error.title")}
        message={tStatic("error.message")}
        action={{ label: tStatic("error.reload"), onClick: this.handleReload }}
        detail={this.state.detail || "—"}
        detailLabel={tStatic("error.details")}
      />
    );
  }
}
