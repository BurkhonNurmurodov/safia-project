import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import FormField from "./ui/FormField";
import StyledSelect from "./ui/StyledSelect";
import SegmentedToggle from "./ui/SegmentedToggle";
import LangTextInput from "./ui/LangTextInput";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";
import { GROUP_LETTERS } from "../utils/wcGroup";
import GroupBadge from "./ui/GroupBadge";

/**
 * THE add/edit form for one production cell — extracted from the /cells
 * register so the register and the cell details page (/cells/:id) share ONE
 * form instead of drifting copies. Endpoints are the register's:
 * POST/PUT /api/profiles/admin/cells[/id], both CAP_CELLS_MANAGE-guarded.
 *
 * `units` / `leaders` are the option lists GET /api/profiles/admin/cells
 * returns beside the register. `onSaved` fires after a successful write —
 * the caller invalidates its own queries there; the modal closes itself.
 *
 * «Zagruzkada hisoblanadi» (`in_load`) follows the brigadir until somebody
 * sets it here: a new cell, or one moved to another brigadir in this form,
 * takes the unit's own «Zagruzka hisoblanadi» (`units[].zagruzka_on`) — what
 * the server applies to a create that names no value — and an edit that keeps
 * the brigadir keeps the cell's own value.
 *
 * A cell names TWO leaders (2026-10-08, the operator's rulings): the
 * «Boshqaruvchi» (`leader_id`) RUNS it — the checklist, the automatic checks,
 * ojidaniya — and picking one carries the cell to their unit; the «Egasi»
 * (`owner_id`) is the leader Verifix seats in it, and picking one moves
 * nothing. Any leader may own a cell, one in another unit or in none, so the
 * owner list names each leader's unit.
 */

const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

export default function CellFormModal({ mode, item, units, leaders, onClose, onSaved }) {
  const { t } = useLang();
  const { tl } = useTranslit();

  const [form, setForm] = useState(() =>
    mode === "edit" && item
      ? {
          verifix_code: item.verifix_code || "",
          sap_code: item.sap_code || "",
          wc_group: item.wc_group || "",
          manager_id: item.manager_id ? String(item.manager_id) : "",
          leader_id: item.leader_id ? String(item.leader_id) : "",
          owner_id: item.owner_id ? String(item.owner_id) : "",
          name_workshop_uz: item.name_workshop_uz || "",
          name_workshop_uz_cyrl: item.name_workshop_uz_cyrl || "",
          name_workshop_ru: item.name_workshop_ru || "",
          name_workshop_en: item.name_workshop_en || "",
          in_load: !!item.in_load,
        }
      : {
          verifix_code: "", sap_code: "", wc_group: "", manager_id: "", leader_id: "", owner_id: "",
          name_workshop_uz: "", name_workshop_uz_cyrl: "",
          name_workshop_ru: "", name_workshop_en: "", in_load: false,
        });
  const [formError, setFormError] = useState("");
  // Has the «Zagruzkada hisoblanadi» switch been set by hand in this form?
  const [loadTouched, setLoadTouched] = useState(false);
  const initialUnit = mode === "edit" && item?.manager_id ? String(item.manager_id) : "";
  const unitCounts = (mid) => !!units.find((u) => String(u.id) === String(mid))?.zagruzka_on;
  const followsUnit = !loadTouched && (mode === "add" || String(form.manager_id || "") !== initialUnit);
  const inLoad = followsUnit ? unitCounts(form.manager_id) : !!form.in_load;

  const fail = (e) => setFormError(cellWriteError(e, t));
  const done = () => { onSaved?.(); onClose(); };

  const createMut = useMutation({
    mutationFn: (body) => api.post("/api/profiles/admin/cells", body),
    onSuccess: done,
    onError: fail,
  });
  const updateMut = useMutation({
    mutationFn: (body) => api.put(`/api/profiles/admin/cells/${item.id}`, body),
    onSuccess: done,
    onError: fail,
  });
  const busy = createMut.isPending || updateMut.isPending;
  // The unit each leader's PROFILE stands in, for the owner list: an owner is
  // often somebody else's leader, or nobody's yet.
  const unitName = (mid) => units.find((u) => String(u.id) === String(mid))?.name;
  const ownerOpts = [
    { value: "", label: t("admin.profiles.cellUnassigned") },
    ...leaders.map((l) => {
      const unit = l.manager_id ? unitName(l.manager_id) : null;
      const where = l.manager_id ? (unit ? tl(unit) : "") : t("admin.profiles.cellOwnerNoUnit");
      const name = tl(l.name);
      return {
        value: String(l.id),
        title: where ? `${name} · ${where}` : name,
        label: (
          <span className="truncate">
            {name}
            {where && <span style={{ color: "var(--text-3)" }}> · {where}</span>}
          </span>
        ),
      };
    }),
  ];
  // A group letter qualifies a SAP code INSIDE one unit (services/wc_group.py),
  // so it needs both — and the server refuses one beside either missing. The
  // form neither offers nor sends it then, so clearing the brigadir clears the
  // letter instead of drawing a refusal. `form.manager_id` already holds a
  // picked leader's unit.
  const canGroup = !!(form.sap_code || "").trim() && !!form.manager_id;

  function submit() {
    setFormError("");
    const code = (form.verifix_code || "").trim();
    if (!code) { setFormError(t("admin.profiles.verifixCodeRequired")); return; }
    const body = {
      verifix_code: code,
      sap_code: form.sap_code || "",
      // Always sent: "" clears — and a blank code or unit clears it too.
      wc_group: canGroup ? (form.wc_group || "") : "",
      name_workshop_uz: form.name_workshop_uz || "",
      name_workshop_uz_cyrl: form.name_workshop_uz_cyrl || "",
      name_workshop_ru: form.name_workshop_ru || "",
      name_workshop_en: form.name_workshop_en || "",
      manager_id: form.manager_id ? Number(form.manager_id) : 0,
      leader_id: form.leader_id ? Number(form.leader_id) : 0,
      owner_id: form.owner_id ? Number(form.owner_id) : 0,
      in_load: inLoad,
    };
    if (mode === "add") createMut.mutate(body);
    else updateMut.mutate(body);
  }

  return (
    <Modal
      onClose={onClose}
      dismissable={!busy}
      title={`${t(mode === "add" ? "admin.profiles.addTitle" : "admin.profiles.editTitle")} · ${t("admin.profiles.cellsTab")}`}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {t("admin.users.cancel")}
          </Button>
          <Button
            size="sm"
            icon={mode === "add" ? <Plus size={12} /> : <Pencil size={12} />}
            loading={busy}
            onClick={submit}
          >
            {t(mode === "add" ? "admin.profiles.create" : "admin.profiles.save")}
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
          autoFocus={mode === "add"}
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
      {/* The work-centre GROUP. Several cells of one brigadir's unit may stand
          at one SAP code; each then needs its own letter so the typed people
          and the catalog minutes reach the right cell. The server enforces the
          rule and its refusal lands in formError below. */}
      <FormField label={t("admin.profiles.colGroup")} hint={t("admin.profiles.cellGroupHint")}>
        <StyledSelect
          value={canGroup ? (form.wc_group || "") : ""}
          onChange={(v) => setForm((f) => ({ ...f, wc_group: v }))}
          disabled={!canGroup}
          options={[
            { value: "", label: "—" },
            ...GROUP_LETTERS.map((l) => ({ value: l, label: <GroupBadge group={l} />, title: l })),
          ]}
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
      <FormField label={t("admin.profiles.colCellManager")}>
        <StyledSelect
          value={form.leader_id || ""}
          onChange={(v) => setForm((f) => {
            // The Boshqaruvchi is authoritative for the supervisor: picking a
            // leader inherits their unit; clearing keeps the cell's current
            // supervisor (a cell can be leaderless yet belong to a unit).
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
      <FormField label={t("admin.profiles.colCellOwner")} hint={t("admin.profiles.cellOwnerHint")}>
        <StyledSelect
          value={form.owner_id || ""}
          onChange={(v) => setForm((f) => ({ ...f, owner_id: v }))}
          searchable
          options={ownerOpts}
        />
      </FormField>
      <FormField label={t("cellPage.inLoad")}
                 hint={followsUnit && form.manager_id ? t("admin.profiles.cellInLoadFollows") : undefined}>
        <SegmentedToggle
          fill
          className="mt-1"
          ariaLabel={t("cellPage.inLoad")}
          value={inLoad ? "on" : "off"}
          onChange={(v) => { setLoadTouched(true); setForm((f) => ({ ...f, in_load: v === "on" })); }}
          options={[
            { value: "on", label: t("profile.zagruzka.on") },
            { value: "off", label: t("profile.zagruzka.off") },
          ]}
        />
      </FormField>
      {formError && <p className="text-[11px] font-medium text-red-400">{formError}</p>}
    </Modal>
  );
}

const fillVars = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
const joinCodes = (v) => (Array.isArray(v) ? v.join(", ") : v);

// The register rule refuses a placement with a STRUCTURED detail
// (wc_group.check_cell_detail: code + params, the English sentence as
// `message`). utils/api.js flattens it to that sentence and keeps the object as
// `detail_raw`; the kinds a cell form can meet are said here in the admin's
// language, anything else falls back to the sentence the server sent.
function cellWriteError(e, t) {
  const res = e?.response?.data;
  const raw = res?.detail_raw;
  const p = raw?.params || {};
  const vars = { code: p.code, group: p.group, free: p.free, unlettered: joinCodes(p.unlettered) };
  switch (raw?.code) {
    case "wc_group_needs_sap": return t("admin.profiles.cellGroupNeedsSap");
    case "wc_group_needs_unit": return t("admin.profiles.cellGroupNeedsUnit");
    case "wc_group_missing":
      return fillVars(t(p.unlettered?.length ? "admin.profiles.cellGroupLetterFirst" : "admin.profiles.cellGroupMissing"),
                      { ...vars, cells: joinCodes(p.cells) });
    case "wc_group_duplicate":
      return fillVars(t(p.free ? "admin.profiles.cellGroupDuplicateFree" : "admin.profiles.cellGroupDuplicate"),
                      { ...vars, cells: p.cell });
    default:
      return (typeof res?.detail === "string" && res.detail) || t("admin.profiles.error");
  }
}

// Shared with the inline cell create on /profile. A static, not a named export:
// react-refresh allows a component module to export components only.
CellFormModal.errorText = cellWriteError;
