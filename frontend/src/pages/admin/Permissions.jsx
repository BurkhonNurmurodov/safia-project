import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Check, Minus, Shield, ClipboardCheck, CalendarClock, UserCog, History,
  LayoutGrid, Ban, Briefcase, Copy,
} from "lucide-react";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { PAGES } from "../../config/pages";
import {
  buildRecipientGroups, isProfileTarget, profileKeyOf, profileTargetKey,
} from "../../utils/broadcastTree";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import CheckboxTree, { collectLeafKeys } from "../../components/ui/CheckboxTree";
import EmptyState from "../../components/ui/EmptyState";
import { SectionHead, Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAdminDirty } from "./AdminPanel";
import CopyPermsModal from "./CopyPermsModal";

/**
 * Individual permissions — the person-level half of the permission system.
 *
 * The Access tab answers "which PAGES may this ROLE open"; this answers "which
 * admin-only ACTIONS may this ONE target perform", so one unit can be made the
 * factory's transfer handler without its people becoming admins.
 *
 * THE FIRST DECISION IS WHO THE TARGET IS, so it is the first control on the
 * page: a switch above the tree, «Lavozimlar» or «Hisoblar».
 *
 *   · a LAVOZIM (profile / position) holds the permission itself. Whoever fills
 *     the position wields it from the moment it is saved — all its current
 *     holders, and everyone who holds it later — and an account that switches to
 *     another profile leaves it behind, because nothing was ever written to that
 *     login. This is the target for "whoever runs this unit approves its
 *     documents", and it is the default: powers usually belong to the job.
 *   · a HISOB (Telegram account) holds it personally, wherever it goes and
 *     whatever it switches to. The exception, for when one login — not the
 *     position — is the thing being trusted.
 *
 * The switch decides what the tree's leaves ARE, rather than mixing both kinds
 * in one list: role ▸ [shift [▸ supervisor]] ▸ position, or the same descending
 * one level further to the individual logins. Both come off the shared
 * CheckboxTree builder the Broadcast recipient picker uses. Multi-select is the
 * point: granting five units the same power is one pass, and saving sends a
 * DIFF so each keeps whatever else it already held.
 *
 * The «Sahifalar» group is the same mechanism applied to PAGE ACCESS: one row
 * per page, so a page can be opened for ONE person without ticking their whole
 * role on the Access matrix — and, on the pages whose data narrows to the
 * viewer, with the scope selector deciding whether they read only their own
 * rows or the entire factory. Page rows carry THREE states, not two: inherit
 * (the role × page matrix decides), grant, and deny. Deny is the only
 * subtractive entry in the system and exists only here, because taking a page
 * from one supervisor used to mean taking it from every supervisor. Actions
 * stay two-state — their authority is checked by hardcoded rules that never
 * consult a deny list, so a denied ACTION would be a block that does nothing.
 *
 * «Nusxalash» hands the WHOLE set to other people (`CopyPermsModal`): the
 * selected person is the source, the same nested tree picks the destinations,
 * and each one ends up an exact MIRROR — the source's grants, scopes and blocks,
 * with anything they held beyond that removed. Re-ticking one supervisor's rows
 * onto the next by eye is how a page gets missed. It is deliberately not part of
 * the draft: the dialog writes on its own press (its own body is the review),
 * the server reads the source fresh, and a pending draft is named there and
 * excluded rather than silently travelling.
 *
 * A DENY reads the same way on both targets: permanent, never consumed. On a
 * position it is the one that matters — "this job does not see /staff" has to
 * survive the person filling it changing.
 *
 * Two deliberate omissions, enforced server-side too: this tab is itself never
 * grantable (handing out powers stays a real admin's job), and admin profiles
 * never appear in the tree — they already hold everything.
 */

// Group → the icon shown on its chip. Mirrors CAPABILITY_GROUPS in
// backend/app/capabilities.py.
const GROUP_ICONS = {
  requests:   ClipboardCheck,
  attendance: CalendarClock,
  identity:   UserCog,
  pages:      LayoutGrid,
};

// One fixed hue per group, matching the no-emoji soft-tint-chip convention.
const GROUP_TINTS = {
  requests:   "#3b82f6",
  attendance: "#22c55e",
  identity:   "#a855f7",
  pages:      "#f97316",
};

// pageKey → its nav label key. Page-view capabilities are labelled from the
// menu itself rather than from caps.<key>.label strings, so shipping a new page
// makes it grantable with no new translation keys in any of the 4 languages.
const PAGE_LABEL_KEYS = Object.fromEntries(PAGES.map((p) => [p.key, p.labelKey]));

// Audit rows follow the APP language, not the device locale.
const AUDIT_LOCALE = { uz: "uz-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };

function GroupChip({ group, label }) {
  const Icon = GROUP_ICONS[group] ?? Shield;
  const tint = GROUP_TINTS[group] ?? "var(--brand)";
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0"
        style={{ background: `${tint}1f`, color: tint }}
      >
        <Icon size={13} />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
        {label}
      </span>
    </div>
  );
}

/** Tri-state box for a capability across the whole selection. */
function CapBox({ state }) {   // "on" | "some" | "off"
  const on = state !== "off";
  return (
    <span
      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
      style={on
        ? { background: "var(--brand)", border: "1px solid var(--brand)", color: "#fff" }
        : { background: "transparent", border: "1px solid var(--border-md)" }}
    >
      {state === "on" && <Check size={12} strokeWidth={3} />}
      {state === "some" && <Minus size={12} strokeWidth={3} />}
    </span>
  );
}

// The three states of a PAGE row. A checkbox can only say yes/no, and "no" was
// forced to mean two different things at once — "the role decides" and "closed
// for this person". Splitting them is the whole point of the deny axis, so the
// control has to show all three at rest, not hide one behind a long-press.
const ROW_INHERIT = "inherit";
const ROW_GRANT   = "grant";
const ROW_DENY    = "deny";

// Which kind of target the tab is editing. Two namespaces, never mixed: a
// profile key is "profile:<role>:<id>", an account key is a telegram id as a
// string, and `isProfileTarget` tells them apart everywhere below.
const AXIS_PROFILE = "profiles";
const AXIS_USER    = "users";

export default function Permissions() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [search, setSearch]     = usePersistentState("perms_search", "");
  // Which kind of target is being edited. Positions first: a permission usually
  // belongs to the job, and the account axis is the deliberate exception.
  const [axis, setAxis]         = usePersistentState("perms_axis", AXIS_PROFILE);
  // Leaf keys of the CURRENT axis — a telegram id as a string, or
  // "profile:<role>:<id>" for a position.
  const [selected, setSelected] = usePersistentState("perms_selected", []);
  // Explicit admin edits only: { capability: "own" | "all" | "deny" | null },
  // null = clear back to inherit. Anything untouched stays absent and is left
  // alone on save — that's what makes multi-select safe.
  const [draft, setDraft]       = useState({});
  const [view, setView]         = usePersistentState("perms_view", "grants"); // grants | audit
  const [saving, setSaving]     = useState(false);
  const [pendingSel, setPendingSel] = useState(null);  // selection awaiting a discard confirm
  const [confirmSave, setConfirmSave] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-capabilities"],
    queryFn: () => api.get("/admin/capabilities").then((r) => r.data),
  });

  const { data: audit } = useQuery({
    queryKey: ["admin-capabilities-audit"],
    queryFn: () => api.get("/admin/capabilities/audit").then((r) => r.data),
    enabled: view === "audit",
  });

  const capabilities = data?.capabilities ?? [];
  const groups = data?.groups ?? [];

  const profileAxis = axis === AXIS_PROFILE;

  // role ▸ [shift [▸ supervisor]] ▸ position, or the same descending one level
  // further to the logins — straight off the shared Broadcast-picker builder so
  // both read identically. Every leaf carries a chip with the number of entries
  // it already holds. `byKey` covers BOTH kinds whatever the tree shows, so
  // nothing below has to branch on which is selected.
  const { tree, byKey } = useMemo(() => {
    const blocks = data?.tree ?? [];
    const byKey = {};
    const entryCount = (n) => Object.keys(n.caps || {}).length + (n.denies || []).length;
    for (const block of blocks) {
      for (const p of block.profiles || []) {
        const pk = profileTargetKey(p.key);
        byKey[pk] = {
          key: pk, kind: "profile", name: tl(p.name), role: block.role,
          caps: p.caps || {}, denies: p.denies || [], holders: (p.users || []).length,
        };
        for (const u of p.users || []) {
          const k = String(u.telegram_id);
          if (!byKey[k]) {
            byKey[k] = { ...u, key: k, kind: "user", caps: u.caps || {},
                         denies: u.denies || [], posts: [] };
          }
          byKey[k].posts.push(tl(p.name));
        }
      }
    }
    const chip = (n) => (entryCount(n) > 0 ? String(entryCount(n)) : undefined);
    // On the positions axis the profile IS the leaf and its accounts are not
    // listed at all: showing a login the current mode cannot write to is how an
    // admin ticks a row and saves nothing they meant. On the accounts axis a
    // profile whose holders all signed out has no login left to write to, but
    // the POSITION is still there — so it is offered as the leaf (the save
    // payload carries both kinds) instead of the disabled dead end that used to
    // make "set their permissions before they re-register" impossible.
    const tree = buildRecipientGroups(
      blocks, t, tl, t("admin.broadcast.notRegistered"),
      profileAxis ? undefined : chip,
      profileAxis
        ? (p) => ({ only: true, hint: chip(p) })
        : (p) => ((p.users || []).length ? null : { only: true, hint: chip(p) }),
    );
    return { tree, byKey };
  }, [data, t, tl, profileAxis]);

  const allKeys = useMemo(() => collectLeafKeys(tree), [tree]);
  // Keys the tree on screen can actually show. `selected` is persisted across
  // sessions, a deploy can change the default axis under it, and a profile can
  // be deleted while its key sits saved — so membership in the visible tree is
  // the filter, not namespace parity (the accounts axis now legitimately holds
  // BOTH kinds: logins, plus unclaimed positions offered in their place). A
  // stale key must not drive a panel whose tree shows nothing ticked.
  const keys = useMemo(() => {
    const ok = new Set(allKeys);
    return selected.filter((k) => ok.has(k));
  }, [selected, allKeys]);
  const chosen = keys.map((k) => byKey[k]).filter(Boolean);
  const chosenProfiles = chosen.filter((c) => c.kind === "profile");
  const chosenUsers = chosen.filter((c) => c.kind === "user");
  // The accounts axis can hold positions too (an unclaimed profile stands in
  // for its missing logins), so any wording that names the target kind follows
  // the selection's real composition, never the axis label.
  const allProfilesChosen = chosen.length > 0 && chosenUsers.length === 0;

  /** Human label for a capability id — page grants read as «Sahifalar · Ishlab
   *  chiqarish» so the audit log never shows a bare page name next to actions. */
  function capLabel(key) {
    const meta = capabilities.find((c) => c.key === key);
    if (!meta?.page) return t(`caps.${key}.label`);
    return `${t("admin.perms.group.pages")} · ${t(PAGE_LABEL_KEYS[meta.page] ?? `nav.${meta.page}`)}`;
  }

  /**
   * Where a row stands across the whole selection, draft on top:
   * "grant" | "deny" | "inherit" | "mixed". "mixed" is its own answer rather
   * than a rounded-off guess — with several targets selected, showing one of
   * their states as if it were shared is how an admin saves a change they never
   * intended to make.
   */
  function rowState(key) {
    if (key in draft) {
      const v = draft[key];
      return v == null ? ROW_INHERIT : v === ROW_DENY ? ROW_DENY : ROW_GRANT;
    }
    if (!chosen.length) return ROW_INHERIT;
    const granted = chosen.filter((p) => (p.caps || {})[key] != null).length;
    const denied = chosen.filter((p) => (p.denies || []).includes(key)).length;
    if (granted === chosen.length) return ROW_GRANT;
    if (denied === chosen.length) return ROW_DENY;
    if (granted === 0 && denied === 0) return ROW_INHERIT;
    return "mixed";
  }

  /** The old two-state view of a row, for the checkbox on ACTION rows. */
  function capState(key) {
    const s = rowState(key);
    return s === ROW_GRANT ? "on" : s === "mixed" ? "some" : "off";
  }

  /** Common scope across the selection, or null when they differ. */
  function capScope(key) {
    if (key in draft) return draft[key] === ROW_DENY ? null : draft[key];
    const scopes = new Set(chosen.map((p) => (p.caps || {})[key]).filter(Boolean));
    return scopes.size === 1 ? [...scopes][0] : null;
  }

  /** Move a row to one of the three states. */
  function setRow(key, next) {
    const meta = capabilities.find((c) => c.key === key);
    const value = next === ROW_INHERIT ? null
      : next === ROW_DENY ? ROW_DENY
      : (meta?.scoped === false ? "all" : (capScope(key) ?? "own"));
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCap(key) {
    setRow(key, capState(key) === "on" ? ROW_INHERIT : ROW_GRANT);
  }

  function setScope(key, scope) {
    setDraft((prev) => ({ ...prev, [key]: scope }));
  }

  const dirty = Object.keys(draft).length > 0;
  // Tab switches unmount this component; the shell asks before discarding.
  useAdminDirty(dirty);

  /**
   * Changing the selection used to call setDraft({}) — every tree click silently
   * destroyed pending edits. Toggle five capabilities, mis-tap one more row on a
   * phone, and the work was gone with no warning, no confirm, and no way to tell
   * it had happened.
   */
  function requestSelection(next) {
    if (dirty) { setPendingSel({ selected: next }); return; }
    setSelected(next);
  }

  /**
   * Switching axis empties the selection: the two namespaces name different
   * things, and carrying ticks across would leave the matrix editing targets
   * the tree no longer shows. Same discard guard as any other selection change.
   */
  function requestAxis(next) {
    if (next === axis) return;
    if (dirty) { setPendingSel({ axis: next, selected: [] }); return; }
    setAxis(next);
    setSelected([]);
  }

  const grantCount = Object.values(draft).filter((v) => v != null && v !== ROW_DENY).length;
  const denyCount = Object.values(draft).filter((v) => v === ROW_DENY).length;
  const revokeCount = Object.values(draft).filter((v) => v == null).length;
  const changeCount = grantCount + denyCount + revokeCount;

  async function save() {
    if (!keys.length || !dirty) return;
    setSaving(true);
    try {
      const grants = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v != null && v !== ROW_DENY));
      const denies = Object.entries(draft).filter(([, v]) => v === ROW_DENY).map(([k]) => k);
      const revokes = Object.entries(draft).filter(([, v]) => v == null).map(([k]) => k);
      await api.put("/admin/capabilities", {
        keys:     keys.filter((k) => !isProfileTarget(k)).map(Number),
        profiles: keys.filter(isProfileTarget).map(profileKeyOf),
        grants, denies, revokes,
      });
      qc.invalidateQueries({ queryKey: ["admin-capabilities"] });
      qc.invalidateQueries({ queryKey: ["admin-capabilities-audit"] });
      // Entries are read live by their holders; refresh our own copy too.
      qc.invalidateQueries({ queryKey: ["my-capabilities"] });
      setDraft({});
      setConfirmSave(false);
      toast.success(
        t(allProfilesChosen ? "admin.perms.savedNProfiles" : "admin.perms.savedN")
          .replace("{n}", changeCount).replace("{m}", keys.length),
      );
    } catch (e) {
      // Was a borrowed generic word painted into the button for 3 seconds. On a
      // permissions surface, "did that grant land?" must never be ambiguous.
      toast.error(e?.response?.data?.detail || t("admin.perms.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  /**
   * A copy is written by the dialog itself — one press after ticking, no second
   * confirm — so all this does is say what landed and refetch. The toast names
   * the removals separately: an exact copy also TAKES, and the count of what it
   * took is the one number nobody asked for by name.
   */
  function copyDone(res) {
    setCopyOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-capabilities"] });
    qc.invalidateQueries({ queryKey: ["admin-capabilities-audit"] });
    qc.invalidateQueries({ queryKey: ["my-capabilities"] });
    toast.success(
      t(res?.removed ? "admin.perms.copy.doneRemoved" : "admin.perms.copy.done")
        .replace("{n}", res?.entries ?? 0)
        .replace("{m}", res?.targets ?? 0)
        .replace("{r}", res?.removed ?? 0),
    );
  }

  const only = chosen.length === 1 ? chosen[0] : null;
  const headTitle = only
    ? only.name
    : t(allProfilesChosen ? "admin.perms.nSelectedProfiles" : "admin.perms.nSelected")
        .replace("{n}", chosen.length);
  const headSub = only
    ? (only.kind === "profile"
        ? (only.holders
            ? t("admin.perms.profileHeldBy").replace("{n}", only.holders)
            : t("admin.perms.profileUnclaimed"))
        : (only.posts && only.posts.length
            ? t("admin.perms.holds").replace("{names}", [...new Set(only.posts)].join(", "))
            : (only.username ? `@${only.username}` : "")))
    : t(allProfilesChosen ? "admin.perms.bulkHintProfiles" : "admin.perms.bulkHint");

  return (
    <div className="space-y-4">
      {/* Toolbar — one aligned row, 38px baseline */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("admin.perms.searchPlaceholder")}
          className="w-full sm:w-72"
        />
        <div className="ml-auto">
          <SegmentedToggle
            value={view}
            onChange={setView}
            options={[
              { value: "grants", label: <span className="inline-flex items-center gap-1.5"><KeyRound size={14} /> {t("admin.perms.tabGrants")}</span> },
              { value: "audit",  label: <span className="inline-flex items-center gap-1.5"><History size={14} /> {t("admin.perms.tabAudit")}</span> },
            ]}
          />
        </div>
      </div>

      {view === "audit" ? (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead
            icon={History}
            title={t("admin.perms.auditTitle")}
            subtitle={t("admin.perms.auditHint")}
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{(audit ?? []).length}</span>}
          />
          {!audit ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
            </div>
          ) : audit.length === 0 ? (
            <div className="py-10 text-center text-xs" style={{ color: "var(--text-4)" }}>
              {t("admin.perms.auditEmpty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                {/* Was tbody-only: five unlabelled columns where "target" and
                    "actor" are both bare person names sitting next to each
                    other — in an audit log, who-received vs who-granted is the
                    one thing that must never be ambiguous. */}
                <thead>
                  <tr>
                    <Th label={t("admin.perms.colWhen")} />
                    <Th label={t("admin.perms.colTarget")} />
                    <Th label={t("admin.perms.colCapability")} />
                    <Th label={t("admin.perms.colAction")} />
                    <Th label={t("admin.perms.colActor")} />
                  </tr>
                </thead>
                <tbody>
                  {audit.map((r) => {
                    const tone = r.action === "revoked" || r.action === "denied" ? "#ef4444"
                      : r.action === "granted" ? "#22c55e" : "#eab308";
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString(AUDIT_LOCALE[lang] || "ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>
                          {r.target_name || (r.telegram_id ? `#${r.telegram_id}` : "—")}
                          {/* Same column, two kinds of target — a change aimed at
                              a POSITION reaches whoever fills it next, so the log
                              has to say which one it was. */}
                          {r.is_profile && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] align-middle"
                              style={{ background: "#f9731714", color: "#f97316" }}
                            >
                              <Briefcase size={9} /> {t("admin.perms.profileTarget")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                          {capLabel(r.capability)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: `${tone}1f`, color: tone }}
                          >
                            {t(`admin.perms.action.${r.action}`)}
                          </span>
                          {r.scope && (
                            <span className="ml-2 text-[10px]" style={{ color: "var(--text-4)" }}>
                              {t(`admin.perms.scope.${r.scope}`)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{r.actor_name || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
          {/* Target tree — role ▸ [shift ▸ supervisor] ▸ position, descending one
              level further to the logins on the accounts axis. Same template as the
              Broadcast picker either way. */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead
              icon={profileAxis ? Briefcase : KeyRound}
              title={t(profileAxis ? "admin.perms.profilesTitle" : "admin.perms.peopleTitle")}
              right={
                <div className="flex items-center gap-1">
                  <span className="text-[11px] mr-1" style={{ color: "var(--text-4)" }}>
                    {keys.length}/{allKeys.length}
                  </span>
                  <Button variant="ghost" size="sm" disabled={!keys.length}
                          onClick={() => requestSelection([])}>
                    {t("admin.broadcast.clearAll")}
                  </Button>
                </div>
              }
            />
            {/* WHO the permission is written to — the first decision, so the
                first control, above the tree it changes. Two targets that look
                identical on the matrix below and mean entirely different things
                once somebody changes job, which is why the line under it says
                what each one does rather than trusting two nouns to carry it. */}
            <div className="px-3 pt-3 pb-2.5 space-y-1.5"
                 style={{ borderBottom: "1px solid var(--border)" }}>
              <SegmentedToggle
                fill
                ariaLabel={t("admin.perms.axisLabel")}
                value={axis}
                onChange={requestAxis}
                options={[
                  { value: AXIS_PROFILE, label: (
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase size={13} /> {t("admin.perms.axis.profiles")}
                      </span>) },
                  { value: AXIS_USER, label: (
                      <span className="inline-flex items-center gap-1.5">
                        <UserCog size={13} /> {t("admin.perms.axis.users")}
                      </span>) },
                ]}
              />
              <p className="text-[11px] leading-snug" style={{ color: "var(--text-4)" }}>
                {t(profileAxis ? "admin.perms.axisHint.profiles" : "admin.perms.axisHint.users")}
              </p>
            </div>
            <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 460 }}>
              {isLoading ? (
                <div className="space-y-2 px-2 py-1">
                  {[...Array(6)].map((_, i) => <SkeletonBlock key={i} className="h-7 w-full" />)}
                </div>
              ) : (
                <CheckboxTree
                  groups={tree}
                  selected={keys}
                  onChange={requestSelection}
                  filter={search}
                  emptyText={t(profileAxis ? "admin.perms.noProfiles" : "admin.perms.noPeople")}
                />
              )}
            </div>
          </div>

          {/* Capabilities for the selection */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {!chosen.length ? (
              <EmptyState
                title={t(profileAxis ? "admin.perms.pickTitleProfile" : "admin.perms.pickTitle")}
                message={t(profileAxis ? "admin.perms.pickHintProfile" : "admin.perms.pickHint")}
                showUploadLink={false}
                height="h-64"
              />
            ) : (
              <>
                <SectionHead
                  icon={KeyRound}
                  title={headTitle}
                  subtitle={headSub}
                  right={
                    <div className="flex items-center gap-2">
                      {/* Hand this whole set to other people. Needs ONE source,
                          so with a bulk selection it stays visible and disabled
                          rather than vanishing — the count beside it is the
                          explanation, and its title spells it out. */}
                      <Button
                        variant="secondary"
                        size="md"
                        icon={Copy}
                        disabled={!only}
                        title={only ? undefined : t("admin.perms.copy.needOne")}
                        onClick={() => setCopyOpen(true)}
                      >
                        {t("admin.perms.copy.button")}
                      </Button>
                      <Button
                        size="md"
                        onClick={() => (grantCount + denyCount > 0 ? setConfirmSave(true) : save())}
                        loading={saving}
                        disabled={!dirty}
                      >
                        {dirty ? t("admin.perms.saveN").replace("{n}", changeCount) : t("admin.save")}
                      </Button>
                    </div>
                  }
                />
                {/* WHO a save will reach, said before it is made rather than
                    discovered afterwards. The matrix below is identical on both
                    axes, so without this line the one fact that distinguishes
                    them — whether the power stays with the job or leaves with
                    the person — is nowhere on the screen doing the writing. */}
                {(chosenProfiles.length > 0 || chosenUsers.length > 0) && (
                  <div
                    className="mx-4 mt-4 rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                    style={chosenProfiles.length
                      ? { background: "#C8973F14", border: "1px solid #C8973F33" }
                      : { background: "#a855f714", border: "1px solid #a855f733" }}
                  >
                    {chosenProfiles.length ? (
                      <Briefcase size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand)" }} />
                    ) : (
                      <UserCog size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#a855f7" }} />
                    )}
                    <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-2)" }}>
                      {t(chosenProfiles.length
                        ? "admin.perms.profileTargetHint"
                        : "admin.perms.userTargetHint")
                        .replace("{n}", chosenProfiles.length || chosenUsers.length)}
                    </p>
                  </div>
                )}
                <div className="p-4 space-y-5">
                  {groups.map((group) => (
                    <div key={group} className="space-y-2">
                      <GroupChip group={group} label={t(`admin.perms.group.${group}`)} />
                      <div className="space-y-1.5 pl-8">
                        {capabilities.filter((c) => c.group === group).map((c) => {
                          const state = capState(c.key);
                          const row = rowState(c.key);
                          const scope = capScope(c.key);
                          // Pages carry the third state; actions cannot (see the
                          // file header — a denied action would be a block no
                          // authority check ever consults).
                          const deniable = !!c.page;
                          return (
                            <div key={c.key} className="flex items-center gap-3 flex-wrap">
                              {deniable ? (
                                <SegmentedToggle
                                  size="sm"
                                  className="flex-shrink-0"
                                  ariaLabel={t(PAGE_LABEL_KEYS[c.page] ?? `nav.${c.page}`)}
                                  /* "mixed" maps to no segment: with several
                                     targets disagreeing, lighting one up would
                                     state a shared setting that does not exist. */
                                  value={row === "mixed" ? "" : row}
                                  onChange={(v) => setRow(c.key, v)}
                                  options={[
                                    { value: ROW_INHERIT, label: <Minus size={13} />,
                                      title: t("admin.perms.state.inherit") },
                                    { value: ROW_GRANT, label: <Check size={13} />,
                                      title: t("admin.perms.state.grant") },
                                    { value: ROW_DENY, label: <Ban size={13} />,
                                      title: t("admin.perms.state.deny") },
                                  ]}
                                />
                              ) : (
                                <button type="button" onClick={() => toggleCap(c.key)}
                                        aria-checked={state === "some" ? "mixed" : state === "on"}
                                        role="checkbox" className="flex-shrink-0">
                                  <CapBox state={state} />
                                </button>
                              )}
                              <button
                                type="button"
                                /* The label toggles between "role decides" and
                                   "open" only. From a BLOCK it steps back to
                                   inherit rather than flipping straight to a
                                   grant — a stray tap on a row's name must not
                                   turn a deliberate block into its opposite. */
                                onClick={() => (deniable
                                  ? setRow(c.key, row === ROW_INHERIT || row === "mixed"
                                      ? ROW_GRANT : ROW_INHERIT)
                                  : toggleCap(c.key))}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block text-sm" style={{ color: "var(--text-1)" }}>
                                  {c.page
                                    ? t(PAGE_LABEL_KEYS[c.page] ?? `nav.${c.page}`)
                                    : t(`caps.${c.key}.label`)}
                                </span>
                                <span
                                  className="block text-[11px]"
                                  style={{ color: row === ROW_DENY ? "#ef4444" : "var(--text-4)" }}
                                >
                                  {row === ROW_DENY
                                    ? t("admin.perms.deniedHint")
                                    : c.page
                                      ? t(c.scoped ? "admin.perms.pageHintScoped"
                                                   : "admin.perms.pageHint")
                                      : t(`caps.${c.key}.hint`)}
                                </span>
                              </button>
                              {/* Identity capabilities have no unit dimension to
                                  narrow, so they show a static chip instead of a
                                  selector that changes nothing. */}
                              {c.scoped ? (
                                <StyledSelect
                                  /* scope === null means the selected users
                                     disagree — show "Mixed" rather than picking
                                     one of them and quietly implying it. */
                                  value={scope ?? ""}
                                  onChange={(v) => setScope(c.key, v)}
                                  disabled={row !== ROW_GRANT}
                                  placeholder={scope == null ? t("admin.perms.scope.mixed") : undefined}
                                  triggerClassName="px-2.5 py-1.5 text-xs"
                                  className="w-32 flex-shrink-0"
                                  options={[
                                    { value: "own", label: t("admin.perms.scope.own") },
                                    { value: "all", label: t("admin.perms.scope.all") },
                                  ]}
                                />
                              ) : (
                                <span
                                  className="w-32 flex-shrink-0 text-center text-[11px] px-2.5 py-1.5 rounded-lg"
                                  style={{ color: "var(--text-4)", border: "1px solid var(--border)" }}
                                >
                                  {t("admin.perms.scope.all")}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] pt-1" style={{ color: "var(--text-4)" }}>
                    {t("admin.perms.footHint")}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
                    {t("admin.perms.denyFootHint")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingSel}
        title={t("admin.unsavedTitle")}
        message={t("admin.perms.discardMsg").replace("{n}", changeCount)}
        confirmLabel={t("admin.unsavedDiscard")}
        onCancel={() => setPendingSel(null)}
        onConfirm={() => {
          if (pendingSel.axis) setAxis(pendingSel.axis);
          setSelected(pendingSel.selected);
          setDraft({});
          setPendingSel(null);
        }}
      />

      {/* The backend DMs every admin whenever a granted power is USED, yet the
          UI conveyed no gravity at all: "delete attendance records" rendered
          identically to a harmless page grant, and one tap on a branch checkbox
          select-alls a whole role. Granting now reads back what it is about to
          do, to how many targets — and blocks are listed separately from grants,
          because closing a page for somebody is not a milder version of opening
          one and must not be skimmed past in a shared list. */}
      <ConfirmDialog
        open={confirmSave}
        tone="danger"
        title={t("admin.perms.confirmTitle")}
        message={
          <>
            <p className="mb-2">
              {t(allProfilesChosen ? "admin.perms.confirmMsgProfiles" : "admin.perms.confirmMsg")
                .replace("{n}", grantCount + denyCount)
                .replace("{m}", keys.length)}
            </p>
            <ul className="space-y-0.5">
              {Object.entries(draft)
                .filter(([, v]) => v != null && v !== ROW_DENY).slice(0, 8).map(([k]) => (
                  <li key={k} style={{ color: "var(--text-2)" }}>+ {capLabel(k)}</li>
                ))}
              {Object.entries(draft)
                .filter(([, v]) => v === ROW_DENY).slice(0, 8).map(([k]) => (
                  <li key={k} style={{ color: "#ef4444" }}>− {capLabel(k)}</li>
                ))}
            </ul>
            {chosenProfiles.length > 0 && (
              <p className="mt-2" style={{ color: "var(--text-3)" }}>
                {t("admin.perms.confirmProfiles").replace("{n}", chosenProfiles.length)}
              </p>
            )}
            {revokeCount > 0 && (
              <p className="mt-2" style={{ color: "var(--text-3)" }}>
                {t("admin.perms.confirmRevokes").replace("{n}", revokeCount)}
              </p>
            )}
          </>
        }
        confirmLabel={t("admin.save")}
        loading={saving}
        onCancel={() => setConfirmSave(false)}
        onConfirm={save}
      />

      {/* Keyed by the source: opening it for someone else starts with an empty
          selection instead of inheriting the last person's ticks. */}
      {copyOpen && only && (
        <CopyPermsModal
          key={only.key}
          source={only}
          tree={tree}
          capLabel={capLabel}
          dirtyCount={changeCount}
          onClose={() => setCopyOpen(false)}
          onDone={copyDone}
        />
      )}

      {toast.node}
    </div>
  );
}
