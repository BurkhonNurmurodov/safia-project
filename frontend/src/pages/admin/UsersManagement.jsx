import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Check, X, RefreshCw, Trash2, Plus, UserCog, Send,
} from "lucide-react";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import ActionMenu from "../../components/ui/ActionMenu";
import ProfileAvatar from "../../components/ui/ProfileAvatar";
import { FOLD_COLOR, ROLE_COLORS } from "../../utils/chartPalette";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import SearchInput from "../../components/ui/SearchInput";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import HrContactButton from "../../components/admin/HrContactButton";

// Roles an existing registration may be CONVERTED to (the per-row select).
// Guest is deliberately absent: converting only re-points role/role_id, and a
// guest profile is contended — taking one has to settle the claims already
// filed against it, which only the add-role path below does.
const ROLES = ["top-manager", "shift-manager", "supervisor", "leader", "idle-owner"];
// Roles the add-role modal may GRANT. Guest joined once guest profiles became
// pre-creatable on the Profiles tab: the modal assigns an existing profile,
// exactly as it does for every other role.
const ADD_ROLES = [...ROLES, "guest"];

// The app language, not the phone's OS locale — an admin running the app in
// Uzbek on an English-locale phone was getting "Jul" inside a Uzbek table.
const LOCALE = { uz: "uz-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };

function fmtDate(iso, lang) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(LOCALE[lang] || "ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Coloured text that stays readable on both themes: the hue pulled toward the
// theme's own ink (a raw #eab308 label on a white card is ~1.9:1).
const ink = (c) => `color-mix(in srgb, ${c} 60%, var(--text-1))`;
const wash = (c) => `color-mix(in srgb, ${c} 14%, transparent)`;

const STATUS_COLOR = { approved: "#22c55e", pending: "#eab308", rejected: "#ef4444" };
// The row menu's door to /tg-user/:tid — worded here like that page's own TXT.
const TG_PROFILE = { uz: "Telegram profili", uz_cyrl: "Telegram профили", ru: "Профиль в Telegram", en: "Telegram profile" };

function Chip({ color, dot = false, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: wash(color), color: ink(color) }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const { t } = useLang();
  return <Chip dot color={STATUS_COLOR[status] ?? STATUS_COLOR.pending}>{t(`admin.users.status.${status}`)}</Chip>;
}

function RoleChip({ role }) {
  const { t } = useLang();
  return <Chip color={ROLE_COLORS[role] ?? FOLD_COLOR}>{t(ROLE_LABEL_KEYS[role]) || role}</Chip>;
}

/**
 * The two answers a WAITING request needs, on the row itself. Everything else
 * (changing the role, undoing a decision, deleting) is rare and lives in the
 * row's ⋮ menu, so a settled row carries no buttons at all.
 */
function Decide({ row, t, pending, disabled, onApprove, onReject, block = false }) {
  if (row.role.status !== "pending") return null;
  const size = block ? "lg" : "sm";
  const cls = block ? "flex-1" : "";
  return (
    <div className={`flex items-center gap-1.5 ${block ? "w-full" : ""}`}>
      {/* In the table the two are bare icons — the words were wider than the
          column they sit in; a phone card has the room and keeps them. */}
      <Button size={size} variant="success" tint className={cls} icon={<Check size={11} />}
        title={t("admin.users.approve")} aria-label={t("admin.users.approve")}
        loading={pending} disabled={disabled} onClick={() => onApprove(row)}>
        {block && t("admin.users.approve")}
      </Button>
      <Button size={size} variant="danger" tint className={cls} icon={<X size={11} />}
        title={t("admin.users.reject")} aria-label={t("admin.users.reject")}
        loading={pending} disabled={disabled} onClick={() => onReject(row)}>
        {block && t("admin.users.reject")}
      </Button>
    </div>
  );
}

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"];

export default function UsersManagement() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { auth } = useAuth();
  // ?status=pending deep-links a filter (used by the bot's notification button).
  // The last-used filter is remembered otherwise; an explicit ?status= beats it.
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = usePersistentState("users_status_filter", "all");
  useEffect(() => {
    if (STATUS_FILTERS.includes(urlStatus)) setStatusFilter(urlStatus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = usePersistentState("users_search", "");
  const [confirmDelete, setConfirmDelete] = useState(null); // {user, role} pending deletion
  const [deleteError, setDeleteError] = useState("");
  const [confirmRole, setConfirmRole] = useState(null);     // {user, role, next}
  const toast = useToast();
  // Add-role modal: pick an existing user + a role to grant (approved on the
  // spot). Shift narrows the profile pickers, mirroring the registration flow.
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", role: "supervisor", roleId: "", shift: "", supervisorId: "" });
  const [addError, setAddError] = useState("");

  const { data: users = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/admin/users").then((r) => r.data),
  });

  // Pre-created profiles feed every picker in the add-role modal — the admin
  // assigns an existing profile, never invents a name.
  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => api.get("/api/profiles/admin/list").then((r) => r.data),
  });
  const units       = (profiles?.supervisors ?? []).filter((s) => !s.archived);
  const shiftSlots  = profiles?.shift_managers ?? [];
  const topManagers = profiles?.top_managers ?? [];
  const leaderProfiles = profiles?.leaders ?? [];
  // Shift-first cascade (same as registration): profiles without a shift stay
  // hidden until an admin sets one in the Profiles tab.
  const shiftedUnits = form.shift ? units.filter((u) => u.shift === Number(form.shift)) : [];
  const shiftedSlots = form.shift ? shiftSlots.filter((s) => s.shift === Number(form.shift)) : [];
  const unitLeaders  = form.supervisorId
    ? leaderProfiles.filter((p) => p.manager_id === Number(form.supervisorId))
    : [];
  // Guest profiles nobody holds yet — the same set the registration picker
  // offers. A profile with an APPROVED holder is refused by the backend, so
  // offering it would only produce a 409 the admin cannot act on. A PENDING
  // claim does not disqualify it: granting settles that claim.
  const freeGuests = (profiles?.guests ?? [])
    .filter((p) => !(p.bindings ?? []).some((b) => b.status === "approved"));

  // Approve/reject/delete used to fail in complete silence: no onError anywhere,
  // so on a dropped request the admin tapped Approve, saw nothing change, and
  // moved on believing the person was let in while they stayed locked out.
  const updateMut = useMutation({
    mutationFn: ({ userId, roleRef, payload }) =>
      api.patch(`/admin/users/${userId}/roles/${roleRef}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.users.actionFailed")),
  });

  const deleteMut = useMutation({
    mutationFn: ({ userId, roleRef }) => api.delete(`/admin/users/${userId}/roles/${roleRef}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
      setDeleteError("");
    },
    // Keeps the dialog standing with the reason on it instead of leaving it
    // inert with a stopped spinner.
    onError: (e) => setDeleteError(e?.response?.data?.detail || t("admin.users.actionFailed")),
  });

  /** Is THIS row the one currently mutating? Scopes the spinner and the disable. */
  const pendingRole = updateMut.isPending ? updateMut.variables?.roleRef : null;

  const addRoleMut = useMutation({
    mutationFn: ({ userId, role, roleId }) =>
      api.post(`/admin/users/${userId}/roles`, {
        role,
        role_id: roleId === "" ? null : Number(roleId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      closeAdd();
    },
    onError: (e) =>
      setAddError(e?.response?.data?.detail || t("admin.users.addError")),
  });

  function openAdd() {
    setForm({ userId: "", role: "supervisor", roleId: "", shift: "", supervisorId: "" });
    setAddError("");
    setAddOpen(true);
  }
  function closeAdd() {
    setAddOpen(false);
    setForm({ userId: "", role: "supervisor", roleId: "", shift: "", supervisorId: "" });
    setAddError("");
  }
  function submitAdd() {
    setAddError("");
    if (!form.userId) { setAddError(t("admin.users.selectUserFirst")); return; }
    if (!form.roleId) { setAddError(t("admin.users.selectTargetFirst")); return; }
    addRoleMut.mutate({ userId: form.userId, role: form.role, roleId: form.roleId });
  }

  function approve(row) {
    updateMut.mutate({ userId: row.user.id, roleRef: row.role.id, payload: { status: "approved" } });
  }
  function reject(row) {
    updateMut.mutate({ userId: row.user.id, roleRef: row.role.id, payload: { status: "rejected" } });
  }
  function changeRole(row, role) {
    setConfirmRole({ ...row, next: role });
  }

  // One table row per role a user holds (multi-role)
  const rows = users.flatMap((u) =>
    (u.roles?.length ? u.roles : [null]).map((r) => ({ user: u, role: r })),
  ).filter((row) => row.role);

  // Search spans the claimed profile name AND the Telegram account it was
  // filed from (raw + transliterated, so «Сех просеивание» is findable while
  // the UI runs in Latin), plus @username / phone.
  const needle = query.trim().toLowerCase();
  const matchesQuery = ({ user, role }) =>
    !needle ||
    [
      role.full_name, user.full_name, user.tg_name,
      tl(role.full_name), tl(user.full_name), tl(user.tg_name),
      user.username, user.phone,
    ].some((v) => v && String(v).toLowerCase().includes(needle));

  const filtered = rows.filter(
    (row) => (statusFilter === "all" || row.role.status === statusFilter) && matchesQuery(row),
  );

  const countByStatus = (s) => rows.filter((row) => row.role.status === s).length;

  const busy = updateMut.isPending || deleteMut.isPending;
  const rowMenu = (row) => {
    const { role } = row;
    return [
      // The page behind it is admin-only; a grantee of this tab gets no dead link.
      auth?.role === "admin" && { key: "tg", label: TG_PROFILE[lang] || TG_PROFILE.uz, icon: Send, onSelect: () => navigate(`/tg-user/${row.user.telegram_id}`) },
      role.status === "rejected" && { key: "approve", label: t("admin.users.approve"), icon: Check, disabled: busy, onSelect: () => approve(row) },
      // A guest registration is not convertible: converting only re-points
      // role/role_id, which would take a CONTENDED guest profile without
      // settling the claims already filed against it — the add-role path's job.
      ...(role.role === "guest" ? [] : ROLES.filter((r) => r !== role.role).map((r) => ({
        key: `role-${r}`, icon: UserCog, disabled: busy,
        label: `${t("admin.users.colRole")}: ${t(ROLE_LABEL_KEYS[r])}`,
        onSelect: () => changeRole(row, r),
      }))),
      role.status === "approved" && { key: "reject", label: t("admin.users.reject"), icon: X, tone: "danger", disabled: busy, onSelect: () => reject(row) },
      { key: "delete", label: t("admin.users.delete"), icon: Trash2, tone: "danger", disabled: busy, onSelect: () => setConfirmDelete(row) },
    ];
  };
  const menuLabel = (name) => `${t("admin.users.colActions")}: ${name || "—"}`;

  return (
    <div>
      <TableCard
        icon={Users}
        title={t("admin.users.title")}
        /* The page's own actions sit in the card's head; the row under it is
           search + filter only. Three buttons in that row wrapped onto a line
           of their own on every laptop. */
        right={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] tabular-nums whitespace-nowrap mr-1" style={{ color: "var(--text-3)" }}>
              {filtered.length === rows.length ? rows.length : `${filtered.length} / ${rows.length}`}
            </span>
            <Button variant="secondary" onClick={() => refetch()}
              title={t("admin.refresh")} aria-label={t("admin.refresh")}
              icon={<RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />} />
            <HrContactButton />
            <Button icon={<Plus size={13} />} onClick={openAdd}
              title={t("admin.users.addRole")} aria-label={t("admin.users.addRole")}>
              <span className="hidden sm:inline">{t("admin.users.addRole")}</span>
            </Button>
          </div>
        }
        toolbar={
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("common.search")}
              className="w-full sm:w-64"
            />
            {/* Status filter — each count wears its status colour, so the
                waiting pile is readable before any tab is opened. */}
            <SegmentedToggle
              className="w-full sm:w-auto"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                ["all",      t("admin.users.filterAll"),       null],
                ["pending",  t("admin.users.status.pending"),  countByStatus("pending")],
                ["approved", t("admin.users.status.approved"), countByStatus("approved")],
                ["rejected", t("admin.users.status.rejected"), countByStatus("rejected")],
              ].map(([s, label, count]) => ({
                value: s,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {count !== null && (
                      <span className="px-1.5 rounded-full text-[10px] font-semibold tabular-nums"
                        style={statusFilter === s
                          ? { background: "rgba(255,255,255,0.24)" }
                          : { background: wash(STATUS_COLOR[s]), color: ink(STATUS_COLOR[s]) }}>
                        {count}
                      </span>
                    )}
                  </span>
                ),
              }))}
            />
          </>
        }
        mobile={
          <div className="p-3 space-y-2.5">
            {isLoading && [...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-28 rounded-xl" />)}
            {!isLoading && filtered.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
                {t("admin.users.empty")}
              </div>
            )}
            {!isLoading && filtered.map(({ user, role }) => {
              const raw = role.full_name || user.full_name || "";
              const shown = tl(raw) || "—";
              return (
                <div
                  key={`m-${user.id}-${role.id}`}
                  className="rounded-xl p-3"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <ProfileAvatar name={shown} colorKey={raw} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>{shown}</div>
                      <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                        {user.username ? `@${user.username}` : user.phone || "—"}
                      </div>
                    </div>
                    <ActionMenu items={rowMenu({ user, role })} label={menuLabel(shown)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <RoleChip role={role.role} />
                    <StatusBadge status={role.status} />
                    <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      {fmtDate(user.last_seen, lang)}
                    </span>
                  </div>
                  {role.status === "pending" && (
                    <div className="mt-3">
                      <Decide row={{ user, role }} t={t} block pending={pendingRole === role.id}
                        disabled={busy} onApprove={approve} onReject={reject} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
      >
              <thead>
                <tr>
                  <Th label={t("admin.users.colName")} />
                  <Th label={t("admin.users.colRole")} />
                  <Th label={t("admin.users.colStatus")} />
                  <Th label={t("admin.users.colUsername")} />
                  <Th label={t("admin.users.colPhone")} />
                  <Th label={t("admin.users.colLastSeen")} />
                  {/* Pinned to the card's right edge: the decision is the point
                      of this tab and must not sit behind a sideways scroll. */}
                  <Th label={t("admin.users.colActions")} align="right" cls="right-0 z-20" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                    {t("admin.users.empty")}
                  </td></tr>
                )}
                {!isLoading && filtered.map(({ user, role }) => {
                  // The row is named after the CLAIMED profile; the Telegram
                  // account that filed it is a different string (shared shop
                  // accounts like «Сех просеивание 8421» claim a brigadir
                  // profile), so it leads the Telegram column — otherwise the
                  // request looks absent to an admin searching for the account.
                  const raw = role.full_name || user.full_name || "";
                  const shown = tl(raw) || "";
                  const account = tl(user.tg_name) || "";
                  const showAccount =
                    account && account.trim().toLowerCase() !== shown.trim().toLowerCase();
                  const handle = user.username ? `@${user.username}` : "";
                  return (
                  <tr key={`${user.id}-${role.id}`} className="group">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2.5">
                        <ProfileAvatar name={shown} colorKey={raw} size={28} />
                        <span className="font-medium truncate max-w-[18rem]" style={{ color: "var(--text-1)" }} title={shown}>
                          {shown || "—"}
                        </span>
                        {user.roles.length > 1 && (
                          <span
                            className="text-[10px] font-semibold px-1.5 rounded-full tabular-nums"
                            style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
                            title={t("admin.users.rolesCount").replace("{n}", user.roles.length)}
                          >
                            ×{user.roles.length}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-3"><RoleChip role={role.role} /></td>

                    <td className="py-2 px-3"><StatusBadge status={role.status} /></td>

                    <td className="py-2 px-3">
                      <div className="truncate max-w-[16rem]" title={[showAccount && account, handle].filter(Boolean).join(" · ")}>
                        {showAccount && <span style={{ color: "var(--text-2)" }}>{account}</span>}
                        {showAccount && handle && <span style={{ color: "var(--text-4)" }}> · </span>}
                        <span style={{ color: "var(--text-3)" }}>{handle || (showAccount ? "" : "—")}</span>
                      </div>
                    </td>

                    <td className="py-2 px-3 tabular-nums" style={{ color: "var(--text-3)" }}>
                      {user.phone || "—"}
                    </td>

                    <td className="py-2 px-3 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      {fmtDate(user.last_seen, lang)}
                    </td>

                    <td
                      className="py-1 px-3 sticky right-0 bg-[var(--bg-card)] group-hover:bg-[var(--bg-inner)]"
                      style={{ boxShadow: "-1px 0 0 var(--border)" }}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <Decide row={{ user, role }} t={t} pending={pendingRole === role.id}
                          disabled={busy} onApprove={approve} onReject={reject} />
                        <ActionMenu items={rowMenu({ user, role })} label={menuLabel(shown)} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
      </TableCard>

      {/* Add-role modal */}
      {addOpen && (
        <Modal
          onClose={closeAdd}
          dismissable={!addRoleMut.isPending}
          title={t("admin.users.addRoleTitle")}
          maxWidth="max-w-sm"
          zIndex={60}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={closeAdd} disabled={addRoleMut.isPending}>
                {t("admin.users.cancel")}
              </Button>
              <Button size="sm" icon={<Plus size={12} />} loading={addRoleMut.isPending} onClick={submitAdd}>
                {t("admin.users.add")}
              </Button>
            </>
          }
        >
          {/* User */}
          <FormField label={t("admin.users.fieldUser")} error={addError && !form.userId ? addError : null}>
            <StyledSelect
              searchable
              searchPlaceholder={t("common.search")}
              value={form.userId}
              onChange={(v) => setForm((f) => ({ ...f, userId: v }))}
              options={users.map((u) => ({
                value: String(u.id),
                label: `${tl(u.full_name) || "—"}${u.username ? ` (@${u.username})` : u.phone ? ` (${u.phone})` : ""}`,
              }))}
              placeholder={t("admin.users.selectPlaceholder")}
            />
          </FormField>

          {/* Role */}
          <FormField label={t("admin.users.fieldRole")}>
            <StyledSelect
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v, roleId: "", shift: "", supervisorId: "" }))}
              options={ADD_ROLES.map((r) => ({ value: r, label: t(ROLE_LABEL_KEYS[r]) }))}
            />
          </FormField>

          {/* Shift — narrows the profile pickers below (registration parity) */}
          {["supervisor", "shift-manager", "leader"].includes(form.role) && (
            <FormField label={t("admin.users.fieldShift")}>
              <StyledSelect
                value={form.shift}
                onChange={(v) => setForm((f) => ({ ...f, shift: v, roleId: "", supervisorId: "" }))}
                options={[1, 2].map((s) => ({ value: String(s), label: t("login.shiftN").replace("{n}", s) }))}
                placeholder={t("admin.users.selectPlaceholder")}
              />
            </FormField>
          )}

          {/* Unit (supervisor) */}
          {form.role === "supervisor" && (
            <FormField label={t("admin.users.fieldUnit")}>
              <StyledSelect
                value={form.roleId}
                disabled={!form.shift}
                onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                options={shiftedUnits.map((u) => ({ value: String(u.id), label: tl(u.name) }))}
                placeholder={t("admin.users.selectPlaceholder")}
              />
            </FormField>
          )}

          {/* Leader — shift's supervisor first, then the unit's leader profiles */}
          {form.role === "leader" && (
            <>
              <FormField label={t("admin.users.fieldUnit")}>
                <StyledSelect
                  value={form.supervisorId}
                  disabled={!form.shift}
                  onChange={(v) => setForm((f) => ({ ...f, supervisorId: v, roleId: "" }))}
                  options={shiftedUnits.map((u) => ({ value: String(u.id), label: tl(u.name) }))}
                  placeholder={t("admin.users.selectPlaceholder")}
                />
              </FormField>
              <FormField label={t("admin.users.fieldLeaderProfile")}>
                <StyledSelect
                  value={form.roleId}
                  disabled={!form.supervisorId}
                  onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                  options={unitLeaders.map((p) => ({ value: String(p.id), label: tl(p.name) }))}
                  placeholder={t("admin.users.selectPlaceholder")}
                />
              </FormField>
            </>
          )}

          {/* Shift-manager — the chosen shift's profiles only */}
          {form.role === "shift-manager" && (
            <FormField label={t("admin.users.fieldSlot")}>
              <StyledSelect
                value={form.roleId}
                disabled={!form.shift}
                onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                options={shiftedSlots.map((s) => ({ value: String(s.id), label: tl(s.name) }))}
                placeholder={t("admin.users.selectPlaceholder")}
              />
            </FormField>
          )}

          {/* Top-manager — pick a pre-created profile */}
          {form.role === "top-manager" && (
            <FormField label={t("admin.users.fieldTopProfile")}>
              <StyledSelect
                value={form.roleId}
                onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                options={topManagers.map((p) => ({ value: String(p.id), label: tl(p.name) }))}
                placeholder={t("admin.users.selectPlaceholder")}
              />
            </FormField>
          )}

          {/* Guest — only UNHELD profiles: one guest profile, one user, so the
              backend 409s on a held one. Guest names are not unique, so the
              list can legitimately show the same name twice. */}
          {form.role === "guest" && (
            <FormField
              label={t("admin.users.fieldGuestProfile")}
              hint={freeGuests.length === 0 ? t("admin.users.noFreeGuests") : null}
            >
              <StyledSelect
                searchable
                searchPlaceholder={t("common.search")}
                value={form.roleId}
                onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                options={freeGuests.map((p) => ({ value: String(p.id), label: tl(p.name) }))}
                placeholder={t("admin.users.selectPlaceholder")}
              />
            </FormField>
          )}

          {addError && form.userId && (
            <p className="text-[11px] font-medium" style={{ color: "#ef4444" }}>{addError}</p>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        error={deleteError}
        onCancel={() => { setConfirmDelete(null); setDeleteError(""); }}
        onConfirm={() => deleteMut.mutate({ userId: confirmDelete.user.id, roleRef: confirmDelete.role.id })}
        title={t("admin.users.deleteTitle")}
        message={confirmDelete && t("admin.users.deleteMsg").replace(
          "{name}",
          `${confirmDelete.role.full_name || confirmDelete.user.full_name || "—"} (${t(ROLE_LABEL_KEYS[confirmDelete.role.role]) || confirmDelete.role.role})`,
        )}
        confirmLabel={t("admin.users.confirmDelete")}
        cancelLabel={t("admin.users.cancel")}
        tone="danger"
        loading={deleteMut.isPending}
      />

      {/* Converting a role rebinds a production account's identity. Delete got a
          confirm; this fired instantly from a dropdown with no undo. */}
      <ConfirmDialog
        open={!!confirmRole}
        onCancel={() => setConfirmRole(null)}
        onConfirm={() => {
          updateMut.mutate({
            userId: confirmRole.user.id,
            roleRef: confirmRole.role.id,
            payload: { role: confirmRole.next },
          });
          setConfirmRole(null);
        }}
        title={t("admin.users.roleChangeTitle")}
        message={confirmRole && t("admin.users.roleChangeMsg")
          .replace("{name}", tl(confirmRole.role.full_name || confirmRole.user.full_name) || "—")
          .replace("{from}", t(ROLE_LABEL_KEYS[confirmRole.role.role]) || confirmRole.role.role)
          .replace("{to}", t(ROLE_LABEL_KEYS[confirmRole.next]) || confirmRole.next)}
        confirmLabel={t("admin.users.roleChangeConfirm")}
        loading={updateMut.isPending}
      />

      {toast.node}
    </div>
  );
}
