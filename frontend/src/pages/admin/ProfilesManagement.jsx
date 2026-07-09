import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IdCard, Plus, RefreshCw, Loader2, Trash2, Pencil, X,
  Star, UserCog, Users, Flag, Shield, Archive, ArchiveRestore, Languages,
  UserRound,
} from "lucide-react";
import api from "../../utils/api";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { useLang } from "../../context/LangContext";
import { useTranslit, transliterate, convertFromUz } from "../../utils/transliterate";

// The profile sections. `listKey` = field in GET /api/profiles/admin/list.
// Guests are self-created at registration — the section manages (rename /
// delete / unassign) but never creates them.
const TYPES = [
  { key: "top-manager",   listKey: "top_managers",   tKey: "admin.profiles.topManagers",   icon: Star },
  { key: "shift-manager", listKey: "shift_managers", tKey: "admin.profiles.shiftManagers", icon: UserCog },
  { key: "supervisor",    listKey: "supervisors",    tKey: "admin.profiles.supervisors",   icon: Users },
  { key: "leader",        listKey: "leaders",        tKey: "admin.profiles.leaders",       icon: Flag },
  { key: "admin",         listKey: "admins",         tKey: "admin.profiles.admins",        icon: Shield },
  { key: "guest",         listKey: "guests",         tKey: "admin.profiles.guests",        icon: UserRound },
];

function HolderChip({ b, onUnassign, disabled }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const pending = b.status === "pending";
  return (
    <span
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
      style={pending
        ? { background: "rgba(234,179,8,0.12)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)" }
        : { background: "rgba(34,197,94,0.10)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.22)" }}
      title={b.username ? `@${b.username}` : String(b.telegram_id)}
    >
      {b.tg_name || tl(b.user_name) || (b.username ? `@${b.username}` : b.telegram_id)}
      {pending && <span className="opacity-80">· {t("admin.users.status.pending")}</span>}
      {!pending && (
        <button
          onClick={onUnassign}
          disabled={disabled}
          title={t("admin.profiles.unassign")}
          className="rounded-full p-0.5 hover:bg-[var(--bg-accent)] transition-colors"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}

export default function ProfilesManagement() {
  const { t, languages, nameOverrides, reloadTranslations } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [type, setType] = useState("top-manager");
  const [modal, setModal] = useState(null);        // {mode:"add"|"edit", item?} — form modal
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);   // profile item
  const [confirmUnassign, setConfirmUnassign] = useState(null); // {item, binding}
  const [confirmSwitch, setConfirmSwitch] = useState(null);   // {body, detail} — 409 confirm_required

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => api.get("/api/profiles/admin/list").then((r) => r.data),
  });

  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    reloadTranslations();
  };
  const fail = (e) => setFormError(e?.response?.data?.detail || t("admin.profiles.error"));

  const createMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin", body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
  });
  const updateMut = useMutation({
    mutationFn: ({ ptype, pid, body }) => api.put(`/api/profiles/admin/${ptype}/${pid}`, body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
  });
  const deleteMut = useMutation({
    mutationFn: ({ ptype, pid }) => api.delete(`/api/profiles/admin/${ptype}/${pid}`),
    onSuccess: () => { done(); setConfirmDelete(null); },
    onError: (e) => { setConfirmDelete(null); alert(e?.response?.data?.detail || t("admin.profiles.error")); },
  });
  const unassignMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/unassign", body),
    onSuccess: () => { done(); setConfirmUnassign(null); },
    onError: (e) => { setConfirmUnassign(null); alert(e?.response?.data?.detail || t("admin.profiles.error")); },
  });
  const switchMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/switch-role", body),
    onSuccess: () => { done(); setModal(null); setConfirmSwitch(null); },
    onError: (e, body) => {
      const detail = e?.response?.data?.detail;
      if (detail?.code === "confirm_required") { setConfirmSwitch({ body, detail }); return; }
      setConfirmSwitch(null);
      setFormError(typeof detail === "string" ? detail : t("admin.profiles.error"));
    },
  });

  const busy = createMut.isPending || updateMut.isPending || switchMut.isPending;
  const activeType = TYPES.find((x) => x.key === type);
  const items = data?.[activeType.listKey] ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);

  function openAdd() {
    setForm({ name: "", shift: 1, manager_id: "", cell: "", cellNew: "", verifix_id: "" });
    setFormError("");
    setModal({ mode: "add" });
  }

  function openEdit(item) {
    const ov = {};
    for (const l of languages) {
      if (l.code === "uz") continue; // canonical IS the Uzbek name — no override input
      ov[l.code] = nameOverrides?.[l.code]?.[`name.${item.name}`] || "";
    }
    setForm({
      role: type,
      name: item.name,
      shift: item.shift ?? 1,
      manager_id: item.manager_id ?? "",
      cell: item.cell ?? "",
      cellNew: "",
      verifix_id: type === "supervisor" ? item.id : "",
      overrides: ov,
    });
    setFormError("");
    setModal({ mode: "edit", item });
  }

  // Role switch: only the name moves with the profile — every other value is
  // entered fresh for the target role.
  const roleChanged = modal?.mode === "edit" && form.role && form.role !== type;
  const effType = roleChanged ? form.role : type;

  // "Other" in the cell picker reveals a text input; its typed value wins.
  const cellVal = (form.cell === CELL_OTHER ? form.cellNew : form.cell || "").trim();

  function submit() {
    setFormError("");

    if (roleChanged) {
      const body = { ptype: type, pid: modal.item.id, new_role: form.role };
      if (form.role === "shift-manager" || form.role === "supervisor") {
        if (!form.shift) { setFormError(t("admin.profiles.shiftRequired")); return; }
        body.shift = Number(form.shift);
      }
      if (form.role === "leader") {
        if (!form.manager_id) { setFormError(t("admin.profiles.supervisorRequired")); return; }
        if (!cellVal) { setFormError(t("admin.profiles.cellRequired")); return; }
        body.manager_id = Number(form.manager_id);
        body.cell = cellVal;
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

    if (modal.mode === "add") {
      const body = { role: type, name };
      if (type === "shift-manager" || type === "supervisor") body.shift = Number(form.shift);
      if (type === "leader") {
        if (!form.manager_id) { setFormError(t("admin.profiles.supervisorRequired")); return; }
        if (!cellVal) { setFormError(t("admin.profiles.cellRequired")); return; }
        body.manager_id = Number(form.manager_id);
        body.cell = cellVal;
      }
      if (type === "supervisor") {
        if (!form.verifix_id) { setFormError(t("admin.profiles.verifixRequired")); return; }
        body.verifix_id = Number(form.verifix_id);
      }
      createMut.mutate(body);
      return;
    }

    // uz: "" clears any stale uz override — it would shadow the canonical name in tl()
    const body = { name, overrides: { ...form.overrides, uz: "" } };
    if (type === "shift-manager" || type === "supervisor") body.shift = Number(form.shift);
    if (type === "leader" && form.manager_id) body.manager_id = Number(form.manager_id);
    if (type === "leader" && cellVal) body.cell = cellVal;
    if (type === "supervisor" && Number(form.verifix_id) !== modal.item.id) {
      body.new_verifix_id = Number(form.verifix_id);
    }
    updateMut.mutate({ ptype: type, pid: modal.item.id, body });
  }

  function toggleArchive(item) {
    updateMut.mutate({ ptype: "supervisor", pid: item.id, body: { archived: !item.archived } });
  }

  const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };
  const labelCls = "text-[11px] font-semibold uppercase tracking-wider";

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <IdCard size={15} className="text-[var(--brand-text)]" />
            <span className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
              {t("admin.profiles.title")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {type !== "guest" && (
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "var(--brand)" }}
              >
                <Plus size={13} /> {t("admin.profiles.add")}
              </button>
            )}
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-inner)] hover:bg-[var(--bg-accent)] text-[var(--text-2)] border border-[var(--border-md)] transition-colors"
            >
              {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {t("admin.refresh")}
            </button>
          </div>
        </div>

        {/* Type pills — the shared segmented-toggle template (scroll for phones) */}
        <div className="no-scrollbar mb-5 overflow-x-auto">
          <SegmentedToggle
            value={type}
            onChange={setType}
            options={TYPES.map(({ key, tKey, icon: Icon, listKey }) => ({
              value: key,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Icon size={12} /> {t(tKey)}
                  <span className="px-1 rounded text-[10px] font-mono"
                    style={{ background: type === key ? "rgba(255,255,255,0.2)" : "var(--bg-card)" }}>
                    {data?.[listKey]?.length ?? 0}
                  </span>
                </span>
              ),
            }))}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg animate-pulse bg-[var(--bg-inner)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-3)]">{t("admin.profiles.empty")}</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    t("admin.profiles.colName"),
                    ...(type === "shift-manager" || type === "supervisor" ? [t("admin.profiles.colShift")] : []),
                    ...(type === "leader" ? [t("admin.profiles.colSupervisor")] : []),
                    ...(type === "supervisor" ? [t("admin.profiles.colVerifix")] : []),
                    t("admin.profiles.colHolders"),
                    t("admin.profiles.colActions"),
                  ].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                      className="hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--text-1)] whitespace-nowrap">
                      {tl(item.name)}
                      {type === "supervisor" && item.archived && (
                        <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                          style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}>
                          {t("admin.profiles.archived")}
                        </span>
                      )}
                    </td>

                    {(type === "shift-manager" || type === "supervisor") && (
                      <td className="py-2.5 px-3 text-[var(--text-2)] whitespace-nowrap">
                        {item.shift ?? "—"}
                      </td>
                    )}
                    {type === "leader" && (
                      <td className="py-2.5 px-3 text-[var(--text-2)] whitespace-nowrap">
                        {tl(item.supervisor) || "—"}
                      </td>
                    )}
                    {type === "supervisor" && (
                      <td className="py-2.5 px-3 text-[var(--text-2)] font-mono whitespace-nowrap">{item.id}</td>
                    )}

                    <td className="py-2.5 px-3">
                      {item.bindings?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {item.bindings.map((b, i) => (
                            <HolderChip
                              key={i}
                              b={b}
                              disabled={unassignMut.isPending}
                              onUnassign={() => setConfirmUnassign({ item, binding: b })}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--text-4)]">{t("admin.profiles.noHolders")}</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                          style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand-text)", border: "1px solid rgba(200,151,63,0.25)" }}
                        >
                          <Pencil size={10} /> {t("admin.profiles.edit")}
                        </button>
                        {type === "supervisor" && item.archived ? (
                          <button
                            onClick={() => toggleArchive(item)}
                            disabled={updateMut.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                            style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.22)" }}
                          >
                            <ArchiveRestore size={10} /> {t("admin.profiles.unarchive")}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(item)}
                            disabled={deleteMut.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                            style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#ef4444"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(148,163,184,0.12)"; e.currentTarget.style.color = "#94a3b8"; }}
                          >
                            {type === "supervisor" && item.has_data
                              ? <><Archive size={10} /> {t("admin.profiles.archive")}</>
                              : <><Trash2 size={10} /> {t("admin.profiles.delete")}</>}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      {modal && (
        <Modal
          onClose={() => setModal(null)}
          dismissable={!busy}
          title={`${t(modal.mode === "add" ? "admin.profiles.addTitle" : "admin.profiles.editTitle")} · ${t(activeType.tKey)}`}
          maxWidth="max-w-sm"
          zIndex={60}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setModal(null)} disabled={busy}>
                {t("admin.users.cancel")}
              </Button>
              <Button
                size="sm"
                icon={modal.mode === "add" ? <Plus size={12} /> : <Pencil size={12} />}
                loading={busy}
                onClick={submit}
              >
                {t(modal.mode === "add" ? "admin.profiles.create" : "admin.profiles.save")}
              </Button>
            </>
          }
        >
              {/* Role — switching moves only the name; other values are asked fresh */}
              {modal.mode === "edit" && (
                <FormField label={t("admin.profiles.roleLabel")}>
                  <StyledSelect
                    value={form.role}
                    onChange={(v) => {
                      setForm((f) => v === type
                        ? { ...f, role: v, name: modal.item.name,
                            shift: modal.item.shift ?? 1,
                            manager_id: modal.item.manager_id ?? "",
                            cell: modal.item.cell ?? "", cellNew: "",
                            verifix_id: type === "supervisor" ? modal.item.id : "" }
                        : { ...f, role: v, name: modal.item.name,
                            shift: "", manager_id: "", cell: "", cellNew: "", verifix_id: "" });
                    }}
                    options={TYPES.map(({ key, tKey }) => ({ value: key, label: t(tKey) }))}
                  />
                  {roleChanged && (
                    <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                      {t("admin.profiles.switchRoleHint")}
                    </p>
                  )}
                </FormField>
              )}

              {/* Canonical name — entered in Uzbek; other languages render automatically */}
              <FormField label={t("admin.profiles.nameLabel")}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={roleChanged}
                  className={inputCls + (roleChanged ? " opacity-60" : "")}
                  style={inputStyle}
                  placeholder={t("admin.profiles.namePlaceholder")}
                />
                {modal.mode === "add" && (
                  <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.nameUzHint")}
                  </p>
                )}
                {modal.mode === "edit" && !roleChanged && type === "supervisor" &&
                  (form.name || "").trim() !== modal.item.name && (
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
                      .filter((u) => !(roleChanged && type === "supervisor" && u.id === modal.item.id))
                      .map((u) => ({ value: String(u.id), label: tl(u.name) }))}
                    placeholder={t("admin.users.selectPlaceholder")}
                  />
                </FormField>
              )}

              {effType === "supervisor" && (
                <FormField label={t("admin.profiles.verifixLabel")}>
                  <input
                    type="number"
                    value={form.verifix_id}
                    onChange={(e) => setForm((f) => ({ ...f, verifix_id: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  />
                  {modal.mode === "edit" && !roleChanged && Number(form.verifix_id) !== modal.item.id && (
                    <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                      {t("admin.profiles.verifixWarn")}
                    </p>
                  )}
                </FormField>
              )}

              {/* Per-language display names — edit only; creation is Uzbek-only */}
              {modal.mode === "edit" && !roleChanged && (
                <div className="pt-1">
                  <div className={labelCls} style={{ color: "var(--text-3)" }}>
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
        </Modal>
      )}

      {/* Delete / archive confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteMut.mutate({ ptype: type, pid: confirmDelete.id })}
        title={t("admin.profiles.deleteTitle")}
        message={confirmDelete && (type === "supervisor" && confirmDelete.has_data
          ? t("admin.profiles.archiveMsg")
          : t("admin.profiles.deleteMsg")
        ).replace("{name}", confirmDelete.name)}
        confirmLabel={confirmDelete && (type === "supervisor" && confirmDelete.has_data
          ? t("admin.profiles.archive") : t("admin.profiles.confirmDelete"))}
        cancelLabel={t("admin.users.cancel")}
        tone="danger"
        loading={deleteMut.isPending}
      />

      {/* Unassign confirmation */}
      <ConfirmDialog
        open={!!confirmUnassign}
        onCancel={() => setConfirmUnassign(null)}
        onConfirm={() => unassignMut.mutate({
          ptype: type,
          pid: confirmUnassign.item.id,
          role_ref: confirmUnassign.binding.role_ref,
          telegram_id: confirmUnassign.binding.telegram_id,
        })}
        title={t("admin.profiles.unassignTitle")}
        message={confirmUnassign && t("admin.profiles.unassignMsg")
          .replace("{user}", confirmUnassign.binding.tg_name || confirmUnassign.binding.user_name ||
            (confirmUnassign.binding.username ? `@${confirmUnassign.binding.username}` : confirmUnassign.binding.telegram_id))
          .replace("{name}", confirmUnassign.item.name)}
        confirmLabel={t("admin.profiles.unassign")}
        cancelLabel={t("admin.users.cancel")}
        loading={unassignMut.isPending}
      />

      {/* Role-switch confirmation (backend 409 confirm_required) */}
      <ConfirmDialog
        open={!!confirmSwitch}
        onCancel={() => setConfirmSwitch(null)}
        onConfirm={() => switchMut.mutate({ ...confirmSwitch.body, confirm: true })}
        title={t("admin.profiles.switchConfirmTitle")}
        message={confirmSwitch && (
          <>
            {t("admin.profiles.switchConfirmMsg")
              .replace("{name}", modal?.item?.name ?? "")
              .replace("{role}", t(TYPES.find((x) => x.key === confirmSwitch.body.new_role)?.tKey))}
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
    </div>
  );
}
