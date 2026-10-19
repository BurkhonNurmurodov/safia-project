import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Pencil, CalendarClock, Info } from "lucide-react";
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
import CellManagerPicker, { PendingChip } from "./CellManagerPicker";

/**
 * THE add/edit form for one production cell — extracted from the /cells
 * register so the register and the cell details page (/cells/:id) share ONE
 * form instead of drifting copies. Endpoints are the register's:
 * POST/PUT /api/profiles/admin/cells[/id], both CAP_CELLS_MANAGE-guarded.
 *
 * `units` / `leaders` are the option lists GET /api/profiles/admin/cells
 * returns beside the register. `onSaved(text)` fires after a successful write —
 * the caller invalidates its own queries there and may toast `text`, the
 * sentence that says from when a dated change counts; the modal closes itself.
 * It also fires with NO text when the cell saved and the «Boshqaruvchi» pick
 * after it was refused (the dialog then stays open with the reason).
 *
 * «Zagruzkada hisoblanadi» (`in_load`) follows the brigadir until somebody
 * sets it here: a new cell, or one moved to another brigadir in this form,
 * takes the unit's own «Zagruzka hisoblanadi» (`units[].zagruzka_on`) — what
 * the server applies to a create that names no value — and an edit that keeps
 * the brigadir keeps the cell's own value.
 *
 * A cell names TWO leaders (2026-10-08, the operator's rulings): the
 * «Boshqaruvchi» (`leader_id`) RUNS it — the checklist, the automatic checks,
 * ojidaniya — and the «Egasi» (`owner_id`) is the leader Verifix seats in it.
 *
 * From the Verifix live sync (2026-10-12, ruling 3) the brigadir and the
 * «Boshqaruvchi» of an EXISTING cell are DATED links: a brigadir change lands
 * at the unit's next shift opening and never rewrites a day already filed, a
 * «Boshqaruvchi» pick counts from the day it is made (2026-10-17) — so the
 * form says from when, and shows a change already waiting beside the value in
 * force. The «Boshqaruvchi» is the Verifix seat by default; a person may pick
 * ONE worker Verifix places in the unit's cells (CellManagerPicker, applied
 * with PUT …/manager AFTER the cell's own PUT, only when it changed). A pick
 * never moves the cell to the leader's unit, so the brigadir is no longer
 * carried from the leader. «Egasi» is Verifix's alone — read-only here, and
 * `owner_id` is never sent. A NEW cell has no past: its brigadir counts at
 * once, and it starts with no «Boshqaruvchi» (`leader_id: 0`) until Verifix
 * seats a leader in it or somebody picks one.
 *
 * «Jarayonlar» (`one_process`, 2026-10-10): «Bitta jarayon» marks a cell
 * specialised for ONE process; a leader whose cells are all such is not asked
 * for 3 different processes on checklist task 3. «Ko'p jarayon» is the default.
 */

const inputCls = "mt-1 w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

export default function CellFormModal({ mode, item, units, leaders, onClose, onSaved }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const isEdit = mode === "edit" && !!item;

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          verifix_code: item.verifix_code || "",
          sap_code: item.sap_code || "",
          wc_group: item.wc_group || "",
          // A brigadir change already waiting is what the select shows: the
          // brigadir in force is printed under it, and picking it back is
          // how the waiting change is withdrawn.
          manager_id: item.pending?.manager_id
            ? (item.pending.manager_id.value == null ? "" : String(item.pending.manager_id.value))
            : (item.manager_id ? String(item.manager_id) : ""),
          name_workshop_uz: item.name_workshop_uz || "",
          name_workshop_uz_cyrl: item.name_workshop_uz_cyrl || "",
          name_workshop_ru: item.name_workshop_ru || "",
          name_workshop_en: item.name_workshop_en || "",
          in_load: !!item.in_load,
          one_process: !!item.one_process,
        }
      : {
          verifix_code: "", sap_code: "", wc_group: "", manager_id: "",
          name_workshop_uz: "", name_workshop_uz_cyrl: "",
          name_workshop_ru: "", name_workshop_en: "", in_load: false, one_process: false,
        });
  // The «Boshqaruvchi» pick: undefined = untouched, "" = back to the Verifix
  // seat, else a Verifix employee id from the pool (CellManagerPicker).
  const [mgrPick, setMgrPick] = useState(undefined);
  const [formError, setFormError] = useState("");
  // Has the «Zagruzkada hisoblanadi» switch been set by hand in this form?
  const [loadTouched, setLoadTouched] = useState(false);
  // The brigadir in force (the column) …
  const initialUnit = isEdit && item.manager_id ? String(item.manager_id) : "";
  // … and a change already recorded and waiting for its opening ({value,
  // from, name?} — the register names it, /cells/:id does not).
  const pendUnit = isEdit ? item.pending?.manager_id || null : null;
  // What the form opened on: the waiting value when there is one.
  const baseUnit = pendUnit ? (pendUnit.value == null ? "" : String(pendUnit.value)) : initialUnit;
  const unitCounts = (mid) => !!units.find((u) => String(u.id) === String(mid))?.zagruzka_on;
  const followsUnit = !loadTouched && (mode === "add" || String(form.manager_id || "") !== baseUnit);
  const inLoad = followsUnit ? unitCounts(form.manager_id) : !!form.in_load;

  const unitName = (mid) => units.find((u) => String(u.id) === String(mid))?.name;
  const pendUnitName = pendUnit
    ? (pendUnit.name || unitName(pendUnit.value) || (pendUnit.value == null ? null : `#${pendUnit.value}`))
    : null;
  const nowUnitName = initialUnit ? (unitName(initialUnit) || item?.supervisor || `#${initialUnit}`) : null;
  const picked = String(form.manager_id || "");
  // Sent only when the reader moved it off what the form opened on. With a
  // change waiting, picking the brigadir in force WITHDRAWS it (the server
  // drops the waiting event and records nothing new).
  const unitChanged = isEdit && picked !== baseUnit;
  const withdrawing = unitChanged && !!pendUnit && picked === initialUnit;

  // The unit's next shift opening, off the manager pool (the picker reads the
  // same query; react-query asks once). A brigadir change lands at the LATER of
  // the two units' openings, which is this date whenever both units run the
  // same shift, or the cell's unit now runs no shift (its opening is the
  // calendar's next day, never earlier than another unit's); across shifts the
  // date is said after the save, from the server's own answer.
  const poolQ = useQuery({ ...CellManagerPicker.poolQuery(item?.id), enabled: isEdit });
  // null = no unit, or a unit running no shift; undefined = a unit this list
  // does not carry (archived), whose shift is unknown — equal to nothing.
  const shiftOf = (mid) => {
    if (!mid) return null;
    const u = units.find((x) => String(x.id) === String(mid));
    return u ? (u.shift ?? null) : undefined;
  };
  // Clearing the brigadir lands at the current unit's own opening (the server
  // compares two units only when there IS a new one).
  const fromShift = shiftOf(initialUnit);
  const unitDate = !picked || fromShift === null || fromShift === shiftOf(picked)
    ? poolQ.data?.next_opening || null
    : null;

  // «Egasi» — Verifix's seat, read-only (the register names it; /cells/:id
  // passes the name in).
  const ownerName = isEdit
    ? item.owner || leaders.find((l) => String(l.id) === String(item.owner_id))?.name || null
    : null;

  const fail = (e) => setFormError(cellWriteError(e, t));
  const ddmm = CellManagerPicker.ddmm;

  // What the save did, in one sentence for the caller's toast.
  const savedText = (out) => {
    const parts = [];
    const pu = out?.cell?.pending?.manager_id;
    if (withdrawing) parts.push(t("cellMgr.unitWithdrawn"));
    else if (unitChanged && pu?.from) parts.push(fillVars(t("cellMgr.unitSaved"), { date: ddmm(pu.from) }));
    if (out?.manager) parts.push(CellManagerPicker.savedText(out.manager, t));
    return parts.length ? parts.join(" · ") : t("cellPage.saved");
  };

  const saveMut = useMutation({
    mutationFn: async (body) => {
      if (mode === "add") {
        await api.post("/api/profiles/admin/cells", body);
        return {};
      }
      // The cell first; the pick only after it landed. Re-sending the cell on
      // a retry is harmless — the server reads a link equal to the one in
      // force or waiting as untouched.
      const cell = (await api.put(`/api/profiles/admin/cells/${item.id}`, body)).data;
      let manager = null;
      if (mgrPick !== undefined) {
        try {
          manager = (await api.put(`/api/profiles/admin/cells/${item.id}/manager`,
                                   { employee_id: mgrPick === "" ? null : mgrPick })).data;
        } catch (e) {
          e.stage = "manager";
          throw e;
        }
      }
      return { cell, manager };
    },
    onSuccess: (out) => { onSaved?.(savedText(out)); onClose(); },
    onError: (e) => {
      if (e?.stage === "manager") {
        // The cell's own fields DID save — refresh the caller, keep the dialog
        // open with the reason, so the pick can be corrected and retried.
        onSaved?.();
        setFormError(fillVars(t("cellMgr.savedButManager"), { reason: CellManagerPicker.errorText(e, t) }));
      } else {
        fail(e);
      }
    },
  });
  const busy = saveMut.isPending;
  // A group letter qualifies a SAP code INSIDE one unit (services/wc_group.py),
  // so it needs both — and the server refuses one beside either missing. The
  // form neither offers nor sends it then, so clearing the brigadir clears the
  // letter instead of drawing a refusal.
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
      in_load: inLoad,
      one_process: !!form.one_process,
    };
    // `owner_id` is never sent («Egasi» is Verifix's). A new cell takes its
    // brigadir at once and starts with no «Boshqaruvchi»; an existing one sends
    // the brigadir only when it changed, and its «Boshqaruvchi» goes through
    // the picker's own endpoint — never `leader_id` here.
    if (mode === "add") {
      body.manager_id = form.manager_id ? Number(form.manager_id) : 0;
      body.leader_id = 0;
    } else if (unitChanged) {
      body.manager_id = form.manager_id ? Number(form.manager_id) : 0;
    }
    saveMut.mutate(body);
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
          searchable
          options={[
            { value: "", label: t("admin.profiles.cellNoSupervisor") },
            ...units.map((u) => ({ value: String(u.id), label: tl(u.name), title: tl(u.name) })),
          ]}
        />
        {/* A change already waiting, and — once the reader moved it — from
            when theirs counts. Only an existing cell has a past to protect. */}
        {pendUnit && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 min-w-0 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="min-w-0">
              {fillVars(t("cellMgr.unitNow"), {
                name: nowUnitName ? tl(nowUnitName) : t("admin.profiles.cellNoSupervisor"),
              })}
            </span>
            <PendingChip from={pendUnit.from}
                         name={pendUnitName ? tl(pendUnitName) : t("admin.profiles.cellNoSupervisor")} />
          </p>
        )}
        {withdrawing ? (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            <Info size={12} className="flex-shrink-0 mt-px" aria-hidden="true" />
            <span className="min-w-0">{t("cellMgr.unitWithdraw")}</span>
          </p>
        ) : unitChanged && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            <CalendarClock size={12} className="flex-shrink-0 mt-px" aria-hidden="true" />
            <span className="min-w-0">
              {unitDate
                ? fillVars(t("cellMgr.unitLands"), { date: ddmm(unitDate) })
                : t("cellMgr.unitLandsNext")}
            </span>
          </p>
        )}
      </FormField>
      <FormField label={t("admin.profiles.colCellManager")}>
        {isEdit
          ? <CellManagerPicker cellId={item.id} value={mgrPick} onChange={setMgrPick} disabled={busy} />
          : (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
              <Info size={12} className="flex-shrink-0 mt-px" aria-hidden="true" />
              <span className="min-w-0">{t("cellMgr.createNote")}</span>
            </p>
          )}
      </FormField>
      {isEdit && (
        <FormField label={t("admin.profiles.colCellOwner")} hint={t("cellMgr.ownerHint")}>
          {/* Read-only: the seat Verifix names — no picker any more. */}
          <div
            className={`${inputCls} flex items-center gap-1.5 min-w-0`}
            style={{ ...inputStyle, background: "var(--bg-inner)", border: "1px solid var(--border)" }}
            aria-readonly="true"
          >
            <span className="truncate min-w-0" style={{ color: ownerName ? "var(--text-2)" : "var(--text-3)" }}>
              {ownerName ? tl(ownerName) : t("cellMgr.noOwner")}
            </span>
            <span className="flex-shrink-0 whitespace-nowrap" style={{ color: "var(--text-3)" }}>
              · {t("cellMgr.byVerifix")}
            </span>
          </div>
        </FormField>
      )}
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
      {/* «Jarayonlar» — read by checklist task 3 alone (services/one_process):
          a leader whose cells are all one-process is not asked for 3
          DIFFERENT processes. The hint says so, and that it moves only the
          proofs checked from now on. */}
      <FormField label={t("cellPage.oneProcess")} hint={t("cellPage.oneProcessHint")}>
        <SegmentedToggle
          fill
          className="mt-1"
          ariaLabel={t("cellPage.oneProcess")}
          value={form.one_process ? "one" : "many"}
          onChange={(v) => setForm((f) => ({ ...f, one_process: v === "one" }))}
          options={[
            { value: "one", label: t("cellPage.oneProcessOn") },
            { value: "many", label: t("cellPage.oneProcessOff") },
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
