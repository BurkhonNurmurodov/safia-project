import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, ArrowLeft, Ban, Camera, Check, Clock,
  Factory as FactoryIcon, Flag, Globe, Hash, IdCard, KeyRound, Languages,
  LayoutGrid, Link2, LogOut, Pencil, Plus, RotateCcw, Shield, Star, Trash2,
  UserCog, UserRound, Users, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import api from "../utils/api";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import StyledSelect from "../components/ui/StyledSelect";
import LangTextInput from "../components/ui/LangTextInput";
import ProfileAvatar, { useMyProfileDetails } from "../components/ui/ProfileAvatar";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { useTranslit, transliterate, convertFromUz } from "../utils/transliterate";
import { cellName } from "../utils/cellName";
import { ROLE_LABEL_KEYS } from "../config/pages";

/**
 * /profile — the person's own profile card (every role), and
 * /profile/:ptype/:pid — the ADMIN management view of one profile, which the
 * admin Profiles tab now navigates to instead of opening an edit modal.
 *
 * Own view is read-only except the web password: profile facts are the
 * identity register's business, and the register lives with the admins. The
 * password form works from BOTH surfaces — a browser session proves the
 * current password, a Telegram session's initData is the same proof the
 * password was originally delivered against, so it asks only for the new one.
 */

const TYPE_META = {
  "top-manager":   { listKey: "top_managers",   icon: Star },
  "shift-manager": { listKey: "shift_managers", icon: UserCog },
  supervisor:      { listKey: "supervisors",    icon: Users },
  leader:          { listKey: "leaders",        icon: Flag },
  admin:           { listKey: "admins",         icon: Shield },
  guest:           { listKey: "guests",         icon: UserRound },
};
const NAME_LANGS = ["uz_cyrl", "ru", "en"];
const MIN_PW_LEN = 8;

const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--border-md)",
  color: "var(--text-1)",
};

// ── shared building blocks ────────────────────────────────────────────────────

function Card({ icon, title, subtitle, right, children, className = "", bodyClassName = "px-4 py-4" }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <SectionHead icon={icon} title={title} subtitle={subtitle} right={right} />
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children, top = false }) {
  return (
    <div className={`flex ${top ? "items-start" : "items-center"} justify-between gap-3 py-2`}
         style={{ borderBottom: "1px solid var(--border)" }}>
      <span className={`flex ${top ? "items-start" : "items-center"} gap-2 flex-shrink-0`}>
        {Icon && <Icon size={13} className={top ? "mt-0.5" : ""} style={{ color: "var(--text-4)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </span>
      <span className="min-w-0 text-right text-xs" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

function RoleChip({ role }) {
  const { t } = useLang();
  const Icon = TYPE_META[role]?.icon || UserRound;
  const tkey = ROLE_LABEL_KEYS[role];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--border)" }}>
      <Icon size={11} />
      {tkey ? t(tkey) : role}
    </span>
  );
}

function StatusTag({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function HolderChip({ b, meLabel, onUnassign, disabled }) {
  const label = b.tg_name || b.user_name || (b.username ? `@${b.username}` : b.telegram_id);
  const pending = b.status === "pending";
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={pending
        ? { background: "rgba(234,179,8,0.12)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)" }
        : { background: "rgba(34,197,94,0.10)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.22)" }}
      title={b.username ? `@${b.username}` : String(b.telegram_id)}
    >
      {label}
      {b.is_me && meLabel && <span className="opacity-75">· {meLabel}</span>}
      {pending && meLabel === undefined && <span className="opacity-80">…</span>}
      {onUnassign && !pending && (
        <button onClick={onUnassign} disabled={disabled}
                className="rounded-full p-0.5 hover:bg-[var(--bg-accent)] transition-colors">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function factoryLabel(f, lang) {
  if (!f) return null;
  return f[`name_${lang}`] || f.name_ru || f.name_uz || f.code;
}

// ── password change (own view; both surfaces) ─────────────────────────────────

function PasswordInput({ value, onChange, ...rest }) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand)]"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
      {...rest}
    />
  );
}

function ChangePasswordModal({ open, onClose, onChanged }) {
  const { webSession, replaceWebToken } = useAuth();
  const { t } = useLang();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setCurrent(""); setNext(""); setRepeat(""); setError(""); setBusy(false);
  }

  async function save() {
    if (next.length < MIN_PW_LEN) { setError(t("weblogin.tooShort")); return; }
    if (next !== repeat) { setError(t("weblogin.mismatch")); return; }
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/web/password", {
        current_password: webSession ? current : undefined,
        new_password: next,
      });
      if (r.data?.token) replaceWebToken(r.data.token);
      onClose();
      reset();
      onChanged();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      // The failure stays ON the dialog — a modal that closes and reports
      // elsewhere leaves the person unsure whether anything changed.
      if (detail === "wrong_current_password") setError(t("weblogin.wrongCurrent"));
      else if (detail === "login_disabled")    setError(t("profile.loginDisabled"));
      else if (detail === "no_web_login")      setError(t("profile.noWebLogin"));
      else setError(t("weblogin.saveFailed"));
      setBusy(false);
    }
  }

  const filled = webSession ? current && next && repeat : next && repeat;

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) { onClose(); reset(); } }}
      title={t("weblogin.changeTitle")}
      icon={<KeyRound size={15} />}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => { onClose(); reset(); }} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!filled}>
            {t("weblogin.changeSubmit")}
          </Button>
        </>
      }
    >
      {webSession ? (
        <FormField label={t("weblogin.current")} required>
          <PasswordInput value={current} onChange={(v) => { setCurrent(v); setError(""); }}
                         autoComplete="current-password" autoFocus />
        </FormField>
      ) : (
        // Telegram session: initData is the identity proof (the same proof the
        // password is DELIVERED against), so only the new password is asked.
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {t("profile.tgChangeHint")}
        </p>
      )}
      <FormField label={t("weblogin.new")} required hint={t("weblogin.changeHint")}>
        <PasswordInput value={next} onChange={(v) => { setNext(v); setError(""); }}
                       autoComplete="new-password" autoFocus={!webSession} />
      </FormField>
      <FormField label={t("weblogin.confirm")} required error={error || undefined}>
        <PasswordInput value={repeat} onChange={(v) => { setRepeat(v); setError(""); }}
                       autoComplete="new-password" />
      </FormField>
    </Modal>
  );
}

// ── web-login card (shared shell; own = read-only + change, admin = manage) ───

function WebLoginStatus({ web }) {
  const { t } = useLang();
  if (!web) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {web.enabled
        ? <StatusTag color="#22c55e">{t("profile.loginEnabled")}</StatusTag>
        : <StatusTag color="#94a3b8">{t("weblogin.disabledTag")}</StatusTag>}
      {web.locked && <StatusTag color="#eab308">{t("weblogin.lockedTag")}</StatusTag>}
    </span>
  );
}

function LastLogin({ web }) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
      <Clock size={12} style={{ color: "var(--text-4)" }} />
      <span>
        {t("weblogin.lastLogin")}:{" "}
        {web.last_login_at ? new Date(web.last_login_at).toLocaleString() : t("weblogin.never")}
      </span>
    </div>
  );
}

// ── OWN profile ───────────────────────────────────────────────────────────────

function MyProfile() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);

  const { data: me, isLoading } = useMyProfileDetails();

  const name = tl(me?.name || auth?.full_name || "");
  const canonical = me?.name || auth?.full_name || "";
  const factory = factoryLabel(me?.factory, lang);

  const context = [
    me?.unit ? tl(me.unit) : null,
    me?.shift != null ? `${t("profile.shift")} ${me.shift}` : null,
    factory,
  ].filter(Boolean).join(" · ");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-4">
            <SkeletonBlock className="w-20 h-20 rounded-full" />
            <div className="flex-1"><SkeletonBlock className="h-5 w-1/2 mb-2" /><SkeletonBlock className="h-4 w-1/3" /></div>
          </div>
        </div>
        <SkeletonBlock className="h-48 w-full rounded-2xl" />
        <SkeletonBlock className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-4 min-w-0">
          <ProfileAvatar name={name} colorKey={canonical} profileKey={me?.profile_key}
                         photoVer={me?.photo_ver} size={80} />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight break-words" style={{ color: "var(--text-1)" }}>
              {name}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleChip role={me?.role || auth?.role} />
            </div>
            {context && (
              <div className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{context}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Details */}
        <Card icon={IdCard} title={t("profile.details")}>
          <div className="-my-2">
            {me?.shift != null && (
              <InfoRow icon={Clock} label={t("profile.shift")}>{me.shift}</InfoRow>
            )}
            {me?.unit && (
              <InfoRow icon={Users} label={t("profile.unit")}>{tl(me.unit)}</InfoRow>
            )}
            {factory && (
              <InfoRow icon={FactoryIcon} label={t("profile.factory")}>{factory}</InfoRow>
            )}
            {me?.verifix_id != null && (
              <InfoRow icon={Hash} label={t("admin.profiles.colVerifix")}>
                <span className="font-mono tabular-nums">{me.verifix_id}</span>
              </InfoRow>
            )}
            {(me?.cells?.length ?? 0) > 0 && (
              <InfoRow icon={LayoutGrid} label={t("profile.cells")} top>
                <span className="inline-flex flex-wrap gap-1 justify-end">
                  {me.cells.map((c) => (
                    <span key={c.verifix_code} title={cellName(c, lang) || undefined}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                      {c.verifix_code}
                    </span>
                  ))}
                </span>
              </InfoRow>
            )}
            {/* Name as colleagues see it, per language */}
            <InfoRow icon={Languages} label={t("profile.names")} top>
              <span className="inline-flex flex-col items-end gap-0.5">
                {["uz", ...NAME_LANGS].map((l) => {
                  const v = l === "uz" ? canonical : me?.names?.[l];
                  return (
                    <span key={l} className="inline-flex items-center gap-1.5">
                      <span className="text-[9px] font-mono uppercase" style={{ color: "var(--text-4)" }}>{l}</span>
                      <span style={{ color: v ? "var(--text-1)" : "var(--text-4)" }}>
                        {v || transliterate(canonical, l)}
                      </span>
                    </span>
                  );
                })}
              </span>
            </InfoRow>
          </div>
        </Card>

        <div className="space-y-4">
          {/* Website login + password */}
          <Card icon={Globe} title={t("weblogin.section")}
                right={<WebLoginStatus web={me?.web} />}>
            {me?.web ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <KeyRound size={13} style={{ color: "var(--text-4)" }} className="flex-shrink-0" />
                    <span className="text-sm font-mono truncate" style={{ color: "var(--text-1)" }}>
                      {me.web.username}
                    </span>
                  </span>
                  <Button size="sm" variant="secondary" icon={<Pencil size={12} />}
                          onClick={() => setPwOpen(true)} disabled={!me.web.enabled}>
                    {t("weblogin.changeTitle")}
                  </Button>
                </div>
                <LastLogin web={me.web} />
                <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                  {t("profile.webHint")}
                </p>
                {!me.web.enabled && (
                  <p className="text-[11px] leading-snug" style={{ color: "#94a3b8" }}>
                    {t("profile.loginDisabled")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs leading-snug" style={{ color: "var(--text-4)" }}>
                {t("profile.noWebLogin")}
              </p>
            )}
          </Card>

          {/* Linked Telegram accounts */}
          <Card icon={Link2} title={t("profile.holders")}>
            {(me?.holders?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {me.holders.map((b) => (
                  <HolderChip key={b.telegram_id} b={b} meLabel={t("profile.you")} />
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("admin.profiles.noHolders")}</p>
            )}
            <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-4)" }}>
              {t("profile.holdersHint")}
            </p>
          </Card>
        </div>
      </div>

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onChanged={() => toast.success(t("weblogin.changed"))}
      />
      {toast.node}
    </div>
  );
}

// ── ADMIN: photo actions ──────────────────────────────────────────────────────

function PhotoActions({ profileKey, hasPhoto, notify, onDone }) {
  const { t } = useLang();
  const fileRef = useRef(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("profile_key", profileKey);
      fd.append("file", file);
      return api.post("/api/profiles/admin/photo", fd);
    },
    onSuccess: () => { onDone(); notify(t("profile.photoSaved"), "success"); },
    onError: (e) => {
      const detail = e?.response?.data?.detail;
      notify(detail === "photo_too_large" ? t("profile.photoTooLarge")
        : detail === "invalid_image" ? t("profile.photoInvalid")
        : typeof detail === "string" ? detail : t("profile.photoFailed"), "error");
    },
  });

  const removeMut = useMutation({
    mutationFn: () => api.delete("/api/profiles/admin/photo", { data: { profile_key: profileKey } }),
    onSuccess: () => { setConfirmRemove(false); onDone(); },
    onError: (e) => setRemoveError(e?.response?.data?.detail || t("profile.photoFailed")),
  });

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify(t("profile.photoTooLarge"), "error"); return; }
    uploadMut.mutate(file);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input ref={fileRef} type="file" className="hidden"
             accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
             onChange={onPick} />
      <Button size="sm" tint variant="primary" icon={<Camera size={11} />}
              loading={uploadMut.isPending}
              onClick={() => fileRef.current?.click()}>
        {t(hasPhoto ? "profile.photoReplace" : "profile.photoUpload")}
      </Button>
      {hasPhoto && (
        <Button size="sm" tint variant="danger" icon={<Trash2 size={11} />}
                disabled={uploadMut.isPending}
                onClick={() => { setRemoveError(""); setConfirmRemove(true); }}>
          {t("profile.photoRemove")}
        </Button>
      )}
      <ConfirmDialog
        open={confirmRemove}
        tone="danger"
        error={removeError}
        title={t("profile.photoRemoveTitle")}
        message={t("profile.photoRemoveMsg")}
        confirmLabel={t("profile.photoRemove")}
        loading={removeMut.isPending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => removeMut.mutate()}
      />
    </div>
  );
}

// ── ADMIN: edit form (ported from the old Profiles-tab modal) ─────────────────

function EditCard({ ptype, item, data, notify, onDone }) {
  const navigate = useNavigate();
  const { t, lang, languages, nameOverrides } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(null);
  const [newCell, setNewCell] = useState(null);
  const [newCellError, setNewCellError] = useState("");

  // Re-seed whenever the target profile changes (or after a save refetch).
  useEffect(() => {
    const ov = {};
    for (const l of NAME_LANGS) {
      ov[l] = item[`name_${l}`] || nameOverrides?.[l]?.[`name.${item.name}`] || "";
    }
    setForm({
      role: ptype,
      name: item.name,
      shift: item.shift ?? 1,
      manager_id: item.manager_id ?? "",
      cells: item.cells ?? [],
      verifix_id: ptype === "supervisor" ? item.id : "",
      overrides: ov,
    });
    setFormError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptype, item.id, item.name]);

  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  const roleChanged = form.role && form.role !== ptype;
  const effType = roleChanged ? form.role : ptype;
  const cellList = form.cells || [];
  const wname = (c) => cellName(c, lang);

  const leaderCellOpts = useMemo(() => {
    const meId = item.id;
    const sel = new Set(form.cells || []);
    return (data?.cells ?? [])
      .filter((c) => !c.leader_id || c.leader_id === meId || sel.has(c.verifix_code))
      .sort((a, b) => String(a.verifix_code).localeCompare(String(b.verifix_code), undefined, { numeric: true }))
      .map((c) => {
        const w = wname(c);
        const label = w ? `${c.verifix_code} · ${w}` : c.verifix_code;
        return { value: c.verifix_code, label, title: label };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, item.id, form.cells, lang]);

  const updateMut = useMutation({
    mutationFn: (body) => api.put(`/api/profiles/admin/${ptype}/${item.id}`, body),
    onSuccess: (r) => {
      onDone();
      notify(t("profile.saved"), "success");
      const newId = r.data?.id;
      if (newId && newId !== item.id) {
        navigate(`/profile/${ptype}/${newId}`, { replace: true });
      }
    },
    onError: (e) => setFormError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const switchMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/switch-role", body),
    onSuccess: (r) => {
      onDone();
      setConfirmSwitch(null);
      notify(t("profile.saved"), "success");
      if (r.data?.role && r.data?.id) {
        navigate(`/profile/${r.data.role}/${r.data.id}`, { replace: true });
      }
    },
    onError: (e, body) => {
      const detail = e?.response?.data?.detail;
      if (detail?.code === "confirm_required") { setConfirmSwitch({ body, detail }); return; }
      setConfirmSwitch(null);
      setFormError(typeof detail === "string" ? detail : t("admin.profiles.error"));
    },
  });

  const inlineCellCreateMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/cells", body),
    onSuccess: (_r, body) => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
      setForm((f) => ({ ...f, cells: [...new Set([...(f.cells || []), body.verifix_code])] }));
      setNewCell(null);
      setNewCellError("");
    },
    onError: (e) => setNewCellError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const busy = updateMut.isPending || switchMut.isPending;

  function openCellCreate(code) {
    setNewCell({
      verifix_code: (code || "").trim(), sap_code: "",
      name_workshop_uz: "", name_workshop_uz_cyrl: "",
      name_workshop_ru: "", name_workshop_en: "",
    });
    setNewCellError("");
  }

  function submitNewCell() {
    const code = (newCell?.verifix_code || "").trim();
    if (!code) { setNewCellError(t("admin.profiles.verifixCodeRequired")); return; }
    inlineCellCreateMut.mutate({
      verifix_code: code,
      sap_code: newCell.sap_code || "",
      name_workshop_uz: newCell.name_workshop_uz || "",
      name_workshop_uz_cyrl: newCell.name_workshop_uz_cyrl || "",
      name_workshop_ru: newCell.name_workshop_ru || "",
      name_workshop_en: newCell.name_workshop_en || "",
      manager_id: form.manager_id ? Number(form.manager_id) : 0,
      leader_id: 0,
    });
  }

  function submit() {
    setFormError("");

    if (roleChanged) {
      const body = { ptype, pid: item.id, new_role: form.role };
      if (form.role === "shift-manager" || form.role === "supervisor") {
        if (!form.shift) { setFormError(t("admin.profiles.shiftRequired")); return; }
        body.shift = Number(form.shift);
      }
      if (form.role === "leader") {
        if (!form.manager_id) { setFormError(t("admin.profiles.supervisorRequired")); return; }
        body.manager_id = Number(form.manager_id);
        if (cellList.length) body.cells = cellList;
      }
      if (form.role === "supervisor") {
        if (!form.verifix_id) { setFormError(t("admin.profiles.verifixRequired")); return; }
        body.verifix_id = Number(form.verifix_id);
      }
      switchMut.mutate(body);
      return;
    }

    const name = (form.name || "").trim();
    if (!name) { setFormError(t("admin.profiles.nameRequired")); return; }

    const body = { name, overrides: { ...form.overrides, uz: "" } };
    if (ptype !== "supervisor") {
      for (const l of NAME_LANGS) body[`name_${l}`] = (form.overrides?.[l] || "").trim();
    }
    if (ptype === "shift-manager" || ptype === "supervisor") body.shift = Number(form.shift);
    if (ptype === "leader" && form.manager_id) body.manager_id = Number(form.manager_id);
    if (ptype === "leader") body.cells = cellList;
    if (ptype === "supervisor" && Number(form.verifix_id) !== item.id) {
      body.new_verifix_id = Number(form.verifix_id);
    }
    updateMut.mutate(body);
  }

  return (
    <Card icon={Pencil} title={t("admin.profiles.editTitle")}>
      <div className="space-y-3">
        {/* Role — switching moves only the name; other values are asked fresh */}
        <FormField label={t("admin.profiles.roleLabel")}>
          <StyledSelect
            value={form.role}
            onChange={(v) => {
              setForm((f) => v === ptype
                ? { ...f, role: v, name: item.name,
                    shift: item.shift ?? 1,
                    manager_id: item.manager_id ?? "",
                    cells: item.cells ?? [],
                    verifix_id: ptype === "supervisor" ? item.id : "" }
                : { ...f, role: v, name: item.name,
                    shift: "", manager_id: "", cells: [], verifix_id: "" });
            }}
            options={Object.keys(TYPE_META).map((key) => ({
              value: key,
              label: t(ROLE_LABEL_KEYS[key]) || key,
            }))}
          />
          {roleChanged && (
            <p className="mt-1 text-[10px] leading-snug text-yellow-500">
              {t("admin.profiles.switchRoleHint")}
            </p>
          )}
        </FormField>

        <FormField label={t("admin.profiles.nameLabel")}>
          <input
            type="text"
            value={form.name || ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={roleChanged}
            className={inputCls + (roleChanged ? " opacity-60" : "")}
            style={inputStyle}
            placeholder={t("admin.profiles.namePlaceholder")}
          />
          {!roleChanged && ptype === "supervisor" && (form.name || "").trim() !== item.name && (
            <p className="mt-1 text-[10px] leading-snug text-yellow-500">
              {t("admin.profiles.renameWarnSupervisor")}
            </p>
          )}
        </FormField>

        {(effType === "shift-manager" || effType === "supervisor") && (
          <FormField label={t("admin.profiles.shiftLabel")}>
            <StyledSelect
              value={String(form.shift ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, shift: v }))}
              options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]}
              placeholder={roleChanged ? t("admin.users.selectPlaceholder") : undefined}
            />
          </FormField>
        )}

        {effType === "leader" && (
          <FormField label={t("admin.profiles.supervisorLabel")}>
            <StyledSelect
              value={String(form.manager_id ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, manager_id: v }))}
              options={units
                .filter((u) => !(roleChanged && ptype === "supervisor" && u.id === item.id))
                .map((u) => ({ value: String(u.id), label: tl(u.name) }))}
              placeholder={t("admin.users.selectPlaceholder")}
            />
          </FormField>
        )}

        {effType === "leader" && (
          <FormField label={t("admin.profiles.cellLabel")}>
            <StyledSelect
              multiple
              searchable
              hideSelectAll
              creatable
              value={form.cells || []}
              onChange={(next) => setForm((f) => ({ ...f, cells: next }))}
              options={leaderCellOpts}
              onCreate={openCellCreate}
              createLabel={(q) => `${t("admin.profiles.cellCreate")}${q ? ` "${q}"` : ""}`}
              allLabel={t("admin.profiles.cellPickPlaceholder")}
              searchPlaceholder={t("admin.profiles.cellSearchOrCreate")}
            />
            {(form.cells || []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {form.cells.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-full"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                    {c}
                    <button
                      type="button"
                      className="opacity-60 hover:opacity-100"
                      onClick={() => setForm((f) => ({ ...f, cells: (f.cells || []).filter((x) => x !== c) }))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </FormField>
        )}

        {effType === "supervisor" && (
          <FormField label={t("admin.profiles.verifixLabel")}>
            <input
              type="number"
              value={form.verifix_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, verifix_id: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
            {!roleChanged && ptype === "supervisor" && Number(form.verifix_id) !== item.id && (
              <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                {t("admin.profiles.verifixWarn")}
              </p>
            )}
          </FormField>
        )}

        {/* Per-language display names */}
        {!roleChanged && (
          <div className="pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              {t("admin.profiles.langNames")}
            </div>
            <p className="mt-0.5 mb-2 text-[10px] leading-snug" style={{ color: "var(--text-3)" }}>
              {t("admin.profiles.langNamesHint")}
            </p>
            <div className="space-y-2">
              {languages.filter((l) => l.code !== "uz").map((l) => (
                <label key={l.code} className="flex items-center gap-2">
                  <span className="w-14 flex-shrink-0 text-[10px] font-mono uppercase"
                        style={{ color: "var(--text-4)" }}>{l.code}</span>
                  <input
                    type="text"
                    value={form.overrides?.[l.code] || ""}
                    onChange={(e) => setForm((f) => ({
                      ...f, overrides: { ...f.overrides, [l.code]: e.target.value },
                    }))}
                    placeholder={transliterate((form.name || "").trim(), l.code)}
                    className={inputCls + " !mt-0"}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f, overrides: { ...f.overrides, [l.code]: convertFromUz((f.name || "").trim(), l.code) },
                    }))}
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                    style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}
                    title={t("settings.translate")}
                  >
                    <Languages size={12} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        )}

        {formError && <p className="text-[11px] font-medium text-red-400">{formError}</p>}

        <div className="flex justify-end pt-1">
          <Button icon={<Pencil size={12} />} loading={busy} onClick={submit}>
            {t("admin.profiles.save")}
          </Button>
        </div>
      </div>

      {/* Inline cell creation (leader flow) */}
      {newCell && (
        <Modal
          onClose={() => setNewCell(null)}
          dismissable={!inlineCellCreateMut.isPending}
          title={t("admin.profiles.cellCreateTitle")}
          maxWidth="max-w-sm"
          zIndex={80}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setNewCell(null)}
                      disabled={inlineCellCreateMut.isPending}>
                {t("admin.users.cancel")}
              </Button>
              <Button size="sm" icon={<Plus size={12} />} loading={inlineCellCreateMut.isPending}
                      onClick={submitNewCell}>
                {t("admin.profiles.create")}
              </Button>
            </>
          }
        >
          <FormField label={t("admin.profiles.colVerifixCode")} required>
            <input
              type="text"
              value={newCell.verifix_code || ""}
              onChange={(e) => setNewCell((c) => ({ ...c, verifix_code: e.target.value }))}
              className={inputCls}
              style={inputStyle}
              autoFocus
            />
          </FormField>
          <FormField label={t("admin.profiles.colSapCode")}>
            <input
              type="text"
              value={newCell.sap_code || ""}
              onChange={(e) => setNewCell((c) => ({ ...c, sap_code: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
          </FormField>
          <FormField label={t("admin.profiles.colWorkshop")}>
            <LangTextInput
              className="mt-1"
              value={{
                uz: newCell.name_workshop_uz,
                uz_cyrl: newCell.name_workshop_uz_cyrl,
                ru: newCell.name_workshop_ru,
                en: newCell.name_workshop_en,
              }}
              onChange={(l, v) => setNewCell((c) => ({ ...c, [`name_workshop_${l}`]: v }))}
            />
          </FormField>
          <p className="mt-2 text-[10px] leading-snug" style={{ color: "var(--text-4)" }}>
            {t("admin.profiles.colSupervisor")}:{" "}
            {tl(units.find((u) => String(u.id) === String(form.manager_id))?.name) || "—"}
          </p>
          {newCellError && <p className="mt-2 text-[11px] font-medium text-red-400">{newCellError}</p>}
        </Modal>
      )}

      {/* Role-switch impacts (backend 409 confirm_required) */}
      <ConfirmDialog
        open={!!confirmSwitch}
        onCancel={() => setConfirmSwitch(null)}
        onConfirm={() => switchMut.mutate({ ...confirmSwitch.body, confirm: true })}
        title={t("admin.profiles.switchConfirmTitle")}
        message={confirmSwitch && (
          <>
            {t("admin.profiles.switchConfirmMsg")
              .replace("{name}", item.name ?? "")
              .replace("{role}", t(ROLE_LABEL_KEYS[confirmSwitch.body.new_role]) || confirmSwitch.body.new_role)}
            <ul className="list-disc pl-4 space-y-1 mt-2">
              {confirmSwitch.detail.concerns > 0 && (
                <li>{t("admin.profiles.switchImpactConcerns").replace("{n}", confirmSwitch.detail.concerns)}</li>
              )}
              {confirmSwitch.detail.tasks > 0 && (
                <li>{t("admin.profiles.switchImpactTasks").replace("{n}", confirmSwitch.detail.tasks)}</li>
              )}
              {confirmSwitch.detail.unit_archive && (
                <li>{t("admin.profiles.switchImpactUnitArchive")}</li>
              )}
              {confirmSwitch.detail.unit_delete && (
                <li>{t("admin.profiles.switchImpactUnitDelete")}</li>
              )}
              {confirmSwitch.detail.unit_leaders > 0 && (
                <li>{t("admin.profiles.switchImpactUnitLeaders").replace("{n}", confirmSwitch.detail.unit_leaders)}</li>
              )}
            </ul>
          </>
        )}
        confirmLabel={t("admin.profiles.switchConfirm")}
        cancelLabel={t("admin.users.cancel")}
        loading={switchMut.isPending}
        zIndex={110}
      />
    </Card>
  );
}

// ── ADMIN: web login management (ported from WebLoginModal) ───────────────────

function WebLoginCard({ item, notify, onDone }) {
  const { t } = useLang();
  const web = item?.web || null;

  const [username, setUsername] = useState(web?.username || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null); // "reset" | "delete"

  useEffect(() => {
    setUsername(web?.username || "");
    setPassword("");
    setError("");
  }, [web?.username, item.profile_key]);

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
    onSuccess: () => { onDone(); notify(t("weblogin.sent"), "success"); setPassword(""); },
    onError: fail,
  });
  const renameMut = useMutation({
    mutationFn: () => api.put("/api/profiles/admin/web-login",
      { profile_key: item.profile_key, username: username.trim() }),
    onSuccess: () => { onDone(); notify(t("weblogin.changed"), "success"); },
    onError: fail,
  });
  const resetMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login", {}),
    onSuccess: () => { setConfirm(null); onDone(); notify(t("weblogin.sent"), "success"); },
    onError: (e) => { setConfirm(null); fail(e); },
  });
  const toggleMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login/toggle", {}),
    onSuccess: () => onDone(),
    onError: fail,
  });
  const revokeMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login/revoke", {}),
    onSuccess: () => { onDone(); notify(t("weblogin.revoked"), "success"); },
    onError: fail,
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete("/api/profiles/admin/web-login",
      { data: { profile_key: item.profile_key } }),
    onSuccess: () => { setConfirm(null); onDone(); },
    onError: (e) => { setConfirm(null); fail(e); },
  });

  const busy = createMut.isPending || renameMut.isPending || resetMut.isPending ||
               toggleMut.isPending || revokeMut.isPending || deleteMut.isPending;
  const renamed = web && username.trim() && username.trim() !== web.username;

  return (
    <Card icon={Globe} title={t("weblogin.formTitle")} right={<WebLoginStatus web={web} />}>
      <div className="space-y-3">
        {!deliverable && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-snug"
               style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)", color: "#eab308" }}>
            <Ban size={13} className="flex-shrink-0 mt-px" />
            <span>{t("weblogin.noHolder")}</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
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
          </div>
          {web && (
            <Button onClick={() => renameMut.mutate()} loading={renameMut.isPending}
                    disabled={!renamed || busy}>
              {t("weblogin.rename")}
            </Button>
          )}
        </div>

        {!web && (
          <>
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
            <div className="flex justify-end">
              <Button icon={<Plus size={12} />} onClick={() => createMut.mutate()}
                      loading={createMut.isPending} disabled={busy || !deliverable}>
                {t("weblogin.create")}
              </Button>
            </div>
          </>
        )}

        {web && (
          <>
            <LastLogin web={web} />
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
      </div>

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
    </Card>
  );
}

// ── ADMIN: holders + danger zone ──────────────────────────────────────────────

function HoldersCard({ ptype, item, notify, onDone }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [confirmUnassign, setConfirmUnassign] = useState(null); // binding
  const [actionError, setActionError] = useState("");

  const unassignMut = useMutation({
    mutationFn: (binding) => api.post("/api/profiles/admin/unassign", {
      ptype,
      pid: item.id,
      role_ref: binding.role_ref,
      telegram_id: binding.telegram_id,
    }),
    onSuccess: () => { setConfirmUnassign(null); onDone(); },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  return (
    <Card icon={Link2} title={t("profile.holders")}>
      {(item.bindings?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {item.bindings.map((b, i) => (
            <HolderChip key={i} b={b}
                        disabled={unassignMut.isPending}
                        onUnassign={b.role_ref != null
                          ? () => { setActionError(""); setConfirmUnassign(b); }
                          : undefined} />
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("admin.profiles.noHolders")}</p>
      )}
      <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-4)" }}>
        {t("admin.profiles.holdersHint")}
      </p>

      <ConfirmDialog
        open={!!confirmUnassign}
        error={actionError}
        onCancel={() => { setConfirmUnassign(null); setActionError(""); }}
        onConfirm={() => unassignMut.mutate(confirmUnassign)}
        title={t("admin.profiles.unassignTitle")}
        message={confirmUnassign && t("admin.profiles.unassignMsg")
          .replace("{user}", confirmUnassign.tg_name || confirmUnassign.user_name ||
            (confirmUnassign.username ? `@${confirmUnassign.username}` : confirmUnassign.telegram_id))
          .replace("{name}", tl(item.name))}
        confirmLabel={t("admin.profiles.unassign")}
        cancelLabel={t("admin.users.cancel")}
        loading={unassignMut.isPending}
      />
    </Card>
  );
}

function DangerCard({ ptype, item, onDone }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");

  const archivable = ptype === "supervisor" && !item.archived && item.has_data;

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/profiles/admin/${ptype}/${item.id}`),
    onSuccess: () => {
      setConfirmDelete(false);
      onDone();
      navigate("/admin/upload?tab=profiles");
    },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const archiveMut = useMutation({
    mutationFn: (archived) => api.put(`/api/profiles/admin/supervisor/${item.id}`, { archived }),
    onSuccess: () => { setConfirmDelete(false); onDone(); },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  return (
    <Card icon={Shield} title={t("profile.dangerZone")}>
      <div className="flex flex-wrap items-center gap-2">
        {ptype === "supervisor" && item.archived ? (
          <Button size="sm" tint variant="success" icon={<ArchiveRestore size={11} />}
                  loading={archiveMut.isPending}
                  onClick={() => archiveMut.mutate(false)}>
            {t("admin.profiles.unarchive")}
          </Button>
        ) : archivable ? (
          <Button size="sm" tint variant="secondary" icon={<Archive size={11} />}
                  disabled={deleteMut.isPending}
                  onClick={() => { setActionError(""); setConfirmDelete(true); }}>
            {t("admin.profiles.archive")}
          </Button>
        ) : (
          <Button size="sm" tint variant="danger" icon={<Trash2 size={11} />}
                  disabled={deleteMut.isPending}
                  onClick={() => { setActionError(""); setConfirmDelete(true); }}>
            {t("admin.profiles.delete")}
          </Button>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-4)" }}>
        {t(archivable ? "admin.profiles.archiveMsg" : "profile.dangerHint").replace("{name}", tl(item.name) || "")}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        error={actionError}
        onCancel={() => { setConfirmDelete(false); setActionError(""); }}
        onConfirm={() => {
          setActionError("");
          if (archivable) archiveMut.mutate(true);
          else deleteMut.mutate();
        }}
        title={t("admin.profiles.deleteTitle")}
        message={(archivable ? t("admin.profiles.archiveMsg") : t("admin.profiles.deleteMsg"))
          .replace("{name}", tl(item.name) || "")}
        confirmLabel={archivable ? t("admin.profiles.archive") : t("admin.profiles.confirmDelete")}
        tone={archivable ? "warning" : "danger"}
        loading={deleteMut.isPending || archiveMut.isPending}
      />
    </Card>
  );
}

// ── ADMIN profile view ────────────────────────────────────────────────────────

function bindState(item) {
  const bs = item.bindings || [];
  if (bs.some((b) => b.status === "pending")) return "pending";
  return bs.length ? "bound" : "none";
}

function AdminProfile({ ptype, pid }) {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { t, lang, reloadTranslations } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => api.get("/api/profiles/admin/list").then((r) => r.data),
  });

  const meta = TYPE_META[ptype];
  const item = useMemo(() => {
    const rows = data?.[meta?.listKey] ?? [];
    return rows.find((x) => x.id === Number(pid)) || null;
  }, [data, meta, pid]);

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    qc.invalidateQueries({ queryKey: ["admin-cells"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    reloadTranslations();
  };
  const notify = (msg, tone) => toast.show(msg, tone);

  const unitById = useMemo(
    () => Object.fromEntries((data?.supervisors ?? []).map((s) => [String(s.id), s])),
    [data],
  );
  const shift = item
    ? (ptype === "leader" ? unitById[String(item.manager_id)]?.shift : item.shift) ?? null
    : null;

  const back = (
    <Button size="sm" variant="ghost" icon={<ArrowLeft size={13} />}
            onClick={() => navigate("/admin/upload?tab=profiles")}>
      {t("profile.backToList")}
    </Button>
  );

  // Capability grantees may run the Profiles tab but never touch ADMIN
  // identities; a typed URL must hit the same wall as the hidden section.
  if (!meta || (ptype === "admin" && auth?.role !== "admin")) {
    return (
      <div className="rounded-2xl py-10" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState title={t("profile.notFound")} message="" showUploadLink={false} />
        <div className="flex justify-center">{back}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-28 w-full rounded-2xl" />
        <SkeletonBlock className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-2xl py-10" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState title={t("profile.notFound")} message="" showUploadLink={false} />
        <div className="flex justify-center">{back}</div>
      </div>
    );
  }

  const bs = bindState(item);
  const bsMap = {
    bound:   { color: "#22c55e", label: t("admin.profiles.bindBound") },
    pending: { color: "#eab308", label: t("admin.users.status.pending") },
    none:    { color: "#94a3b8", label: t("admin.profiles.noHolders") },
  };

  const context = [
    ptype === "leader" && item.supervisor ? tl(item.supervisor) : null,
    shift != null ? `${t("profile.shift")} ${shift}` : null,
    ptype === "supervisor" ? `Verifix ${item.id}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div>{back}</div>

      {/* Identity + photo */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
          <ProfileAvatar name={tl(item.name)} colorKey={item.name} profileKey={item.profile_key}
                         photoVer={item.photo_ver} size={80} />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold leading-tight break-words" style={{ color: "var(--text-1)" }}>
              {tl(item.name)}
              {ptype === "supervisor" && item.archived && (
                <span className="ml-2 align-middle text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}>
                  {t("admin.profiles.archived")}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleChip role={ptype} />
              <StatusTag color={bsMap[bs].color}>{bsMap[bs].label}</StatusTag>
            </div>
            {context && (
              <div className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{context}</div>
            )}
            <div className="mt-3">
              <PhotoActions profileKey={item.profile_key} hasPhoto={Boolean(item.photo_ver)}
                            notify={notify} onDone={onDone} />
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>
                {t("profile.photoHint")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <EditCard ptype={ptype} item={item} data={data} notify={notify} onDone={onDone} />
        <div className="space-y-4">
          <WebLoginCard item={item} notify={notify} onDone={onDone} />
          <HoldersCard ptype={ptype} item={item} notify={notify} onDone={onDone} />
          <DangerCard ptype={ptype} item={item} onDone={onDone} />
        </div>
      </div>

      {toast.node}
    </div>
  );
}

// ── page shell ────────────────────────────────────────────────────────────────

export default function Profile() {
  const { ptype, pid } = useParams();
  const { t } = useLang();
  const adminView = Boolean(ptype && pid);

  return (
    <Layout title={t("profile.title")}>
      {adminView ? <AdminProfile ptype={ptype} pid={pid} /> : <MyProfile />}
    </Layout>
  );
}
