import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid, Plus, RefreshCw, Pencil, Trash2, Users, Flag, Hash, Settings2,
  FileSpreadsheet, ShieldCheck, UserRound,
} from "lucide-react";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import Layout from "../components/layout/Layout";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import TableCard, { Th } from "../components/ui/DataTable";
import CellLink from "../components/ui/CellLink";
import CellFormModal from "../components/CellFormModal";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useTranslit } from "../utils/transliterate";
import { cellName } from "../utils/cellName";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";

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
 * POST/PUT/DELETE /api/profiles/admin/cells[/id] endpoints (the add/edit form
 * itself is the shared components/CellFormModal, also used by /cells/:id).
 *
 * Rows and phone cards NAVIGATE to the cell's own page (/cells/:id) — same
 * pattern as the Profiles tab rows; edit/delete stay as the row's icon pair
 * and stop the click from bubbling into the navigation.
 */

// Compact gold-Edit / grey→red-Delete icon pair — shared by the desktop row and
// the mobile card so both surfaces read identically. Clicks must not bubble:
// the row/card underneath navigates to the cell page.
function RowActions({ t, onEdit, onDelete, deleting }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        title={t("admin.profiles.edit")}
        aria-label={t("admin.profiles.edit")}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
        style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand-text)", border: "1px solid rgba(200,151,63,0.25)" }}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
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

// Phone-only card: code + SAP chip and the actions up top, brigadir + leader
// pinned to the footer so a stack lines up. The code is the whole identity —
// the workshop name is never printed (utils/cellName.js), and the two people
// answerable for the cell are what the card carries instead.
// The whole card opens the cell's page; the icon pair stops propagation.
function CellCard({ c, tl, t, canEdit, onEdit, onDelete, deleting, onOpen }) {
  return (
    <div
      className="min-w-0 rounded-2xl p-4 flex flex-col gap-3 border border-[var(--border)] bg-[var(--bg-card)] cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <CellLink id={c.id} className="font-mono font-semibold text-sm text-[var(--text-1)]">{c.verifix_code}</CellLink>
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
  const toast = useToast();
  const navigate = useNavigate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-cells"],
    queryFn: () => api.get("/api/profiles/admin/cells").then((r) => r.data),
  });

  const cells = data?.cells ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  const leaders = data?.leaders ?? [];

  // Workshop name in the viewer's language, Russian as the fallback (shared
  // resolver — every language column is nullable, see utils/cellName).
  //
  // SEARCH ONLY. A cell is never written out by its name — not in this table,
  // not on a card, not in the export — so this feeds the match test and nothing
  // else: typing «яблоки» still finds 1612, and 1612 is what comes back.
  const wname = (c) => cellName(c, lang);

  const [search, setSearch] = usePersistentState("cells_search", "");
  const [fBrigadir, setFBrigadir] = usePersistentState("cells_filter_brigadir", "");  // "" all · "none" unassigned · manager_id
  const [fLeader, setFLeader] = usePersistentState("cells_filter_leader", "");        // "" all · "none" unassigned · leader_id

  // Per-column sort (desktop table headers) — key:null falls back to verifix.
  const [sort, setSort] = usePersistentState("cells_sort", { key: null, dir: "asc" });
  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  const [modal, setModal] = useState(null);       // {mode:"add"|"edit", item?}
  const [confirmDelete, setConfirmDelete] = useState(null);

  const done = () => qc.invalidateQueries({ queryKey: ["admin-cells"] });

  const deleteMut = useMutation({
    mutationFn: (cid) => api.delete(`/api/profiles/admin/cells/${cid}`),
    onSuccess: () => { done(); setConfirmDelete(null); },
    // Never window.alert here: Telegram's iOS WebView swallows it, so the one
    // signal that a deletion failed would be invisible on the primary device.
    onError: (e) => { setConfirmDelete(null); toast.error(e?.response?.data?.detail || t("admin.profiles.error")); },
  });

  const openAdd = () => setModal({ mode: "add" });
  const openEdit = (item) => setModal({ mode: "edit", item });

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

  // Excel export — ships what the page is SHOWING (filtered + sorted, names
  // already resolved to the viewer's language and transliterated), so the
  // workbook mirrors the screen instead of re-deriving a second register.
  // Unassigned slots go out as "" and the backend applies the placeholder
  // label, keeping "no brigadir" visually distinct from a real name in Excel.
  // Read-only, so it stays available to a view-only grantee (no canEdit gate).
  const exportMut = useMutation({
    mutationFn: () =>
      exportXlsx("/api/profiles/admin/cells/export.xlsx", {
        body: {
          lang,
          total: cells.length,
          rows: sorted.map((c) => ({
            verifix_code: c.verifix_code || "",
            sap_code: c.sap_code || "",
            supervisor: c.supervisor ? tl(c.supervisor) : "",
            leader: c.leader ? tl(c.leader) : "",
          })),
        },
        fallbackName: "cells_register.xlsx",
      }),
    onSuccess: (via) => toast.success(t(via === "download" ? "staff.exportDownloaded" : "staff.exportToast")),
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const colSpan = canEdit ? 5 : 4;

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
          tl={tl}
          t={t}
          canEdit={canEdit}
          onEdit={() => openEdit(c)}
          onDelete={() => setConfirmDelete(c)}
          deleting={deleteMut.isPending}
          onOpen={() => navigate(`/cells/${c.id}`)}
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
            <FilterPanel
              sections={[
                {
                  key: "brigadir", icon: ShieldCheck, label: t("admin.profiles.cellFilterAllBrigadirs"),
                  active: fBrigadir !== "",
                  display: fBrigadir !== "" ? (brigadirOpts.find((o) => o.value === fBrigadir)?.label || "") : "",
                  onClear: () => setFBrigadir(""),
                  render: ({ close } = {}) => (
                    <PickFilter searchable close={close} opts={brigadirOpts} value={fBrigadir} onChange={setFBrigadir} />
                  ),
                },
                {
                  key: "leader", icon: UserRound, label: t("admin.profiles.cellFilterAllLeaders"),
                  active: fLeader !== "",
                  display: fLeader !== "" ? (leaderFilterOpts.find((o) => o.value === fLeader)?.label || "") : "",
                  onClear: () => setFLeader(""),
                  render: ({ close } = {}) => (
                    <PickFilter searchable close={close} opts={leaderFilterOpts} value={fLeader} onChange={setFLeader} />
                  ),
                },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <Button size="lg" icon={<Plus size={14} />} onClick={openAdd} className="whitespace-nowrap">
                  {t("admin.profiles.cellCreate")}
                </Button>
              )}
              <Button
                size="lg"
                variant="secondary"
                icon={<FileSpreadsheet size={14} />}
                loading={exportMut.isPending}
                disabled={isLoading || sorted.length === 0}
                onClick={() => exportMut.mutate()}
                className="whitespace-nowrap"
              >
                {/* Label stays put — Button overlays the spinner so the
                    toolbar doesn't reflow mid-send. */}
                {t("staff.export")}
              </Button>
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
            <Th icon={LayoutGrid} label={t("admin.profiles.colVerifixCode")} k="verifix_code" sort={sort} onSort={onSort} cls="w-[18%]" />
            <Th icon={Hash} label={t("admin.profiles.colSapCode")} k="sap_code" sort={sort} onSort={onSort} cls="w-[18%]" />
            <Th icon={Users} label={t("admin.profiles.colSupervisor")} k="supervisor" sort={sort} onSort={onSort} cls="w-[28%]" />
            <Th icon={Flag} label={t("admin.profiles.colOwner")} k="owner" sort={sort} onSort={onSort} cls="w-[28%]" />
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
            <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/cells/${c.id}`)}>
              <td className="px-3 py-2 font-mono font-semibold text-[var(--text-1)] whitespace-nowrap">
                <CellLink id={c.id}>{c.verifix_code}</CellLink>
              </td>
              <td className="px-3 py-2 font-mono text-[var(--text-3)] whitespace-nowrap">{c.sap_code || "—"}</td>
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

      {/* Add / edit modal — the ONE cell form, shared with /cells/:id */}
      {modal && (
        <CellFormModal
          mode={modal.mode}
          item={modal.item}
          units={units}
          leaders={leaders}
          onClose={() => setModal(null)}
          onSaved={done}
        />
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

      {toast.node}
    </Layout>
  );
}
