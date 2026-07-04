import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IdCard, Plus, RefreshCw, Loader2, Trash2, Pencil, AlertTriangle, X,
  Star, UserCog, Users, Flag, Shield, Archive, ArchiveRestore, Languages,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit, transliterate, convertFromUz } from "../../utils/transliterate";

// The five profile sections. `listKey` = field in GET /api/profiles/admin/list.
const TYPES = [
  { key: "top-manager",   listKey: "top_managers",   tKey: "admin.profiles.topManagers",   icon: Star },
  { key: "shift-manager", listKey: "shift_managers", tKey: "admin.profiles.shiftManagers", icon: UserCog },
  { key: "supervisor",    listKey: "supervisors",    tKey: "admin.profiles.supervisors",   icon: Users },
  { key: "leader",        listKey: "leaders",        tKey: "admin.profiles.leaders",       icon: Flag },
  { key: "admin",         listKey: "admins",         tKey: "admin.profiles.admins",        icon: Shield },
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
          className="rounded-full p-0.5 hover:bg-white/10 transition-colors"
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

  const busy = createMut.isPending || updateMut.isPending;
  const activeType = TYPES.find((x) => x.key === type);
  const items = data?.[activeType.listKey] ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);

  function openAdd() {
    setForm({ name: "", shift: 1, manager_id: "", verifix_id: "" });
    setFormError("");
    setModal({ mode: "add" });
  }

  function openEdit(item) {
    const ov = {};
    for (const l of languages) {
      ov[l.code] = nameOverrides?.[l.code]?.[`name.${item.name}`] || "";
    }
    setForm({
      name: item.name,
      shift: item.shift ?? 1,
      manager_id: item.manager_id ?? "",
      verifix_id: type === "supervisor" ? item.id : "",
      overrides: ov,
    });
    setFormError("");
    setModal({ mode: "edit", item });
  }

  function submit() {
    setFormError("");
    const name = (form.name || "").trim();
    if (!name) { setFormError(t("admin.profiles.nameRequired")); return; }

    if (modal.mode === "add") {
      const body = { role: type, name };
      if (type === "shift-manager" || type === "supervisor") body.shift = Number(form.shift);
      if (type === "leader") {
        if (!form.manager_id) { setFormError(t("admin.profiles.supervisorRequired")); return; }
        body.manager_id = Number(form.manager_id);
      }
      if (type === "supervisor") {
        if (!form.verifix_id) { setFormError(t("admin.profiles.verifixRequired")); return; }
        body.verifix_id = Number(form.verifix_id);
      }
      createMut.mutate(body);
      return;
    }

    const body = { name, overrides: form.overrides };
    if (type === "shift-manager" || type === "supervisor") body.shift = Number(form.shift);
    if (type === "leader" && form.manager_id) body.manager_id = Number(form.manager_id);
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
      <div className="bg-[#1a1d27] border border-white/5 rounded-xl p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <IdCard size={15} className="text-[var(--brand-text)]" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t("admin.profiles.title")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
              style={{ background: "var(--brand)" }}
            >
              <Plus size={13} /> {t("admin.profiles.add")}
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors"
            >
              {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {t("admin.refresh")}
            </button>
          </div>
        </div>

        {/* Type pills */}
        <div className="no-scrollbar flex gap-1.5 mb-5 overflow-x-auto">
          {TYPES.map(({ key, tKey, icon: Icon, listKey }) => (
            <button
              key={key}
              onClick={() => setType(key)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={type === key
                ? { background: "var(--brand)", color: "#fff" }
                : { background: "rgba(255,255,255,0.05)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Icon size={12} /> {t(tKey)}
              <span className="px-1 rounded text-[10px] font-mono"
                style={{ background: type === key ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }}>
                {data?.[listKey]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg animate-pulse bg-white/[0.04]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">{t("admin.profiles.empty")}</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    t("admin.profiles.colName"),
                    ...(type === "shift-manager" || type === "supervisor" ? [t("admin.profiles.colShift")] : []),
                    ...(type === "leader" ? [t("admin.profiles.colSupervisor")] : []),
                    ...(type === "supervisor" ? [t("admin.profiles.colVerifix")] : []),
                    t("admin.profiles.colHolders"),
                    t("admin.profiles.colActions"),
                  ].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-medium text-gray-200 whitespace-nowrap">
                      {tl(item.name)}
                      {type === "supervisor" && item.archived && (
                        <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                          style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}>
                          {t("admin.profiles.archived")}
                        </span>
                      )}
                    </td>

                    {(type === "shift-manager" || type === "supervisor") && (
                      <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">
                        {item.shift ?? "—"}
                      </td>
                    )}
                    {type === "leader" && (
                      <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">
                        {tl(item.supervisor) || "—"}
                      </td>
                    )}
                    {type === "supervisor" && (
                      <td className="py-2.5 px-3 text-gray-400 font-mono whitespace-nowrap">{item.id}</td>
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
                        <span className="text-gray-600">{t("admin.profiles.noHolders")}</span>
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }}
          onClick={() => !busy && setModal(null)}
        >
          <div
            className="rounded-2xl w-full max-w-sm shadow-2xl p-5 my-8"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: "var(--brand-bg)" }}>
                {modal.mode === "add" ? <Plus size={16} className="text-[var(--brand-text)]" />
                                      : <Pencil size={15} className="text-[var(--brand-text)]" />}
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
                {t(modal.mode === "add" ? "admin.profiles.addTitle" : "admin.profiles.editTitle")}
                {" · "}{t(activeType.tKey)}
              </div>
            </div>

            <div className="space-y-3">
              {/* Canonical name — entered in Uzbek; other languages render automatically */}
              <label className="block">
                <span className={labelCls} style={{ color: "var(--text-3)" }}>
                  {t("admin.profiles.nameLabel")}
                </span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  style={inputStyle}
                  placeholder={t("admin.profiles.namePlaceholder")}
                />
                {modal.mode === "add" && (
                  <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.nameUzHint")}
                  </p>
                )}
                {modal.mode === "edit" && type === "supervisor" &&
                  (form.name || "").trim() !== modal.item.name && (
                  <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                    {t("admin.profiles.renameWarnSupervisor")}
                  </p>
                )}
              </label>

              {(type === "shift-manager" || type === "supervisor") && (
                <label className="block">
                  <span className={labelCls} style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.shiftLabel")}
                  </span>
                  <select
                    value={form.shift}
                    onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
              )}

              {type === "leader" && (
                <label className="block">
                  <span className={labelCls} style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.supervisorLabel")}
                  </span>
                  <select
                    value={form.manager_id}
                    onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">{t("admin.users.selectPlaceholder")}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{tl(u.name)}</option>
                    ))}
                  </select>
                </label>
              )}

              {type === "supervisor" && (
                <label className="block">
                  <span className={labelCls} style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.verifixLabel")}
                  </span>
                  <input
                    type="number"
                    value={form.verifix_id}
                    onChange={(e) => setForm((f) => ({ ...f, verifix_id: e.target.value }))}
                    className={inputCls}
                    style={inputStyle}
                  />
                  {modal.mode === "edit" && Number(form.verifix_id) !== modal.item.id && (
                    <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                      {t("admin.profiles.verifixWarn")}
                    </p>
                  )}
                </label>
              )}

              {/* Per-language display names — edit only; creation is Uzbek-only */}
              {modal.mode === "edit" && (
                <div className="pt-1">
                  <div className={labelCls} style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.langNames")}
                  </div>
                  <p className="mt-0.5 mb-2 text-[10px] leading-snug" style={{ color: "var(--text-3)" }}>
                    {t("admin.profiles.langNamesHint")}
                  </p>
                  <div className="space-y-2">
                    {languages.map((l) => (
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
                        {l.code === "uz" ? (
                          <span className="w-7 flex-shrink-0" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({
                              ...f, overrides: { ...f.overrides, [l.code]: convertFromUz((f.name || "").trim(), l.code) },
                            }))}
                            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                            style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}
                            title={t("settings.translate")}
                          >
                            <Languages size={12} />
                          </button>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formError && <p className="text-[11px] font-medium text-red-400">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setModal(null)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {t("admin.users.cancel")}
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "var(--brand)" }}
              >
                {busy ? <Loader2 size={12} className="animate-spin" />
                      : modal.mode === "add" ? <Plus size={12} /> : <Pencil size={12} />}
                {t(modal.mode === "add" ? "admin.profiles.create" : "admin.profiles.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / archive confirmation */}
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
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: "rgba(239,68,68,0.15)" }}>
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
                {t("admin.profiles.deleteTitle")}
              </div>
            </div>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-3)" }}>
              {(type === "supervisor" && confirmDelete.has_data
                ? t("admin.profiles.archiveMsg")
                : t("admin.profiles.deleteMsg")
              ).replace("{name}", confirmDelete.name)}
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
                onClick={() => deleteMut.mutate({ ptype: type, pid: confirmDelete.id })}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "#ef4444" }}
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {type === "supervisor" && confirmDelete.has_data
                  ? t("admin.profiles.archive") : t("admin.profiles.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unassign confirmation */}
      {confirmUnassign && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }}
          onClick={() => !unassignMut.isPending && setConfirmUnassign(null)}
        >
          <div
            className="rounded-2xl w-full max-w-xs shadow-2xl p-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: "rgba(234,179,8,0.15)" }}>
                <AlertTriangle size={16} className="text-yellow-500" />
              </div>
              <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
                {t("admin.profiles.unassignTitle")}
              </div>
            </div>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-3)" }}>
              {t("admin.profiles.unassignMsg")
                .replace("{user}", confirmUnassign.binding.user_name ||
                  (confirmUnassign.binding.username ? `@${confirmUnassign.binding.username}` : confirmUnassign.binding.telegram_id))
                .replace("{name}", confirmUnassign.item.name)}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmUnassign(null)}
                disabled={unassignMut.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
              >
                {t("admin.users.cancel")}
              </button>
              <button
                onClick={() => unassignMut.mutate({
                  ptype: type,
                  pid: confirmUnassign.item.id,
                  role_ref: confirmUnassign.binding.role_ref,
                  telegram_id: confirmUnassign.binding.telegram_id,
                })}
                disabled={unassignMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: "#eab308", color: "#1a1d27" }}
              >
                {unassignMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                {t("admin.profiles.unassign")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
