import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowLeft, Award, Ban, BellOff, Camera, Check, Clock, Copy,
  Eye, EyeOff, Flag, Globe, IdCard, KeyRound, Languages, Loader2,
  LogIn, LogOut, Pencil, Plus, RotateCcw, Send, Shield, Star, Trash2,
  UserCog, UserRound, Users, X, ShieldQuestion,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import api from "../utils/api";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import ActionMenu from "../components/ui/ActionMenu";
import FormField from "../components/ui/FormField";
import StyledSelect from "../components/ui/StyledSelect";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import LangTextInput from "../components/ui/LangTextInput";
import ProfileAvatar, { useMyProfileDetails } from "../components/ui/ProfileAvatar";
import CellLink from "../components/ui/CellLink";
import CellFormModal from "../components/CellFormModal";
import GroupBadge from "../components/ui/GroupBadge";
import { GROUP_LETTERS, wcGroupLabel } from "../utils/wcGroup";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { copyText } from "../utils/copyText";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useExam } from "../context/ExamContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { useTranslit, transliterate, convertFromUz } from "../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../config/pages";
import { CATEGORY_COLORS, ROLE_COLORS } from "../utils/chartPalette";

/**
 * ONE profile page for both routes — /profile (own) and /profile/:ptype/:pid
 * (opened from the admin Profiles register). The layout is the same for every
 * viewer: an identity header that answers «can this person get in» at a
 * glance (Telegram · site login · last sign-in), then ONE column of full-width
 * cards — details, site login, Telegram accounts. Cards never sit side by
 * side: their heights follow their content, and two of those in a row end at
 * different heights. Each card splits into two columns INSIDE instead. Every
 * section carries one small hue of its own (an icon chip), the header takes
 * the role's; gold stays the action colour. What differs is
 * ACCESS, not structure — a viewer who may manage profiles (admin, or the
 * `admin.profiles.manage` grantee the register route already admits) gets the
 * details card as a live form, login management, holder unassign and the
 * danger zone; everyone else reads the same cards and can only change their
 * own password. A manager's own /profile therefore opens already editable:
 * their row is resolved out of the same register list by profile_key, with
 * full parity to managing anyone else, plus the self password change.
 *
 * The password form works from BOTH surfaces — a browser session proves the
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
  "idle-owner":    { listKey: "idle_owners",    icon: ShieldQuestion },
};
const NAME_LANGS = ["uz_cyrl", "ru", "en"];
const MIN_PW_LEN = 8;

// What a profile takes with it, in the order the operator has to read it:
// DESTROYED first (a leader's filed checklist cannot outlive the profile row),
// then what only loses its owner and stays readable by its name snapshot.
// Shared by the delete dialog and the role switch, which destroys the same
// three when it moves a leader's identity into a `managers` row.
const IMPACT_KEYS = [
  ["days",     "admin.profiles.impactDays"],
  ["photos",   "admin.profiles.impactPhotos"],
  ["reviews",  "admin.profiles.impactReviews"],
  ["late",     "admin.profiles.impactLate"],
  ["cells",    "admin.profiles.impactCells"],
  ["tasks",    "admin.profiles.switchImpactTasks"],
  ["concerns", "admin.profiles.switchImpactConcerns"],
];

const inputCls = "mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand)]";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--border-md)",
  color: "var(--text-1)",
};

// ── shared building blocks ────────────────────────────────────────────────────

// One hue per section, worn only by its icon chip — enough to tell the cards
// apart at a glance, never enough to colour the page. None is a status colour
// except the danger zone's red, which is one.
const HUE = {
  details: CATEGORY_COLORS[2],   // blue
  web:     CATEGORY_COLORS[5],   // purple
  tg:      CATEGORY_COLORS[12],  // sky — Telegram's own
  last:    CATEGORY_COLORS[6],   // teal
  danger:  "#ef4444",
};
// The register gives admins no hue of their own; the header needs one.
const roleHue = (role) => ROLE_COLORS[role] ?? CATEGORY_COLORS[8];

const CARD_PAD = "px-3 sm:px-6 py-4 sm:py-5";   // SectionHead lg's own gutters

function Card({ icon, color, title, subtitle, right, children, className = "", bodyClassName = CARD_PAD, danger = false }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "var(--border)"}` }}
    >
      <SectionHead size="lg" icon={icon} color={color} title={title} subtitle={subtitle} right={right} />
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

// A read-only value under its label — the own view's details grid.
function Detail({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-1 text-sm font-medium break-words" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

function RoleChip({ role }) {
  const { t } = useLang();
  const Icon = TYPE_META[role]?.icon || UserRound;
  const tkey = ROLE_LABEL_KEYS[role];
  const c = roleHue(role);
  return (
    <span className="chat-ink inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ "--ink": c, background: `${c}1f`, border: `1px solid ${c}40` }}>
      <Icon size={12} />
      {tkey ? t(tkey) : role}
    </span>
  );
}

function StatusTag({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {children}
    </span>
  );
}

// One fact of the header's strip: a hue chip, its label, the value. `dot` is
// a status colour beside a value that is ALSO worded — never colour alone.
function Fact({ icon: Icon, color, label, dot, children }) {
  return (
    <div className="flex items-center gap-3 min-w-0 rounded-xl px-3 py-2.5"
         style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <span className="grid place-items-center w-9 h-9 rounded-xl flex-shrink-0"
            style={{ background: `${color}1f`, color }}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider truncate" style={{ color: "var(--text-3)" }}>{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[13px] font-semibold"
             style={{ color: "var(--text-1)" }}>
          {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
          <span className="truncate">{children}</span>
        </div>
      </div>
    </div>
  );
}

const GREEN = "#22c55e", AMBER = "#eab308", GREY = "#94a3b8";

// «Can this person get in?» — the three answers, the same for both views:
// is a Telegram account linked, is there a working site login, when was it
// last used. `bind` is "bound" | "pending" | "none"; `holders` their count.
function ProfileFacts({ bind, holders = 0, web }) {
  const { t, lang } = useLang();
  const bindMap = {
    bound:   { dot: GREEN, label: t("admin.profiles.bindBound") },
    pending: { dot: AMBER, label: t("admin.users.status.pending") },
    none:    { dot: GREY,  label: t("admin.profiles.noHolders") },
  }[bind];
  const webNote = !web ? null
    : !web.enabled ? t("weblogin.disabledTag")
    : web.locked ? t("weblogin.lockedTag") : null;
  return (
    <>
      <Fact icon={Send} color={HUE.tg} label={t("profile.holders")} dot={bindMap.dot}>
        {bindMap.label}{holders > 1 ? ` · ${holders}` : ""}
      </Fact>
      <Fact icon={Globe} color={HUE.web} label={t("weblogin.section")}
            dot={!web || !web.enabled ? GREY : web.locked ? AMBER : GREEN}>
        {web ? <><span className="font-mono">{web.username}</span>{webNote ? ` · ${webNote}` : ""}</> : t("weblogin.none")}
      </Fact>
      <Fact icon={Clock} color={HUE.last} label={t("weblogin.lastLogin")}>
        {web ? (fmtDateTime(web.last_login_at, lang) || t("weblogin.never")) : "—"}
      </Fact>
    </>
  );
}

function HolderChip({ b, meLabel, onUnassign, disabled, dmTip }) {
  const label = b.tg_name || b.user_name || (b.username ? `@${b.username}` : b.telegram_id);
  const pending = b.status === "pending";
  // Assigned but undeliverable — see the same chip on the Profiles tab.
  const unreachable = !pending && b.dm_ok === false;
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium max-w-full"
      style={pending
        ? { background: "rgba(234,179,8,0.12)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)" }
        : unreachable
          ? { background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }
          : { background: "rgba(34,197,94,0.10)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.22)" }}
      title={unreachable && dmTip ? dmTip : (b.username ? `@${b.username}` : String(b.telegram_id))}
    >
      {unreachable && <BellOff size={12} className="flex-shrink-0" />}
      <span className="truncate">{label}</span>
      {b.is_me && meLabel && <span className="opacity-75">· {meLabel}</span>}
      {pending && meLabel === undefined && <span className="opacity-80">…</span>}
      {onUnassign && !pending && (
        <button type="button" onClick={onUnassign} disabled={disabled}
                className="relative flex-shrink-0 rounded-full p-0.5 hover:bg-[var(--bg-accent)] transition-colors
                           after:absolute after:-inset-2.5 after:content-['']">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function factoryLabel(f, lang) {
  if (!f) return null;
  return f[`name_${lang}`] || f.name_ru || f.name_uz || f.code;
}

// Timestamps follow the UI language, not the browser default — an uz page
// showing "8/8/2026, 8:05:47 AM" reads as someone else's software.
const DT_LOCALE = { uz: "uz-Latn-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };
function fmtDateTime(iso, lang) {
  if (!iso) return null;
  const d = new Date(iso);
  try {
    return d.toLocaleString(DT_LOCALE[lang] || "ru-RU", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d.toLocaleString();
  }
}

// The identity header every viewer gets: a band in the ROLE's hue (with the
// role's own icon faint in it), the photo standing on its edge, the name, the
// chips, one context line, then the three facts. At manage access the photo
// carries a camera badge (`avatarBadge`) and the band a ⋮ (`menu`). One
// component so the two access levels cannot drift apart.
function ProfileHero({ name, role, colorKey, profileKey, photoVer, chips, context, facts, avatarBadge, menu }) {
  const hue = roleHue(role);
  const RoleIcon = TYPE_META[role]?.icon || UserRound;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="relative h-20 sm:h-24 overflow-hidden"
           style={{ background: `color-mix(in srgb, ${hue} 16%, var(--bg-card))` }}>
        {/* Clear of the ⋮ on its right and, on the narrowest phone, of the photo. */}
        <RoleIcon aria-hidden="true" size={104} strokeWidth={1.5}
                  className="absolute -bottom-6 right-14" style={{ color: hue, opacity: 0.16 }} />
        {menu && <div className="absolute top-2 right-2">{menu}</div>}
      </div>
      <div className="px-3 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5 min-w-0">
          {/* Half on the band, half on the card; the ring is the card's colour. */}
          <div className="relative -mt-12 w-24 h-24 flex-shrink-0 rounded-full"
               style={{ boxShadow: "0 0 0 4px var(--bg-card)", background: "var(--bg-card)" }}>
            <ProfileAvatar name={name} colorKey={colorKey} profileKey={profileKey}
                           photoVer={photoVer} size={96} />
            {avatarBadge}
          </div>
          <div className="min-w-0 flex-1 sm:pt-3">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight break-words" style={{ color: "var(--text-1)" }}>
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">{chips}</div>
            {context && (
              <div className="mt-2 text-[13px] break-words" style={{ color: "var(--text-2)" }}>{context}</div>
            )}
          </div>
        </div>
        {facts && <div className="mt-4 sm:mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">{facts}</div>}
      </div>
    </div>
  );
}

// Name as colleagues see it, per language — a tag and the name, two columns
// on a wide card.
function NamesBlock({ canonical, names }) {
  const { t } = useLang();
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {t("profile.names")}
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
        {["uz", ...NAME_LANGS].map((l) => {
          const v = l === "uz" ? canonical : names?.[l];
          return (
            <div key={l} className="flex items-center gap-2.5 min-w-0">
              <span className="w-14 flex-shrink-0 text-center text-[10px] font-mono uppercase tracking-wide px-1 py-0.5 rounded-md"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
                {l}
              </span>
              <span className="text-sm truncate" style={{ color: v ? "var(--text-1)" : "var(--text-3)" }}>
                {v || transliterate(canonical, l)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── page-level save ───────────────────────────────────────────────────────────
/**
 * The page has ONE save action — a bar that rises from the bottom edge the
 * moment something is unsaved and leaves once it is saved (a button that sat
 * disabled in the header was the loudest thing on a page with nothing to
 * save) — and it commits every DEFERRED edit on the page at once — the profile form AND the web-login
 * username. Cards no longer carry their own save buttons: two "save" controls
 * on one screen means the operator has to work out which of them their change
 * belongs to, and the one inside a card is invisible from anywhere else.
 *
 * What it deliberately does NOT touch: the actions that fire on their own click
 * and confirm themselves — photo upload/remove, password reset, sign-out,
 * enable/disable, delete/archive, and minting a brand-new browser login (that
 * one DMs a password, so it stays an explicit, separate decision).
 *
 * Each card REGISTERS a target instead of rendering a button, so validation and
 * error text stay inside the card that owns the offending field.
 */
const SaveBusCtx = createContext(null);

function useSaveHub() {
  const [flags, setFlags] = useState({});   // key -> { dirty, busy }
  const runners = useRef({});               // key -> () => void
  const flagsRef = useRef(flags);
  flagsRef.current = flags;

  // Stable identity: children re-register on every render, so this must never
  // write state unless dirty/busy actually moved, or the two would loop.
  const bus = useMemo(() => ({
    register(key, { dirty, busy, run }) {
      runners.current[key] = run;
      setFlags((prev) => (prev[key]?.dirty === dirty && prev[key]?.busy === busy)
        ? prev
        : { ...prev, [key]: { dirty, busy } });
    },
    unregister(key) {
      delete runners.current[key];
      setFlags((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    run() {
      for (const [key, f] of Object.entries(flagsRef.current)) {
        if (f.dirty) runners.current[key]?.();
      }
    },
  }), []);

  const list = Object.values(flags);
  return { bus, dirty: list.some((f) => f.dirty), busy: list.some((f) => f.busy) };
}

function useSaveTarget(key, { dirty, busy, save }) {
  const bus = useContext(SaveBusCtx);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    bus?.register(key, { dirty, busy, run: () => saveRef.current?.() });
  }, [bus, key, dirty, busy]);

  useEffect(() => () => bus?.unregister(key), [bus, key]);
}

function SaveBar({ busy, onSave }) {
  const { t } = useLang();
  return (
    <div className="sticky z-30 savebar-in" style={{ bottom: "var(--tg-safe-bottom, 0px)" }}>
      <div className="flex items-center justify-between gap-3 rounded-2xl pl-4 pr-2 py-2 shadow-lg"
           style={{ background: "var(--bg-card)", border: "1px solid var(--brand-border)" }}>
        <span className="flex items-center gap-2 min-w-0 text-[13px] font-medium" style={{ color: "var(--text-1)" }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: AMBER }} />
          <span className="truncate">{t("profile.unsaved")}</span>
        </span>
        <Button size="lg" className="flex-shrink-0" icon={<Check size={14} />} loading={busy}
                title={t("profile.saveAllHint")} onClick={onSave}>
          {t("admin.profiles.save")}
        </Button>
      </div>
    </div>
  );
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
        ? <StatusTag color={GREEN}>{t("profile.loginEnabled")}</StatusTag>
        : <StatusTag color={GREY}>{t("weblogin.disabledTag")}</StatusTag>}
      {web.locked && <StatusTag color={AMBER}>{t("weblogin.lockedTag")}</StatusTag>}
    </span>
  );
}

// ── OWN profile ───────────────────────────────────────────────────────────────

function MyProfile() {
  const { auth } = useAuth();
  // «Imtihon»: the dated badge for a passed exam, only while the admin switch is on.
  const examBadge = useExam()?.me?.badge || null;
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

  if (isLoading) return <ProfileSkeleton />;

  const holders = me?.holders ?? [];
  const hasDetails = me?.shift != null || me?.unit || factory || me?.verifix_id != null;

  return (
    <div className="space-y-4">
      <ProfileHero
        name={name}
        role={me?.role || auth?.role}
        colorKey={canonical}
        profileKey={me?.profile_key}
        photoVer={me?.photo_ver}
        chips={(
          <>
            <RoleChip role={me?.role || auth?.role} />
            {examBadge && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: "rgba(34,197,94,0.12)", color: GREEN, border: "1px solid rgba(34,197,94,0.3)" }}
                    title={examBadge.date || ""}>
                <Award size={11} />
                {t("exam.badge")}{examBadge.date ? ` · ${examBadge.date}` : ""}
              </span>
            )}
          </>
        )}
        context={context}
        facts={<ProfileFacts bind={holders.length ? "bound" : "none"} holders={holders.length} web={me?.web} />}
      />

      {/* Details */}
      <Card icon={IdCard} color={HUE.details} title={t("profile.details")}>
        <div className="space-y-5">
          {hasDetails && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4">
              {me?.shift != null && <Detail label={t("profile.shift")}>{me.shift}</Detail>}
              {me?.unit && <Detail label={t("profile.unit")}>{tl(me.unit)}</Detail>}
              {factory && <Detail label={t("profile.factory")}>{factory}</Detail>}
              {me?.verifix_id != null && (
                <Detail label={t("admin.profiles.colVerifix")}>
                  <span className="font-mono tabular-nums">{me.verifix_id}</span>
                </Detail>
              )}
            </div>
          )}
          {(me?.cells?.length ?? 0) > 0 && (
            <Detail label={t("profile.cells")}>
              <span className="flex flex-wrap gap-1.5">
                {me.cells.map((c) => (
                  <span key={c.verifix_code} className="inline-flex items-center gap-1">
                    <CellLink id={c.id}
                          className="text-xs font-mono px-2 py-0.5 rounded-full"
                          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                      {c.verifix_code}
                    </CellLink>
                    {/* A cell sharing its work centre carries a group letter. */}
                    <GroupBadge group={c.wc_group} title={wcGroupLabel(c.sap_code, c.wc_group)} />
                  </span>
                ))}
              </span>
            </Detail>
          )}
          <NamesBlock canonical={canonical} names={me?.names} />
        </div>
      </Card>

      {/* Website login + password */}
      <Card icon={Globe} color={HUE.web} title={t("weblogin.section")}
            subtitle={me?.web ? t("profile.webHint") : undefined}
            right={<WebLoginStatus web={me?.web} />}>
        {me?.web ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Detail label={t("weblogin.username")}>
                <span className="font-mono">{me.web.username}</span>
              </Detail>
              {/* The one thing a non-admin comes to this page to do. */}
              <Button size="lg" icon={<Pencil size={14} />}
                      onClick={() => setPwOpen(true)} disabled={!me.web.enabled}>
                {t("weblogin.changeTitle")}
              </Button>
            </div>
            {!me.web.enabled && (
              <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>
                {t("profile.loginDisabled")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] leading-snug" style={{ color: "var(--text-3)" }}>
            {t("profile.noWebLogin")}
          </p>
        )}
      </Card>

      {/* Linked Telegram accounts */}
      <Card icon={Send} color={HUE.tg} title={t("profile.holders")} subtitle={t("profile.holdersHint")}>
        {holders.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {holders.map((b) => (
              <HolderChip key={b.telegram_id} b={b} meLabel={t("profile.you")}
                          dmTip={t("admin.profiles.dmBlockedTip")} />
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>{t("admin.profiles.noHolders")}</p>
        )}
      </Card>

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onChanged={() => toast.success(t("weblogin.changed"))}
      />
      {toast.node}
    </div>
  );
}

// The page while it loads, in the shape it is about to take.
function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-[300px] sm:h-[264px] w-full rounded-2xl" />
      <SkeletonBlock className="h-52 w-full rounded-2xl" />
      <SkeletonBlock className="h-52 w-full rounded-2xl" />
      <SkeletonBlock className="h-28 w-full rounded-2xl" />
    </div>
  );
}

// ── ADMIN: photo actions ──────────────────────────────────────────────────────

// The photo's two actions, offered where the eye already is: a camera badge
// on the photo itself (pick a file — the common one) and, once there is a
// photo, a ⋮ on the header with «replace» and «delete». One picker and one
// confirm dialog behind both.
function usePhotoActions({ profileKey, hasPhoto, notify, onDone }) {
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

  const pick = () => fileRef.current?.click();
  const pickLabel = t(hasPhoto ? "profile.photoReplace" : "profile.photoUpload");

  const badge = (
    <button type="button" onClick={pick} disabled={uploadMut.isPending}
            aria-label={pickLabel} title={`${pickLabel} — ${t("profile.photoHint")}`}
            className="absolute -bottom-0.5 -right-0.5 grid place-items-center w-8 h-8 rounded-full transition-colors outline-none
                       hover:text-[var(--brand-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]
                       after:absolute after:-inset-1.5 after:content-['']"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
      {uploadMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
    </button>
  );

  const menu = hasPhoto ? (
    <ActionMenu
      label={t("admin.profiles.colActions")}
      items={[
        { key: "replace", label: pickLabel, icon: Camera, onSelect: pick, disabled: uploadMut.isPending },
        { key: "remove", label: t("profile.photoRemove"), icon: Trash2, tone: "danger",
          disabled: uploadMut.isPending,
          onSelect: () => { setRemoveError(""); setConfirmRemove(true); } },
      ]}
    />
  ) : null;

  const node = (
    <>
      <input ref={fileRef} type="file" className="hidden"
             accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
             onChange={onPick} />
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
    </>
  );

  return { badge, menu, node };
}

// ── ADMIN: «Lider / Lider o'rnida» — what stands behind the saved answer ──────

// Under the switch: who decided the SAVED kind and what Verifix said at its last
// check — the Verifix name included, so a wrong match is visible to the very
// person correcting it. A flipped switch is a draft like every field here: the
// page's one Save commits it.
function LeaderKindNote({ info, unsetKey = "profile.leaderKind.unset" }) {
  const { t, lang } = useLang();
  const lines = [];
  const vfx = info?.vfx;
  if (vfx) {
    const when = fmtDateTime(vfx.checked_at, lang) ?? "";
    if (vfx.found) {
      lines.push(t("profile.leaderKind.vfxFound")
        .replace("{job}", vfx.job || "—")
        .replace("{name}", vfx.name || "—")
        .replace("{cell}", vfx.cell ? ` · ${vfx.cell}` : "")
        .replace("{date}", when));
    } else {
      const key = `profile.leaderKind.vfx.${vfx.reason}`;
      const text = t(key) === key ? t("profile.leaderKind.vfx.not_found") : t(key);
      lines.push(text.replace("{n}", vfx.count ?? "").replace("{date}", when));
    }
  }
  if (info?.src === "manual") {
    lines.push(t("profile.leaderKind.manual")
      .replace("{by}", info.by || "—")
      .replace("{date}", fmtDateTime(info.at, lang) ?? ""));
  }
  if (!lines.length) lines.push(t(unsetKey));
  return lines.map((l, i) => <span key={i} className="block">{l}</span>);
}

// ── ADMIN: «Chek-list smenasi» — the shift a leader's checklist runs on ───────

// The plant's calendar day, Tashkent, `offset` days on — a switch saved now
// takes effect from tomorrow (services/leader_shift.tomorrow).
const tashkentDay = (offset = 0) =>
  new Date(Date.now() + 5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "");

// The shift in force from TOMORROW on — what the switch shows and edits. A
// switch still waiting for its date is that date's shift; null = unit's.
function clShiftTarget(cs) {
  if (!cs) return null;
  const unit = cs.unit_shift ?? null;
  if (cs.next) return cs.next.shift ?? unit;
  return cs.value ?? unit;
}

// Under the switch: the brigade's own shift, the shift in force today when it
// is another, a switch still waiting for its date, and — while the draft moved
// — when the saved value will start to count.
function ClShiftNote({ cs, draft }) {
  const { t } = useLang();
  const unit = cs?.unit_shift ?? null;
  const today = tashkentDay();
  const lines = [];
  if (cs?.value != null && cs.value !== unit) {
    const since = [...(cs.history || [])].filter((e) => e.from <= today).pop()?.from;
    lines.push(t("profile.clShift.now").replace("{n}", cs.value)
      .replace("{date}", dmy(since)).replace("{u}", unit ?? "—"));
  }
  if (cs?.next) {
    lines.push(t("profile.clShift.next").replace("{date}", dmy(cs.next.from))
      .replace("{n}", cs.next.shift ?? unit ?? "—"));
  }
  if (draft) lines.push(t("profile.clShift.draft").replace("{date}", dmy(tashkentDay(1))));
  if (!lines.length) lines.push(t("profile.clShift.unit").replace("{n}", unit ?? "—"));
  return lines.map((l, i) => <span key={i} className="block">{l}</span>);
}

// ── ADMIN: edit form (ported from the old Profiles-tab modal) ─────────────────

// Field-by-field so a value that only differs by type (12 vs "12") or by cell
// ORDER does not read as an edit — a save button lit by noise trains the
// operator to ignore it.
function sameProfileForm(a, b) {
  if (!a || !b) return true;
  if (String(a.role ?? "") !== String(b.role ?? "")) return false;
  if ((a.name || "").trim() !== (b.name || "").trim()) return false;
  if (String(a.shift ?? "") !== String(b.shift ?? "")) return false;
  if (String(a.manager_id ?? "") !== String(b.manager_id ?? "")) return false;
  if (String(a.verifix_id ?? "") !== String(b.verifix_id ?? "")) return false;
  const cells = (f) => [...(f.cells || [])].map(String).sort().join("|");
  if (cells(a) !== cells(b)) return false;
  if ((a.leader_kind ?? null) !== (b.leader_kind ?? null)) return false;
  if ((a.checklist_shift ?? null) !== (b.checklist_shift ?? null)) return false;
  if ((a.supervisor_kind ?? null) !== (b.supervisor_kind ?? null)) return false;
  if ((a.zagruzka_on ?? null) !== (b.zagruzka_on ?? null)) return false;
  return NAME_LANGS.every((l) => (a.overrides?.[l] || "").trim() === (b.overrides?.[l] || "").trim());
}

function EditCard({ ptype, item, data, notify, onDone }) {
  const navigate = useNavigate();
  const { t, lang, nameOverrides } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [form, setForm] = useState({});
  // The values the form was last seeded/saved with — the page's save button is
  // enabled only against a real difference, so "unsaved changes" never lies.
  const [base, setBase] = useState(null);
  const [formError, setFormError] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(null);
  const [newCell, setNewCell] = useState(null);
  const [newCellError, setNewCellError] = useState("");

  // Re-seed whenever the target profile changes (or after a save refetch).
  // Keyed on the profile's own VALUES, not the object identity: a background
  // refetch that returns the same row must not wipe an edit in progress.
  const itemSig = JSON.stringify([
    item.id, item.name, item.shift ?? null, item.manager_id ?? null,
    item.cells ?? null, item.name_uz_cyrl ?? null, item.name_ru ?? null, item.name_en ?? null,
    item.leader_kind ?? null, item.supervisor_kind ?? null, item.zagruzka_on ?? null,
    item.checklist_shift ?? null,
  ]);
  useEffect(() => {
    const ov = {};
    for (const l of NAME_LANGS) {
      ov[l] = item[`name_${l}`] || nameOverrides?.[l]?.[`name.${item.name}`] || "";
    }
    const seeded = {
      role: ptype,
      name: item.name,
      shift: item.shift ?? 1,
      manager_id: item.manager_id ?? "",
      cells: item.cells ?? [],
      verifix_id: ptype === "supervisor" ? item.id : "",
      leader_kind: item.leader_kind ?? null,
      checklist_shift: clShiftTarget(item.checklist_shift),
      supervisor_kind: item.supervisor_kind ?? null,
      // A brigadir unit only; a bundle reading an older payload has no field
      // and must not offer to switch a unit off by accident.
      zagruzka_on: ptype === "supervisor" ? item.zagruzka_on !== false : null,
      overrides: ov,
    };
    setForm(seeded);
    setBase(seeded);
    setFormError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptype, itemSig]);

  const formRef = useRef(form);
  formRef.current = form;

  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  const roleChanged = form.role && form.role !== ptype;
  const effType = roleChanged ? form.role : ptype;
  const cellList = form.cells || [];

  // The cells this leader may hold, by CODE — never by workshop name
  // (utils/cellName.js). The list is already narrowed to cells that are free or
  // already theirs, so the leader beside a code would be this profile itself.
  const leaderCellOpts = useMemo(() => {
    const meId = item.id;
    const sel = new Set(form.cells || []);
    // An archived cell is offered only while it is still on the form — a
    // closed cell takes no new leader, and dropping it here would release it.
    return (data?.cells ?? [])
      .filter((c) => !c.archived_at || sel.has(c.verifix_code))
      .filter((c) => !c.leader_id || c.leader_id === meId || sel.has(c.verifix_code))
      .sort((a, b) => String(a.verifix_code).localeCompare(String(b.verifix_code), undefined, { numeric: true }))
      .map((c) => ({ value: c.verifix_code, label: c.verifix_code, title: c.verifix_code }));
  }, [data, item.id, form.cells]);

  const updateMut = useMutation({
    mutationFn: (body) => api.put(`/api/profiles/admin/${ptype}/${item.id}`, body),
    onSuccess: (r) => {
      // Baseline the values we just persisted: per-language names for a
      // supervisor land in the translations table, so the profile row comes
      // back byte-identical and the re-seed below would never fire.
      setBase(formRef.current);
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
      // `detail_raw`, not `detail`: api.js flattens every non-string detail to
      // text for the ~80 call sites that render it directly, which turned this
      // impacts OBJECT into a JSON string — so the check below never matched and
      // the confirm dialog was replaced by a blob of JSON in the error line.
      const res = e?.response?.data;
      const detail = res?.detail_raw ?? res?.detail;
      if (detail?.code === "confirm_required") { setConfirmSwitch({ body, detail }); return; }
      setConfirmSwitch(null);
      setFormError(typeof res?.detail === "string" ? res.detail : t("admin.profiles.error"));
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
    // The register form's own reading of a refusal, so a group-rule answer is
    // said in the admin's language here too.
    onError: (e) => setNewCellError(CellFormModal.errorText(e, t)),
  });

  const busy = updateMut.isPending || switchMut.isPending;
  const dirty = Boolean(base) && !sameProfileForm(form, base);

  useSaveTarget("profile", { dirty, busy, save: () => submit() });

  function openCellCreate(code) {
    setNewCell({
      verifix_code: (code || "").trim(), sap_code: "", wc_group: "",
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
      // "" = none; a group needs the SAP code it qualifies AND the unit it is
      // unique inside (services/wc_group.py) — without either it is refused.
      wc_group: (newCell.sap_code || "").trim() && form.manager_id ? (newCell.wc_group || "") : "",
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
    // Sent only when it moved: a save of the name must not restamp who
    // decided the kind (services/leader_kind.py).
    if (ptype === "leader" && form.leader_kind && form.leader_kind !== (item.leader_kind ?? null)) {
      body.leader_kind = form.leader_kind;
    }
    // Sent only when it moved: the server starts it from TOMORROW
    // (services/leader_shift), and a name save must not add a history entry.
    if (ptype === "leader" && form.checklist_shift
        && form.checklist_shift !== clShiftTarget(item.checklist_shift)) {
      body.checklist_shift = form.checklist_shift;
    }
    if (ptype === "supervisor" && Number(form.verifix_id) !== item.id) {
      body.new_verifix_id = Number(form.verifix_id);
    }
    // The brigadir's two switches, each sent only when it moved — a save of the
    // name must not restamp who decided the kind (services/supervisor_kind.py).
    if (ptype === "supervisor" && form.supervisor_kind
        && form.supervisor_kind !== (item.supervisor_kind ?? null)) {
      body.supervisor_kind = form.supervisor_kind;
    }
    if (ptype === "supervisor" && form.zagruzka_on !== (item.zagruzka_on !== false)) {
      body.zagruzka_on = form.zagruzka_on;
    }
    updateMut.mutate(body);
  }

  // Same card, same title as the read view — access is what turned it into a
  // form, so it must not read as a different page.
  return (
    <Card icon={IdCard} color={HUE.details} title={t("profile.details")}>
      {/* Two fields a row from sm up. Every field is `alignTop`: only some
          carry a hint, and the controls of a row must stay on one line. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        {/* Role — switching moves only the name; other values are asked fresh */}
        <FormField alignTop label={t("admin.profiles.roleLabel")}>
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
            <p className="mt-1 text-[11px] leading-snug text-yellow-500">
              {t("admin.profiles.switchRoleHint")}
            </p>
          )}
        </FormField>

        <FormField alignTop label={t("admin.profiles.nameLabel")}>
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
            <p className="mt-1 text-[11px] leading-snug text-yellow-500">
              {t("admin.profiles.renameWarnSupervisor")}
            </p>
          )}
        </FormField>

        {(effType === "shift-manager" || effType === "supervisor") && (
          <FormField alignTop label={t("admin.profiles.shiftLabel")}>
            <StyledSelect
              value={String(form.shift ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, shift: v }))}
              options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]}
              placeholder={roleChanged ? t("admin.users.selectPlaceholder") : undefined}
            />
          </FormField>
        )}

        {effType === "leader" && (
          <FormField alignTop label={t("admin.profiles.supervisorLabel")}>
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
          <FormField alignTop label={t("admin.profiles.cellLabel")}>
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
                {form.cells.map((c) => {
                  // A «Boshqaruvchi» pick counts from the day it is made; one
                  // made while the cell's brigadir change waits lands with that
                  // move — say from when, or it reads as already in force.
                  const from = item.cells_waiting?.[c];
                  const d = from ? `${from.slice(8, 10)}.${from.slice(5, 7)}` : null;
                  return (
                  <span key={c} className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-full"
                        title={d ? t("admin.profiles.cellWaitingHint").replace("{d}", d) : undefined}
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                    {c}
                    {d && (
                      <span className="inline-flex items-center gap-0.5 font-sans" style={{ color: "var(--text-3)" }}>
                        <Clock className="w-3 h-3" />
                        {t("admin.profiles.cellWaitingFrom").replace("{d}", d)}
                      </span>
                    )}
                    <button
                      type="button"
                      className="opacity-60 hover:opacity-100"
                      onClick={() => setForm((f) => ({ ...f, cells: (f.cells || []).filter((x) => x !== c) }))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                  );
                })}
              </div>
            )}
          </FormField>
        )}

        {effType === "leader" && !roleChanged && (
          <FormField alignTop label={t("profile.leaderKind.label")}
                     hint={<LeaderKindNote info={item.leader_kind_info} />}>
            <SegmentedToggle
              fill
              ariaLabel={t("profile.leaderKind.label")}
              value={form.leader_kind ?? null}
              onChange={(v) => setForm((f) => ({ ...f, leader_kind: v }))}
              options={[
                { value: "leader", label: t("profile.leaderKind.leader"),
                  title: t("profile.leaderKind.leaderTitle") },
                { value: "acting", label: t("profile.leaderKind.acting"),
                  title: t("profile.leaderKind.actingTitle") },
              ]}
            />
          </FormField>
        )}

        {/* The shift this leader's CHECKLIST runs on — their brigade's, or the
            other one (services/leader_shift). Takes effect from tomorrow. */}
        {effType === "leader" && !roleChanged && item.checklist_shift && (
          <FormField alignTop label={t("profile.clShift.label")}
                     hint={<ClShiftNote cs={item.checklist_shift}
                                        draft={form.checklist_shift !== base?.checklist_shift} />}>
            <SegmentedToggle
              fill
              ariaLabel={t("profile.clShift.label")}
              value={form.checklist_shift ?? null}
              onChange={(v) => setForm((f) => ({ ...f, checklist_shift: v }))}
              options={[
                { value: 1, label: t("profile.clShift.s1") },
                { value: 2, label: t("profile.clShift.s2") },
              ]}
            />
          </FormField>
        )}

        {effType === "supervisor" && (
          <FormField alignTop label={t("admin.profiles.verifixLabel")}>
            <input
              type="number"
              value={form.verifix_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, verifix_id: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
            {!roleChanged && ptype === "supervisor" && Number(form.verifix_id) !== item.id && (
              <p className="mt-1 text-[11px] leading-snug text-yellow-500">
                {t("admin.profiles.verifixWarn")}
              </p>
            )}
          </FormField>
        )}

        {/* «Brigadir / Brigadir o'rnida» — the leaders' switch, for the unit's
            brigadir (services/supervisor_kind.py). */}
        {effType === "supervisor" && !roleChanged && (
          <FormField alignTop label={t("profile.supKind.label")}
                     hint={<LeaderKindNote info={item.supervisor_kind_info}
                                           unsetKey="profile.supKind.unset" />}>
            <SegmentedToggle
              fill
              ariaLabel={t("profile.supKind.label")}
              value={form.supervisor_kind ?? null}
              onChange={(v) => setForm((f) => ({ ...f, supervisor_kind: v }))}
              options={[
                { value: "supervisor", label: t("profile.supKind.supervisor"),
                  title: t("profile.supKind.supervisorTitle") },
                { value: "acting", label: t("profile.supKind.acting"),
                  title: t("profile.supKind.actingTitle") },
              ]}
            />
          </FormField>
        )}

        {/* Is this unit's загрузка calculated at all (managers.zagruzka_on)?
            OFF takes it out of every загрузка table, card and average. */}
        {effType === "supervisor" && !roleChanged && form.zagruzka_on != null && (
          <FormField alignTop label={t("profile.zagruzka.label")}
                     hint={t(form.zagruzka_on ? "profile.zagruzka.onHint" : "profile.zagruzka.offHint")}>
            <SegmentedToggle
              fill
              ariaLabel={t("profile.zagruzka.label")}
              value={form.zagruzka_on ? "on" : "off"}
              onChange={(v) => setForm((f) => ({ ...f, zagruzka_on: v === "on" }))}
              options={[
                { value: "on", label: t("profile.zagruzka.on") },
                { value: "off", label: t("profile.zagruzka.off") },
              ]}
            />
          </FormField>
        )}

        {/* Per-language display names — the uz canonical name lives in its own
            field above, so the tabs cover only the three override languages. */}
        {!roleChanged && (
          <div className="sm:col-span-2">
          <FormField label={t("admin.profiles.langNames")} hint={t("admin.profiles.langNamesHint")}>
            <LangTextInput
              className="mt-1"
              langs={NAME_LANGS}
              value={form.overrides || {}}
              onChange={(l, v) => setForm((f) => ({
                ...f, overrides: { ...f.overrides, [l]: v },
              }))}
              placeholderFn={(l) => transliterate((form.name || "").trim(), l)}
              action={(l) => (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f, overrides: { ...f.overrides, [l]: convertFromUz((f.name || "").trim(), l) },
                  }))}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                  style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}
                  title={t("settings.translate")}
                >
                  <Languages size={12} />
                </button>
              )}
            />
          </FormField>
          </div>
        )}

        {/* No save button here — the page has ONE, the bar at the bottom, and
            it commits this form together with the web-login username. Failures
            still surface next to the fields that caused them. */}
        {formError && <p className="sm:col-span-2 text-xs font-medium text-red-400">{formError}</p>}
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
          <FormField label={t("admin.profiles.colGroup")} hint={t("admin.profiles.cellGroupHint")}>
            <StyledSelect
              value={(newCell.sap_code || "").trim() && form.manager_id ? (newCell.wc_group || "") : ""}
              onChange={(v) => setNewCell((c) => ({ ...c, wc_group: v }))}
              disabled={!((newCell.sap_code || "").trim() && form.manager_id)}
              options={[
                { value: "", label: "—" },
                ...GROUP_LETTERS.map((l) => ({ value: l, label: <GroupBadge group={l} />, title: l })),
              ]}
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
              {IMPACT_KEYS.map(([field, key]) => confirmSwitch.detail[field] > 0 && (
                <li key={field}>{t(key).replace("{n}", confirmSwitch.detail[field])}</li>
              ))}
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

// `resetSignal` bumps when the password changed somewhere this card cannot see
// — the self-change modal beside it — so a revealed value is dropped instead of
// lingering as the answer to a question that has moved on.
function WebLoginCard({ item, own = false, onChangePassword, resetSignal = 0, notify, onDone }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const web = item?.web || null;

  const [username, setUsername] = useState(web?.username || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  // The saved password, held ONLY while it is on screen (see reveal below).
  const [shownPw, setShownPw] = useState("");
  const [pwBusy, setPwBusy] = useState("");   // "" | "show" | "copy"
  const [pwError, setPwError] = useState("");
  const [confirmOpenAs, setConfirmOpenAs] = useState(false);
  const [openAsBusy, setOpenAsBusy] = useState(false);
  const [openAsError, setOpenAsError] = useState("");

  useEffect(() => {
    setUsername(web?.username || "");
    setPassword("");
    setError("");
    setShownPw("");
    setPwError("");
  }, [web?.username, item.profile_key, resetSignal]);

  const deliverable = web ? web.deliverable : true;
  // Reading a password back is admins-only, server-side too: every other action
  // on this card CHANGES the login, which the owner sees (a reset arrives as a
  // DM, a disable stops their access), so those are safe to delegate through
  // `admin.profiles.manage`. Reading one leaves nothing the owner can notice.
  const canReveal = auth?.role === "admin";
  // Opening the app AS this person is strictly MORE than reading their
  // password — it is the sign-in the password would buy — so it is at least as
  // narrow: admins only, refused server-side too, and never on your own row,
  // where it would open a second tab as the person already using it.
  const canOpenAs = auth?.role === "admin" && !own;

  function failText(e) {
    const detail = e?.response?.data?.detail;
    if (detail === "username_taken") return t("weblogin.taken");
    if (detail === "no_holder")      return t("weblogin.noHolder");
    if (detail === "login_disabled") return t("weblogin.impDisabled");
    return typeof detail === "string" ? detail : t("weblogin.saveFailed");
  }
  function fail(e) { setError(failText(e)); }

  const post = (url, body) => api.post(url, { profile_key: item.profile_key, ...body });

  const createMut = useMutation({
    mutationFn: () => post("/api/profiles/admin/web-login", {
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    }),
    onSuccess: () => {
      onDone(); notify(t("weblogin.sent"), "success");
      setPassword(""); setShownPw("");
    },
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
    onSuccess: () => {
      // The password on screen is now the OLD one — drop it rather than let it
      // sit there looking current.
      setShownPw("");
      setConfirmReset(false); onDone(); notify(t("weblogin.sent"), "success");
    },
    onError: (e) => { setConfirmReset(false); fail(e); },
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
  const busy = createMut.isPending || renameMut.isPending || resetMut.isPending ||
               toggleMut.isPending || revokeMut.isPending;
  const renamed = Boolean(web && username.trim() && username.trim() !== web.username);

  /** Fetch the saved password. Deliberately re-fetched on every reveal and every
   *  copy rather than cached in the component: a reset here, a self-change in
   *  the modal beside it, or another admin's reset elsewhere all invalidate a
   *  cached value silently, and a confidently-displayed password that no longer
   *  logs in is worse than the missing one this feature exists to fix. It also
   *  means the audit line records each time it was actually looked at. */
  async function fetchPassword(which) {
    setPwBusy(which);
    setPwError("");
    try {
      const r = await api.post("/api/profiles/admin/web-login/reveal",
                               { profile_key: item.profile_key });
      const value = r.data?.password || "";
      // The credential exists but nothing readable came back — a sealed copy
      // written under a rotated SECRET_KEY. Say so on the field; never blank.
      if (!value) setPwError(t("weblogin.pwUnknownHint"));
      return value;
    } catch (e) {
      setPwError(failText(e));
      return "";
    } finally {
      setPwBusy("");
    }
  }

  async function toggleReveal() {
    if (shownPw) return setShownPw("");   // hiding drops the value from the page
    setShownPw(await fetchPassword("show"));
  }

  async function copyValue(value) {
    const ok = await copyText(value);
    notify(ok ? t("admin.copied") : t("weblogin.copyFailed"), ok ? "success" : "error");
  }

  async function copyPassword() {
    const value = shownPw || await fetchPassword("copy");
    if (value) await copyValue(value);
  }

  /** Open a new tab signed in as this profile.
   *
   *  The tab is opened SYNCHRONOUSLY, inside the click that asked for it: a
   *  window.open() after an await is a pop-up as far as the browser is
   *  concerned and is blocked silently. So the blank tab is claimed first, the
   *  code is minted second, and the tab is sent where it was always going —
   *  and if the browser refused the tab, nothing is minted and the dialog says
   *  why instead of appearing to have done nothing.
   *
   *  What travels in the URL is a one-time code, never a token: it is spent by
   *  the tab that opens and dead a minute later either way. */
  async function openAsProfile() {
    setOpenAsError("");
    const tab = window.open("", "_blank");
    if (!tab) {
      setOpenAsError(t("weblogin.impBlocked"));
      return;
    }
    setOpenAsBusy(true);
    try {
      const r = await post("/api/profiles/admin/web-login/impersonate", {});
      // Absolute: a relative URL on about:blank resolves against a base this
      // tab does not own.
      tab.location.replace(`${window.location.origin}/?as=${encodeURIComponent(r.data.code)}`);
      setConfirmOpenAs(false);
    } catch (e) {
      tab.close();
      setOpenAsError(failText(e));
    } finally {
      setOpenAsBusy(false);
    }
  }

  // Renaming an existing login is a deferred edit, so the page's save button
  // owns it. Creating one is not: it mints a password and DMs it, which stays
  // its own deliberate button below.
  useSaveTarget("weblogin", {
    dirty: renamed,
    busy: renameMut.isPending,
    save: () => renameMut.mutate(),
  });

  return (
    <Card icon={Globe} color={HUE.web} title={t("weblogin.formTitle")} right={<WebLoginStatus web={web} />}>
      <div className="space-y-4">
        {!deliverable && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-snug"
               style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)", color: "var(--text-1)" }}>
            <Ban size={14} className="flex-shrink-0 mt-px" style={{ color: AMBER }} />
            <span>{t("weblogin.noHolder")}</span>
          </div>
        )}

        {/* Login beside password from sm up — the pair that is read together. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <FormField
          alignTop
          label={t("weblogin.username")}
          hint={web && renamed ? t("weblogin.renamePending") : web ? undefined : t("weblogin.usernameHint")}
          error={error || undefined}
        >
          <div className="flex items-stretch gap-1.5">
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              placeholder={t("weblogin.usernamePh")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-[var(--brand)]"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
            {/* Copies the SAVED login, not what is being typed — the typed one
                does not log anybody in until the page is saved. */}
            {web && (
              <Button size="sm" tint variant="secondary" className="px-2.5"
                      title={t("weblogin.copyLogin")} aria-label={t("weblogin.copyLogin")}
                      icon={<Copy size={13} />} onClick={() => copyValue(web.username)} />
            )}
          </div>
        </FormField>

        {/* The password itself — admins only, masked until asked for, and
            copyable without ever being displayed. */}
        {web && canReveal && (
          <FormField
            alignTop
            label={t("weblogin.password")}
            hint={web.has_password ? t("weblogin.revealHint") : t("weblogin.pwUnknownHint")}
            error={pwError || undefined}
          >
            <div className="flex items-stretch gap-1.5">
              <div className="flex-1 min-w-0 flex items-center rounded-xl px-3 py-2 text-sm font-mono"
                   style={{
                     background: "var(--bg-inner)",
                     border: "1px solid var(--border-md)",
                     color: shownPw ? "var(--text-1)" : "var(--text-4)",
                   }}>
                <span className="truncate select-all">
                  {shownPw || (web.has_password ? "••••••••••" : t("weblogin.pwUnknown"))}
                </span>
              </div>
              <Button size="sm" tint variant="secondary" className="px-2.5"
                      title={t(shownPw ? "weblogin.hidePassword" : "weblogin.showPassword")}
                      aria-label={t(shownPw ? "weblogin.hidePassword" : "weblogin.showPassword")}
                      loading={pwBusy === "show"} disabled={busy || !web.has_password}
                      onClick={toggleReveal}
                      icon={shownPw ? <EyeOff size={13} /> : <Eye size={13} />} />
              <Button size="sm" tint variant="secondary" className="px-2.5"
                      title={t("weblogin.copyPassword")} aria-label={t("weblogin.copyPassword")}
                      loading={pwBusy === "copy"} disabled={busy || !web.has_password}
                      onClick={copyPassword}
                      icon={<Copy size={13} />} />
            </div>
          </FormField>
        )}

        {!web && (
            <FormField alignTop label={t("weblogin.password")} hint={t("weblogin.passwordHint")}>
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
        </div>

        {!web && (
          <div className="flex justify-end">
            <Button size="lg" icon={<Plus size={14} />} onClick={() => createMut.mutate()}
                    loading={createMut.isPending} disabled={busy || !deliverable}>
              {t("weblogin.create")}
            </Button>
          </div>
        )}

        {web && (
          <>
            {/* Recoverable operations only — deleting the login lives in the
                page's danger zone, away from these daily controls. On the
                manager's OWN profile the self password change joins them. */}
            <div className="pt-4 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--border)" }}>
              {own && (
                <Button tint variant="primary" icon={<Pencil size={13} />}
                        disabled={busy || !web.enabled} onClick={onChangePassword}>
                  {t("weblogin.changeTitle")}
                </Button>
              )}
              {/* A disabled login is a standing decision that this profile may
                  not be entered from a browser; this must not be the way round
                  it, so the button goes with it. */}
              {canOpenAs && (
                <Button tint variant="primary" icon={<LogIn size={13} />}
                        loading={openAsBusy} disabled={busy || !web.enabled}
                        onClick={() => { setOpenAsError(""); setConfirmOpenAs(true); }}>
                  {t("weblogin.impersonate")}
                </Button>
              )}
              <Button tint variant={own || canOpenAs ? "secondary" : "primary"}
                      icon={<RotateCcw size={13} />}
                      disabled={busy} onClick={() => setConfirmReset(true)}>
                {t("weblogin.reset")}
              </Button>
              <Button tint variant="secondary" icon={<LogOut size={13} />}
                      loading={revokeMut.isPending} disabled={busy}
                      onClick={() => revokeMut.mutate()}>
                {t("weblogin.revoke")}
              </Button>
              <Button tint variant={web.enabled ? "secondary" : "success"}
                      icon={web.enabled ? <Ban size={13} /> : <Check size={13} />}
                      loading={toggleMut.isPending} disabled={busy}
                      onClick={() => toggleMut.mutate()}>
                {t(web.enabled ? "weblogin.disable" : "weblogin.enable")}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Says what the tab will be able to do before it exists: everything done
          in it is recorded as this person, which is the whole reason the door
          is admin-only and written to the register. */}
      <ConfirmDialog
        open={confirmOpenAs}
        icon={LogIn}
        title={t("weblogin.impTitle")}
        message={t("weblogin.impBody").replace("{name}", tl(item.name) || "")}
        confirmLabel={t("weblogin.impConfirm")}
        loading={openAsBusy}
        error={openAsError || undefined}
        onCancel={() => { setConfirmOpenAs(false); setOpenAsError(""); }}
        onConfirm={openAsProfile}
      />

      <ConfirmDialog
        open={confirmReset}
        title={t("weblogin.resetTitle")}
        message={t("weblogin.resetBody")}
        confirmLabel={t("weblogin.reset")}
        loading={resetMut.isPending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => resetMut.mutate()}
      />
    </Card>
  );
}

// ── ADMIN: holders + danger zone ──────────────────────────────────────────────

function HoldersCard({ ptype, item, onDone }) {
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
    <Card icon={Send} color={HUE.tg} title={t("profile.holders")} subtitle={t("profile.holdersHint")}>
      {(item.bindings?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-2">
          {item.bindings.map((b, i) => (
            <HolderChip key={i} b={b}
                        dmTip={t("admin.profiles.dmBlockedTip")}
                        disabled={unassignMut.isPending}
                        onUnassign={b.role_ref != null
                          ? () => { setActionError(""); setConfirmUnassign(b); }
                          : undefined} />
          ))}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--text-3)" }}>{t("admin.profiles.noHolders")}</p>
      )}

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
  const web = item.web || null;
  const [confirm, setConfirm] = useState(null); // "login" | "profile"
  const [actionError, setActionError] = useState("");
  // The backend's 409 {"code":"confirm_required", ...counts}: a leader profile
  // whose delete would destroy filed checklist days. Second step, not a nag —
  // the first dialog cannot name a number it does not have.
  const [impacts, setImpacts] = useState(null);

  const archivable = ptype === "supervisor" && !item.archived && item.has_data;

  const deleteMut = useMutation({
    mutationFn: (confirmed = false) =>
      api.delete(`/api/profiles/admin/${ptype}/${item.id}`,
                 confirmed ? { params: { confirm: 1 } } : undefined),
    onSuccess: () => {
      setConfirm(null);
      setImpacts(null);
      onDone();
      navigate("/panel/profiles");
    },
    onError: (e) => {
      // `detail_raw` holds the structure; api.js flattens `detail` to text.
      const res = e?.response?.data;
      const detail = res?.detail_raw ?? res?.detail;
      if (detail?.code === "confirm_required") {
        setConfirm(null);
        setActionError("");
        setImpacts(detail);
        return;
      }
      setActionError(typeof res?.detail === "string" ? res.detail
                                                     : t("admin.profiles.error"));
    },
  });

  const archiveMut = useMutation({
    mutationFn: (archived) => api.put(`/api/profiles/admin/supervisor/${item.id}`, { archived }),
    onSuccess: () => { setConfirm(null); onDone(); },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const loginDeleteMut = useMutation({
    mutationFn: () => api.delete("/api/profiles/admin/web-login",
      { data: { profile_key: item.profile_key } }),
    onSuccess: () => { setConfirm(null); onDone(); },
    onError: (e) => setActionError(e?.response?.data?.detail || t("weblogin.saveFailed")),
  });

  const busy = deleteMut.isPending || archiveMut.isPending || loginDeleteMut.isPending;
  const rowCls = "flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5";

  return (
    <Card icon={AlertTriangle} color={HUE.danger} danger title={t("profile.dangerZone")}>
      {/* One row per irreversible action: the consequence on the left, the
          single button that causes it on the right. */}
      {web && (
        <div className={`${rowCls} pb-4 border-b`} style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] leading-snug" style={{ color: "var(--text-2)" }}>
            {t("weblogin.deleteBody")}
          </p>
          <div className="flex-shrink-0">
            <Button tint variant="danger" icon={<Trash2 size={13} />}
                    disabled={busy}
                    onClick={() => { setActionError(""); setConfirm("login"); }}>
              {t("weblogin.delete")}
            </Button>
          </div>
        </div>
      )}
      <div className={`${rowCls}${web ? " pt-4" : ""}`}>
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-2)" }}>
          {t(archivable ? "admin.profiles.archiveMsg" : "profile.dangerHint").replace("{name}", tl(item.name) || "")}
        </p>
        <div className="flex-shrink-0">
          {ptype === "supervisor" && item.archived ? (
            <Button tint variant="success" icon={<ArchiveRestore size={13} />}
                    loading={archiveMut.isPending} disabled={busy && !archiveMut.isPending}
                    onClick={() => archiveMut.mutate(false)}>
              {t("admin.profiles.unarchive")}
            </Button>
          ) : archivable ? (
            <Button tint variant="secondary" icon={<Archive size={13} />}
                    disabled={busy}
                    onClick={() => { setActionError(""); setConfirm("profile"); }}>
              {t("admin.profiles.archive")}
            </Button>
          ) : (
            <Button tint variant="danger" icon={<Trash2 size={13} />}
                    disabled={busy}
                    onClick={() => { setActionError(""); setConfirm("profile"); }}>
              {t("admin.profiles.delete")}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "login"}
        tone="danger"
        error={actionError}
        onCancel={() => { setConfirm(null); setActionError(""); }}
        onConfirm={() => { setActionError(""); loginDeleteMut.mutate(); }}
        title={t("weblogin.deleteTitle")}
        message={t("weblogin.deleteBody")}
        confirmLabel={t("weblogin.delete")}
        loading={loginDeleteMut.isPending}
      />
      <ConfirmDialog
        open={confirm === "profile"}
        error={actionError}
        onCancel={() => { setConfirm(null); setActionError(""); }}
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

      {/* Delete impacts (backend 409 confirm_required). What dies is listed
          first and the name has to be retyped: filed checklist days, their
          photos and every AI verdict on them go with the profile, and no undo
          reaches any of it. */}
      <ConfirmDialog
        open={!!impacts}
        tone="danger"
        error={actionError}
        onCancel={() => { setImpacts(null); setActionError(""); }}
        onConfirm={() => { setActionError(""); deleteMut.mutate(true); }}
        title={t("admin.profiles.deleteImpactTitle")}
        message={impacts && (
          <>
            {t("admin.profiles.deleteImpactMsg").replace("{name}", tl(item.name) || "")}
            <ul className="list-disc pl-4 space-y-1 mt-2">
              {IMPACT_KEYS.map(([field, key]) => impacts[field] > 0 && (
                <li key={field}>{t(key).replace("{n}", impacts[field])}</li>
              ))}
            </ul>
          </>
        )}
        challenge={tl(item.name) || item.name}
        confirmLabel={t("admin.profiles.confirmDelete")}
        cancelLabel={t("admin.users.cancel")}
        loading={deleteMut.isPending}
        zIndex={110}
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

function AdminProfile({ ptype: routePtype, pid, fromRegister = false }) {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { t, reloadTranslations } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { bus, dirty, busy } = useSaveHub();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwEpoch, setPwEpoch] = useState(0);

  const { data: me } = useMyProfileDetails();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => api.get("/api/profiles/admin/list").then((r) => r.data),
  });

  // From the register the row is addressed by the URL; from /profile the
  // viewer's OWN row is resolved out of the same list by profile_key, so a
  // manager's profile opens already editable.
  const resolved = useMemo(() => {
    if (!data) return null;
    if (fromRegister) {
      const meta = TYPE_META[routePtype];
      const row = (data[meta?.listKey] ?? []).find((x) => x.id === Number(pid));
      return row ? { ptype: routePtype, item: row } : null;
    }
    if (!me?.profile_key) return null;
    for (const [pt, meta] of Object.entries(TYPE_META)) {
      const row = (data[meta.listKey] ?? []).find((r) => r.profile_key === me.profile_key);
      if (row) return { ptype: pt, item: row };
    }
    return null;
  }, [data, fromRegister, routePtype, pid, me]);
  const ptype = resolved?.ptype ?? (fromRegister ? routePtype : null);
  const item = resolved?.item ?? null;
  const own = Boolean(me?.profile_key && item && item.profile_key === me.profile_key);

  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    qc.invalidateQueries({ queryKey: ["admin-cells"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    // Editing yourself must reach the header and sidebar avatar/name too.
    qc.invalidateQueries({ queryKey: ["my-profile-details"] });
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

  const back = fromRegister ? (
    <Button size="sm" variant="ghost" icon={<ArrowLeft size={13} />}
            onClick={() => navigate("/panel/profiles")}>
      {t("profile.backToList")}
    </Button>
  ) : null;

  // Capability grantees may run the Profiles tab but never touch ADMIN
  // identities; a typed URL must hit the same wall as the hidden section.
  if (fromRegister && (!TYPE_META[routePtype] || (routePtype === "admin" && auth?.role !== "admin"))) {
    return (
      <div className="rounded-2xl py-10" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState title={t("profile.notFound")} message="" showUploadLink={false} />
        <div className="flex justify-center">{back}</div>
      </div>
    );
  }

  if (isLoading || (!fromRegister && !me)) return <ProfileSkeleton />;

  if (!item) {
    // A register URL that matches nothing is a dead end; an own view whose
    // row cannot be resolved falls back to plain read access, never to a wall.
    if (!fromRegister) return <MyProfile />;
    return (
      <div className="rounded-2xl py-10" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState title={t("profile.notFound")} message="" showUploadLink={false} />
        <div className="flex justify-center">{back}</div>
      </div>
    );
  }

  const context = [
    ptype === "leader" && item.supervisor ? tl(item.supervisor) : null,
    shift != null ? `${t("profile.shift")} ${shift}` : null,
    ptype === "supervisor" ? `Verifix ${item.id}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SaveBusCtx.Provider value={bus}>
      <AdminProfileBody
        ptype={ptype} item={item} data={data} own={own} back={back} context={context}
        dirty={dirty} busy={busy} onSave={bus.run} notify={notify} onDone={onDone}
        onChangePassword={() => setPwOpen(true)} pwEpoch={pwEpoch}
      />

      {/* Managers hold logins too — the self password change works from the
          same page that manages everyone else's. */}
      {own && (
        <ChangePasswordModal
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          onChanged={() => { setPwEpoch((n) => n + 1); toast.success(t("weblogin.changed")); }}
        />
      )}

      {toast.node}
    </SaveBusCtx.Provider>
  );
}

// The resolved profile at manage access. Its own component because the photo
// hook needs the profile to exist, and hooks cannot follow an early return.
function AdminProfileBody({
  ptype, item, data, own, back, context, dirty, busy, onSave, notify, onDone, onChangePassword, pwEpoch,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const photo = usePhotoActions({
    profileKey: item.profile_key, hasPhoto: Boolean(item.photo_ver), notify, onDone,
  });

  return (
    <div className="space-y-4">
      {back && <div>{back}</div>}

      <ProfileHero
        name={tl(item.name)}
        role={ptype}
        colorKey={item.name}
        profileKey={item.profile_key}
        photoVer={item.photo_ver}
        avatarBadge={photo.badge}
        menu={photo.menu}
        chips={
          <>
            <RoleChip role={ptype} />
            {ptype === "supervisor" && item.archived && (
              <StatusTag color={GREY}>{t("admin.profiles.archived")}</StatusTag>
            )}
            {ptype === "leader" && item.leader_kind === "acting" && (
              <StatusTag color={GREY}>{t("profile.leaderKind.acting")}</StatusTag>
            )}
            {ptype === "supervisor" && item.supervisor_kind === "acting" && (
              <StatusTag color={GREY}>{t("profile.supKind.acting")}</StatusTag>
            )}
            {ptype === "supervisor" && item.zagruzka_on === false && (
              <StatusTag color={GREY}>{t("profile.zagruzka.offChip")}</StatusTag>
            )}
          </>
        }
        context={context}
        facts={<ProfileFacts bind={bindState(item)} holders={item.bindings?.length ?? 0} web={item.web} />}
      />
      {photo.node}

      {/* One column, in the order the questions come: who they are, how they
          get in from a browser, which Telegram accounts are theirs. */}
      <EditCard ptype={ptype} item={item} data={data} notify={notify} onDone={onDone} />
      <WebLoginCard item={item} own={own} onChangePassword={onChangePassword}
                    resetSignal={pwEpoch} notify={notify} onDone={onDone} />
      <HoldersCard ptype={ptype} item={item} onDone={onDone} />

      {/* Every irreversible action for this profile lives in ONE full-width
          zone at the very end — never beside the daily controls. */}
      <DangerCard ptype={ptype} item={item} onDone={onDone} />

      {/* The page's one save action: here only while something is unsaved. */}
      {(dirty || busy) && <SaveBar busy={busy} onSave={onSave} />}
    </div>
  );
}

// ── page shell ────────────────────────────────────────────────────────────────

export default function Profile() {
  const { ptype, pid } = useParams();
  const { auth } = useAuth();
  const { capTabs } = useCapabilities();
  const { t } = useLang();

  const fromRegister = Boolean(ptype && pid);
  // Same audience as the register route: admins plus `admin.profiles.manage`
  // grantees. While capabilities load a grantee briefly gets the read view and
  // upgrades in place; admins resolve instantly from the role alone.
  const canManage = auth?.role === "admin" || capTabs.includes("profiles");

  return (
    <Layout title={t("profile.title")}>
      {/* One centered column of full-width cards. */}
      <div className="mx-auto w-full max-w-4xl">
        {fromRegister
          ? <AdminProfile ptype={ptype} pid={pid} fromRegister />
          : canManage ? <AdminProfile /> : <MyProfile />}
      </div>
    </Layout>
  );
}
