import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Check, X, ChevronDown, RefreshCw, Loader2, Trash2, AlertTriangle, Plus,
} from "lucide-react";
import api from "../../utils/api";
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
      <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-[var(--brand-text)]" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t("admin.users.title")}
            </span>
            <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400 font-mono">
              {rows.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
              style={{ background: "var(--brand)" }}
            >
              <Plus size={13} /> {t("admin.users.addRole")}
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors"
            >
              <RefreshCw size={12} /> {t("admin.refresh")}
            </button>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
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
                  : { background: "rgba(255,255,255,0.05)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {label}
              {count !== null && (
                <span className="ml-0.5 px-1 rounded text-[10px] font-mono"
                  style={{ background: statusFilter === s ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[var(--brand-text)] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {t("admin.users.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    t("admin.users.colName"),
                    t("admin.users.colPhone"),
                    t("admin.users.colUsername"),
                    t("admin.users.colRole"),
                    t("admin.users.colStatus"),
                    t("admin.users.colLastSeen"),
                    t("admin.users.colActions"),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ user, role }) => (
                  <tr
                    key={`${user.id}-${role.id}`}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Role-scoped display name (+ multi-role marker) */}
                    <td className="py-2.5 px-3 font-medium text-gray-200 whitespace-nowrap">
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
                    <td className="py-2.5 px-3 text-gray-400 font-mono whitespace-nowrap">
                      {user.phone || "—"}
                    </td>

                    {/* Telegram username */}
                    <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">
                      {user.username ? `@${user.username}` : "—"}
                    </td>

                    {/* Role selector */}
                    <td className="py-2.5 px-3">
                      <div className="relative inline-block">
                        <select
                          value={role.role}
                          onChange={(e) => changeRole({ user, role }, e.target.value)}
                          disabled={updateMut.isPending}
                          className="appearance-none bg-[#12151f] border border-white/10 rounded-lg pl-2.5 pr-6 py-1 text-[11px] text-gray-300 cursor-pointer focus:outline-none focus:border-[var(--brand-border)] transition-colors"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(ROLE_LABEL_KEYS[r])}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={10}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                        />
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="py-2.5 px-3">
                      <StatusBadge status={role.status} />
                    </td>

                    {/* Last seen */}
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap text-[11px]">
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
            </table>
          </div>
        )}
      </div>

      {/* Add-role modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }}
          onClick={() => !addRoleMut.isPending && closeAdd()}
        >
          <div
            className="rounded-2xl w-full max-w-sm shadow-2xl p-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-bg)" }}
              >
                <Plus size={16} className="text-[var(--brand-text)]" />
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
                {t("admin.users.addRoleTitle")}
              </div>
            </div>

            <div className="space-y-3">
              {/* User */}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  {t("admin.users.fieldUser")}
                </span>
                <select
                  value={form.userId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                  className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                >
                  <option value="">{t("admin.users.selectPlaceholder")}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {tl(u.full_name) || "—"}
                      {u.username ? ` (@${u.username})` : u.phone ? ` (${u.phone})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/* Role */}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  {t("admin.users.fieldRole")}
                </span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, roleId: "" }))}
                  className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{t(ROLE_LABEL_KEYS[r])}</option>
                  ))}
                </select>
              </label>

              {/* Unit (supervisor) */}
              {form.role === "supervisor" && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    {t("admin.users.fieldUnit")}
                  </span>
                  <select
                    value={form.roleId}
                    onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                    className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                  >
                    <option value="">{t("admin.users.selectPlaceholder")}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{tl(u.name)}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Leader — pick a pre-created leader profile (shows its unit) */}
              {form.role === "leader" && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    {t("admin.users.fieldLeaderProfile")}
                  </span>
                  <select
                    value={form.roleId}
                    onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                    className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                  >
                    <option value="">{t("admin.users.selectPlaceholder")}</option>
                    {leaderProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {tl(p.name)}{p.supervisor ? ` — ${tl(p.supervisor)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Shift-manager — pick a pre-created profile */}
              {form.role === "shift-manager" && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    {t("admin.users.fieldSlot")}
                  </span>
                  <select
                    value={form.roleId}
                    onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                    className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                  >
                    <option value="">{t("admin.users.selectPlaceholder")}</option>
                    {shiftSlots.map((s) => (
                      <option key={s.id} value={s.id}>{tl(s.name)} — S{s.shift}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Top-manager — pick a pre-created profile */}
              {form.role === "top-manager" && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    {t("admin.users.fieldTopProfile")}
                  </span>
                  <select
                    value={form.roleId}
                    onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                    className="mt-1 w-full bg-[#12151f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[var(--brand-border)]"
                  >
                    <option value="">{t("admin.users.selectPlaceholder")}</option>
                    {topManagers.map((p) => (
                      <option key={p.id} value={p.id}>{tl(p.name)}</option>
                    ))}
                  </select>
                </label>
              )}

              {addError && (
                <p className="text-[11px] font-medium text-red-400">{addError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={closeAdd}
                disabled={addRoleMut.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {t("admin.users.cancel")}
              </button>
              <button
                onClick={submitAdd}
                disabled={addRoleMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "var(--brand)" }}
              >
                {addRoleMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {t("admin.users.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }}
          onClick={() => !deleteMut.isPending && setConfirmDelete(null)}
        >
          <div
            className="rounded-2xl w-full max-w-xs shadow-2xl p-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.15)" }}
              >
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
                {t("admin.users.deleteTitle")}
              </div>
            </div>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-3)" }}>
              {t("admin.users.deleteMsg").replace(
                "{name}",
                `${confirmDelete.role.full_name || confirmDelete.user.full_name || "—"} (${t(ROLE_LABEL_KEYS[confirmDelete.role.role]) || confirmDelete.role.role})`,
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteMut.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {t("admin.users.cancel")}
              </button>
              <button
                onClick={() => deleteMut.mutate({ userId: confirmDelete.user.id, roleRef: confirmDelete.role.id })}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "#ef4444" }}
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {t("admin.users.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
