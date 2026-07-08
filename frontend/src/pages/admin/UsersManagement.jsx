import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Check, X, RefreshCw, Trash2, Plus,
} from "lucide-react";
import api from "../../utils/api";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";

const ROLES = ["top-manager", "shift-manager", "supervisor", "leader"];

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  // ?status=pending deep-links a filter (used by the bot's notification button)
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState(
    STATUS_FILTERS.includes(urlStatus) ? urlStatus : "all",
  );
  const [confirmDelete, setConfirmDelete] = useState(null); // {user, role} pending deletion
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

  const updateMut = useMutation({
    mutationFn: ({ userId, roleRef, payload }) =>
      api.patch(`/admin/users/${userId}/roles/${roleRef}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ userId, roleRef }) => api.delete(`/admin/users/${userId}/roles/${roleRef}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

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
    updateMut.mutate({ userId: row.user.id, roleRef: row.role.id, payload: { role } });
  }

  // One table row per role a user holds (multi-role)
  const rows = users.flatMap((u) =>
    (u.roles?.length ? u.roles : [null]).map((r) => ({ user: u, role: r })),
  ).filter((row) => row.role);

  const filtered = rows.filter(
    (row) => statusFilter === "all" || row.role.status === statusFilter,
  );

  const countByStatus = (s) => rows.filter((row) => row.role.status === s).length;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8">
      <TableCard
        icon={Users}
        title={t("admin.users.title")}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {rows.length}
          </span>
        }
        toolbar={
          <>
            {/* Status filter pills */}
            {[
              ["all",      t("admin.users.filterAll"),              null],
              ["pending",  t("admin.users.status.pending"),  countByStatus("pending")],
              ["approved", t("admin.users.status.approved"), countByStatus("approved")],
              ["rejected", t("admin.users.status.rejected"), countByStatus("rejected")],
            ].map(([s, label, count]) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={
                  statusFilter === s
                    ? { background: "var(--brand)", color: "#fff" }
                    : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }
                }
              >
                {label}
                {count !== null && (
                  <span className="ml-0.5 px-1 rounded text-[10px] font-mono"
                    style={{ background: statusFilter === s ? "rgba(255,255,255,0.2)" : "var(--bg-card)" }}>
                    {count}
                  </span>
                )}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" icon={<Plus size={13} />} onClick={openAdd}>{t("admin.users.addRole")}</Button>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={() => refetch()}>
                {t("admin.refresh")}
              </Button>
            </div>
          </>
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
                {!isLoading && filtered.map(({ user, role }) => (
                  <tr key={`${user.id}-${role.id}`}>
                    {/* Role-scoped display name (+ multi-role marker) */}
                    <td className="py-2.5 px-3 font-medium whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                      {tl(role.full_name || user.full_name) || "—"}
                      {user.roles.length > 1 && (
                        <span
                          className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                          title={`${user.roles.length} roles`}
                        >
                          ×{user.roles.length}
                        </span>
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
                      {fmtDate(user.last_seen)}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        {role.status !== "approved" && (
                          <button
                            onClick={() => approve({ user, role })}
                            disabled={updateMut.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.25)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.15)")}
                          >
                            <Check size={10} /> {t("admin.users.approve")}
                          </button>
                        )}
                        {role.status !== "rejected" && (
                          <button
                            onClick={() => reject({ user, role })}
                            disabled={updateMut.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.25)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
                          >
                            <X size={10} /> {t("admin.users.reject")}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete({ user, role })}
                          disabled={deleteMut.isPending}
                          title={t("admin.users.delete")}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                          style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(148,163,184,0.12)"; e.currentTarget.style.color = "#94a3b8"; }}
                        >
                          <Trash2 size={10} /> {t("admin.users.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
          <FormField label={t("admin.users.fieldUser")}>
            <StyledSelect
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

          {addError && (
            <p className="text-[11px] font-medium text-red-400">{addError}</p>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
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
    </div>
  );
}
