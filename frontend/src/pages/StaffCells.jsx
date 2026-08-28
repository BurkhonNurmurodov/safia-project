/**
 * /staff-cells — cell-level people exchange (page key "staff-cell").
 *
 * The unit-level twin of /staff, asked one level down: which YACHEYKA did a
 * worker leave, and which one did they land in. Everything here reads and
 * writes through `/api/staff-cells/*` — never `/api/staff/*` — so a leader
 * holding only this page can never reach the unit-level endpoints, and a grant
 * on this page can never widen the old one.
 *
 * There is NO exception. The supervisor NAME list has no cell endpoint of its
 * own, so it is DERIVED from the roster payload instead of borrowed from
 * `/api/staff/supervisors`: that endpoint is gated on the OLD page key, so a
 * shift-manager holding this page and not /staff would read an empty list with
 * no error anywhere on screen — the worst shape a scope control can take.
 *
 * SANDBOX. While the backend's `cell_exchange.SANDBOX` stands, every document
 * filed here carries a test doc_type: it is filed, notified and approved for
 * real, and it moves no attendance row. The page says so once at the top and
 * marks every such document with a TEST chip — on its row, on its card and in
 * the modal header — so nothing on screen can be mistaken for a live transfer.
 *
 * Templates: this is a CORRECTED copy of /staff, not a bug-for-bug one.
 * Staff.jsx predates FilterPanel, DataTable, Toast and DayStepper and
 * hand-rolls all four; nothing here does. What can be imported from Staff.jsx
 * unchanged IS imported (the transfer-time arithmetic especially — it is the
 * subtlest code in that file and a second spelling of it would silently blank
 * the operator's time).
 */

import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, Boxes, Check, Ban, Trash2, X, Plus, UserRound,
  FlaskConical, AlertTriangle, Clock, Users, FileText, Info,
} from "lucide-react";

import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import DayStepper from "../components/ui/DayStepper";
import CellLink from "../components/ui/CellLink";
import TimeWheelPicker from "../components/ui/TimeWheelPicker";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useCapabilities } from "../hooks/useCapabilities";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";
import { cellName as pickCellName } from "../utils/cellName";
// Imported, never re-spelled: the transfer/return window arithmetic and the
// document-type label map are one rule each, and /staff owns them.
import {
  fmtDateLabel, DOC_TYPE_TKEY,
  parseHHMM, scheduleStartMin, clockInMin, clockOutMin,
} from "./Staff";

// ── small helpers ─────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// A sandbox document is told apart by its doc_type suffix — the same fact
// `cell_exchange.is_test` states on the backend. The label still comes from the
// REAL type, so «people_exchange_test» reads as «Perevod sotrudnikov · TEST»
// rather than as a fourth document kind nobody has heard of.
const isTestDoc = (d) => String(d?.doc_type || "").endsWith("_test");
const realType  = (d) => String(d?.doc_type || "").replace(/_test$/, "");

// A row may be moved only when it names a cell AND is not the unit's own
// brigadir. The two are different facts: a null verifix_code does NOT imply
// is_supervisor (a legacy day has null codes on every row), so both are tested.
const isSelectable = (w) => !!w.verifix_code && !w.is_supervisor;

// Codes exist zero-padded AND zero-stripped («0028» and «28» are ONE cell), so
// every comparison and every lookup goes through the normal form — the client
// twin of `cell_lookup.norm_code`. A raw string compare would let a worker be
// «moved» into the cell they are already in, past the guard that exists to
// refuse exactly that.
const normCode = (c) => String(c ?? "").trim().replace(/^0+(?=\d)/, "");
const sameCode = (a, b) => !!a && !!b && normCode(a) === normCode(b);

/**
 * What one cell shows, in the viewer's language. The day catalog
 * (`cells: [{cell_id, verifix_code, name_*, leader_name}]`) is authoritative;
 * the row's own `cell {code, names, leader_name}` is the fallback for a code
 * the catalog does not carry. Both shapes resolve through the ONE
 * `cellName` helper — the short `{uz,…}` map takes the empty prefix.
 */
function cellInfo(code, byCode, lang, fallback) {
  const c = byCode.get(normCode(code));
  if (c) {
    return {
      id: c.cell_id ?? null,
      code: c.verifix_code || code || "",
      name: pickCellName(c, lang, "name_") || "",
      leader: c.leader_name || null,
    };
  }
  if (fallback) {
    return {
      id: fallback.cell_id ?? null,
      code: fallback.code || code || "",
      name: pickCellName(fallback.names || {}, lang, "") || "",
      leader: fallback.leader_name || null,
    };
  }
  return { id: null, code: code || "", name: "", leader: null };
}

// ── chips ─────────────────────────────────────────────────────────────────────

function TestChip() {
  const { t } = useLang();
  return (
    <span
      title={t("staffCell.testChipTitle")}
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full align-middle"
      style={{ background: "rgba(234,179,8,0.14)", color: "#eab308", border: "1px solid rgba(234,179,8,0.35)" }}
    >
      <FlaskConical size={9} /> {t("staffCell.testChip")}
    </span>
  );
}

// Traffic light — the one place a raw status hex is correct.
const STATUS_TONE = {
  approved: { bg: "rgba(34,197,94,0.14)",  fg: "#22c55e", bd: "rgba(34,197,94,0.35)",  key: "staff.yes" },
  rejected: { bg: "rgba(239,68,68,0.14)",  fg: "#ef4444", bd: "rgba(239,68,68,0.35)",  key: "staff.rejected" },
  draft:    { bg: "rgba(234,179,8,0.14)",  fg: "#eab308", bd: "rgba(234,179,8,0.35)",  key: "staff.pending" },
};

function StatusChip({ status }) {
  const { t } = useLang();
  const tone = STATUS_TONE[status] || STATUS_TONE.draft;
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block whitespace-nowrap"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
    >
      {t(tone.key)}
    </span>
  );
}

// The cell as CONTENT: code prominent, workshop name muted beneath it. The code
// links to /cells/:id when the registry knows it, and renders inert when it
// does not — the two registers are allowed to disagree in public.
function CellCell({ info }) {
  const { t } = useLang();
  if (!info || !info.code) {
    return <span style={{ color: "var(--text-4)" }}>{t("staffCell.noCellGroup")}</span>;
  }
  return (
    <div className="flex flex-col leading-tight">
      <CellLink id={info.id} className="font-mono text-xs" style={{ color: "var(--text-1)" }}>
        {info.code}
      </CellLink>
      {info.name && (
        <span className="text-[10px] truncate max-w-[160px]" style={{ color: "var(--text-4)" }}>
          {info.name}
        </span>
      )}
    </div>
  );
}

// ── The exchange modal ────────────────────────────────────────────────────────
//
// The target chain reveals in order, so there is never more than one thing to
// decide: Qayerga → Yacheyka → transfer time T → return time R → the roster.
// The roster is grouped by SENDER cell under a sticky header naming the cell
// and its leader, because ONE Save can file several documents — a selection
// spanning two groups has to be visible while it is being made, not a surprise
// in the footer.
function ExchangeModal({ date, workers, byCode, probeCell, lang, onClose, onSaved }) {
  const { t } = useLang();
  const { tl } = useTranslit();

  const [target, setTarget]         = useState("");     // "sup:<id>" | "task:<name>"
  const [targetCell, setTargetCell] = useState("");
  const [selected, setSelected]     = useState(() => new Set());
  const [query, setQuery]           = useState("");
  const [useTime, setUseTime]       = useState(false);
  const [transferTime, setTransfer] = useState("");
  const [useReturn, setUseReturn]   = useState(false);
  const [returnTime, setReturn]     = useState("");
  const [tOpen, setTOpen]           = useState(false);
  const [rOpen, setROpen]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  // Where a move may land. The endpoint answers for the SENDER's shift, so it
  // is asked with one sender cell — the page's own scope, fixed for the life of
  // the modal so the option list can never move under a half-made decision.
  const { data: raw } = useQuery({
    queryKey: ["staffcell-exchange-targets", date, probeCell],
    queryFn: () => api.get("/api/staff-cells/exchange-targets", {
      params: { attend_date: date, ...(probeCell ? { sender_cell: probeCell } : {}) },
    }).then((r) => r.data),
    enabled: !!date,
  });
  // The endpoint may answer with the bare supervisor array or with
  // `{supervisors, tasks}`; both are read the same way, and a bare array simply
  // offers no task targets.
  const supTargets = useMemo(() => (Array.isArray(raw) ? raw : (raw?.supervisors ?? [])), [raw]);
  const tasks      = useMemo(() => (Array.isArray(raw) ? [] : (raw?.tasks ?? [])), [raw]);

  const targetOptions = useMemo(() => [
    ...supTargets.map((s) => {
      const nm = tl(s.full_name || s.name || "");
      return { value: `sup:${s.manager_id}`, label: nm, title: nm };
    }),
    ...tasks.map((name) => ({
      value: `task:${name}`,
      label: t("staffCell.taskPrefix").replace("{name}", name),
      title: name,
    })),
  ], [supTargets, tasks, tl, t]);

  const targetIsSup = target.startsWith("sup:");
  const targetCells = useMemo(() => {
    if (!targetIsSup) return [];
    const s = supTargets.find((x) => `sup:${x.manager_id}` === target);
    return s?.cells || [];
  }, [targetIsSup, target, supTargets]);

  // «code · workshop · leader» — the whole address of the destination in one
  // line. A cell with nobody assigned says «Biriktirilmagan» rather than
  // trailing off, so a blank never reads as a missing name.
  const cellOptions = useMemo(() => targetCells.map((c) => {
    const nm = pickCellName(c, lang, "name_");
    const leader = c.leader_name ? tl(c.leader_name) : t("staffCell.unassignedLeader");
    const label = [c.verifix_code, nm, leader].filter(Boolean).join(" · ");
    return { value: c.verifix_code, label, title: label };
  }), [targetCells, lang, tl, t]);

  // Drop a picked destination the (newly chosen) target does not have.
  useEffect(() => {
    if (targetCell && targetCells.length && !targetCells.some((c) => c.verifix_code === targetCell))
      setTargetCell("");
  }, [targetCells, targetCell]);

  const needCell  = targetIsSup && targetCells.length > 0;
  const chainDone = !!target && (!needCell || !!targetCell);

  // ── the roster ──────────────────────────────────────────────────────────
  const pool = useMemo(() => workers.filter(isSelectable), [workers]);
  const shown = useMemo(
    () => pool.filter((w) => !query || (w.worker_name || "").toLowerCase().includes(query.toLowerCase())),
    [pool, query],
  );
  // Groups in code order; the header names the cell and its leader.
  const groups = useMemo(() => {
    const m = new Map();
    for (const w of shown) {
      const k = w.verifix_code || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  function toggle(name) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  function toggleGroup(rows, on) {
    setSelected((s) => {
      const n = new Set(s);
      rows.forEach((w) => (on ? n.delete(w.worker_name) : n.add(w.worker_name)));
      return n;
    });
  }

  const selectedRows = useMemo(() => pool.filter((w) => selected.has(w.worker_name)), [pool, selected]);

  // ── transfer / return windows ───────────────────────────────────────────
  // Same arithmetic as /staff, from the same imported helpers: earliest start
  // (schedule, falling back to clock-in) → latest clock-out across the
  // SELECTED workers, carrying an overnight clock-out into the next day.
  const timeWindow = useMemo(() => {
    const starts = [], outs = [];
    selectedRows.forEach((w) => {
      const s = scheduleStartMin(w.schedule) ?? clockInMin(w.clock_in_out);
      let o = clockOutMin(w.clock_in_out);
      if (s != null && o != null && o < s) o += 1440;
      if (s != null) starts.push(s);
      if (o != null) outs.push(o);
    });
    if (!starts.length || !outs.length) return null;
    const lo = Math.min(...starts), hi = Math.max(...outs);
    return hi >= lo ? { lo, hi } : null;
  }, [selectedRows]);

  // Keep the picked time valid as the selection changes. Guarded on a non-empty
  // pool so a value is never cleared during the roster's own fetch.
  useEffect(() => {
    if (!transferTime || !pool.length) return;
    let m = parseHHMM(transferTime);
    if (m != null && timeWindow && m < timeWindow.lo) m += 1440;
    if (!timeWindow || m == null || m < timeWindow.lo || m > timeWindow.hi) setTransfer("");
  }, [timeWindow, transferTime, pool.length]);

  const returnWindow = useMemo(() => {
    if (!transferTime || !timeWindow) return null;
    let tm = parseHHMM(transferTime);
    if (tm == null) return null;
    if (tm < timeWindow.lo) tm += 1440;
    return timeWindow.hi > tm ? { lo: tm, hi: timeWindow.hi } : null;
  }, [transferTime, timeWindow]);

  useEffect(() => {
    if (!returnTime || !pool.length) return;
    let m = parseHHMM(returnTime);
    if (m != null && returnWindow && m < returnWindow.lo) m += 1440;
    if (!returnWindow || m == null || m < returnWindow.lo || m > returnWindow.hi) setReturn("");
  }, [returnWindow, returnTime, pool.length]);

  // ── the outcome, in words, before it is committed ───────────────────────
  const senderGroups = useMemo(() => {
    const m = new Map();
    for (const w of selectedRows) {
      const k = w.verifix_code || "";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.keys()].sort();
  }, [selectedRows]);

  // A worker already sitting in the destination cell has nowhere to go: the
  // backend refuses the document, so the page names the cells rather than
  // letting Save fail on a rule nothing on screen stated.
  const sameCell = useMemo(
    () => (targetCell ? senderGroups.filter((c) => sameCode(c, targetCell)) : []),
    [senderGroups, targetCell],
  );

  const outcome = useMemo(() => {
    if (!selectedRows.length || !chainDone) return "";
    const n = String(selectedRows.length);
    const d = String(senderGroups.length);
    if (targetIsSup) {
      const moves = senderGroups
        .map((c) => `${c || t("staffCell.noCellGroup")} → ${targetCell || "…"}`)
        .join(", ");
      return t("staffCell.outcome")
        .replace("{n}", n).replace("{d}", d).replace("{moves}", moves);
    }
    return t("staffCell.outcomeTask")
      .replace("{n}", n).replace("{d}", d).replace("{task}", target.slice(5));
  }, [selectedRows.length, senderGroups, chainDone, targetIsSup, targetCell, target, t]);

  async function handleSave() {
    setError("");
    if (!target)               { setError(t("staff.chooseTarget")); return; }
    if (needCell && !targetCell) { setError(t("staff.chooseCell")); return; }
    if (!selected.size)        { setError(t("staff.selectAtLeastOne")); return; }
    if (sameCell.length) {
      setError(t("staffCell.sameCell").replace("{cells}", sameCell.join(", ")));
      return;
    }
    const tgt = targetIsSup
      ? { target_type: "supervisor", target_manager_id: parseInt(target.slice(4), 10), target_cell: targetCell || "" }
      : { target_type: "task", task_name: target.slice(5) };
    const tt = useTime && transferTime ? transferTime : "";
    const rt = tt && useReturn && returnTime ? returnTime : "";
    setSaving(true);
    try {
      const res = await api.post("/api/staff-cells/documents", {
        doc_type: "people_exchange",
        attend_date: date,
        employees: [...selected],
        transfer_time: tt,
        return_time: rt,
        ...tgt,
      });
      const made = res?.data?.documents?.length ?? senderGroups.length;
      onSaved(made);
    } catch (e) {
      setError(e?.response?.data?.detail || t("staff.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  const stepCls = "px-5 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0";
  const labelCls = "text-xs font-medium";

  return (
      <Modal
        onClose={onClose}
        zIndex={100}
        maxWidth="max-w-3xl"
        bodyClassName="p-0 flex flex-col"
        icon={<ArrowLeftRight size={16} style={{ color: "var(--brand-text)" }} />}
        title={
          <span className="inline-flex items-center gap-2">
            {t("staffCell.exchangeTitle")} <TestChip />
          </span>
        }
        subtitle={fmtDateLabel(date)}
        footer={
          <>
            <span
              className="mr-auto self-center text-[11px] leading-snug"
              style={{ color: error ? "#ef4444" : "var(--text-3)" }}
            >
              {error || outcome || t("staffCell.outcomeEmpty")}
            </span>
            <Button variant="secondary" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              size="sm"
              icon={<Check size={13} />}
              loading={saving}
              disabled={!chainDone || !selected.size}
              onClick={handleSave}
            >
              {t("staff.saveDocument")}
            </Button>
          </>
        }
      >
        {/* 1 — Qayerga */}
        <div className={stepCls} style={{ borderColor: "var(--border)" }}>
          <span className={labelCls} style={{ color: "var(--text-3)" }}>{t("staff.moveTo")}</span>
          <StyledSelect
            value={target}
            onChange={(v) => { setTarget(v); setTargetCell(""); }}
            options={targetOptions}
            placeholder={t("staff.selectTargetOpt")}
            searchable
            searchPlaceholder={t("common.search")}
            className="flex-1 min-w-[220px]"
            triggerClassName="px-3 py-2 text-xs"
          />
        </div>

        {/* 2 — Yacheyka (only once a receiving supervisor is chosen) */}
        {needCell && (
          <div className={stepCls} style={{ borderColor: "var(--border)" }}>
            <span className={labelCls} style={{ color: "var(--text-3)" }}>{t("staff.toCell")}</span>
            <StyledSelect
              value={targetCell}
              onChange={setTargetCell}
              options={cellOptions}
              placeholder={t("staff.selectCellOpt")}
              searchable
              searchPlaceholder={t("common.search")}
              className="flex-1 min-w-[240px]"
              triggerClassName="px-3 py-2 text-xs"
            />
          </div>
        )}

        {/* 3 — transfer time T */}
        {chainDone && (
          <div className={stepCls} style={{ borderColor: "var(--border)" }}>
            <span className={labelCls} style={{ color: "var(--text-3)" }}>{t("staff.transferTimeToggle")}</span>
            <SegmentedToggle
              size="sm"
              value={useTime ? "at" : "all"}
              onChange={(v) => { const on = v === "at"; setUseTime(on); if (!on) { setTransfer(""); setUseReturn(false); setReturn(""); } }}
              options={[["all", t("staffCell.tWhole")], ["at", t("staffCell.tFrom")]]}
            />
            {useTime && (timeWindow ? (
              <Button
                variant="secondary"
                size="md"
                icon={<Clock size={13} />}
                onClick={() => setTOpen(true)}
              >
                {transferTime || t("staff.transferTimePlaceholder")}
              </Button>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("staff.transferTimeNoOptions")}</span>
            ))}
            <TimeWheelPicker
              open={tOpen && !!timeWindow}
              lo={timeWindow?.lo}
              hi={timeWindow?.hi}
              value={transferTime}
              onConfirm={(v) => { setTransfer(v); setTOpen(false); }}
              onClose={() => setTOpen(false)}
            />
          </div>
        )}

        {/* 4 — return time R (only once T exists: R ends the away stint) */}
        {chainDone && useTime && !!transferTime && (
          <div className={stepCls} style={{ borderColor: "var(--border)" }}>
            <span className={labelCls} style={{ color: "var(--text-3)" }}>{t("staff.returnTimeToggle")}</span>
            <SegmentedToggle
              size="sm"
              value={useReturn ? "at" : "none"}
              onChange={(v) => { const on = v === "at"; setUseReturn(on); if (!on) setReturn(""); }}
              options={[["none", t("staffCell.rNone")], ["at", t("staffCell.rAt")]]}
            />
            {useReturn && (returnWindow ? (
              <Button
                variant="secondary"
                size="md"
                icon={<Clock size={13} />}
                onClick={() => setROpen(true)}
              >
                {returnTime || t("staff.returnTimePlaceholder")}
              </Button>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("staff.returnTimeNoOptions")}</span>
            ))}
            <TimeWheelPicker
              open={rOpen && !!returnWindow}
              lo={returnWindow?.lo}
              hi={returnWindow?.hi}
              value={returnTime}
              onConfirm={(v) => { setReturn(v); setROpen(false); }}
              onClose={() => setROpen(false)}
            />
          </div>
        )}

        {/* 5 — the roster, grouped by SENDER cell */}
        <div className="px-5 py-2.5 border-b flex items-center gap-2 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("staff.searchEmployees")}
            className="flex-1"
            inputClassName="text-xs pl-8 pr-7 py-2"
          />
          <span className="text-[11px] px-2 py-1 rounded-full whitespace-nowrap"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
            {selected.size} {t("staff.selected")}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {pool.length === 0 ? (
            <EmptyState
              showUploadLink={false}
              icon={Users}
              title={t("staffCell.noSelectableTitle")}
              message={t("staffCell.noSelectableMsg")}
            />
          ) : groups.length === 0 ? (
            <EmptyState
              showUploadLink={false}
              icon={Users}
              title={t("staffCell.noMatchTitle")}
              message={t("staffCell.noMatchMsg")}
            />
          ) : (
            groups.map(([code, rows]) => {
              const info = cellInfo(code, byCode, lang, rows[0]?.cell);
              const allOn = rows.every((w) => selected.has(w.worker_name));
              return (
                <div key={code || "_none"}>
                  <div
                    className="sticky top-0 z-10 flex items-center gap-2 px-5 py-2"
                    style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}
                  >
                    <Boxes size={12} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
                    <span className="font-mono text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                      {info.code || t("staffCell.noCellGroup")}
                    </span>
                    {info.name && (
                      <span className="text-[11px] truncate" style={{ color: "var(--text-4)" }}>{info.name}</span>
                    )}
                    <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                      {t("staffCell.leaderPrefix").replace("{name}", info.leader ? tl(info.leader) : t("staffCell.unassignedLeader"))}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => toggleGroup(rows, allOn)}
                    >
                      {allOn ? t("staff.clearSelection") : t("staff.selectAll")}
                    </Button>
                  </div>
                  {rows.map((w) => {
                    const on = selected.has(w.worker_name);
                    return (
                      <button
                        key={w.worker_name}
                        type="button"
                        onClick={() => toggle(w.worker_name)}
                        className="w-full text-left flex items-center gap-3 px-5 py-2 border-b text-xs"
                        style={{ borderColor: "var(--border)", background: on ? "var(--brand-bg)" : "transparent" }}
                      >
                        <span
                          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            background: on ? "var(--brand)" : "transparent",
                            border: `1px solid ${on ? "var(--brand)" : "var(--border-md)"}`,
                          }}
                        >
                          {on && <Check size={11} color="#fff" />}
                        </span>
                        <span className="flex-1 truncate" style={{ color: "var(--text-1)" }}>{tl(w.worker_name)}</span>
                        <span className="truncate max-w-[38%]" style={{ color: "var(--text-3)" }}>
                          {tl(w.job_title) || "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </Modal>
  );
}

// ── The documents register (Requests + Approvals read the same renderer) ──────

function DocumentsTable({
  title, subtitle, rows, isLoading, byCode, lang,
  canDecide, canDelete, onAct, emptyTitle, emptyMessage,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();

  function fromCell(d) {
    const p = d.sender_cell || "";
    return cellInfo(p, byCode, lang, d.sender_cell_names ? { code: p, names: d.sender_cell_names, leader_name: d.sender_leader_name } : null);
  }
  function toLabel(d) {
    if (d.target_type === "task") return t("staffCell.taskPrefix").replace("{name}", d.task_name || "—");
    const who = tl(d.target_manager_name || "") || "—";
    return d.target_cell ? `${who} · ${d.target_cell}` : who;
  }

  function actions(d) {
    const out = [];
    if (canDecide(d) && d.status === "draft") {
      out.push(
        <Button key="a" tint variant="success" size="sm" icon={<Check size={12} />}
          onClick={() => onAct(d, "approve")}>{t("staffCell.actApprove")}</Button>,
        <Button key="r" tint variant="danger" size="sm" icon={<X size={12} />}
          onClick={() => onAct(d, "reject")}>{t("staffCell.actReject")}</Button>,
      );
    }
    if (canDecide(d) && d.status === "approved") {
      out.push(
        <Button key="c" tint variant="secondary" size="sm" icon={<Ban size={12} />}
          onClick={() => onAct(d, "cancel")}>{t("staffCell.actCancel")}</Button>,
      );
    }
    if (canDelete(d)) {
      out.push(
        <Button key="d" tint variant="danger" size="sm" icon={<Trash2 size={12} />}
          onClick={() => onAct(d, "delete")}>{t("staff.delete")}</Button>,
      );
    }
    return out;
  }

  const cardCls = "rounded-2xl p-3.5";
  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

  function docCard(d) {
    const f = fromCell(d);
    return (
      <div key={d.id} className={`${cardCls} space-y-2`} style={cardStyle}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
            {t(DOC_TYPE_TKEY[realType(d)] || "staff.peopleExchange")}
          </span>
          {isTestDoc(d) && <TestChip />}
          <span className="ml-auto"><StatusChip status={d.status} /></span>
        </div>
        <div className="text-[11px] flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: "var(--text-3)" }}>
          <span>{fmtDateLabel(d.date)}</span>
          <span>·</span>
          <span className="font-mono" style={{ color: "var(--text-2)" }}>{f.code || t("staffCell.noCellGroup")}</span>
          <span>→</span>
          <span style={{ color: "var(--text-2)" }}>{toLabel(d)}</span>
          <span>·</span>
          <span>{d.employee_count} {t("staff.employeesWord")}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">{actions(d)}</div>
      </div>
    );
  }

  // The phone list is a real branch, not a fallback: `mobile` REPLACES the
  // table below sm, so its loading and empty states have to be rendered here
  // too — otherwise a phone shows a blank strip where the table's own message
  // sits, which reads as a page that failed rather than as an empty register.
  const mobile = isLoading
    ? [0, 1, 2].map((i) => (
      <div key={`sk-${i}`} className={cardCls} style={cardStyle}>
        <SkeletonBlock className="h-12 w-full" />
      </div>
    ))
    : rows.length === 0
      ? (
        <div className={cardCls} style={cardStyle}>
          <EmptyState showUploadLink={false} icon={FileText} title={emptyTitle} message={emptyMessage} />
        </div>
      )
      : rows.map(docCard);

  return (
    <TableCard
      icon={FileText}
      title={title}
      subtitle={subtitle}
      right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>
        {t("staff.showingRows").replace("{n}", String(rows.length))}
      </span>}
      mobile={mobile}
      mobileCards
      wrap
    >
      <thead>
        <tr>
          <Th label={t("staff.fDate")} />
          <Th label={t("staff.colDocType")} />
          <Th label={t("staffCell.colFrom")} icon={Boxes} />
          <Th label={t("staffCell.colTo")} />
          <Th label={t("staffCell.colPeople")} align="right" />
          <Th label={t("staff.colStatus")} />
          <Th label={t("staffCell.colActions")} />
        </tr>
      </thead>
      <tbody>
        {isLoading && [0, 1, 2, 3].map((i) => (
          <tr key={`sk-${i}`}>
            {[0, 1, 2, 3, 4, 5, 6].map((c) => (
              <td key={c} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td>
            ))}
          </tr>
        ))}
        {!isLoading && rows.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6">
              <EmptyState showUploadLink={false} icon={FileText} title={emptyTitle} message={emptyMessage} />
            </td>
          </tr>
        )}
        {!isLoading && rows.map((d) => {
          const f = fromCell(d);
          return (
            <tr key={d.id}>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{fmtDateLabel(d.date)}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <span style={{ color: "var(--text-2)" }}>{t(DOC_TYPE_TKEY[realType(d)] || "staff.peopleExchange")}</span>
                  {isTestDoc(d) && <TestChip />}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col leading-tight">
                  <CellCell info={f} />
                  <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                    {t("staffCell.leaderPrefix").replace("{name}", f.leader ? tl(f.leader) : t("staffCell.unassignedLeader"))}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{toLabel(d)}</td>
              <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{d.employee_count}</td>
              <td className="px-3 py-2"><StatusChip status={d.status} /></td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">{actions(d)}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );
}

// ── The page ──────────────────────────────────────────────────────────────────

const ACT_MSG = {
  approve: "staffCell.confirmApprove",
  reject:  "staffCell.confirmReject",
  cancel:  "staffCell.confirmCancel",
  delete:  "staffCell.confirmDelete",
};
const ACT_LABEL = {
  approve: "staffCell.actApprove",
  reject:  "staffCell.actReject",
  cancel:  "staffCell.actCancel",
  delete:  "staff.delete",
};

export default function StaffCells() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { seesAllOn } = useCapabilities();
  const qc = useQueryClient();
  const toast = useToast();

  const role       = auth?.role;
  const isAdmin    = role === "admin";
  const isShiftMgr = role === "shift-manager";
  // A personal grant at "all" on THIS page — never folded in from /staff, whose
  // scope answers a different question about a different set of endpoints.
  const seesAll    = seesAllOn("staff-cell");
  const picksSupervisor = isAdmin || isShiftMgr || seesAll;
  // Only a decider gets the Approvals queue; a leader files and reads, and the
  // backend refuses their decision anyway.
  const showApprovals = isAdmin || isShiftMgr || role === "supervisor";

  // Keys are NEW and prefixed staffcell_ — reusing a staff_ key would make the
  // two pages fight over one stored value.
  const [rawTab, setTab]   = usePersistentState("staffcell_tab", "workers");
  const [date, setDate]    = usePersistentState("staffcell_date", todayISO);
  const [managerId, setManagerId] = usePersistentState("staffcell_manager_id", null);
  const [cellPick, setCellPick]   = usePersistentState("staffcell_cell", "");
  const [sort, setSort]    = usePersistentState("staffcell_workers_sort", { key: "cell", dir: "asc" });
  const [query, setQuery]  = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [ask, setAsk]      = useState(null);   // {doc, action}
  const [askErr, setAskErr] = useState("");

  const tab = rawTab === "approvals" && !showApprovals ? "workers" : rawTab;

  // ── data ────────────────────────────────────────────────────────────────
  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["staffcell-attendance", date, managerId],
    queryFn: () => api.get("/api/staff-cells/attendance", {
      params: { attend_date: date, ...(managerId ? { manager_id: managerId } : {}) },
    }).then((r) => r.data),
    enabled: !!date,
  });

  const { data: docsRaw, isLoading: docsLoading } = useQuery({
    queryKey: ["staffcell-documents"],
    queryFn: () => api.get("/api/staff-cells/documents").then((r) => r.data),
    refetchInterval: 30_000,
  });
  const documents = useMemo(
    () => (Array.isArray(docsRaw) ? docsRaw : (docsRaw?.documents ?? [])),
    [docsRaw],
  );

  const allWorkers = useMemo(() => attData?.workers ?? [], [attData]);
  const byCode = useMemo(
    () => new Map((attData?.cells ?? []).filter((c) => c.verifix_code).map((c) => [normCode(c.verifix_code), c])),
    [attData],
  );

  // Every row carries its resolved cell once, so the column, the grouping, the
  // sort and the filter all read ONE answer to "which yacheyka is this".
  const rows = useMemo(() => allWorkers.map((w) => ({
    ...w,
    _cell: w.verifix_code ? cellInfo(w.verifix_code, byCode, lang, w.cell) : null,
  })), [allWorkers, byCode, lang]);

  // The page is NAMED for this dimension, so a day that carries none of it says
  // so out loud. Hiding the column instead would make "we have no codes for
  // this day" indistinguishable from "this day has no cells".
  const dayHasCodes = rows.some((w) => w.verifix_code);
  const noCodesDay  = rows.length > 0 && !dayHasCodes;

  // ── filters ─────────────────────────────────────────────────────────────
  const cellOptions = useMemo(() => {
    const seen = new Map();
    for (const w of rows) {
      if (!w.verifix_code || seen.has(w.verifix_code)) continue;
      const info = w._cell;
      seen.set(w.verifix_code, {
        value: w.verifix_code,
        label: [info.code, info.name].filter(Boolean).join(" · "),
      });
    }
    return [...seen.values()].sort((a, b) => a.value.localeCompare(b.value));
  }, [rows]);

  // A pick the (newly narrowed) day no longer offers is dropped: a control
  // naming a value the page cannot show is worse than a reset.
  useEffect(() => {
    if (cellPick && cellOptions.length && !cellOptions.some((o) => o.value === cellPick)) setCellPick("");
  }, [cellOptions, cellPick, setCellPick]);

  // Supervisor NAMES, off the roster payload itself (see the file header).
  // Preference order: the payload's own `supervisors` list — the whole in-scope
  // set, independent of the narrowing — then whatever the cells catalog and the
  // rows can name between them.
  const supervisors = useMemo(() => {
    const names = new Map();
    const add = (id, nm) => {
      if (id == null) return;
      const k = Number(id);
      const v = nm ? String(nm) : "";
      if (!names.has(k) || (!names.get(k) && v)) names.set(k, v);
    };
    for (const s of attData?.supervisors ?? []) add(s.manager_id, s.full_name ?? s.name);
    for (const c of attData?.cells ?? []) add(c.manager_id, c.manager_name ?? c.supervisor_name);
    for (const w of allWorkers) add(w.manager_id, w.manager_name);
    add(attData?.manager_id, attData?.manager_name);
    return [...names.entries()].map(([manager_id, full_name]) => ({ manager_id, full_name }));
  }, [attData, allWorkers]);

  // A unit the payload could not name is still offered — by its id, said out
  // loud. A filter row that renders blank is worse than an ugly one.
  const supLabel = (id) => {
    const s = supervisors.find((x) => x.manager_id === Number(id));
    return (s && tl(s.full_name)) || t("staffCell.unitNo").replace("{id}", String(id));
  };
  const supName = managerId != null ? supLabel(managerId) : "";

  // The pick is ALWAYS in the list, even once the server has narrowed the
  // payload down to it: a control naming a value its own list no longer offers
  // is how a page silently widens itself the next time it is touched.
  const supOptions = useMemo(() => {
    const opts = supervisors
      .map((s) => ({ value: s.manager_id, label: supLabel(s.manager_id) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    if (managerId != null && !opts.some((o) => o.value === managerId))
      opts.unshift({ value: managerId, label: supLabel(managerId) });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisors, managerId, tl, t]);

  const lockedCell = !picksSupervisor && cellOptions.length === 1 ? cellOptions[0] : null;

  const sections = [
    ...(picksSupervisor ? [{
      key: "supervisor",
      icon: UserRound,
      label: t("staffCell.filterSupervisor"),
      active: managerId != null,
      display: supName,
      onClear: () => { setManagerId(null); setCellPick(""); },
      render: ({ close } = {}) => (
        <PickFilter
          searchable
          close={close}
          value={managerId}
          onChange={(v) => { setManagerId(v); setCellPick(""); }}
          opts={[
            { value: null, label: t("staffCell.allSupervisors") },
            ...supOptions.map((o) => ({ ...o, title: String(o.label) })),
          ]}
        />
      ),
    }] : []),
    // The cell narrows UNDER the supervisor and says so. A viewer pinned to a
    // single cell gets an inert chip instead: a one-option control is not a
    // choice, and offering it suggests there are other cells to point at.
    ...(lockedCell ? [{
      key: "cell",
      icon: Boxes,
      static: true,
      label: t("staffCell.filterCell"),
      display: lockedCell.label,
    }] : [{
      key: "cell",
      icon: Boxes,
      label: t("staffCell.filterCell"),
      active: !!cellPick,
      display: cellOptions.find((o) => o.value === cellPick)?.label || "",
      onClear: () => setCellPick(""),
      render: ({ close } = {}) => (
        <PickFilter
          searchable
          close={close}
          value={cellPick}
          onChange={setCellPick}
          note={managerId != null
            ? t("staffCell.cellNarrowed").replace("{sup}", supName).replace("{n}", String(cellOptions.length))
            : null}
          empty={
            <div className="text-center py-2 space-y-2">
              <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("staffCell.noCellsHere")}</p>
              {managerId != null && (
                <Button variant="secondary" size="sm" onClick={() => { setManagerId(null); setCellPick(""); }}>
                  {t("staffCell.allSupervisors")}
                </Button>
              )}
            </div>
          }
          // An empty list is a REAL answer, so the "all cells" escape is only
          // offered when there is something to escape from — otherwise `empty`
          // never fires and a level narrowed to nothing reads as a bug.
          opts={cellOptions.length ? [{ value: "", label: t("staffCell.allCells") }, ...cellOptions] : []}
        />
      ),
    }]),
  ];

  // ── the roster on screen ────────────────────────────────────────────────
  // The cell filter is the page's SCOPE (the exchange inherits it); the search
  // box narrows only what is being read, and the modal carries its own.
  const scoped = useMemo(
    () => rows.filter((w) => !cellPick || w.verifix_code === cellPick),
    [rows, cellPick],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((w) => (w.worker_name || "").toLowerCase().includes(q));
  }, [scoped, query]);

  const cmp = {
    worker:   (a, b) => (tl(a.worker_name) || "").localeCompare(tl(b.worker_name) || ""),
    cell:     (a, b) => (a.verifix_code || "￿").localeCompare(b.verifix_code || "￿"),
    role:     (a, b) => (tl(a.job_title) || "").localeCompare(tl(b.job_title) || ""),
    schedule: (a, b) => (a.schedule || "").localeCompare(b.schedule || ""),
    clock:    (a, b) => (a.clock_in_out || "").localeCompare(b.clock_in_out || ""),
    hours:    (a, b) => (a.hours_worked ?? -1) - (b.hours_worked ?? -1),
    eff:      (a, b) => (a.effective_hours ?? -1) - (b.effective_hours ?? -1),
  };
  const sorted = useMemo(() => {
    const f = cmp[sort.key] || cmp.cell;
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...visible].sort((a, b) => dir * (f(a, b) || cmp.worker(a, b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sort]);

  function onSort(k) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  }

  // Grouping earns its space only while the cell axis is the one being read:
  // sorting by anything else flattens the table, so the order on screen is
  // always the order the header says it is.
  const groupByCell = sort.key === "cell" && cellOptions.length > 1;
  const groups = useMemo(() => {
    if (!groupByCell) return null;
    const m = new Map();
    for (const w of sorted) {
      const k = w.verifix_code || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
    return [...m.entries()];
  }, [sorted, groupByCell]);

  // ── documents ───────────────────────────────────────────────────────────
  // The frontend offers the buttons the backend is likely to accept; the
  // backend is the authority and a refusal lands inside the dialog.
  const canDecide = (d) =>
    isAdmin || isShiftMgr || (role === "supervisor" && d.target_manager_id === auth?.role_id);
  const canDelete = (d) =>
    isAdmin || (d.status === "draft" && d.created_by_telegram_id === auth?.telegram_id);

  const pending = useMemo(
    () => documents.filter((d) => d.status === "draft" && canDecide(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, role, auth?.role_id],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staffcell-documents"] });
    qc.invalidateQueries({ queryKey: ["staffcell-attendance"] });
  };
  const actMut = useMutation({
    mutationFn: ({ doc, action }) => api.post(`/api/staff-cells/documents/${doc.id}/${action}`),
    onSuccess: () => {
      setAsk(null); setAskErr("");
      invalidate();
      toast.success(t("staffCell.actionDone"));
    },
    onError: (e) => setAskErr(String(e?.response?.data?.detail || t("staffCell.actionFailed"))),
  });

  function openAct(doc, action) { setAskErr(""); setAsk({ doc, action }); }

  // The exchange is asked about ONE sender cell — the one the page is scoped to
  // — and the answer is fixed for the modal's life so the option list can never
  // move under a half-made decision.
  const probeCell = cellPick || scoped.find((w) => w.verifix_code)?.verifix_code || "";
  const canFile = dayHasCodes && scoped.some(isSelectable);

  const thProps = { sort, onSort };

  return (
    <Layout title={t("nav.staffCell")}>
      {/* Tabs — the shared view-tab template. No overflow wrapper: the track
          caps and scrolls itself, and a wrapper would hide the affordance. */}
      <SegmentedToggle
        asTabs
        className="mb-3"
        ariaLabel={t("nav.staffCell")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "workers", label: t("staff.tabWorkers") },
          { value: "requests", label: t("staff.tabRequests") },
          ...(showApprovals ? [{
            value: "approvals",
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t("staff.tabApprovals")}
                {pending.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#ef4444", color: "#fff", minWidth: 18, textAlign: "center" }}>
                    {pending.length}
                  </span>
                )}
              </span>
            ),
          }] : []),
        ]}
      />

      {/* Nothing moves today — said once, at the top, in one line. */}
      <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] leading-snug"
        style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "var(--text-2)" }}>
        <FlaskConical size={13} style={{ color: "#eab308", flexShrink: 0, marginTop: 1 }} />
        <span>{t("staffCell.sandboxNote")}</span>
      </div>

      {tab === "workers" && (
        <div className="space-y-4">
          {/* ── Toolbar: ONE row — day, FilterPanel (a DIRECT child of this
                flex row, or its fit check silently never unfolds), then chips.
                It belongs to the ROSTER: the register tabs span every day and
                every cell, and a control that narrows nothing they show would
                be a filter lying about its own reach. ───────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <DayStepper value={date} onChange={setDate} />
            <FilterPanel sections={sections} />
          </div>

          {noCodesDay && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[11px] leading-snug"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.30)", color: "var(--text-2)" }}>
              <AlertTriangle size={13} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
              <span>{t("staffCell.noCellCodes")}</span>
            </div>
          )}

          <TableCard
            icon={Users}
            title={t("staffCell.rosterTitle")}
            subtitle={attData?.manager_name ? tl(attData.manager_name) : undefined}
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>
              {t("staff.showingRows").replace("{n}", String(sorted.length))}
            </span>}
            toolbar={
              <>
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={t("staff.searchByName")}
                  className="w-full sm:w-64"
                />
                <Button
                  size="lg"
                  className="sm:ml-auto"
                  icon={<Plus size={14} />}
                  disabled={!canFile}
                  title={canFile ? undefined : t("staffCell.newExchangeDisabled")}
                  onClick={() => setExchangeOpen(true)}
                >
                  {t("staffCell.newExchange")}
                </Button>
              </>
            }
          >
            <thead>
              <tr>
                <Th label={t("staff.colEmployee")} k="worker" {...thProps} />
                <Th label={t("staff.colCell")} icon={Boxes} k="cell" {...thProps} />
                <Th label={t("staff.colRole")} k="role" {...thProps} />
                <Th label={t("staff.colSchedule")} k="schedule" {...thProps} />
                <Th label={t("staff.colClock")} k="clock" {...thProps} />
                <Th label={t("staff.colHours")} k="hours" align="right" {...thProps} />
                <Th label={t("staff.colEffHours")} k="eff" align="right" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {attLoading && [0, 1, 2, 3, 4].map((i) => (
                <tr key={`sk-${i}`}>
                  {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                    <td key={c} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!attLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6">
                    <EmptyState
                      showUploadLink={false}
                      icon={Users}
                      title={rows.length === 0 ? t("staffCell.emptyRosterTitle") : t("staffCell.noMatchTitle")}
                      message={rows.length === 0 ? t("staffCell.emptyRosterMsg") : t("staffCell.noMatchMsg")}
                    />
                  </td>
                </tr>
              )}
              {!attLoading && groups
                ? groups.map(([code, list]) => {
                  const info = cellInfo(code, byCode, lang, list[0]?.cell);
                  return (
                    <Fragment key={code || "_none"}>
                      <tr>
                        <td colSpan={7} className="px-3 py-1.5" style={{ background: "var(--bg-inner)" }}>
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            <Boxes size={11} style={{ color: "var(--brand-text)" }} />
                            <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-1)" }}>
                              {info.code || t("staffCell.noCellGroup")}
                            </span>
                            {info.name && <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{info.name}</span>}
                            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                              {t("staffCell.leaderPrefix").replace("{name}", info.leader ? tl(info.leader) : t("staffCell.unassignedLeader"))}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                              {t("staffCell.groupCount").replace("{n}", String(list.length))}
                            </span>
                          </span>
                        </td>
                      </tr>
                      {list.map((w) => <WorkerRow key={`${w.verifix_code || "_"}-${w.worker_name}`} w={w} tl={tl} t={t} />)}
                    </Fragment>
                  );
                })
                : !attLoading && sorted.map((w) => (
                  <WorkerRow key={`${w.verifix_code || "_"}-${w.worker_name}`} w={w} tl={tl} t={t} />
                ))}
            </tbody>
          </TableCard>

          {(attData?.extra_hours ?? 0) > 0 && (
            <p className="text-[11px] text-right" style={{ color: "var(--text-4)" }}>
              {t("staff.extraHoursNote").replace("{n}", String(attData.extra_hours))}
            </p>
          )}
          <div className="pb-16" />
        </div>
      )}

      {tab === "requests" && (
        <>
          <DocumentsTable
            title={t("staffCell.registerTitle")}
            rows={documents}
            isLoading={docsLoading}
            byCode={byCode}
            lang={lang}
            canDecide={canDecide}
            canDelete={canDelete}
            onAct={openAct}
            emptyTitle={t("staffCell.noRequestsTitle")}
            emptyMessage={t("staff.noDocuments")}
          />
          <div className="pb-16" />
        </>
      )}

      {tab === "approvals" && showApprovals && (
        <>
          <DocumentsTable
            title={t("staff.tabApprovals")}
            subtitle={t("staffCell.approvalsHint")}
            rows={pending}
            isLoading={docsLoading}
            byCode={byCode}
            lang={lang}
            canDecide={canDecide}
            canDelete={canDelete}
            onAct={openAct}
            emptyTitle={t("staffCell.noApprovalsTitle")}
            emptyMessage={t("staffCell.noApprovalsMsg")}
          />
          <div className="pb-16" />
        </>
      )}

      {exchangeOpen && (
        <ExchangeModal
          date={date}
          workers={scoped}
          byCode={byCode}
          probeCell={probeCell}
          lang={lang}
          onClose={() => setExchangeOpen(false)}
          onSaved={(n) => {
            setExchangeOpen(false);
            invalidate();
            toast.success(t("staffCell.saved").replace("{n}", String(n)));
            setTab("requests");
          }}
        />
      )}

      <ConfirmDialog
        open={!!ask}
        tone={ask?.action === "approve" ? "warning" : "danger"}
        icon={ask?.action === "approve" ? <Check size={20} /> : <AlertTriangle size={20} />}
        title={t(ACT_LABEL[ask?.action] || "staff.delete")}
        message={
          <>
            {t(ACT_MSG[ask?.action] || "staffCell.confirmDelete")}
            {ask?.doc && (
              <span className="block text-xs mt-2" style={{ color: "var(--text-3)" }}>
                {fmtDateLabel(ask.doc.date)} · {ask.doc.sender_cell || t("staffCell.noCellGroup")} → {ask.doc.target_cell || ask.doc.task_name || "—"}
                {" · "}
                {ask.doc.employee_count} {t("staff.employeesWord")}
              </span>
            )}
          </>
        }
        confirmLabel={t(ACT_LABEL[ask?.action] || "staff.delete")}
        cancelLabel={t("common.cancel")}
        loading={actMut.isPending}
        error={askErr || null}
        onCancel={() => { setAsk(null); setAskErr(""); }}
        onConfirm={() => ask && actMut.mutate(ask)}
      />

      {toast.node}
    </Layout>
  );
}

// One roster row, in both the grouped and the flat orders — so the two can
// never drift into showing different columns for the same worker.
function WorkerRow({ w, tl, t }) {
  return (
    <tr>
      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span>{tl(w.worker_name)}</span>
          {w.is_supervisor && (
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap"
              title={t("staffCell.supervisorRowHint")}
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
              {t("staffCell.supervisorRow")}
            </span>
          )}
          {w.on_task && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
              title={t("staff.onTask")}
              style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
              <Info size={9} /> {w.on_task}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2"><CellCell info={w._cell} /></td>
      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.job_title) || "—"}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.schedule) || "—"}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.clock_in_out) || "—"}</td>
      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{w.hours_worked ?? "—"}</td>
      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{w.effective_hours ?? "—"}</td>
    </tr>
  );
}
