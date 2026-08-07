import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, RotateCcw, LogOut, Ban, Check, Trash2, Clock } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";

/**
 * Manage one profile's browser login.
 *
 * Everything about a web login lives behind ONE row action rather than four
 * chips in the table: these operations are rare, consequential, and easier to
 * choose between when they are described next to each other than when they are
 * competing for width in a cell.
 *
 * The password is never displayed. It is generated (or typed) here, hashed
 * server-side, and delivered only to the profile's Telegram holders — so
 * running this tab never means learning someone's password, and there is no
 * "copy it before you close this" moment to get wrong.
 */
export default function WebLoginModal({ item, profileName, onClose, onDone }) {
  const { t } = useLang();
  const web = item?.web || null;

  const [username, setUsername] = useState(web?.username || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(null); // "reset" | "delete"

  useEffect(() => {
    setUsername(web?.username || "");
    setPassword("");
    setError("");
    setNotice("");
  }, [web?.username]);

  const deliverable = web ? web.deliverable : true;

  function fail(e) {
    const detail = e?.response?.data?.detail;
    if (detail === "username_taken") return setError(t("weblogin.taken"));
    if (detail === "no_holder")      return setError(t("weblogin.noHolder"));
    setError(typeof detail === "string" ? detail : t("weblogin.saveFailed"));
  }

  const post = (url, body) => api.post(url, { profile_key: item.profile_key, ...body });

  const createMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login", {
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    }),
    onSuccess: () => { onDone(t("weblogin.sent")); onClose(); },
    onError: fail,
  });

  const renameMut = useMutation({
    mutationFn: () => api.put("/api/profiles/admin/web-login",
      { profile_key: item.profile_key, username: username.trim() }),
    onSuccess: () => { setNotice(t("weblogin.changed")); onDone(); },
    onError: fail,
  });

  const resetMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login", {}),
    onSuccess: () => { setConfirm(null); onDone(t("weblogin.sent")); onClose(); },
    onError: (e) => { setConfirm(null); fail(e); },
  });

  const toggleMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login/toggle", {}),
    onSuccess: () => { onDone(); onClose(); },
    onError: fail,
  });

  const revokeMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login/revoke", {}),
    onSuccess: () => { onDone(t("weblogin.revoked")); onClose(); },
    onError: fail,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete("/api/profiles/admin/web-login",
      { data: { profile_key: item.profile_key } }),
    onSuccess: () => { setConfirm(null); onDone(); onClose(); },
    onError: (e) => { setConfirm(null); fail(e); },
  });

  const busy = createMut.isPending || renameMut.isPending || resetMut.isPending ||
               toggleMut.isPending || revokeMut.isPending || deleteMut.isPending;

  const renamed = web && username.trim() && username.trim() !== web.username;

  return (
    <>
      <Modal
        open={!confirm}
        onClose={onClose}
        title={t("weblogin.formTitle")}
        subtitle={profileName}
        icon={<KeyRound size={15} />}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            {web ? (
              <Button onClick={() => renameMut.mutate()} loading={renameMut.isPending}
                      disabled={!renamed || busy}>
                {t("weblogin.rename")}
              </Button>
            ) : (
              <Button onClick={() => createMut.mutate()} loading={createMut.isPending}
                      disabled={busy || !deliverable}>
                {t("weblogin.create")}
              </Button>
            )}
          </>
        }
      >
        {/* A profile nobody holds in Telegram has nowhere to receive its
            password, so say that instead of offering a login that could never
            be delivered. */}
        {!deliverable && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-snug"
               style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)", color: "#eab308" }}>
            <Ban size={13} className="flex-shrink-0 mt-px" />
            <span>{t("weblogin.noHolder")}</span>
          </div>
        )}

        <FormField
          label={t("weblogin.username")}
          hint={web ? undefined : t("weblogin.usernameHint")}
          error={error || undefined}
        >
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            placeholder={t("weblogin.usernamePh")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-[var(--brand)]"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
          />
        </FormField>

        {!web && (
          <FormField label={t("weblogin.password")} hint={t("weblogin.passwordHint")}>
            <input
              type="text"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              autoComplete="off"
              className="w-full rounded-xl px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-[var(--brand)]"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
        )}

        {web && (
          <>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
              <Clock size={12} style={{ color: "var(--text-4)" }} />
              <span>
                {t("weblogin.lastLogin")}:{" "}
                {web.last_login_at
                  ? new Date(web.last_login_at).toLocaleString()
                  : t("weblogin.never")}
              </span>
            </div>

            {notice && (
              <p className="text-[11px] font-medium" style={{ color: "#22c55e" }}>{notice}</p>
            )}

            {/* Existing-login operations, ordered least to most destructive. */}
            <div className="pt-1 grid grid-cols-2 gap-2">
              <Button size="sm" tint variant="primary" icon={<RotateCcw size={11} />}
                      disabled={busy} onClick={() => setConfirm("reset")}>
                {t("weblogin.reset")}
              </Button>
              <Button size="sm" tint variant="secondary" icon={<LogOut size={11} />}
                      loading={revokeMut.isPending} disabled={busy}
                      onClick={() => revokeMut.mutate()}>
                {t("weblogin.revoke")}
              </Button>
              <Button size="sm" tint variant={web.enabled ? "secondary" : "success"}
                      icon={web.enabled ? <Ban size={11} /> : <Check size={11} />}
                      loading={toggleMut.isPending} disabled={busy}
                      onClick={() => toggleMut.mutate()}>
                {t(web.enabled ? "weblogin.disable" : "weblogin.enable")}
              </Button>
              <Button size="sm" tint variant="danger" icon={<Trash2 size={11} />}
                      disabled={busy} onClick={() => setConfirm("delete")}>
                {t("weblogin.delete")}
              </Button>
            </div>
          </>
        )}

      </Modal>

      <ConfirmDialog
        open={confirm === "reset"}
        title={t("weblogin.resetTitle")}
        message={t("weblogin.resetBody")}
        confirmLabel={t("weblogin.reset")}
        loading={resetMut.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => resetMut.mutate()}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        tone="danger"
        title={t("weblogin.deleteTitle")}
        message={t("weblogin.deleteBody")}
        confirmLabel={t("weblogin.delete")}
        loading={deleteMut.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => deleteMut.mutate()}
      />
    </>
  );
}
