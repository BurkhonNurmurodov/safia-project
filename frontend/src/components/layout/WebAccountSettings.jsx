import { useState } from "react";
import { KeyRound, Globe } from "lucide-react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { useToast } from "../ui/Toast";

const MIN_LEN = 8;

/**
 * The «Website login» block inside the header Settings panel.
 *
 * Only rendered for a BROWSER session — inside Telegram there is no password in
 * play, and showing a password form there would invite someone to change a
 * credential they never had to prove they hold (the backend refuses it too).
 *
 * Changing a password signs out every other browser, which is the point of
 * changing it. The current tab keeps working because the server hands back a
 * re-issued token.
 */
export default function WebAccountSettings({ onBeforeOpen }) {
  const { auth, replaceWebToken } = useAuth();
  const { t } = useLang();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const username = auth?.web_login?.username;

  function reset() {
    setCurrent(""); setNext(""); setRepeat(""); setError(""); setBusy(false);
  }

  async function save() {
    if (next.length < MIN_LEN) { setError(t("weblogin.tooShort")); return; }
    if (next !== repeat)       { setError(t("weblogin.mismatch")); return; }
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/web/password", {
        current_password: current,
        new_password: next,
      });
      replaceWebToken(r.data?.token);
      setOpen(false);
      reset();
      toast.success(t("weblogin.changed"));
    } catch (err) {
      // The failure stays ON the dialog: a modal that closes and reports
      // elsewhere leaves the person unsure whether anything changed.
      setError(err?.response?.status === 400 && err?.response?.data?.detail === "wrong_current_password"
        ? t("weblogin.wrongCurrent")
        : t("weblogin.saveFailed"));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--text-4)" }}>
          {t("weblogin.section")}
        </span>

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Globe size={13} style={{ color: "var(--text-4)" }} className="flex-shrink-0" />
            <span className="text-xs truncate" style={{ color: "var(--text-2)" }}>
              {username || "—"}
            </span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon={<KeyRound size={12} />}
            onClick={() => { onBeforeOpen?.(); setOpen(true); }}
          >
            {t("weblogin.changeTitle")}
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title={t("weblogin.changeTitle")}
        icon={<KeyRound size={15} />}
        maxWidth="max-w-sm"
        zIndex={10000}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={!current || !next || !repeat}
            >
              {t("weblogin.changeSubmit")}
            </Button>
          </>
        }
      >
        <FormField label={t("weblogin.current")} required>
          <PasswordInput value={current} onChange={(v) => { setCurrent(v); setError(""); }}
                         autoComplete="current-password" autoFocus />
        </FormField>
        <FormField label={t("weblogin.new")} required hint={t("weblogin.changeHint")}>
          <PasswordInput value={next} onChange={(v) => { setNext(v); setError(""); }}
                         autoComplete="new-password" />
        </FormField>
        <FormField label={t("weblogin.confirm")} required error={error || undefined}>
          <PasswordInput value={repeat} onChange={(v) => { setRepeat(v); setError(""); }}
                         autoComplete="new-password" />
        </FormField>
      </Modal>

      {toast.node}
    </>
  );
}

function PasswordInput({ value, onChange, ...rest }) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand)]"
      style={{
        background: "var(--bg-inner)",
        border: "1px solid var(--border-md)",
        color: "var(--text-1)",
      }}
      {...rest}
    />
  );
}
