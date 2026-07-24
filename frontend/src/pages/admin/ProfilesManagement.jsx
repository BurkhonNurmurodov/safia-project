import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IdCard, Plus, RefreshCw, Trash2, Pencil, X,
  Star, UserCog, Users, Flag, Shield, Archive, ArchiveRestore, Languages,
  UserRound, Clock, LayoutGrid, Hash, Link2, Settings2,
} from "lucide-react";
import api from "../../utils/api";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import StyledSelect from "../../components/ui/StyledSelect";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import SearchInput from "../../components/ui/SearchInput";
import { ColFilter, TxtFilter, OptsFilter } from "../../components/ui/ColumnFilter";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit, transliterate, convertFromUz } from "../../utils/transliterate";

// The profile sections. `listKey` = field in GET /api/profiles/admin/list.
// Guests are self-created at registration — the section manages (rename /
// delete / unassign) but never creates them. "cells" is not a profile type —
// it's the first-class cell registry (verifix/sap codes + workshop names),
// rendered with its own columns and modal.
const TYPES = [
  { key: "top-manager",   listKey: "top_managers",   tKey: "admin.profiles.topManagers",   icon: Star },
  { key: "shift-manager", listKey: "shift_managers", tKey: "admin.profiles.shiftManagers", icon: UserCog },
  { key: "supervisor",    listKey: "supervisors",    tKey: "admin.profiles.supervisors",   icon: Users },
  { key: "leader",        listKey: "leaders",        tKey: "admin.profiles.leaders",       icon: Flag },
  { key: "admin",         listKey: "admins",         tKey: "admin.profiles.admins",        icon: Shield },
  { key: "guest",         listKey: "guests",         tKey: "admin.profiles.guests",        icon: UserRound },
  { key: "cells",         listKey: "cells",          tKey: "admin.profiles.cellsTab",      icon: LayoutGrid },
];

// name_* / name_workshop_* column suffixes beyond canonical uz Latin.
const NAME_LANGS = ["uz_cyrl", "ru", "en"];

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

export default function ProfilesManagement({ cellsOnly = false }) {
  const { t, lang, languages, nameOverrides, reloadTranslations } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [type, setType] = useState(cellsOnly ? "cells" : "top-manager");
  const [cellSearch, setCellSearch] = useState("");   // cells view free-text filter
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
    // "cells" rides the same admin prefix but its own registry endpoints.
    mutationFn: ({ ptype, pid }) => api.delete(`/api/profiles/admin/${ptype}/${pid}`),
    onSuccess: () => { done(); setConfirmDelete(null); },
    onError: (e) => { setConfirmDelete(null); alert(e?.response?.data?.detail || t("admin.profiles.error")); },
  });
  const cellCreateMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/cells", body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
  });
  const cellUpdateMut = useMutation({
    mutationFn: ({ cid, body }) => api.put(`/api/profiles/admin/cells/${cid}`, body),
    onSuccess: () => { done(); setModal(null); },
    onError: fail,
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

  const busy = createMut.isPending || updateMut.isPending || switchMut.isPending ||
    cellCreateMut.isPending || cellUpdateMut.isPending;
  const activeType = TYPES.find((x) => x.key === type);
  const isCells = type === "cells";
  const items = data?.[activeType.listKey] ?? [];
  const units = (data?.supervisors ?? []).filter((s) => !s.archived);
  // Workshop name in the viewer's language, first known language as fallback.
  const wname = (c) =>
    c[`name_workshop_${lang}`] || c.name_workshop_uz || c.name_workshop_uz_cyrl ||
    c.name_workshop_ru || c.name_workshop_en || "";

  // Per-column sort — key:null keeps the server order until a header is clicked.
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  // ── Google-Sheets-style per-column filters (cells registry) ─────────────────
  // A funnel on each column opens a searchable checkbox list of that column's
  // distinct values; empty selection = column unfiltered, several columns AND.
  const FILT_COLS = ["verifix_code", "sap_code", "workshop", "owner"];
  const colVal = {
    verifix_code: (c) => c.verifix_code || "",
    sap_code:     (c) => c.sap_code || "",
    workshop:     (c) => wname(c) || "",
    owner:        (c) => c.leader || "",
  };
  const colRender = { owner: (o) => (o ? tl(o) : t("admin.profiles.cellUnassigned")) };
  const colOpts = useMemo(() => {
    const m = {};
    for (const k of FILT_COLS)
      m[k] = [...new Set(items.map(colVal[k]))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, lang]);

  const [colSel, setColSel] = useState({ verifix_code: [], sap_code: [], workshop: [], owner: [] });
  const [colQ, setColQ] = useState({ verifix_code: "", sap_code: "", workshop: "", owner: "" });

  // The funnel node handed to each cells <Th> — search box (for long lists) over
  // a checkbox list of distinct values, both from the shared filter templates.
  const colFilter = (k) => {
    const opts = colOpts[k] || [];
    const q = (colQ[k] || "").trim().toLowerCase();
    const shown = q
      ? opts.filter((o) => String(colRender[k] ? colRender[k](o) : (o || "—")).toLowerCase().includes(q))
      : opts;
    return (
      <ColFilter active={colSel[k].length > 0}>
        {opts.length > 8 && (
          <div className="mb-1.5">
            <TxtFilter value={colQ[k]} onChange={(v) => setColQ((s) => ({ ...s, [k]: v }))} />
          </div>
        )}
        <OptsFilter opts={shown} sel={colSel[k]} render={colRender[k]}
          onChange={(v) => setColSel((s) => ({ ...s, [k]: v }))} />
      </ColFilter>
    );
  };

  // Cells view: the global search box (all columns) AND the per-column funnels.
  // Profiles views stay untouched (short lists, server-ordered).
  const filtered = useMemo(() => {
    if (!isCells) return items;
    const q = cellSearch.trim().toLowerCase();
    return items.filter((c) => {
      if (q && !`${c.verifix_code || ""} ${c.sap_code || ""} ${wname(c)} ${tl(c.leader) || ""}`
            .toLowerCase().includes(q)) return false;
      for (const k of FILT_COLS)
        if (colSel[k].length && !colSel[k].includes(colVal[k](c))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isCells, cellSearch, colSel, tl, lang]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (it) => {
      switch (sort.key) {
        case "shift":      return it.shift ?? 0;
        case "supervisor": return tl(it.supervisor) || "";
        case "cell":       return (it.cells || []).join(", ");
        case "verifix":    return it.id;
        case "verifix_code": return it.verifix_code || "";
        case "sap_code":     return it.sap_code || "";
        case "workshop":     return wname(it);
        case "owner":        return tl(it.leader) || "";
        default:           return tl(it.name) || "";
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, tl]);

  // name + holders + actions, plus the per-type extras.
  const colSpan = isCells
    ? 5
    : 3 + (type === "supervisor" || type === "leader" ? 2 : type === "shift-manager" ? 1 : 0);

  function openAdd() {
    if (isCells) {
      setForm({ verifix_code: "", sap_code: "", leader_id: "",
                name_workshop_uz: "", name_workshop_uz_cyrl: "",
                name_workshop_ru: "", name_workshop_en: "" });
    } else {
      setForm({ name: "", shift: 1, manager_id: "", cells: [], cellInput: "", verifix_id: "" });
    }
    setFormError("");
    setModal({ mode: "add" });
  }

  function openEdit(item) {
    if (isCells) {
      setForm({
        verifix_code: item.verifix_code || "",
        sap_code: item.sap_code || "",
        leader_id: item.leader_id ? String(item.leader_id) : "",
        name_workshop_uz: item.name_workshop_uz || "",
        name_workshop_uz_cyrl: item.name_workshop_uz_cyrl || "",
        name_workshop_ru: item.name_workshop_ru || "",
        name_workshop_en: item.name_workshop_en || "",
      });
      setFormError("");
      setModal({ mode: "edit", item });
      return;
    }
    const ov = {};
    for (const l of languages) {
      if (l.code === "uz") continue; // canonical IS the Uzbek name — no override input
      // Prefer the profile's name_* column; translation override is the legacy fallback.
      ov[l.code] = item[`name_${l.code}`] || nameOverrides?.[l.code]?.[`name.${item.name}`] || "";
    }
    setForm({
      role: type,
      name: item.name,
      shift: item.shift ?? 1,
      manager_id: item.manager_id ?? "",
      cells: item.cells ?? [],
      cellInput: "",
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

  // Owned cell codes to submit — the badge chips plus any code still sitting
  // in the input (so a typed-but-not-added code isn't silently dropped).
  const pendingCell = (form.cellInput || "").trim();
  const cellList = pendingCell && !(form.cells || []).includes(pendingCell)
    ? [...(form.cells || []), pendingCell]
    : (form.cells || []);

  function addCell() {
    const code = (form.cellInput || "").trim();
    if (!code) return;
    setForm((f) => (f.cells || []).includes(code)
      ? { ...f, cellInput: "" }
      : { ...f, cells: [...(f.cells || []), code], cellInput: "" });
  }

  function submit() {
    setFormError("");

    if (isCells) {
      const code = (form.verifix_code || "").trim();
      if (!code) { setFormError(t("admin.profiles.verifixCodeRequired")); return; }
      const body = {
        verifix_code: code,
        sap_code: form.sap_code || "",
        name_workshop_uz: form.name_workshop_uz || "",
        name_workshop_uz_cyrl: form.name_workshop_uz_cyrl || "",
        name_workshop_ru: form.name_workshop_ru || "",
        name_workshop_en: form.name_workshop_en || "",
        leader_id: form.leader_id ? Number(form.leader_id) : 0,
      };
      if (modal.mode === "add") cellCreateMut.mutate(body);
      else cellUpdateMut.mutate({ cid: modal.item.id, body });
      return;
    }

    if (roleChanged) {
      const body = { ptype: type, pid: modal.item.id, new_role: form.role };
      if (form.role === "shift-manager" || form.role === "supervisor") {
        if (!form.shift) { setFormError(t("admin.profiles.shiftRequired")); return; }
        body.shift = Number(form.shift);
      }
      if (form.role === "leader") {
        if (!form.manager_id) { setFormError(t("admin.profiles.supervisorRequired")); return; }
        body.manager_id = Number(form.manager_id);
        if (cellList.length) body.cells = cellList;
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
        body.manager_id = Number(form.manager_id);
        if (cellList.length) body.cells = cellList;
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
    // The same inputs persist as name_* columns on role_profiles too ("" clears);
    // supervisors are managers rows — no columns there, overrides only.
    if (type !== "supervisor") {
      for (const l of NAME_LANGS) body[`name_${l}`] = (form.overrides?.[l] || "").trim();
    }
    if (type === "shift-manager" || type === "supervisor") body.shift = Number(form.shift);
    if (type === "leader" && form.manager_id) body.manager_id = Number(form.manager_id);
    // Always send the full list on edit — removals must reach the server too.
    if (type === "leader") body.cells = cellList;
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
      {/* Canonical POSITIONS-style TableCard: count in the head, type pills +
          actions in the toolbar, per-column sort. */}
      <TableCard
        icon={cellsOnly ? LayoutGrid : IdCard}
        title={cellsOnly ? t("admin.profiles.cellsTab") : t("admin.profiles.title")}
        wrap
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {sorted.length}
          </span>
        }
        toolbar={
          <>
            {/* Type pills — the shared segmented-toggle template (scroll for phones).
                Hidden on the dedicated Cells tab, where cells is the only view. */}
            {!cellsOnly && (
            <div className="no-scrollbar max-w-full overflow-x-auto">
              <SegmentedToggle
                value={type}
                onChange={(v) => { setType(v); setSort({ key: null, dir: "asc" }); }}
                options={TYPES.filter((x) => x.key !== "cells").map(({ key, tKey, icon: Icon, listKey }) => ({
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
            )}
            {isCells && (
              <SearchInput
                value={cellSearch}
                onChange={setCellSearch}
                placeholder={t("admin.profiles.cellSearchPh")}
                className="w-full sm:w-72"
              />
            )}
            {type !== "guest" && (
              <Button size="lg" icon={<Plus size={14} />} onClick={openAdd} className="whitespace-nowrap">
                {t("admin.profiles.add")}
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
          </>
        }
      >
        <thead>
          {isCells ? (
            <tr>
              <Th icon={LayoutGrid} label={t("admin.profiles.colVerifixCode")} k="verifix_code" sort={sort} onSort={onSort} filter={colFilter("verifix_code")} />
              <Th icon={Hash} label={t("admin.profiles.colSapCode")} k="sap_code" sort={sort} onSort={onSort} filter={colFilter("sap_code")} />
              <Th icon={Users} label={t("admin.profiles.colWorkshop")} k="workshop" sort={sort} onSort={onSort} filter={colFilter("workshop")} />
              <Th icon={Flag} label={t("admin.profiles.colOwner")} k="owner" sort={sort} onSort={onSort} filter={colFilter("owner")} />
              <Th icon={Settings2} label={t("admin.profiles.colActions")} />
            </tr>
          ) : (
          <tr>
            <Th icon={UserRound} label={t("admin.profiles.colName")} k="name" sort={sort} onSort={onSort} />
            {(type === "shift-manager" || type === "supervisor") && (
              <Th icon={Clock} label={t("admin.profiles.colShift")} k="shift" sort={sort} onSort={onSort} />
            )}
            {type === "leader" && (
              <Th icon={Users} label={t("admin.profiles.colSupervisor")} k="supervisor" sort={sort} onSort={onSort} />
            )}
            {type === "leader" && (
              <Th icon={LayoutGrid} label={t("admin.profiles.colCell")} k="cell" sort={sort} onSort={onSort} />
            )}
            {type === "supervisor" && (
              <Th icon={Hash} label={t("admin.profiles.colVerifix")} k="verifix" sort={sort} onSort={onSort} />
            )}
            <Th icon={Link2} label={t("admin.profiles.colHolders")} />
            <Th icon={Settings2} label={t("admin.profiles.colActions")} />
          </tr>
          )}
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              {Array.from({ length: colSpan }).map((_, j) => (
                <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
              ))}
            </tr>
          ))}
          {!isLoading && sorted.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {t("admin.profiles.empty")}
              </td>
            </tr>
          )}
          {!isLoading && isCells && sorted.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 font-mono text-[var(--text-1)] whitespace-nowrap">{item.verifix_code}</td>
              <td className="px-3 py-2 font-mono text-[var(--text-2)] whitespace-nowrap">{item.sap_code || "—"}</td>
              <td className="px-3 py-2 text-[var(--text-2)]">{wname(item) || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {item.leader
                  ? <span className="text-[var(--text-2)]">{tl(item.leader)}</span>
                  : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
                    style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand-text)", border: "1px solid rgba(200,151,63,0.25)" }}
                  >
                    <Pencil size={10} /> {t("admin.profiles.edit")}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item)}
                    disabled={deleteMut.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
                    style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#ef4444"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(148,163,184,0.12)"; e.currentTarget.style.color = "#94a3b8"; }}
                  >
                    <Trash2 size={10} /> {t("admin.profiles.delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!isLoading && !isCells && sorted.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 font-medium text-[var(--text-1)] whitespace-nowrap">
                {tl(item.name)}
                {type === "supervisor" && item.archived && (
                  <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                    style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}>
                    {t("admin.profiles.archived")}
                  </span>
                )}
              </td>

              {(type === "shift-manager" || type === "supervisor") && (
                <td className="px-3 py-2 text-[var(--text-2)] whitespace-nowrap">
                  {item.shift ?? "—"}
                </td>
              )}
              {type === "leader" && (
                <td className="px-3 py-2 text-[var(--text-2)] whitespace-nowrap">
                  {tl(item.supervisor) || "—"}
                </td>
              )}
              {type === "leader" && (
                <td className="px-3 py-2 text-[var(--text-2)]">
                  {item.cells?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {item.cells.map((c) => (
                        <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : "—"}
                </td>
              )}
              {type === "supervisor" && (
                <td className="px-3 py-2 text-[var(--text-2)] font-mono whitespace-nowrap">{item.id}</td>
              )}

              <td className="px-3 py-2">
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

              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
                    style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand-text)", border: "1px solid rgba(200,151,63,0.25)" }}
                  >
                    <Pencil size={10} /> {t("admin.profiles.edit")}
                  </button>
                  {type === "supervisor" && item.archived ? (
                    <button
                      onClick={() => toggleArchive(item)}
                      disabled={updateMut.isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
                      style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.22)" }}
                    >
                      <ArchiveRestore size={10} /> {t("admin.profiles.unarchive")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(item)}
                      disabled={deleteMut.isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
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
      </TableCard>

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
              {/* Cell registry form — verifix/sap codes, workshop names, owner */}
              {isCells && (
                <>
                  <FormField label={t("admin.profiles.colVerifixCode")} required>
                    <input
                      type="text"
                      value={form.verifix_code || ""}
                      onChange={(e) => setForm((f) => ({ ...f, verifix_code: e.target.value }))}
                      className={inputCls}
                      style={inputStyle}
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
                          <span className="w-14 flex-shrink-0 text-[10px] font-mono uppercase"
                                style={{ color: "var(--text-4)" }}>{l}</span>
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
                  <FormField label={t("admin.profiles.colOwner")}>
                    <StyledSelect
                      value={form.leader_id || ""}
                      onChange={(v) => setForm((f) => ({ ...f, leader_id: v }))}
                      options={[
                        { value: "", label: t("admin.profiles.cellUnassigned") },
                        ...(data?.leaders ?? []).map((l) => ({ value: String(l.id), label: tl(l.name) })),
                      ]}
                    />
                  </FormField>
                </>
              )}

              {/* Role — switching moves only the name; other values are asked fresh */}
              {!isCells && modal.mode === "edit" && (
                <FormField label={t("admin.profiles.roleLabel")}>
                  <StyledSelect
                    value={form.role}
                    onChange={(v) => {
                      setForm((f) => v === type
                        ? { ...f, role: v, name: modal.item.name,
                            shift: modal.item.shift ?? 1,
                            manager_id: modal.item.manager_id ?? "",
                            cells: modal.item.cells ?? [], cellInput: "",
                            verifix_id: type === "supervisor" ? modal.item.id : "" }
                        : { ...f, role: v, name: modal.item.name,
                            shift: "", manager_id: "", cells: [], cellInput: "", verifix_id: "" });
                    }}
                    options={TYPES.filter((x) => x.key !== "cells")
                      .map(({ key, tKey }) => ({ value: key, label: t(tKey) }))}
                  />
                  {roleChanged && (
                    <p className="mt-1 text-[10px] leading-snug text-yellow-500">
                      {t("admin.profiles.switchRoleHint")}
                    </p>
                  )}
                </FormField>
              )}

              {/* Canonical name — entered in Uzbek; other languages render automatically */}
              {!isCells && (
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
              )}

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

              {effType === "leader" && (
                <FormField label={t("admin.profiles.cellLabel")}>
                  {/* Owned cells as removable badges; the input below adds codes. */}
                  {(form.cells || []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {form.cells.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-full"
                          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                          {c}
                          <button
                            type="button"
                            className="opacity-60 hover:opacity-100"
                            onClick={() => setForm((f) => ({ ...f, cells: (f.cells || []).filter((x) => x !== c) }))}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 flex items-stretch gap-1.5">
                    <input
                      type="text"
                      value={form.cellInput || ""}
                      onChange={(e) => setForm((f) => ({ ...f, cellInput: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCell(); } }}
                      placeholder={t("admin.profiles.cellNewPlaceholder")}
                      className={inputCls + " mt-0 flex-1"}
                      style={inputStyle}
                    />
                    <Button variant="secondary" size="md" onClick={addCell}
                            disabled={!(form.cellInput || "").trim()}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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

              {/* Per-language display names — edit only; creation is Uzbek-only.
                  These inputs persist both as role_profiles name_* columns and
                  as translation overrides for tl(). */}
              {!isCells && modal.mode === "edit" && !roleChanged && (
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
        ).replace("{name}", confirmDelete.name || confirmDelete.verifix_code || "")}
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
