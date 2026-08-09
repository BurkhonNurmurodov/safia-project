import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, User, UserPlus, Check } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";

/**
 * "Add another profile" — the browser's answer to the Telegram role-switcher.
 *
 * Inside Telegram the same menu item runs the bot's register flow, because a new
 * profile there needs the bot to sign the claim. In a browser a profile is
 * proven by its own username + password, so the credential is asked for here and
 * the resulting session joins the wallet (utils/profileWallet.js) beside the one
 * already signed in — the current profile is NOT signed out.
 *
 * `presetUsername` + `expired` is the second entrance: a stored token that has
 * died (password reset, admin "sign out everywhere", or plain expiry) reopens
 * this dialog on that username rather than dropping the row, so one password
 * puts the profile back instead of making the person remember who was there.
 *
 * Errors render on the field, never as an alert — Telegram's iOS WebView
 * suppresses window.alert and the same bundle serves both surfaces.
 */
export default function AddProfileModal({ open, onClose, onAdded, presetUsername = "", expired = false }) {
  const { t } = useLang();

  const [username, setUsername] = useState(presetUsername);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");

  // Reopening for a different profile (or for a newly expired one) must not
  // inherit the previous attempt's typing.
  useEffect(() => {
    if (!open) return;
    setUsername(presetUsername);
    setPassword("");
    setShow(false);
    setBusy(false);
    setError("");
  }, [open, presetUsername]);

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

  async function submit(e) {
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
      // Hands over to AuthContext.addWebProfile, which stores the row and
      // reloads under the new profile — so nothing after this line runs.
      onAdded(r.data, remember);
    } catch (err) {
      setError(readError(err));
      setPassword("");
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
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissable={!busy}
      maxWidth="max-w-sm"
      icon={<UserPlus size={16} />}
      title={t(expired ? "webadd.expiredTitle" : "webadd.title")}
      subtitle={t(expired ? "webadd.expiredSubtitle" : "webadd.subtitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="addProfileForm" loading={busy} disabled={!canSubmit}>
            {t(expired ? "webadd.resume" : "webadd.submit")}
          </Button>
        </>
      }
    >
      <form id="addProfileForm" onSubmit={submit} className="space-y-4">
        <FormField label={t("weblogin.username")}>
          <div className="relative">
            <User
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-4)" }}
            />
            <input
              autoFocus={!presetUsername}
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
              autoFocus={Boolean(presetUsername)}
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

        {/* Per-profile "remember me": ticked keeps this profile on the machine
            after a restart, unticked drops it when the tab closes. Each row
            carries its own choice, so adding a colleague for one shift does not
            leave them signed in on a shared PC tomorrow. */}
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
              {t("webadd.rememberHint")}
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}
