import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound, Check, Users, Shield, ClipboardCheck, CalendarClock, UserCog, History,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
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
 * Two deliberate omissions, enforced server-side too: this tab is itself never
 * grantable (handing out powers stays a real admin's job), and admin profiles
 * never appear in the list — they already hold everything.
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

export default function Permissions() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);   // profile key
  const [draft, setDraft]     = useState(null);     // { capability: scope }
  const [view, setView]       = useState("grants"); // grants | audit
  const [saving, setSaving]   = useState(false);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      (tl(p.name) || p.name || "").toLowerCase().includes(q)
      || (p.detail || "").toLowerCase().includes(q)
      || (p.holders || []).some((h) => h.toLowerCase().includes(q)));
  }, [people, search, tl]);

  const current = people.find((p) => p.key === selected) ?? null;
  // `draft` is null until the admin touches something — until then the saved
  // grants are the truth, so re-fetches stay visible instead of being shadowed
  // by a stale local copy.
  const caps = draft ?? current?.caps ?? {};
  const dirty = draft !== null;

  function pick(person) {
    setSelected(person.key);
    setDraft(null);
    setSaveStatus("idle");
  }

  function toggleCap(key) {
    setDraft((prev) => {
      const base = { ...(prev ?? current?.caps ?? {}) };
      if (base[key] != null) delete base[key];
      // Unit-scoped grants start narrow on purpose; the identity ones have no
      // narrower option (see UNSCOPED_CAPABILITIES on the backend).
      else base[key] = (capabilities.find((c) => c.key === key)?.scoped === false) ? "all" : "own";
      return base;
    });
  }

  function setScope(key, scope) {
    setDraft((prev) => {
      const base = { ...(prev ?? current?.caps ?? {}) };
      if (base[key] != null) base[key] = scope;
      return base;
    });
  }

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      await api.put(`/admin/capabilities/${encodeURIComponent(current.key)}`, { caps });
      qc.invalidateQueries({ queryKey: ["admin-capabilities"] });
      qc.invalidateQueries({ queryKey: ["admin-capabilities-audit"] });
      // The grantee's own session reads these live — refresh ours too so an
      // admin editing their own peers sees the panel react immediately.
      qc.invalidateQueries({ queryKey: ["my-capabilities"] });
      setDraft(null);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  }

  const grantedCount = (p) => Object.keys(p.caps || {}).length;

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
                    const person = people.find((p) => p.key === r.profile_key);
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] items-start">
          {/* People */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead
              icon={Users}
              title={t("admin.perms.peopleTitle")}
              right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{filtered.length}</span>}
            />
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(6)].map((_, i) => <SkeletonBlock key={i} className="h-9 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-xs" style={{ color: "var(--text-4)" }}>
                {t("admin.perms.noPeople")}
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                {filtered.map((p) => {
                  const active = p.key === selected;
                  const n = grantedCount(p);
                  return (
                    <button
                      key={p.key}
                      onClick={() => pick(p)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: active ? "var(--brand-bg)" : "transparent",
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate" style={{ color: "var(--text-1)" }}>
                          {tl(p.name)}
                        </span>
                        <span className="block text-[11px] truncate" style={{ color: "var(--text-4)" }}>
                          {t(ROLE_LABEL_KEYS[p.role] ?? "role.guest")}
                          {p.detail ? ` · ${tl(p.detail)}` : ""}
                        </span>
                      </span>
                      {n > 0 && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                          style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
                        >
                          {n}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Capabilities for the picked person */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {!current ? (
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
                  title={tl(current.name)}
                  subtitle={
                    (current.holders || []).length
                      ? t("admin.perms.heldBy").replace("{names}", current.holders.map(tl).join(", "))
                      : t("admin.perms.noHolders")
                  }
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
                          const on = caps[c.key] != null;
                          return (
                            <div key={c.key} className="flex items-center gap-3 flex-wrap">
                              <button
                                type="button"
                                onClick={() => toggleCap(c.key)}
                                aria-pressed={on}
                                className="inline-flex items-center justify-center w-5 h-5 rounded-md border transition-colors flex-shrink-0"
                                style={on
                                  ? { background: "var(--brand)", borderColor: "transparent" }
                                  : { background: "transparent", borderColor: "var(--border-md)" }}
                              >
                                {on && <Check size={12} className="text-white" />}
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
                              {/* Identity capabilities have no unit dimension
                                  to narrow, so they show a static "all" chip
                                  instead of a selector that changes nothing. */}
                              {c.scoped ? (
                                <StyledSelect
                                  value={caps[c.key] ?? "own"}
                                  onChange={(v) => setScope(c.key, v)}
                                  disabled={!on}
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
