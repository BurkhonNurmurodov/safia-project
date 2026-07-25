import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Check, Minus, Shield, ClipboardCheck, CalendarClock, UserCog, History,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_SECTIONS } from "../../utils/broadcastTree";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import CheckboxTree, { collectLeafKeys } from "../../components/ui/CheckboxTree";
import EmptyState from "../../components/ui/EmptyState";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";

/**
 * Per-profile capabilities — the person-level half of the permission system.
 *
 * The Access tab answers "which PAGES may this ROLE open"; this answers "which
 * admin-only ACTIONS may this ONE person perform", so a supervisor can be made
 * the factory's transfer handler without becoming an admin.
 *
 * The picker is the shared CheckboxTree, same as the Broadcast recipient tree —
 * but two levels (role ▸ profile) instead of three: a capability belongs to a
 * PROFILE, so the tree stops there and never descends to Telegram accounts.
 * Multi-select is the point: granting five supervisors the same power is one
 * pass, and saving sends a DIFF so each keeps whatever else they already held.
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
};

// One fixed hue per group, matching the no-emoji soft-tint-chip convention.
const GROUP_TINTS = {
  requests:   "#3b82f6",
  attendance: "#22c55e",
  identity:   "#a855f7",
};

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

export default function Permissions() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState([]);   // profile keys (leaf keys)
  // Explicit admin edits only: { capability: "own" | "all" | null }, null =
  // revoke. Anything untouched stays absent and is left alone on save — that's
  // what makes multi-select safe.
  const [draft, setDraft]       = useState({});
  const [view, setView]         = useState("grants"); // grants | audit
  const [saving, setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-capabilities"],
    queryFn: () => api.get("/admin/capabilities").then((r) => r.data),
  });

  const { data: audit } = useQuery({
    queryKey: ["admin-capabilities-audit"],
    queryFn: () => api.get("/admin/capabilities/audit").then((r) => r.data),
    enabled: view === "audit",
  });

  const people = data?.people ?? [];
  const capabilities = data?.capabilities ?? [];
  const groups = data?.groups ?? [];
  const byKey = useMemo(() => Object.fromEntries(people.map((p) => [p.key, p])), [people]);

  // Sub-line under a profile: its shift or its supervisor's unit, localised
  // here rather than pre-joined by the backend.
  const subOf = (p) => {
    if (p.shift) return t("admin.cleanup.shiftN").replace("{n}", p.shift);
    if (p.unit) return tl(p.unit);
    return undefined;
  };

  // role ▸ profile, in the Broadcast tree's section order.
  const tree = useMemo(() => {
    const order = Object.keys(ROLE_SECTIONS);
    const byRole = new Map();
    for (const p of people) {
      if (!byRole.has(p.role)) byRole.set(p.role, []);
      byRole.get(p.role).push(p);
    }
    return order
      .filter((role) => byRole.has(role))
      .map((role) => {
        const meta = ROLE_SECTIONS[role] || {};
        return {
          key: role,
          label: meta.tKey ? t(meta.tKey) : role,
          icon: meta.icon,
          children: byRole.get(role).map((p) => {
            const n = Object.keys(p.caps || {}).length;
            return {
              key: p.key,
              label: tl(p.name),
              sub: subOf(p),
              // Held capabilities are the one thing worth seeing without
              // opening a profile, so they ride the row as a chip.
              hint: n > 0 ? String(n) : undefined,
            };
          }),
        };
      });
  }, [people, t, tl]);

  const allKeys = useMemo(() => collectLeafKeys(tree), [tree]);
  const chosen = selected.map((k) => byKey[k]).filter(Boolean);

  /** Current state of a capability across the selection, with the draft on top. */
  function capState(key) {
    if (key in draft) return draft[key] == null ? "off" : "on";
    if (!chosen.length) return "off";
    const held = chosen.filter((p) => (p.caps || {})[key] != null).length;
    return held === 0 ? "off" : held === chosen.length ? "on" : "some";
  }

  /** Common scope across the selection, or null when they differ. */
  function capScope(key) {
    if (key in draft) return draft[key];
    const scopes = new Set(chosen.map((p) => (p.caps || {})[key]).filter(Boolean));
    return scopes.size === 1 ? [...scopes][0] : null;
  }

  function toggleCap(key) {
    const meta = capabilities.find((c) => c.key === key);
    const next = capState(key) === "on" ? null
      : (meta?.scoped === false ? "all" : (capScope(key) ?? "own"));
    setDraft((prev) => ({ ...prev, [key]: next }));
  }

  function setScope(key, scope) {
    setDraft((prev) => ({ ...prev, [key]: scope }));
  }

  const dirty = Object.keys(draft).length > 0;

  async function save() {
    if (!selected.length || !dirty) return;
    setSaving(true);
    try {
      const grants = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v != null));
      const revokes = Object.entries(draft).filter(([, v]) => v == null).map(([k]) => k);
      await api.put("/admin/capabilities", { keys: selected, grants, revokes });
      qc.invalidateQueries({ queryKey: ["admin-capabilities"] });
      qc.invalidateQueries({ queryKey: ["admin-capabilities-audit"] });
      // Grants are read live by their holders; refresh our own copy too.
      qc.invalidateQueries({ queryKey: ["my-capabilities"] });
      setDraft({});
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  }

  const headTitle = chosen.length === 1
    ? tl(chosen[0].name)
    : t("admin.perms.nSelected").replace("{n}", chosen.length);
  const headSub = chosen.length === 1
    ? ((chosen[0].holders || []).length
        ? t("admin.perms.heldBy").replace("{names}", chosen[0].holders.map(tl).join(", "))
        : t("admin.perms.noHolders"))
    : t("admin.perms.bulkHint");

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-4">
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
                <tbody>
                  {audit.map((r) => {
                    const person = byKey[r.profile_key];
                    const tone = r.action === "revoked" ? "#ef4444"
                      : r.action === "granted" ? "#22c55e" : "#eab308";
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>
                          {person ? tl(person.name) : r.profile_key}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                          {t(`caps.${r.capability}.label`)}
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
          {/* Profile tree — role ▸ profile, same template as the Broadcast picker */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead
              icon={KeyRound}
              title={t("admin.perms.peopleTitle")}
              right={
                <div className="flex items-center gap-1">
                  <span className="text-[11px] mr-1" style={{ color: "var(--text-4)" }}>
                    {selected.length}/{allKeys.length}
                  </span>
                  <Button variant="ghost" size="sm" disabled={!selected.length}
                          onClick={() => { setSelected([]); setDraft({}); }}>
                    {t("admin.broadcast.clearAll")}
                  </Button>
                </div>
              }
            />
            <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 460 }}>
              {isLoading ? (
                <div className="space-y-2 px-2 py-1">
                  {[...Array(6)].map((_, i) => <SkeletonBlock key={i} className="h-7 w-full" />)}
                </div>
              ) : (
                <CheckboxTree
                  groups={tree}
                  selected={selected}
                  onChange={(next) => { setSelected(next); setDraft({}); }}
                  filter={search}
                  emptyText={t("admin.perms.noPeople")}
                />
              )}
            </div>
          </div>

          {/* Capabilities for the selection */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {!chosen.length ? (
              <EmptyState
                title={t("admin.perms.pickTitle")}
                message={t("admin.perms.pickHint")}
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
                    <Button
                      size="md"
                      onClick={save}
                      loading={saving}
                      disabled={!dirty}
                      variant={saveStatus === "error" ? "danger" : "primary"}
                      icon={saveStatus === "ok" ? <Check size={14} /> : null}
                    >
                      {saveStatus === "ok" ? t("admin.saved")
                        : saveStatus === "error" ? t("admin.refreshFailed")
                        : t("admin.save")}
                    </Button>
                  }
                />
                <div className="p-4 space-y-5">
                  {groups.map((group) => (
                    <div key={group} className="space-y-2">
                      <GroupChip group={group} label={t(`admin.perms.group.${group}`)} />
                      <div className="space-y-1.5 pl-8">
                        {capabilities.filter((c) => c.group === group).map((c) => {
                          const state = capState(c.key);
                          const scope = capScope(c.key);
                          return (
                            <div key={c.key} className="flex items-center gap-3 flex-wrap">
                              <button type="button" onClick={() => toggleCap(c.key)}
                                      aria-checked={state === "some" ? "mixed" : state === "on"}
                                      role="checkbox" className="flex-shrink-0">
                                <CapBox state={state} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCap(c.key)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block text-sm" style={{ color: "var(--text-1)" }}>
                                  {t(`caps.${c.key}.label`)}
                                </span>
                                <span className="block text-[11px]" style={{ color: "var(--text-4)" }}>
                                  {t(`caps.${c.key}.hint`)}
                                </span>
                              </button>
                              {/* Identity capabilities have no unit dimension to
                                  narrow, so they show a static chip instead of a
                                  selector that changes nothing. */}
                              {c.scoped ? (
                                <StyledSelect
                                  /* scope === null means the selected profiles
                                     disagree — show "Mixed" rather than picking
                                     one of them and quietly implying it. */
                                  value={scope ?? ""}
                                  onChange={(v) => setScope(c.key, v)}
                                  disabled={state === "off"}
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
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
