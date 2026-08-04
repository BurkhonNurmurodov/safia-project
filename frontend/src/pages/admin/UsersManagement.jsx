import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Check, X, RefreshCw, Trash2, Plus,
} from "lucide-react";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import SearchInput from "../../components/ui/SearchInput";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";

const ROLES = ["top-manager", "shift-manager", "supervisor", "leader"];

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

/**
 * Approve / reject / delete for one row.
 *
 * Was three raw <button>s with inline rgba and onMouseEnter/onMouseLeave
 * restyling. On touch those events never fire, so the delete chip stayed
 * permanently styled like the neutral one — its danger semantics were invisible
 * on the phone where the bot deep-links admins to approve people. Button's
 * `tint` carries the semantics at rest, and `loading` finally shows the tap
 * registered.
 */
function RowActions({ row, t, pending, disabled, onApprove, onReject, onDelete, block = false }) {
  const { role } = row;
  const cls = block ? "flex-1" : "";
  return (
    <div className={`flex items-center gap-1.5 ${block ? "w-full" : ""}`}>
      {role.status !== "approved" && (
        <Button
          size={block ? "lg" : "sm"} variant="success" tint className={cls}
          icon={<Check size={11} />} loading={pending} disabled={disabled}
          onClick={() => onApprove(row)}
        >
          {t("admin.users.approve")}
        </Button>
      )}
      {role.status !== "rejected" && (
        <Button
          size={block ? "lg" : "sm"} variant="danger" tint className={cls}
          icon={<X size={11} />} loading={pending} disabled={disabled}
          onClick={() => onReject(row)}
        >
          {t("admin.users.reject")}
        </Button>
      )}
      <Button
        size={block ? "lg" : "sm"} variant="danger" tint className={cls}
        icon={<Trash2 size={11} />} disabled={disabled}
        title={t("admin.users.delete")}
        onClick={() => onDelete(row)}
      >
        {t("admin.users.delete")}
      </Button>
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useLang();
  const styles = {
    approved: { background: "rgba(34,197,94,0.15)",  color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" },
    pending:  { background: "rgba(234,179,8,0.15)",   color: "#eab308", border: "1px solid rgba(234,179,8,0.3)" },
    rejected: { background: "rgba(239,68,68,0.15)",   color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" },
  };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={styles[status] ?? styles.pending}
    >
      {t(`admin.users.status.${status}`)}
    </span>
  );
}

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"];

export default function UsersManagement() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
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

  const { data: users = [], isLoading, refetch } = useQuery({
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

  return (
    <div>
      <TableCard
        icon={Users}
        title={t("admin.users.title")}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {filtered.length === rows.length ? rows.length : `${filtered.length} / ${rows.length}`}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("common.search")}
              className="w-full sm:w-56"
            />
            {/* Status filter — single-select segmented toggle with live counts */}
            <SegmentedToggle
              scrollable
              className="w-full sm:w-auto"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                ["all",      t("admin.users.filterAll"),              null],
                ["pending",  t("admin.users.status.pending"),  countByStatus("pending")],
                ["approved", t("admin.users.status.approved"), countByStatus("approved")],
                ["rejected", t("admin.users.status.rejected"), countByStatus("rejected")],
              ].map(([s, label, count]) => ({
                value: s,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {count !== null && (
                      <span className="px-1 rounded text-[10px] font-mono"
                        style={{ background: statusFilter === s ? "rgba(255,255,255,0.22)" : "var(--bg-card)" }}>
                        {count}
                      </span>
                    )}
                  </span>
                ),
              }))}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button size="lg" icon={<Plus size={14} />} onClick={openAdd}>{t("admin.users.addRole")}</Button>
              <Button variant="secondary" size="lg" icon={<RefreshCw size={13} />} onClick={() => refetch()}>
                {t("admin.refresh")}
              </Button>
            </div>
          </>
        }
        /* At 390px the table is ~900px wide and Actions — the entire point of
           this tab, and where the bot's registration notification deep-links —
           was the LAST column, reachable only by a blind sideways scroll. */
        mobile={
          <div className="p-3 space-y-2.5">
            {isLoading && [...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-28 rounded-xl" />)}
            {!isLoading && filtered.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>
                {t("admin.users.empty")}
              </div>
            )}
            {!isLoading && filtered.map(({ user, role }) => (
              <div
                key={`m-${user.id}-${role.id}`}
                className="rounded-xl p-3"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>
                      {tl(role.full_name || user.full_name) || "—"}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-4)" }}>
                      {user.username ? `@${user.username}` : user.phone || "—"}
                    </div>
                  </div>
                  <StatusBadge status={role.status} />
                </div>
                <div className="flex items-center gap-2 mb-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span>{t(ROLE_LABEL_KEYS[role.role]) || role.role}</span>
                  <span style={{ color: "var(--text-4)" }}>·</span>
                  <span>{fmtDate(user.last_seen, lang)}</span>
                </div>
                <RowActions
                  row={{ user, role }}
                  t={t}
                  block
                  pending={pendingRole === role.id}
                  disabled={updateMut.isPending || deleteMut.isPending}
                  onApprove={approve}
                  onReject={reject}
                  onDelete={setConfirmDelete}
                />
              </div>
            ))}
          </div>
        }
      >
              <thead>
                <tr>
                  {[
                    t("admin.users.colName"),
                    t("admin.users.colPhone"),
                    t("admin.users.colUsername"),
                    t("admin.users.colRole"),
                    t("admin.users.colStatus"),
                    t("admin.users.colLastSeen"),
                    t("admin.users.colActions"),
                  ].map((h) => (
                    <Th key={h} label={h} />
                  ))}
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
                  <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                    {t("admin.users.empty")}
                  </td></tr>
                )}
                {!isLoading && filtered.map(({ user, role }) => {
                  // The row is named after the CLAIMED profile; the Telegram
                  // account that filed it is a different string (shared shop
                  // accounts like «Сех просеивание 8421» claim a brigadir
                  // profile), so it gets its own muted line — otherwise the
                  // request looks absent to an admin searching for the account.
                  const shown = tl(role.full_name || user.full_name) || "";
                  const account = tl(user.tg_name) || "";
                  const showAccount =
                    account && account.trim().toLowerCase() !== shown.trim().toLowerCase();
                  return (
                  <tr key={`${user.id}-${role.id}`}>
                    {/* Role-scoped display name (+ multi-role marker) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-medium" style={{ color: "var(--text-1)" }}>
                        {shown || "—"}
                        {user.roles.length > 1 && (
                          <span
                            className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                            style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                            title={t("admin.users.rolesCount").replace("{n}", user.roles.length)}
                          >
                            ×{user.roles.length}
                          </span>
                        )}
                      </div>
                      {showAccount && (
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--text-4)" }} title={t("admin.users.colUsername")}>
                          {account}
                        </div>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                      {user.phone || "—"}
                    </td>

                    {/* Telegram username */}
                    <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                      {user.username ? `@${user.username}` : "—"}
                    </td>

                    {/* Role selector — guest is not convertible (its role_id
                        points at a self-created guest profile), so it renders
                        as a static label instead of the select. */}
                    <td className="py-2.5 px-3">
                      {role.role === "guest" ? (
                        <span className="inline-block rounded-lg px-2.5 py-1 text-[11px]" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
                          {t(ROLE_LABEL_KEYS[role.role])}
                        </span>
                      ) : (
                        <StyledSelect
                          value={role.role}
                          onChange={(v) => changeRole({ user, role }, v)}
                          disabled={updateMut.isPending}
                          options={ROLES.map((r) => ({ value: r, label: t(ROLE_LABEL_KEYS[r]) }))}
                          triggerClassName="px-2.5 py-1 text-[11px]"
                          className="inline-block w-40 align-middle"
                        />
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="py-2.5 px-3">
                      <StatusBadge status={role.status} />
                    </td>

                    {/* Last seen */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-[11px]" style={{ color: "var(--text-4)" }}>
                      {fmtDate(user.last_seen, lang)}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3">
                      <RowActions
                        row={{ user, role }}
                        t={t}
                        pending={pendingRole === role.id}
                        disabled={updateMut.isPending || deleteMut.isPending}
                        onApprove={approve}
                        onReject={reject}
                        onDelete={setConfirmDelete}
                      />
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
              options={ROLES.map((r) => ({ value: r, label: t(ROLE_LABEL_KEYS[r]) }))}
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
