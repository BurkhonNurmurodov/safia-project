import { useState } from "react";
import { Eye, EyeOff, Lock, User, ArrowLeft, Send, Check } from "lucide-react";
// Inlined base64 logo baked into the JS bundle — same reasoning as the sidebar:
// the stable /logo.png URL can be poisoned by the host's anti-bot layer, and the
// login screen is the one place where a broken logo is the whole first
// impression. See assets/logoChrome.js.
import LOGO_SRC from "../assets/logoChrome.js";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import SegmentedToggle from "../components/ui/SegmentedToggle";

const LANGS = [
  { value: "uz",      label: "UZ" },
  { value: "uz_cyrl", label: "ЎЗ" },
  { value: "ru",      label: "RU" },
  { value: "en",      label: "EN" },
];

/**
 * Password login for the browser — the screen a person lands on when the app is
 * opened outside Telegram.
 *
 * Deliberately one job: sign in. The only other things on it are the language
 * picker (this screen renders before any profile is known, so the visitor's own
 * language has to be selectable here) and the recovery link, which swaps the
 * card's contents in place rather than navigating away — a person who has just
 * failed to log in should not also lose the page they were on.
 *
 * Errors render on the field or under the button, never as an alert: Telegram's
 * iOS WebView suppresses window.alert outright, and the same code serves both
 * surfaces.
 */
export default function WebLogin({ onSuccess }) {
  const { t, lang, setLang } = useLang();

  const [mode,     setMode]     = useState("login"); // "login" | "forgot"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [sent,     setSent]     = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  function readError(err) {
    const status = err?.response?.status;
    const detail = String(err?.response?.data?.detail || "");
    if (status === 423 && detail.startsWith("locked:")) {
      const mins = Math.max(1, Math.ceil(Number(detail.split(":")[1] || 0) / 60));
      return t("weblogin.locked").replace("{min}", mins);
    }
    if (status === 429) return t("weblogin.throttled");
    if (status === 403) return t("weblogin.unavailable");
    if (status === 401) return t("weblogin.invalid");
    if (!err?.response)  return t("weblogin.netError");
    return t("weblogin.invalid");
  }

  async function submitLogin(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/web/login", {
        username: username.trim(),
        password,
        remember,
      });
      onSuccess(r.data, remember);
    } catch (err) {
      setError(readError(err));
      setPassword("");
      setBusy(false);
    }
  }

  async function submitForgot(e) {
    e.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/web/forgot", { username: username.trim() });
      setSent(true);
    } catch (err) {
      // 429 is the only failure worth showing: everything else answers ok on
      // purpose, so that this form can't be used to find out who has an account.
      setError(err?.response?.status === 429 ? t("weblogin.throttled") : t("weblogin.netError"));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: "var(--bg-inner)",
    border: "1px solid var(--border-md)",
    color: "var(--text-1)",
  };
  const inputClass =
    "w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none transition-colors " +
    "focus:border-[var(--brand)]";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full" style={{ maxWidth: 380 }}>
        {/* Brand — the only decoration on the screen, and the one thing that
            tells a visitor they are in the right place before they can read. */}
        <div className="flex flex-col items-center mb-7">
          <img src={LOGO_SRC} alt="" className="h-12 w-auto mb-4" />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-1)" }}>
            {t("weblogin.title")}
          </h1>
          <p className="text-sm mt-1.5 text-center" style={{ color: "var(--text-3)" }}>
            {mode === "login" ? t("weblogin.subtitle") : t("weblogin.forgotBody")}
          </p>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {mode === "login" ? (
            <form onSubmit={submitLogin} className="space-y-4">
              <FormField label={t("weblogin.username")}>
                <div className="relative">
                  <User
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-4)" }}
                  />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    placeholder={t("weblogin.usernamePh")}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </FormField>

              <FormField label={t("weblogin.password")} error={error || undefined}>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-4)" }}
                  />
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    placeholder={t("weblogin.passwordPh")}
                    autoComplete="current-password"
                    className={inputClass + " !pr-10"}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={t(show ? "weblogin.hidePassword" : "weblogin.showPassword")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg"
                    style={{ color: "var(--text-3)" }}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </FormField>

              {/* Remember me — a real checkbox so it is keyboard-reachable and
                  announced; the label is the hit area, which matters at 375px. */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <span
                  className="mt-0.5 w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    background: remember ? "var(--brand)" : "var(--bg-inner)",
                    border: `1px solid ${remember ? "var(--brand)" : "var(--border-md)"}`,
                  }}
                >
                  {remember && <Check size={12} color="#fff" strokeWidth={3} />}
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only"
                  />
                </span>
                <span className="leading-tight">
                  <span className="text-sm" style={{ color: "var(--text-2)" }}>
                    {t("weblogin.remember")}
                  </span>
                  <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                    {t("weblogin.rememberHint")}
                  </span>
                </span>
              </label>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                disabled={!canSubmit}
                className="w-full justify-center"
              >
                {t("weblogin.submit")}
              </Button>

              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(""); setPassword(""); }}
                className="w-full text-center text-xs underline pt-0.5"
                style={{ color: "var(--text-3)" }}
              >
                {t("weblogin.forgot")}
              </button>
            </form>
          ) : sent ? (
            <div className="text-center py-2">
              <div
                className="w-11 h-11 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: "rgba(34,197,94,0.12)" }}
              >
                <Send size={18} color="#22c55e" />
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                {t("weblogin.forgotSent")}
              </p>
              <Button
                variant="secondary"
                size="lg"
                className="w-full justify-center mt-5"
                icon={<ArrowLeft size={14} />}
                onClick={() => { setMode("login"); setSent(false); setError(""); }}
              >
                {t("weblogin.back")}
              </Button>
            </div>
          ) : (
            <form onSubmit={submitForgot} className="space-y-4">
              <FormField label={t("weblogin.username")} error={error || undefined}>
                <div className="relative">
                  <User
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--text-4)" }}
                  />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    placeholder={t("weblogin.usernamePh")}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </FormField>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                disabled={!username.trim()}
                className="w-full justify-center"
              >
                {t("weblogin.forgotSubmit")}
              </Button>

              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="w-full text-center text-xs underline"
                style={{ color: "var(--text-3)" }}
              >
                {t("weblogin.back")}
              </button>
            </form>
          )}
        </div>

        <div className="flex justify-center mt-6">
          <SegmentedToggle
            size="sm"
            value={lang}
            onChange={setLang}
            options={LANGS}
          />
        </div>
      </div>
    </div>
  );
}
