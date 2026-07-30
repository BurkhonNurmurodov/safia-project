import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid, Plus, RefreshCw, Pencil, Trash2, Users, Flag, Hash, Factory, Settings2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import TableCard, { Th } from "../components/ui/DataTable";
import LangTextInput from "../components/ui/LangTextInput";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { cellName } from "../utils/cellName";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import api from "../utils/api";

/**
 * Cells registry — the verifix/SAP-code + workshop-name + brigadir/leader
 * register, rebuilt 2026-07-28 as a first-class page. Previously it borrowed the
 * admin ProfilesManagement component in a `cellsOnly` mode, which left it looking
 * like a transplanted admin tab; this is purpose-built and responsive: a sortable
 * TABLE on desktop (sm+), a stack of CARDS on phones (the DataTable `mobile` /
 * `mobileCards` split).
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

const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

// Compact gold-Edit / grey→red-Delete icon pair — shared by the desktop row and
// the mobile card so both surfaces read identically.
function RowActions({ t, onEdit, onDelete, deleting }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
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
  );
}

// Phone-only card: code + SAP chip and the actions up top, the workshop name as
// the body, brigadir + leader pinned to the footer so a stack lines up.
function CellCard({ c, workshop, tl, t, canEdit, onEdit, onDelete, deleting }) {
  return (
    <div className="min-w-0 rounded-2xl p-4 flex flex-col gap-3 border border-[var(--border)] bg-[var(--bg-card)]">
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
          <div className="flex-shrink-0">
            <RowActions t={t} onEdit={onEdit} onDelete={onDelete} deleting={deleting} />
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

  // Workshop name in the viewer's language, Russian as the fallback (shared
  // resolver — every language column is nullable, see utils/cellName).
  const wname = (c) => cellName(c, lang);

  const [search, setSearch] = useState("");
  const [fBrigadir, setFBrigadir] = useState("");  // "" all · "none" unassigned · manager_id
  const [fLeader, setFLeader] = useState("");        // "" all · "none" unassigned · leader_id

  // Per-column sort (desktop table headers) — key:null falls back to verifix.
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

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

  // Global search over every visible field, then the two dropdown filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cells.filter((c) => {
      if (q && !`${c.verifix_code || ""} ${c.sap_code || ""} ${wname(c)} ${tl(c.supervisor) || ""} ${tl(c.leader) || ""}`
            .toLowerCase().includes(q)) return false;
      if (fBrigadir === "none" ? c.manager_id : fBrigadir && String(c.manager_id) !== fBrigadir) return false;
      if (fLeader === "none" ? c.leader_id : fLeader && String(c.leader_id) !== fLeader) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, search, fBrigadir, fLeader, lang, tl]);

  // Sort by the clicked column; the default (no column picked) is a natural sort
  // by verifix code — the register's identity — shared by the table and cards.
  const sorted = useMemo(() => {
    const val = (c) => {
      switch (sort.key) {
        case "sap_code":   return c.sap_code || "";
        case "workshop":   return wname(c);
        case "supervisor": return tl(c.supervisor) || "";
        case "owner":      return tl(c.leader) || "";
        default:           return c.verifix_code || "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      String(val(a)).localeCompare(String(val(b)), undefined, { numeric: true }) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, tl, lang]);

  const colSpan = canEdit ? 6 : 5;

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

  // Phone-only stack (rendered by TableCard `mobile` below `sm`).
  const mobileList = isLoading ? (
    <div className="grid grid-cols-1 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SkeletonBlock className="h-5 w-20 mb-3" />
          <SkeletonBlock className="h-4 w-full mb-2" />
          <SkeletonBlock className="h-4 w-2/3 mb-4" />
          <SkeletonBlock className="h-3.5 w-1/2 mb-2" />
          <SkeletonBlock className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  ) : sorted.length === 0 ? (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <EmptyState title={t("admin.profiles.cellsEmpty")} message={t("admin.profiles.cellsEmptyHint")} showUploadLink={false} height="h-52" />
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-3">
      {sorted.map((c) => (
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
  );

  return (
    <Layout title={t("nav.cells")}>
      <TableCard
        icon={LayoutGrid}
        title={t("admin.profiles.cellsTab")}
        wrap
        fixed
        mobile={mobileList}
        mobileCards
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {sorted.length}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("admin.profiles.cellSearchPh")}
              className="w-full sm:w-72"
            />
            <StyledSelect value={fBrigadir} onChange={setFBrigadir} options={brigadirOpts} searchable className="w-full sm:w-44" />
            <StyledSelect value={fLeader} onChange={setFLeader} options={leaderFilterOpts} searchable className="w-full sm:w-48" />
            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <Button size="lg" icon={<Plus size={14} />} onClick={openAdd} className="whitespace-nowrap">
                  {t("admin.profiles.cellCreate")}
                </Button>
              )}
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
            </div>
          </>
        }
      >
        <thead>
          <tr>
            <Th icon={LayoutGrid} label={t("admin.profiles.colVerifixCode")} k="verifix_code" sort={sort} onSort={onSort} cls="w-[13%]" />
            <Th icon={Hash} label={t("admin.profiles.colSapCode")} k="sap_code" sort={sort} onSort={onSort} cls="w-[12%]" />
            <Th icon={Factory} label={t("admin.profiles.colWorkshop")} k="workshop" sort={sort} onSort={onSort} cls="w-[29%]" />
            <Th icon={Users} label={t("admin.profiles.colSupervisor")} k="supervisor" sort={sort} onSort={onSort} cls="w-[19%]" />
            <Th icon={Flag} label={t("admin.profiles.colOwner")} k="owner" sort={sort} onSort={onSort} cls="w-[19%]" />
            {canEdit && <Th icon={Settings2} label={t("admin.profiles.colActions")} align="center" cls="w-[8%]" />}
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              {Array.from({ length: colSpan }).map((_, j) => (
                <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
              ))}
            </tr>
          ))}
          {!isLoading && sorted.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>
                {t("admin.profiles.cellsEmpty")}
              </td>
            </tr>
          )}
          {!isLoading && sorted.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-mono font-semibold text-[var(--text-1)] whitespace-nowrap">{c.verifix_code}</td>
              <td className="px-3 py-2 font-mono text-[var(--text-3)] whitespace-nowrap">{c.sap_code || "—"}</td>
              <td className="px-3 py-2">
                {wname(c)
                  ? <span className="font-medium text-[var(--text-1)]">{wname(c)}</span>
                  : <span style={{ color: "var(--text-4)" }}>—</span>}
              </td>
              <td className="px-3 py-2">
                {c.supervisor
                  ? <span className="text-[var(--text-2)]">{tl(c.supervisor)}</span>
                  : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellNoSupervisor")}</span>}
              </td>
              <td className="px-3 py-2">
                {c.leader
                  ? <span className="text-[var(--text-2)]">{tl(c.leader)}</span>
                  : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>}
              </td>
              {canEdit && (
                <td className="px-3 py-2">
                  <RowActions t={t} onEdit={() => openEdit(c)} onDelete={() => setConfirmDelete(c)} deleting={deleteMut.isPending} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </TableCard>

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
          <FormField label={t("admin.profiles.colWorkshop")}>
            {/* One tabbed field, not four stacked inputs: every language column
                is optional and a blank one falls back to Russian on display,
                so the empty tabs preview the Russian text as a placeholder. */}
            <LangTextInput
              className="mt-1"
              value={{
                uz: form.name_workshop_uz,
                uz_cyrl: form.name_workshop_uz_cyrl,
                ru: form.name_workshop_ru,
                en: form.name_workshop_en,
              }}
              onChange={(l, v) => setForm((f) => ({ ...f, [`name_workshop_${l}`]: v }))}
            />
          </FormField>
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
