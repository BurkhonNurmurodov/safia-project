import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid, Plus, RefreshCw, Pencil, Trash2, Users, Flag,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import api from "../utils/api";

/**
 * Cells registry — the verifix/SAP-code + workshop-name + brigadir/leader
 * register, rebuilt 2026-07-28 as a first-class card-grid page. Previously it
 * borrowed the admin ProfilesManagement component in a `cellsOnly` mode, which
 * left it looking like a transplanted admin tab; this is a purpose-built page.
 *
 * Two independent grants gate it (a real admin holds both):
 *   • page.view.cells    → open the page (RequirePage on the route + a
 *                          PAGE-gated read endpoint) — read-only view
 *   • admin.cells.manage → create / edit / delete (CAP.CELLS_MANAGE)
 * `canEdit` hides every write control for a view-only grantee; the backend
 * enforces the same split, so a hidden button that somehow fired still 403s.
 *
 * Data + endpoints are unchanged: GET /api/profiles/admin/cells returns the
 * register plus the brigadir/leader option lists; create/edit/delete ride the
 * POST/PUT/DELETE /api/profiles/admin/cells[/id] endpoints.
 */

const NAME_LANGS = ["uz_cyrl", "ru", "en"];

const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };
const labelCls = "text-[11px] font-semibold uppercase tracking-wider";

// A single register entry rendered as a card: code + SAP chip and the row
// actions up top, the workshop name as the body, brigadir + leader pinned to
// the footer so every card in a grid row lines its people up.
function CellCard({ c, workshop, tl, t, canEdit, onEdit, onDelete, deleting }) {
  return (
    <div className="group min-w-0 rounded-2xl p-4 flex flex-col gap-3 border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-inner)] transition-colors">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-mono font-semibold text-sm text-[var(--text-1)]">{c.verifix_code}</span>
          {c.sap_code && (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}
            >
              {c.sap_code}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onEdit}
              title={t("admin.profiles.edit")}
              aria-label={t("admin.profiles.edit")}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand-text)", border: "1px solid rgba(200,151,63,0.25)" }}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title={t("admin.profiles.delete")}
              aria-label={t("admin.profiles.delete")}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.16)"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(148,163,184,0.12)"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "rgba(148,163,184,0.22)"; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-[2.5rem] min-w-0">
        {workshop
          ? <div className="text-sm font-medium leading-snug text-[var(--text-1)] break-words">{workshop}</div>
          : <div className="text-sm" style={{ color: "var(--text-4)" }}>—</div>}
      </div>

      <div className="mt-auto pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Users size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          {c.supervisor
            ? <span className="truncate min-w-0 text-[var(--text-2)]">{tl(c.supervisor)}</span>
            : <span className="truncate min-w-0" style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellNoSupervisor")}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Flag size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          {c.leader
            ? <span className="truncate min-w-0 text-[var(--text-2)]">{tl(c.leader)}</span>
            : <span className="truncate min-w-0" style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Cells() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { can, isLoading: capLoading } = useCapabilities();
  // Default to read-only while the grant query is in flight so a slow response
  // never briefly exposes edit controls. Admins hold the whole catalog.
  const canEdit = !capLoading && can(CAP.CELLS_MANAGE);
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-cells"],
    queryFn: () => api.get("/api/profiles/admin/cells").then((r) => r.data),
  });

  const cells = data?.cells ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  const leaders = data?.leaders ?? [];

  // Workshop name in the viewer's language, first known language as fallback.
  const wname = (c) =>
    c[`name_workshop_${lang}`] || c.name_workshop_uz || c.name_workshop_uz_cyrl ||
    c.name_workshop_ru || c.name_workshop_en || "";

  const [search, setSearch] = useState("");
  const [fBrigadir, setFBrigadir] = useState("");  // "" all · "none" unassigned · manager_id
  const [fLeader, setFLeader] = useState("");        // "" all · "none" unassigned · leader_id

  const [modal, setModal] = useState(null);       // {mode:"add"|"edit", item?}
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const done = () => qc.invalidateQueries({ queryKey: ["admin-cells"] });
  const fail = (e) => setFormError(e?.response?.data?.detail || t("admin.profiles.error"));

  const createMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/cells", body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
  });
  const updateMut = useMutation({
    mutationFn: ({ cid, body }) => api.put(`/api/profiles/admin/cells/${cid}`, body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
  });
  const deleteMut = useMutation({
    mutationFn: (cid) => api.delete(`/api/profiles/admin/cells/${cid}`),
    onSuccess: () => { done(); setConfirmDelete(null); },
    onError: (e) => { setConfirmDelete(null); alert(e?.response?.data?.detail || t("admin.profiles.error")); },
  });
  const busy = createMut.isPending || updateMut.isPending;

  function openAdd() {
    setForm({ verifix_code: "", sap_code: "", manager_id: "", leader_id: "",
              name_workshop_uz: "", name_workshop_uz_cyrl: "",
              name_workshop_ru: "", name_workshop_en: "" });
    setFormError("");
    setModal({ mode: "add" });
  }

  function openEdit(item) {
    setForm({
      verifix_code: item.verifix_code || "",
      sap_code: item.sap_code || "",
      manager_id: item.manager_id ? String(item.manager_id) : "",
      leader_id: item.leader_id ? String(item.leader_id) : "",
      name_workshop_uz: item.name_workshop_uz || "",
      name_workshop_uz_cyrl: item.name_workshop_uz_cyrl || "",
      name_workshop_ru: item.name_workshop_ru || "",
      name_workshop_en: item.name_workshop_en || "",
    });
    setFormError("");
    setModal({ mode: "edit", item });
  }

  function submit() {
    setFormError("");
    const code = (form.verifix_code || "").trim();
    if (!code) { setFormError(t("admin.profiles.verifixCodeRequired")); return; }
    const body = {
      verifix_code: code,
      sap_code: form.sap_code || "",
      name_workshop_uz: form.name_workshop_uz || "",
      name_workshop_uz_cyrl: form.name_workshop_uz_cyrl || "",
      name_workshop_ru: form.name_workshop_ru || "",
      name_workshop_en: form.name_workshop_en || "",
      manager_id: form.manager_id ? Number(form.manager_id) : 0,
      leader_id: form.leader_id ? Number(form.leader_id) : 0,
    };
    if (modal.mode === "add") createMut.mutate(body);
    else updateMut.mutate({ cid: modal.item.id, body });
  }

  // Global search over every visible field, then the two dropdown filters, then
  // a stable natural sort by verifix code (the register's identity).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = cells.filter((c) => {
      if (q && !`${c.verifix_code || ""} ${c.sap_code || ""} ${wname(c)} ${tl(c.supervisor) || ""} ${tl(c.leader) || ""}`
            .toLowerCase().includes(q)) return false;
      if (fBrigadir === "none" ? c.manager_id : fBrigadir && String(c.manager_id) !== fBrigadir) return false;
      if (fLeader === "none" ? c.leader_id : fLeader && String(c.leader_id) !== fLeader) return false;
      return true;
    });
    return out.sort((a, b) =>
      String(a.verifix_code).localeCompare(String(b.verifix_code), undefined, { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, search, fBrigadir, fLeader, lang, tl]);

  const brigadirOpts = [
    { value: "", label: t("admin.profiles.cellFilterAllBrigadirs") },
    { value: "none", label: t("admin.profiles.cellNoSupervisor") },
    ...units.map((u) => ({ value: String(u.id), label: tl(u.name) })),
  ];
  const leaderFilterOpts = [
    { value: "", label: t("admin.profiles.cellFilterAllLeaders") },
    { value: "none", label: t("admin.profiles.cellUnassigned") },
    ...leaders.map((l) => ({ value: String(l.id), label: tl(l.name), title: tl(l.name) })),
  ];

  const refreshBtn = (
    <Button
      size="lg"
      variant="secondary"
      icon={<RefreshCw size={14} />}
      loading={isFetching}
      onClick={() => refetch()}
      className="whitespace-nowrap"
    >
      {t("admin.refresh")}
    </Button>
  );

  return (
    <Layout title={t("nav.cells")}>
      <div className="w-full space-y-4">
        {/* Header + toolbar: title/count on top, one aligned control row
            (search-left → filters-middle → actions-right, 38px baseline). */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead
            icon={LayoutGrid}
            title={t("admin.profiles.cellsTab")}
            right={
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                {filtered.length}
              </span>
            }
          />
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("admin.profiles.cellSearchPh")}
              className="w-full sm:w-72"
            />
            <StyledSelect
              value={fBrigadir}
              onChange={setFBrigadir}
              options={brigadirOpts}
              searchable
              className="w-full sm:w-44"
            />
            <StyledSelect
              value={fLeader}
              onChange={setFLeader}
              options={leaderFilterOpts}
              searchable
              className="w-full sm:w-48"
            />
            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <Button size="lg" icon={<Plus size={14} />} onClick={openAdd} className="whitespace-nowrap">
                  {t("admin.profiles.cellCreate")}
                </Button>
              )}
              {refreshBtn}
            </div>
          </div>
        </div>

        {/* Card grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <SkeletonBlock className="h-5 w-20 mb-3" />
                <SkeletonBlock className="h-4 w-full mb-2" />
                <SkeletonBlock className="h-4 w-2/3 mb-4" />
                <SkeletonBlock className="h-3.5 w-1/2 mb-2" />
                <SkeletonBlock className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState
              title={t("admin.profiles.cellsEmpty")}
              message={t("admin.profiles.cellsEmptyHint")}
              showUploadLink={false}
              height="h-56"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((c) => (
              <CellCard
                key={c.id}
                c={c}
                workshop={wname(c)}
                tl={tl}
                t={t}
                canEdit={canEdit}
                onEdit={() => openEdit(c)}
                onDelete={() => setConfirmDelete(c)}
                deleting={deleteMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      {modal && (
        <Modal
          onClose={() => setModal(null)}
          dismissable={!busy}
          title={`${t(modal.mode === "add" ? "admin.profiles.addTitle" : "admin.profiles.editTitle")} · ${t("admin.profiles.cellsTab")}`}
          maxWidth="max-w-sm"
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
          <FormField label={t("admin.profiles.colVerifixCode")} required>
            <input
              type="text"
              value={form.verifix_code || ""}
              onChange={(e) => setForm((f) => ({ ...f, verifix_code: e.target.value }))}
              className={inputCls}
              style={inputStyle}
              autoFocus={modal.mode === "add"}
            />
          </FormField>
          <FormField label={t("admin.profiles.colSapCode")}>
            <input
              type="text"
              value={form.sap_code || ""}
              onChange={(e) => setForm((f) => ({ ...f, sap_code: e.target.value }))}
              className={inputCls}
              style={inputStyle}
            />
          </FormField>
          <div className="pt-1">
            <div className={labelCls} style={{ color: "var(--text-3)" }}>
              {t("admin.profiles.colWorkshop")}
            </div>
            <div className="mt-2 space-y-2">
              {["uz", ...NAME_LANGS].map((l) => (
                <label key={l} className="flex items-center gap-2">
                  <span className="w-14 flex-shrink-0 text-[10px] font-mono uppercase" style={{ color: "var(--text-4)" }}>{l}</span>
                  <input
                    type="text"
                    value={form[`name_workshop_${l}`] || ""}
                    onChange={(e) => setForm((f) => ({ ...f, [`name_workshop_${l}`]: e.target.value }))}
                    className={inputCls + " !mt-0"}
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
          </div>
          <FormField label={t("admin.profiles.colSupervisor")}>
            <StyledSelect
              value={form.manager_id || ""}
              onChange={(v) => setForm((f) => ({ ...f, manager_id: v }))}
              disabled={!!form.leader_id}
              options={[
                { value: "", label: t("admin.profiles.cellNoSupervisor") },
                ...units.map((u) => ({ value: String(u.id), label: tl(u.name) })),
              ]}
            />
            {form.leader_id && (
              <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--text-4)" }}>
                {t("admin.profiles.cellSupervisorFromOwner")}
              </p>
            )}
          </FormField>
          <FormField label={t("admin.profiles.colOwner")}>
            <StyledSelect
              value={form.leader_id || ""}
              onChange={(v) => setForm((f) => {
                // Owner is authoritative for the supervisor: picking a leader
                // inherits their unit; clearing keeps the cell's current
                // supervisor (a cell can be leaderless yet owned).
                const L = leaders.find((x) => String(x.id) === String(v));
                return {
                  ...f,
                  leader_id: v,
                  manager_id: v ? (L?.manager_id ? String(L.manager_id) : f.manager_id) : f.manager_id,
                };
              })}
              searchable
              options={[
                { value: "", label: t("admin.profiles.cellUnassigned") },
                ...leaders.map((l) => ({ value: String(l.id), label: tl(l.name), title: tl(l.name) })),
              ]}
            />
          </FormField>
          {formError && <p className="text-[11px] font-medium text-red-400">{formError}</p>}
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        title={t("admin.profiles.deleteTitle")}
        message={confirmDelete && t("admin.profiles.deleteMsg").replace("{name}", confirmDelete.verifix_code || "")}
        confirmLabel={t("admin.profiles.confirmDelete")}
        cancelLabel={t("admin.users.cancel")}
        tone="danger"
        loading={deleteMut.isPending}
      />
    </Layout>
  );
}
