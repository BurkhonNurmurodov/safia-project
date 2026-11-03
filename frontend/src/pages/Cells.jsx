import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid, Plus, RefreshCw, Pencil, Trash2, Users, Flag, Hash,
  FileSpreadsheet, ShieldCheck, UserRound, UserCheck, Layers, AlertTriangle, Archive, ArchiveRestore, Gauge,
  Workflow, Target, Tag,
} from "lucide-react";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import Layout from "../components/layout/Layout";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import TableCard, { Th } from "../components/ui/DataTable";
import ActionMenu from "../components/ui/ActionMenu";
import KPICard from "../components/ui/KPICard";
import useIsMobile from "../hooks/useIsMobile";
import CellLink from "../components/ui/CellLink";
import CellFormModal from "../components/CellFormModal";
import { CellManagerDialog, PendingChip, ManualMark } from "../components/CellManagerPicker";
import GroupBadge from "../components/ui/GroupBadge";
import { wcGroupLabel } from "../utils/wcGroup";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useTranslit } from "../utils/transliterate";
import { cellName } from "../utils/cellName";
import { latinFold } from "../utils/latinCode";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import { useAuth } from "../context/AuthContext";
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
 * Supervisors open it through their ROLE (from 2026-09-14) and are served it
 * narrowed server-side to their own unit's cells, read-only. The payload's
 * `scope` says so, and the page names that unit as an inert brigadir chip.
 *
 * Data + endpoints are unchanged: GET /api/profiles/admin/cells returns the
 * register plus the brigadir/leader option lists; create/edit/delete ride the
 * POST/PUT/DELETE /api/profiles/admin/cells[/id] endpoints (the add/edit form
 * itself is the shared components/CellFormModal, also used by /cells/:id).
 *
 * Rows and phone cards NAVIGATE to the cell's own page (/cells/:id) — same
 * pattern as the Profiles tab rows; a row's actions (edit · archive · delete,
 * or a brigadir's «Boshqaruvchi» pick) sit behind its ⋮ (ui/ActionMenu, from
 * 2026-11-03), which never lets a click through to the navigation.
 *
 * Four cards head the page (2026-11-03): active cells · counted in the
 * загрузка · no brigadir (a narrowed supervisor's register: owner ≠ manager)
 * · no «Boshqaruvchi», counted over the register as served, active cells
 * only — never the filtered rows. A card's number opens exactly its cells
 * (every other filter and the search cleared).
 *
 * A cell names two leaders (2026-10-08): the «Boshqaruvchi» who runs it on the
 * platform (`leader_id`) and the «Egasi» Verifix seats in it (`owner_id`).
 * Mostly one person; the owner filter's «Boshqaruvchidan farqli» lists the
 * cells where they are not.
 *
 * «Jarayonlar» (`one_process`, 2026-10-10): a cell specialised for ONE process
 * carries a chip; a leader whose cells are all such is not asked for 3
 * different processes on checklist task 3 (backend services/one_process).
 *
 * The Verifix live sync (2026-10-12): a cell's brigadir and «Boshqaruvchi»
 * are DATED links — a change lands at the unit's next shift opening — so a
 * change already waiting prints beside the value in force, «13.10 dan: X», on
 * the same line (rows stay one line high). The «Boshqaruvchi» is the Verifix
 * seat by default; one a person picked carries a «qo'lda» mark. A brigadir
 * (no edit grant, `can_pick_manager` on the payload) gets ONE row action on
 * their own unit's cells, «Boshqaruvchi», opening the picker dialog — nothing
 * else of the cell is theirs to edit. «Egasi» is Verifix's, read-only.
 *
 * The NAME (2026-10-19, the operator: «show the cell names on cells page»):
 * this register prints the cell's name beside its code — «Sex nomi», in the
 * viewer's language (Russian when theirs is blank), cut with «…» and whole on
 * hover. Verifix's name, kept in step by the live sync. Every OTHER page still
 * names a cell by its code alone (utils/cellName.js).
 */

// Whole-sentence templates with {placeholders} — word order differs per language.
// When a cell was archived, on the plant's wall clock (never the browser's).
const fmtArchived = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
};

// «Arxivda · DD.MM.YYYY» beside a closed cell's code; the time and who did it
// on hover.
function ArchivedChip({ c, t }) {
  if (!c.archived_at) return null;
  const when = fmtArchived(c.archived_at);
  const tip = fill(t("admin.profiles.cellArchivedTip"), { date: when, by: c.archived_by || "—" });
  return (
    <span
      title={tip}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap align-middle"
      style={{ background: "rgba(148,163,184,0.14)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.25)" }}
    >
      <Archive size={11} />
      {t("admin.profiles.cellArchived")} · {when.slice(0, 10)}
    </span>
  );
}

const fill = (s, vars) => String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

// The register rule of a work-centre GROUP (backend services/wc_group.py
// `cell_conflicts`, which the boot self-check reports): inside ONE brigadir's
// unit a SAP code is carried by exactly one cell, or by several cells that are
// ALL lettered and all different. Computed here over the whole register — not
// the filtered rows — so a sibling hidden by a filter still counts, and the
// admin sees on the row what the self-check would name.
const normSap = (v) => String(v ?? "").replace(/\s/g, "").toUpperCase();
function groupIssues(cells) {
  const by = new Map();
  for (const c of cells) {
    const code = normSap(c.sap_code);
    if (c.manager_id == null || !code) continue;
    const k = `${c.manager_id}|${code}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(c);
  }
  const out = new Map();
  for (const cs of by.values()) {
    if (cs.length < 2) continue;
    for (const c of cs) {
      const others = cs.filter((o) => o.id !== c.id);
      if (!c.wc_group) {
        out.set(c.id, { kind: "missing", code: normSap(c.sap_code),
                        cells: others.map((o) => o.verifix_code).join(", ") });
        continue;
      }
      const same = others.filter((o) => o.wc_group === c.wc_group);
      if (same.length) {
        out.set(c.id, { kind: "duplicate", code: normSap(c.sap_code), group: c.wc_group,
                        cells: same.map((o) => o.verifix_code).join(", ") });
      }
    }
  }
  return out;
}

// The group cell of a row/card: the letter badge, amber when it collides with a
// sibling's; a warning mark when a shared code leaves this cell unlettered.
function GroupMark({ c, issue, t, placeholder = true }) {
  const tip = issue
    ? fill(t(issue.kind === "missing" ? "admin.profiles.cellGroupMissing" : "admin.profiles.cellGroupDuplicate"), issue)
    : wcGroupLabel(c.sap_code, c.wc_group);
  if (c.wc_group) {
    return <GroupBadge group={c.wc_group} tone={issue ? "warn" : "neutral"} title={tip} />;
  }
  if (issue) {
    return (
      <span title={tip} aria-label={tip} className="inline-flex items-center gap-1 align-middle" style={{ color: "#eab308" }}>
        <AlertTriangle size={13} />
        {placeholder && <span className="text-[11px]">—</span>}
      </span>
    );
  }
  return placeholder ? <span style={{ color: "var(--text-4)" }}>—</span> : null;
}

// «Zagruzkada hisoblanadi» (`in_load`): plain when the cell counts, a grey chip
// when it does not — the exception is the one the eye should find (the
// brigadir list's own «Zagruzka» column). `long` spells it out for a phone card,
// where no column header says what the word is about.
function LoadMark({ on, t, long = false }) {
  if (on) {
    return (
      <span className="whitespace-nowrap text-[var(--text-2)]">
        {t(long ? "cellPage.inLoadOn" : "admin.profiles.cellZagOn")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.25)" }}>
      {t(long ? "cellPage.inLoadOff" : "admin.profiles.cellZagOff")}
    </span>
  );
}

// «Jarayonlar» (`one_process`): «Ko'p» plain — what most cells are — and a
// neutral chip for a cell specialised for ONE process, the exception the eye
// should find. Not a status, so no traffic-light colour. `long` spells it out
// for a phone card, where no column header says what the word is about.
function ProcessMark({ one, t, long = false }) {
  if (!one) {
    return (
      <span className="whitespace-nowrap text-[var(--text-2)]">
        {t(long ? "cellPage.oneProcessOff" : "admin.profiles.cellProcMany")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "var(--bg-inner)", color: "var(--text-1)", border: "1px solid var(--border-md)" }}>
      <Target size={11} aria-hidden="true" style={{ color: "var(--text-3)" }} />
      {t(long ? "cellPage.oneProcessOn" : "admin.profiles.cellProcOne")}
    </span>
  );
}

// The cell's name (2026-10-19 — this register only; everywhere else a cell is
// its code). One line, cut with «…», whole on hover; «—» when none is stored.
function NameCell({ name, className = "" }) {
  if (!name) return <span className={className} style={{ color: "var(--text-4)" }}>—</span>;
  return <span className={`block truncate min-w-0 text-[var(--text-2)] ${className}`} title={name}>{name}</span>;
}

// "2026-10-13" → "13.10" — the operator's «{dd.mm} dan» form.
const ddmm = (iso) => {
  const s = String(iso || "");
  return s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : s;
};

// A DATED link of the cell (its brigadir, its «Boshqaruvchi»): the value in
// force, cut with «…»; «qo'lda» when a person picked the manager; and a change
// already waiting as «13.10 dan: X» on the SAME line. The whole of it on hover.
function LinkName({ name, empty, manual = false, pend, t, tl }) {
  const shown = name ? tl(name) : t(empty);
  const pendName = pend ? (pend.name ? tl(pend.name) : t(empty)) : null;
  const tip = [
    shown,
    manual ? t("cellMgr.manualTip") : null,
    pend ? fill(t("cellMgr.from"), { date: ddmm(pend.from), name: pendName }) : null,
  ].filter(Boolean).join("\n");
  return (
    <span className="flex items-center gap-1.5 min-w-0" title={tip}>
      <span className="truncate min-w-0" style={{ color: name ? "var(--text-2)" : "var(--text-4)", flexShrink: 1 }}>
        {shown}
      </span>
      {manual && <ManualMark />}
      {pend && (
        <span className="flex min-w-0" style={{ flexShrink: 2 }}>
          <PendingChip from={pend.from} name={pendName} title={tip} />
        </span>
      )}
    </span>
  );
}

// «Egasi» — the leader Verifix seats in the cell. Their profile may stand in
// another brigadir's unit, or in none yet; the tooltip names which, and an
// owner with no brigadir carries an amber mark, because that profile still has
// to be given one.
function OwnerMark({ c, tl, t }) {
  if (!c.owner) {
    return <span className="block truncate" style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>;
  }
  const name = tl(c.owner);
  const noUnit = c.owner_unit_id == null;
  const where = noUnit ? t("admin.profiles.cellOwnerNoUnit") : (c.owner_unit ? tl(c.owner_unit) : "");
  const tip = where ? `${name} · ${where}` : name;
  return (
    <span className="flex items-center gap-1.5 min-w-0" title={tip}>
      <span className="truncate min-w-0 text-[var(--text-2)]">{name}</span>
      {noUnit && <AlertTriangle size={12} className="flex-shrink-0" style={{ color: "#eab308" }} aria-label={where} />}
    </span>
  );
}

// Phone-only card: code + SAP chip and the ⋮ menu up top, the cell's name
// under them, brigadir + leader pinned to the footer so a stack lines up.
// The whole card opens the cell's page; the menu stops propagation.
function CellCard({ c, name, tl, t, menu, onOpen, issue }) {
  return (
    <div
      className="min-w-0 rounded-2xl p-4 flex flex-col gap-3 border border-[var(--border)] bg-[var(--bg-card)] cursor-pointer"
      style={c.archived_at ? { opacity: 0.7 } : undefined}
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
          {c.sap_code && <GroupMark c={c} issue={issue} t={t} placeholder={false} />}
          <ArchivedChip c={c} t={t} />
        </div>
        {menu && <div className="flex-shrink-0 -mr-1 -mt-1">{menu}</div>}
      </div>
      {name && <NameCell name={name} className="-mt-1.5 text-sm" />}

      <div className="mt-auto pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Users size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <LinkName name={c.supervisor} empty="admin.profiles.cellNoSupervisor"
                    pend={c.pending?.manager_id} t={t} tl={tl} />
        </div>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Flag size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{t("admin.profiles.colCellManager")}:</span>
          <LinkName name={c.leader} empty="admin.profiles.cellUnassigned"
                    manual={c.manager_mode === "manual"} pend={c.pending?.leader_id} t={t} tl={tl} />
        </div>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <UserCheck size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{t("admin.profiles.colCellOwner")}:</span>
          <OwnerMark c={c} tl={tl} t={t} />
        </div>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Gauge size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <LoadMark on={c.in_load} t={t} long />
        </div>
        <div className="flex items-center gap-2 text-xs min-w-0">
          <Workflow size={13} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <ProcessMark one={c.one_process} t={t} long />
        </div>
      </div>
    </div>
  );
}

export default function Cells() {
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const { can, isLoading: capLoading } = useCapabilities();
  // Default to read-only while the grant query is in flight so a slow response
  // never briefly exposes edit controls. Admins hold the whole catalog.
  const canEdit = !capLoading && can(CAP.CELLS_MANAGE);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const phone = useIsMobile();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-cells"],
    queryFn: () => api.get("/api/profiles/admin/cells").then((r) => r.data),
  });

  const cells = data?.cells ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  const leaders = data?.leaders ?? [];

  // Workshop name in the viewer's language, Russian as the fallback (shared
  // resolver — every language column is nullable, see utils/cellName). The
  // search matches it as stored; the column, the card and the export print it
  // through `tx`, the platform's rule for DB text.
  const wname = (c) => cellName(c, lang);
  const shownName = (c) => tx(wname(c)) || "";

  const [search, setSearch] = usePersistentState("cells_search", "");
  const [fBrigadir, setFBrigadir] = usePersistentState("cells_filter_brigadir", "");  // "" all · "none" unassigned · manager_id
  const [fLeader, setFLeader] = usePersistentState("cells_filter_leader", "");        // "" all · "none" unassigned · leader_id
  // «Egasi»: "" all · "none" no owner · "differs" owner ≠ Boshqaruvchi · leader_id
  const [fOwner, setFOwner] = usePersistentState("cells_filter_owner", "");
  // Archived (closed) cells are hidden by default; "archived" shows only them.
  const [fStatus, setFStatus] = usePersistentState("cells_filter_status", "active"); // active · archived · all
  const statusSel = ["active", "archived", "all"].includes(fStatus) ? fStatus : "active";
  // «Zagruzkada hisoblanadi»: "" all · "on" counted · "off" not counted.
  const [fZag, setFZag] = usePersistentState("cells_filter_zag", "");
  const zagSel = ["", "on", "off"].includes(fZag) ? fZag : "";
  // «Jarayonlar»: "" all · "one" one process · "many" several.
  const [fProc, setFProc] = usePersistentState("cells_filter_proc", "");
  const procSel = ["", "one", "many"].includes(fProc) ? fProc : "";

  // Set when the server narrowed the register to the viewer's OWN unit — a
  // supervisor who opens the page through their role (backend
  // `_cells_viewer_unit`). Read off the payload, never off the role: the same
  // supervisor holding a grant is served the whole register with scope null.
  const scope = data?.scope ?? null;
  // The picks actually applied. A narrowed register holds one unit, so its
  // brigadir control is an inert chip and a pick remembered from a wider
  // session must not keep filtering behind it; a leader the list no longer
  // offers is dropped the same way instead of hiding every row behind a chip
  // that names nobody.
  // A brigadir may pick the «Boshqaruvchi» of their OWN unit's cells and do
  // nothing else here (backend `_may_pick_manager`). The server answers it per
  // row (`can_pick`); a payload without it is answered off the viewer's unit —
  // a narrowed register names it, a supervisor widened by a page grant by
  // their role. A cell the payload lists because it JOINS the unit at the next
  // opening is not theirs yet, and the server would refuse it. Nothing is
  // offered while the capabilities load: an editor gets the whole form.
  const pickOnly = !capLoading && !canEdit && !!data?.can_pick_manager;
  const myUnit = scope ? scope.unit_id ?? null
    : auth?.role === "supervisor" && auth?.role_id != null ? Number(auth.role_id) : null;
  const canPickRow = (c) => pickOnly && (typeof c.can_pick === "boolean"
    ? c.can_pick
    : myUnit != null && !c.archived_at && c.manager_id === myUnit);
  // Over the whole register, never the filtered rows, so a filter never adds
  // or removes the column under the reader.
  const showActions = canEdit || (pickOnly && cells.some(canPickRow));
  const brigadirSel = scope ? "" : fBrigadir;
  const leaderSel = !data || fLeader === "" || fLeader === "none"
    || leaders.some((l) => String(l.id) === fLeader) ? fLeader : "";
  const ownerSel = !data || ["", "none", "differs"].includes(fOwner)
    || leaders.some((l) => String(l.id) === fOwner) ? fOwner : "";

  // Per-column sort (desktop table headers) — key:null falls back to verifix.
  const [sort, setSort] = usePersistentState("cells_sort", { key: null, dir: "asc" });
  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  const [modal, setModal] = useState(null);       // {mode:"add"|"edit", item?}
  const [pickFor, setPickFor] = useState(null);   // the cell whose manager a brigadir picks
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(null);

  const done = () => qc.invalidateQueries({ queryKey: ["admin-cells"] });

  const deleteMut = useMutation({
    mutationFn: (cid) => api.delete(`/api/profiles/admin/cells/${cid}`),
    onSuccess: () => { done(); setConfirmDelete(null); },
    // Never window.alert here: Telegram's iOS WebView swallows it, so the one
    // signal that a deletion failed would be invisible on the primary device.
    onError: (e) => { setConfirmDelete(null); toast.error(e?.response?.data?.detail || t("admin.profiles.error")); },
  });

  // Archive / restore. Archiving asks first (it hides the cell from the
  // register); restoring is one tap — nothing to lose either way, nothing is
  // deleted and no figure moves.
  const archiveMut = useMutation({
    mutationFn: ({ id, archived }) =>
      api.post(`/api/profiles/admin/cells/${id}/archive`, { archived }).then((r) => r.data),
    onSuccess: (_d, v) => {
      done();
      setConfirmArchive(null);
      toast.success(t(v.archived ? "admin.profiles.cellArchivedToast" : "admin.profiles.cellRestoredToast"));
    },
  });
  const onArchive = (c) => {
    if (c.archived_at) archiveMut.mutate({ id: c.id, archived: false }, {
      onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
    });
    else { archiveMut.reset(); setConfirmArchive(c); }
  };

  // The row's ⋮ menu: an editor's edit · archive/restore · delete; a brigadir's
  // one door, the «Boshqaruvchi» picker, on their own unit's cells; nothing
  // (no button) for a row the viewer may not act on.
  const rowMenu = (c) => {
    const label = `${t("admin.profiles.colActions")}: ${c.verifix_code || ""}`;
    if (canEdit) {
      return (
        <ActionMenu label={label} items={[
          { key: "edit", label: t("admin.profiles.edit"), icon: Pencil, onSelect: () => openEdit(c) },
          {
            key: "archive", icon: c.archived_at ? ArchiveRestore : Archive,
            label: t(c.archived_at ? "admin.profiles.cellUnarchive" : "admin.profiles.cellArchive"),
            disabled: archiveMut.isPending, onSelect: () => onArchive(c),
          },
          {
            key: "delete", tone: "danger", label: t("admin.profiles.delete"), icon: Trash2,
            disabled: deleteMut.isPending, onSelect: () => setConfirmDelete(c),
          },
        ]} />
      );
    }
    if (canPickRow(c)) {
      return (
        <ActionMenu label={label} items={[
          { key: "pick", label: t("cellMgr.pickTitle"), icon: Flag, onSelect: () => setPickFor(c) },
        ]} />
      );
    }
    return null;
  };

  // The four cards above the table count the register as the server sent it
  // (a supervisor's own unit; everybody else the whole plant), ACTIVE cells
  // only — never the filtered rows, so typing a search does not move them.
  const stats = useMemo(() => {
    const all = data?.cells ?? [];
    const active = all.filter((c) => !c.archived_at);
    return {
      active: active.length,
      archived: all.length - active.length,
      inLoad: active.filter((c) => c.in_load).length,
      noSup: active.filter((c) => c.manager_id == null).length,
      noMgr: active.filter((c) => c.leader_id == null).length,
      differs: active.filter((c) => (c.owner_id ?? null) !== (c.leader_id ?? null)).length,
    };
  }, [data]);
  const ofActive = (n) => fill(t("cells.kpiOfActive"), { p: stats.active ? Math.round((n * 100) / stats.active) : 0 });
  // A card's number opens exactly the cells it counted: every other filter and
  // the search are cleared, the status set to active, then the card's own pick.
  const showOnly = (apply) => {
    setSearch(""); setFBrigadir(""); setFLeader(""); setFOwner("");
    setFZag(""); setFProc(""); setFStatus("active");
    apply();
  };

  // Cell id → what breaks the group rule for it (nothing for a sound register).
  // Keyed on `data`, not `cells`: `cells` is a fresh [] on every render while loading.
  const issues = useMemo(() => groupIssues(data?.cells ?? []), [data]);

  const openAdd = () => setModal({ mode: "add" });
  const openEdit = (item) => setModal({ mode: "edit", item });

  // Global search over every visible field, then the two dropdown filters.
  // Both sides go through `latinFold`: a code typed on the Russian layout
  // («В2942» with a Cyrillic В) is a different string from the register's
  // B2942 and used to find nothing, with nothing on screen saying why.
  const filtered = useMemo(() => {
    const q = latinFold(search.trim());
    return cells.filter((c) => {
      if (q && !latinFold(`${c.verifix_code || ""} ${wcGroupLabel(c.sap_code, c.wc_group)} ${wname(c)} ${shownName(c)} ${tl(c.supervisor) || ""} ${tl(c.leader) || ""} ${tl(c.owner) || ""}`)
            .includes(q)) return false;
      if (brigadirSel === "none" ? c.manager_id : brigadirSel && String(c.manager_id) !== brigadirSel) return false;
      if (leaderSel === "none" ? c.leader_id : leaderSel && String(c.leader_id) !== leaderSel) return false;
      if (ownerSel === "none" ? c.owner_id
          : ownerSel === "differs" ? (c.owner_id ?? null) === (c.leader_id ?? null)
          : ownerSel && String(c.owner_id) !== ownerSel) return false;
      if (statusSel === "active" && c.archived_at) return false;
      if (statusSel === "archived" && !c.archived_at) return false;
      if (zagSel === "on" && !c.in_load) return false;
      if (zagSel === "off" && c.in_load) return false;
      if (procSel === "one" && !c.one_process) return false;
      if (procSel === "many" && c.one_process) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, search, brigadirSel, leaderSel, ownerSel, statusSel, zagSel, procSel, lang, tl, tx]);

  // Sort by the clicked column; the default (no column picked) is a natural sort
  // by verifix code — the register's identity — shared by the table and cards.
  const sorted = useMemo(() => {
    const val = (c) => {
      switch (sort.key) {
        case "name":       return shownName(c);
        case "sap_code":   return c.sap_code || "";
        case "wc_group":   return c.wc_group || "";
        case "supervisor": return tl(c.supervisor) || "";
        case "leader":     return tl(c.leader) || "";
        case "owner":      return tl(c.owner) || "";
        case "in_load":    return c.in_load ? "0" : "1";
        case "one_process": return c.one_process ? "0" : "1";
        default:           return c.verifix_code || "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      String(val(a)).localeCompare(String(val(b)), undefined, { numeric: true }) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, tl, tx, lang]);

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
            workshop: shownName(c),
            sap_code: c.sap_code || "",
            wc_group: c.wc_group || "",
            supervisor: c.supervisor ? tl(c.supervisor) : "",
            leader: c.leader ? tl(c.leader) : "",
            owner: c.owner ? tl(c.owner) : "",
            in_load: !!c.in_load,
            one_process: !!c.one_process,
          })),
        },
        fallbackName: "cells_register.xlsx",
      }),
    onSuccess: (via) => toast.success(t(via === "download" ? "staff.exportDownloaded" : "staff.exportToast")),
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const colSpan = showActions ? 10 : 9;

  const brigadirOpts = [
    { value: "", label: t("admin.profiles.cellFilterAllBrigadirs") },
    { value: "none", label: t("admin.profiles.cellNoSupervisor") },
    ...units.map((u) => ({ value: String(u.id), label: tl(u.name) })),
  ];
  const statusOpts = [
    { value: "active", label: t("admin.profiles.cellStatusActive") },
    { value: "archived", label: t("admin.profiles.cellStatusArchived") },
    { value: "all", label: t("admin.profiles.cellStatusAll") },
  ];
  const zagOpts = [
    { value: "", label: t("admin.profiles.cellStatusAll") },
    { value: "on", label: t("admin.profiles.cellZagOn") },
    { value: "off", label: t("admin.profiles.cellZagOff") },
  ];
  const procOpts = [
    { value: "", label: t("admin.profiles.cellStatusAll") },
    { value: "one", label: t("cellPage.oneProcessOn") },
    { value: "many", label: t("cellPage.oneProcessOff") },
  ];
  const leaderFilterOpts = [
    { value: "", label: t("admin.profiles.cellFilterAllLeaders") },
    { value: "none", label: t("admin.profiles.cellUnassigned") },
    ...leaders.map((l) => ({ value: String(l.id), label: tl(l.name), title: tl(l.name) })),
  ];
  const ownerFilterOpts = [
    { value: "", label: t("admin.profiles.cellFilterAllOwners") },
    { value: "none", label: t("admin.profiles.cellUnassigned") },
    { value: "differs", label: t("admin.profiles.cellOwnerDiffers") },
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
          name={shownName(c)}
          tl={tl}
          t={t}
          menu={rowMenu(c)}
          onOpen={() => navigate(`/cells/${c.id}`)}
          issue={issues.get(c.id)}
        />
      ))}
    </div>
  );

  return (
    <Layout title={t("nav.cells")}>
      {/* Four headline cards. Values load as skeletons of their final size and
          every sub-line is always printed, so nothing below them moves. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {(() => {
          const loadingVal = <SkeletonBlock className="h-8 max-sm:h-7 w-14" />;
          const gap = (n) => (n > 0 ? "#eab308" : "#22c55e");
          const gapText = (n) => (n > 0 ? "var(--status-warn)" : "var(--text-1)");
          const cards = [
            {
              key: "active", label: t("cells.kpiActive"), icon: LayoutGrid, color: "#C8973F",
              value: stats.active, valueColor: "var(--text-1)",
              sub: fill(t("cells.kpiArchivedSub"), { n: stats.archived }),
              tooltip: t("cells.kpiActiveTip"),
            },
            {
              key: "load", label: t("cells.kpiLoad"), icon: Gauge, color: "#3b82f6",
              value: stats.inLoad, valueColor: "var(--text-1)", sub: ofActive(stats.inLoad),
              open: () => setFZag("on"),
            },
            // A supervisor's register is their own unit: every cell has its
            // brigadir, so that card would always read 0 — theirs is the
            // cells whose «Egasi» is not the one running them.
            scope ? {
              key: "differs", label: t("cells.kpiDiffers"), icon: UserCheck, color: "#94a3b8",
              value: stats.differs, valueColor: "var(--text-1)", sub: ofActive(stats.differs),
              open: () => setFOwner("differs"),
            } : {
              key: "nosup", label: t("cells.kpiNoSup"), icon: Users, color: gap(stats.noSup),
              value: stats.noSup, valueColor: gapText(stats.noSup),
              sub: stats.noSup ? ofActive(stats.noSup) : t("cells.kpiAllSet"),
              open: stats.noSup ? () => setFBrigadir("none") : null,
            },
            {
              key: "nomgr", label: t("cells.kpiNoMgr"), icon: Flag, color: gap(stats.noMgr),
              value: stats.noMgr, valueColor: gapText(stats.noMgr),
              sub: stats.noMgr ? ofActive(stats.noMgr) : t("cells.kpiAllSet"),
              open: stats.noMgr ? () => setFLeader("none") : null,
            },
          ];
          return cards.map((k) => {
            const clickable = !isLoading && !!k.open && k.value > 0;
            return (
            <KPICard
              key={k.key}
              label={k.label}
              icon={k.icon}
              color={isLoading ? "#94a3b8" : k.color}
              valueColor={isLoading ? undefined : k.valueColor}
              value={isLoading ? loadingVal : k.value}
              sub={isLoading ? " " : k.sub}
              // On a phone the whole card is the button, so the click hint
              // would only crowd a half-width label.
              tooltip={k.tooltip || (clickable && !phone ? t("cells.kpiClickTip") : undefined)}
              onValueClick={clickable ? () => showOnly(k.open) : undefined}
            />
            );
          });
        })()}
      </div>

      <TableCard
        icon={LayoutGrid}
        title={t("admin.profiles.cellsTab")}
        wrap
        fixed
        // Ten columns since the name joined them (2026-10-19): below this the
        // table scrolls sideways instead of cutting every header short.
        minWidth={1060}
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
                // A narrowed register names its one unit as an inert chip —
                // the locked-viewer shape useFactorySection uses — never as a
                // one-option picker.
                scope ? {
                  key: "brigadir", icon: ShieldCheck, label: t("admin.profiles.colSupervisor"), static: true,
                  display: scope.unit ? tl(scope.unit) : "—",
                } : {
                  key: "brigadir", icon: ShieldCheck, label: t("admin.profiles.cellFilterAllBrigadirs"),
                  active: brigadirSel !== "",
                  display: brigadirSel !== "" ? (brigadirOpts.find((o) => o.value === brigadirSel)?.label || "") : "",
                  onClear: () => setFBrigadir(""),
                  render: ({ close } = {}) => (
                    <PickFilter searchable close={close} opts={brigadirOpts} value={brigadirSel} onChange={setFBrigadir} />
                  ),
                },
                {
                  key: "leader", icon: UserRound, label: t("admin.profiles.cellFilterAllLeaders"),
                  active: leaderSel !== "",
                  display: leaderSel !== "" ? (leaderFilterOpts.find((o) => o.value === leaderSel)?.label || "") : "",
                  onClear: () => setFLeader(""),
                  render: ({ close } = {}) => (
                    <PickFilter searchable close={close} opts={leaderFilterOpts} value={leaderSel} onChange={setFLeader} />
                  ),
                },
                {
                  key: "owner", icon: UserCheck, label: t("admin.profiles.cellFilterAllOwners"),
                  active: ownerSel !== "",
                  display: ownerSel !== "" ? (ownerFilterOpts.find((o) => o.value === ownerSel)?.label || "") : "",
                  onClear: () => setFOwner(""),
                  render: ({ close } = {}) => (
                    <PickFilter searchable close={close} opts={ownerFilterOpts} value={ownerSel} onChange={setFOwner} />
                  ),
                },
                {
                  key: "zag", icon: Gauge, label: t("admin.profiles.colZagruzka"),
                  active: zagSel !== "",
                  display: zagSel !== "" ? (zagOpts.find((o) => o.value === zagSel)?.label || "") : "",
                  onClear: () => setFZag(""),
                  render: ({ close } = {}) => (
                    <PickFilter close={close} opts={zagOpts} value={zagSel} onChange={setFZag} />
                  ),
                },
                {
                  key: "proc", icon: Workflow, label: t("cellPage.oneProcess"),
                  active: procSel !== "",
                  display: procSel !== "" ? (procOpts.find((o) => o.value === procSel)?.label || "") : "",
                  onClear: () => setFProc(""),
                  render: ({ close } = {}) => (
                    <PickFilter close={close} opts={procOpts} value={procSel} onChange={setFProc} />
                  ),
                },
                {
                  key: "status", icon: Archive, label: t("admin.profiles.cellFilterStatus"),
                  active: statusSel !== "active",
                  display: statusSel !== "active" ? (statusOpts.find((o) => o.value === statusSel)?.label || "") : "",
                  onClear: () => setFStatus("active"),
                  render: ({ close } = {}) => (
                    <PickFilter close={close} opts={statusOpts} value={statusSel} onChange={setFStatus} />
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
            <Th icon={LayoutGrid} label={t("admin.profiles.colVerifixCode")} k="verifix_code" sort={sort} onSort={onSort} cls="w-[10%]" />
            <Th icon={Tag} label={t("admin.profiles.colWorkshop")} k="name" sort={sort} onSort={onSort} cls="w-[16%]" />
            <Th icon={Hash} label={t("admin.profiles.colSapCode")} k="sap_code" sort={sort} onSort={onSort} cls="w-[8%]" />
            <Th icon={Layers} label={t("admin.profiles.colGroup")} k="wc_group" sort={sort} onSort={onSort} cls="w-[6%]" />
            <Th icon={Users} label={t("admin.profiles.colSupervisor")} k="supervisor" sort={sort} onSort={onSort} cls="w-[11%]" />
            <Th icon={Flag} label={t("admin.profiles.colCellManager")} k="leader" sort={sort} onSort={onSort} cls="w-[14%]" />
            <Th icon={UserCheck} label={t("admin.profiles.colCellOwner")} k="owner" sort={sort} onSort={onSort} cls="w-[12%]" />
            <Th icon={Gauge} label={t("admin.profiles.colZagruzka")} k="in_load" sort={sort} onSort={onSort} cls="w-[9%]" />
            <Th icon={Workflow} label={t("cellPage.oneProcess")} k="one_process" sort={sort} onSort={onSort} cls="w-[9%]" />
            {/* The ⋮ column: a 56px slot, its name for screen readers only. */}
            {showActions && <Th label={<span className="sr-only">{t("admin.profiles.colActions")}</span>} align="center" cls="w-[56px]" />}
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
            <tr key={c.id} className="cursor-pointer" style={c.archived_at ? { opacity: 0.7 } : undefined}
                onClick={() => navigate(`/cells/${c.id}`)}>
              <td className="px-3 py-2 font-mono font-semibold text-[var(--text-1)] whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <CellLink id={c.id}>{c.verifix_code}</CellLink>
                  <ArchivedChip c={c} t={t} />
                </span>
              </td>
              <td className="px-3 py-2">
                <NameCell name={shownName(c)} />
              </td>
              <td className="px-3 py-2 font-mono text-[var(--text-3)] whitespace-nowrap">{c.sap_code || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <GroupMark c={c} issue={issues.get(c.id)} t={t} />
              </td>
              {/* People are cut with «…» and whole on hover — one line per row. */}
              <td className="px-3 py-2">
                <LinkName name={c.supervisor} empty="admin.profiles.cellNoSupervisor"
                          pend={c.pending?.manager_id} t={t} tl={tl} />
              </td>
              <td className="px-3 py-2">
                <LinkName name={c.leader} empty="admin.profiles.cellUnassigned"
                          manual={c.manager_mode === "manual"} pend={c.pending?.leader_id} t={t} tl={tl} />
              </td>
              <td className="px-3 py-2">
                <OwnerMark c={c} tl={tl} t={t} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <LoadMark on={c.in_load} t={t} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <ProcessMark one={c.one_process} t={t} />
              </td>
              {showActions && (
                <td className="px-2 py-1.5 text-center">
                  {/* A row with nothing to offer keeps the ⋮'s height: rows stay equal. */}
                  {rowMenu(c) || <span className="inline-block w-8 h-8 align-middle" aria-hidden="true" />}
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
          onSaved={(msg) => { done(); if (msg) toast.success(msg); }}
        />
      )}

      {/* A brigadir's pick of a cell's «Boshqaruvchi» — the picker alone */}
      {pickFor && (
        <CellManagerDialog
          cell={pickFor}
          subtitle={pickFor.supervisor ? tl(pickFor.supervisor) : undefined}
          onClose={() => setPickFor(null)}
          onSaved={(msg) => { if (msg) toast.success(msg); }}
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

      {/* Archive confirmation — the failure stays inside the dialog */}
      <ConfirmDialog
        open={!!confirmArchive}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => archiveMut.mutate({ id: confirmArchive.id, archived: true })}
        title={t("admin.profiles.cellArchiveTitle")}
        message={confirmArchive && fill(t("admin.profiles.cellArchiveMsg"), { name: confirmArchive.verifix_code || "" })}
        confirmLabel={t("admin.profiles.cellArchive")}
        cancelLabel={t("admin.users.cancel")}
        loading={archiveMut.isPending}
        error={confirmArchive && archiveMut.isError ? (archiveMut.error?.response?.data?.detail || t("admin.profiles.error")) : null}
      />

      {toast.node}
    </Layout>
  );
}
