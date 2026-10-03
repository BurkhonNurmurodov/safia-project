import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, FlaskConical, LogIn, LogOut, UserX, Clock, AlertTriangle, Timer,
  ArrowRightLeft, BadgeCheck, LayoutGrid, Lock, Unlock, Info, Loader2, FileSpreadsheet,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import FormField from "../components/ui/FormField";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DayStepper from "../components/ui/DayStepper";
import TimeField from "../components/ui/TimeField";
import TableCard, { Th } from "../components/ui/DataTable";
import { SkeletonTable, SkeletonBlock } from "../components/ui/Skeleton";
import { localISO } from "../components/ui/DateRangePicker";
import { useToast } from "../components/ui/Toast";
import { SupervisorSelect } from "./Staff";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";

/**
 * «Verifix to'g'irlash · Jonli» — the LAB copy of /staff (admin-only, from
 * 2026-10-01). The unit's day is read straight from Verifix (`/api/staff-live`,
 * `services/verifix_live.py`): who is inside, who left, who has not come, late
 * and early, hours so far — with a refresh button and an auto-refresh.
 *
 * Moves, role changes, cell placements and closing a day work here the way
 * the agreed live flow will (memory: verifix-api-integration): a change counts
 * from the time it states, a move is approved with its receiving cell, and the
 * day closes by itself an hour after the last check-out. All of it lands in
 * the lab's own tables — the real /staff, attendance and загрузка never see it.
 */

const AUTO_MS = 120_000;
const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
const n1 = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("ru-RU"));
const shiftISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
};
const fetchView = (managerId, day, force = false) => api.get("/api/staff-live/view", {
  params: { manager_id: managerId, ...(day ? { day } : {}), ...(force ? { force: true } : {}) },
}).then((r) => r.data);

const STATUS_TONE = {
  inside: "#22c55e",
  break: "#eab308",
  left: "#94a3b8",
  absent: "#ef4444",
  not_yet: "#94a3b8",
  off: "#94a3b8",
  moved_out: "#94a3b8",
  no_out: "#ef4444",
};

function Chip({ color, children, dashed = false, title }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{
        background: `${color}1f`, color,
        border: `1px ${dashed ? "dashed" : "solid"} ${color}66`,
      }}>
      {children}
    </span>
  );
}

function StatusChip({ status, t }) {
  const color = STATUS_TONE[status] || "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: "var(--text-2)" }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {t(`staffLive.st.${status}`)}
    </span>
  );
}

// ── the close bar ─────────────────────────────────────────────────────────────
function CloseBar({ close, t, onClose, onReopen, onRequests, busy }) {
  if (!close) return null;
  const s = close.state;
  const tone = s === "closed_manual" || s === "closed_auto" ? "#22c55e"
    : s === "held_missing" ? "#ef4444" : s === "held_pending" || s === "closing" ? "#eab308" : "#94a3b8";
  const text = fill(t(`staffLive.close.${s}`), {
    at: hhmm(close.at), last: hhmm(close.last_out), n: close.n, by: close.by || "—",
  });
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap min-h-[52px]"
      style={{ background: `${tone}14`, border: `1px solid ${tone}55` }}>
      {s === "closed_manual" || s === "closed_auto"
        ? <Lock size={16} style={{ color: tone }} className="flex-shrink-0" />
        : <Unlock size={16} style={{ color: tone }} className="flex-shrink-0" />}
      <span className="text-sm flex-1 min-w-[200px]" style={{ color: "var(--text-1)" }}>{text}</span>
      {s === "held_pending" && (
        <Button size="md" variant="secondary" onClick={onRequests}>{t("staffLive.tab.requests")}</Button>
      )}
      {s === "closed_manual" ? (
        <Button size="md" variant="secondary" loading={busy} onClick={onReopen}>{t("staffLive.close.reopen")}</Button>
      ) : s !== "closed_auto" && s !== "waiting" ? (
        <Button size="md" variant="primary" loading={busy} onClick={onClose}>{t("staffLive.close.closeNow")}</Button>
      ) : null}
    </div>
  );
}

// ── the change dialogs ────────────────────────────────────────────────────────
function ChangeModal({ mode, row, view, meta, onClose, onDone, t, tl, tx }) {
  const qc = useQueryClient();
  const [toUnit, setToUnit] = useState(null);
  const [toCell, setToCell] = useState("");
  const [toRole, setToRole] = useState("");
  const [at, setAt] = useState(hhmm(view?.now) || "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);

  const units = (meta?.units || []).filter((u) => u.id !== view?.unit?.id);
  const target = (meta?.units || []).find((u) => u.id === toUnit);
  const unitCells = view?.cells || [];

  const save = useMutation({
    mutationFn: () => api.post("/api/staff-live/events", {
      day: view.day, employee_id: row.employee_id, worker_name: row.name,
      kind: mode, at, from_manager_id: view.unit.id,
      from_cell: row.cell || null, from_role: row.role || null,
      ...(mode === "move" ? { to_manager_id: toUnit, to_cell: toCell || null } : {}),
      ...(mode === "role" ? { to_role: toRole } : {}),
      ...(mode === "cell" ? { to_cell: toCell } : {}),
      note: note || null,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-live-view"] });
      qc.invalidateQueries({ queryKey: ["staff-live-events"] });
      onDone(t(mode === "cell" ? "staffLive.t.saved" : "staffLive.t.created"));
    },
    onError: (e) => setErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  const ready = !!at && (mode === "move" ? !!toUnit : mode === "role" ? !!toRole.trim() : !!toCell);
  const title = t(`staffLive.m.${mode}Title`);

  return (
    <Modal open onClose={onClose} title={title} subtitle={tl(row.name)} icon={<ArrowRightLeft size={18} />}
      footer={(
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={save.isPending} disabled={!ready} onClick={() => { setErr(null); save.mutate(); }}>
            {t(mode === "cell" ? "staffLive.m.save" : "staffLive.m.create")}
          </Button>
        </div>
      )}>
      {mode === "move" && (
        <>
          <FormField label={t("staffLive.m.toUnit")} required>
            <StyledSelect searchable value={toUnit} onChange={(v) => { setToUnit(v); setToCell(""); }}
              placeholder={t("staffLive.pickUnit")}
              options={units.map((u) => ({ value: u.id, label: `S${u.shift ?? "?"} · ${tl(u.name)}` }))} />
          </FormField>
          <FormField label={t("staffLive.m.toCell")} hint={t("staffLive.m.toCellHint")}>
            <StyledSelect value={toCell} onChange={setToCell} disabled={!target}
              placeholder="—"
              options={[{ value: "", label: "—" }, ...(target?.cells || []).map((c) => ({ value: c, label: c }))]} />
          </FormField>
        </>
      )}
      {mode === "role" && (
        <FormField label={t("staffLive.m.toRole")} required hint={row.role ? fill(t("staffLive.m.nowRole"), { role: tx(row.role) }) : undefined}>
          <StyledSelect searchable value={toRole} onChange={setToRole} placeholder="—"
            options={(meta?.jobs || []).map((j) => ({ value: j, label: tx(j) }))} />
        </FormField>
      )}
      {mode === "cell" && (
        <FormField label={t("staffLive.m.toCell")} required>
          <StyledSelect value={toCell} onChange={setToCell} placeholder="—"
            options={unitCells.filter((c) => c.code !== row.cell).map((c) => ({ value: c.code, label: c.code }))} />
        </FormField>
      )}
      <FormField label={t("staffLive.m.at")} required hint={t("staffLive.m.atHint")}>
        <TimeField value={at} onChange={setAt} clearable={false} />
      </FormField>
      {mode !== "cell" && (
        <FormField label={t("staffLive.m.note")}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
        </FormField>
      )}
      {err && <div className="text-xs" style={{ color: "#ef4444" }}>{err}</div>}
    </Modal>
  );
}

function ApproveMoveModal({ ev, meta, onClose, onDone, t, tl }) {
  const qc = useQueryClient();
  const [cell, setCell] = useState(ev.to_cell || "");
  const [err, setErr] = useState(null);
  const target = (meta?.units || []).find((u) => u.id === ev.to_manager_id);
  const go = useMutation({
    mutationFn: () => api.post(`/api/staff-live/events/${ev.id}/decide`, { action: "approve", to_cell: cell }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-live-view"] });
      qc.invalidateQueries({ queryKey: ["staff-live-events"] });
      onDone(t("staffLive.t.approved"));
    },
    onError: (e) => setErr(e?.response?.data?.detail || String(e?.message || e)),
  });
  return (
    <Modal open onClose={onClose} title={t("staffLive.m.approveTitle")}
      subtitle={`${tl(ev.worker_name || "")} · ${tl(ev.from_unit || "")} → ${tl(ev.to_unit || "")} · ${ev.at}`}
      footer={(
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={go.isPending} disabled={!cell} onClick={() => { setErr(null); go.mutate(); }}>
            {t("staffLive.m.approve")}
          </Button>
        </div>
      )}>
      <FormField label={t("staffLive.m.toCell")} required hint={t("staffLive.m.approveHint")}>
        <StyledSelect value={cell} onChange={setCell} placeholder="—"
          options={(target?.cells || []).map((c) => ({ value: c, label: c }))} />
      </FormField>
      {err && <div className="text-xs" style={{ color: "#ef4444" }}>{err}</div>}
    </Modal>
  );
}

// ── the requests tab ──────────────────────────────────────────────────────────
function RequestsTab({ view, meta, t, tl, tx, toast }) {
  const qc = useQueryClient();
  const day = view?.day;
  const unitId = view?.unit?.id;
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["staff-live-events", unitId, day],
    queryFn: () => api.get("/api/staff-live/events", { params: { day, manager_id: unitId } }).then((r) => r.data),
    enabled: !!day && !!unitId,
  });
  const [approve, setApprove] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const decide = useMutation({
    mutationFn: ({ id, action }) => api.post(`/api/staff-live/events/${id}/decide`, { action }).then((r) => r.data),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["staff-live-view"] });
      qc.invalidateQueries({ queryKey: ["staff-live-events"] });
      toast(t(v.action === "approve" ? "staffLive.t.approved" : "staffLive.t.rejected"), "success");
    },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });
  const [delErr, setDelErr] = useState(null);
  const del = useMutation({
    mutationFn: (id) => api.delete(`/api/staff-live/events/${id}`).then((r) => r.data),
    onSuccess: () => {
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["staff-live-view"] });
      qc.invalidateQueries({ queryKey: ["staff-live-events"] });
      toast(t("staffLive.t.deleted"), "success");
    },
    onError: (e) => setDelErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  const change = (ev) => {
    if (ev.kind === "move") return `${tl(ev.from_unit || "—")} → ${tl(ev.to_unit || "—")}${ev.to_cell ? ` · ${ev.to_cell}` : ""}`;
    if (ev.kind === "role") return `${tx(ev.from_role || "—")} → ${tx(ev.to_role || "—")}`;
    return `${ev.from_cell || "—"} → ${ev.to_cell || "—"}`;
  };
  const sTone = { pending: "#eab308", approved: "#22c55e", rejected: "#ef4444" };

  return (
    <>
      <TableCard icon={ArrowRightLeft} title={t("staffLive.r.title")} minWidth={860}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{events.length}</span>}>
        <thead>
          <tr>
            <Th label={t("staffLive.r.c.at")} />
            <Th label={t("staffLive.r.c.worker")} />
            <Th label={t("staffLive.r.c.kind")} />
            <Th label={t("staffLive.r.c.change")} />
            <Th label={t("staffLive.r.c.status")} />
            <Th label={t("staffLive.r.c.by")} />
            <Th label="" align="right" />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7}><SkeletonTable rows={3} cols={5} /></td></tr>
          ) : events.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("staffLive.r.empty")}</td></tr>
          ) : events.map((ev) => (
            <tr key={ev.id}>
              <td className="px-3 py-2 tabular-nums">{ev.at}</td>
              <td className="px-3 py-2">{tl(ev.worker_name || "")}</td>
              <td className="px-3 py-2">{t(`staffLive.r.kind.${ev.kind}`)}</td>
              <td className="px-3 py-2 font-mono text-[11px]">{change(ev)}</td>
              <td className="px-3 py-2"><Chip color={sTone[ev.status] || "#94a3b8"}>{t(`staffLive.r.status.${ev.status}`)}</Chip></td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                {ev.created_by || "—"}
                {ev.decided_by && ev.kind !== "cell" ? ` · ${ev.decided_by}` : ""}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {ev.status === "pending" && (
                  <span className="inline-flex gap-1.5 mr-1.5">
                    <Button size="sm" variant="success" tint
                      onClick={() => (ev.kind === "move" ? setApprove(ev) : decide.mutate({ id: ev.id, action: "approve" }))}>
                      {t("staffLive.m.approve")}
                    </Button>
                    <Button size="sm" variant="danger" tint onClick={() => decide.mutate({ id: ev.id, action: "reject" })}>
                      {t("staffLive.m.reject")}
                    </Button>
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setDelErr(null); setConfirmDel(ev); }}>
                  {t("staffLive.m.delete")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {approve && (
        <ApproveMoveModal ev={approve} meta={meta} t={t} tl={tl}
          onClose={() => setApprove(null)}
          onDone={(msg) => { setApprove(null); toast(msg, "success"); }} />
      )}
      <ConfirmDialog
        open={!!confirmDel}
        tone="danger"
        title={t("staffLive.m.deleteTitle")}
        message={confirmDel ? `${tl(confirmDel.worker_name || "")} · ${change(confirmDel)} · ${confirmDel.at}` : ""}
        confirmLabel={t("staffLive.m.delete")}
        loading={del.isPending}
        error={delErr}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => del.mutate(confirmDel.id)}
      />
    </>
  );
}

// ── the cells tab ─────────────────────────────────────────────────────────────
function CellsTab({ view, rows, t, tl, onCell }) {
  const groups = useMemo(() => {
    const by = new Map((view?.cells || []).map((c) => [c.code, []]));
    const none = [];
    for (const r of rows) {
      if (r.status === "moved_out") continue;
      if (r.cell && by.has(r.cell)) by.get(r.cell).push(r);
      else if (r.cell) by.set(r.cell, [...(by.get(r.cell) || []), r]);
      else none.push(r);
    }
    const out = [...by.entries()].map(([code, people]) => ({ code, people }));
    if (none.length) out.push({ code: null, people: none });
    return out;
  }, [view, rows]);

  if (!groups.length) {
    return <div className="text-sm py-10 text-center" style={{ color: "var(--text-3)" }}>{t("staffLive.cells.empty")}</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
      {groups.map((g) => {
        const inside = g.people.filter((p) => p.status === "inside" || p.status === "break").length;
        return (
          <div key={g.code || "none"} className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <LayoutGrid size={15} style={{ color: "var(--brand-text)" }} />
              <span className="font-mono text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                {g.code || t("staffLive.cells.none")}
              </span>
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                {fill(t("staffLive.cells.people"), { n: g.people.length, i: inside })}
              </span>
            </div>
            {g.people.length === 0 ? (
              <div className="px-3 py-3 text-xs" style={{ color: "var(--text-4)" }}>—</div>
            ) : (
              <ul>
                {g.people.map((p) => (
                  <li key={p.employee_id} className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }}>{tl(p.name)}</span>
                    <StatusChip status={p.status} t={t} />
                    <Button size="sm" variant="ghost" onClick={() => onCell(p)}>{t("staffLive.a.cell")}</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── the page ──────────────────────────────────────────────────────────────────
export default function StaffLive() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const [tab, setTab] = usePersistentState("staff_live_tab", "workers");
  const [unitId, setUnitId] = usePersistentState("staff_live_unit", null);
  const [day, setDay] = useState(null);                      // null = the unit's shift-day
  const [auto, setAuto] = usePersistentState("staff_live_auto", "on");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);                // {mode, row}
  const [confirmClose, setConfirmClose] = useState(false);
  const [openRow, setOpenRow] = useState(null);             // the row whose raw Verifix data is shown

  const { data: meta } = useQuery({
    queryKey: ["staff-live-meta"],
    queryFn: () => api.get("/api/staff-live/meta").then((r) => r.data),
    staleTime: 300_000,
  });
  const supervisors = useMemo(
    () => (meta?.units || []).map((u) => ({ manager_id: u.id, full_name: u.name, shift: u.shift })),
    [meta],
  );

  // No placeholder from the previous key: a new date or brigadir shows a
  // skeleton at once, never the last day's table under the new day's label.
  const viewKey = ["staff-live-view", unitId, day];
  const view = useQuery({
    queryKey: viewKey,
    queryFn: () => fetchView(unitId, day),
    enabled: !!unitId,
    staleTime: 60_000,
    refetchInterval: auto === "on" ? AUTO_MS : false,
    refetchIntervalInBackground: false,
  });
  const data = view.data && !view.data.error && view.data.unit?.id === unitId ? view.data : null;
  const error = view.data?.error;
  // The unit's own day (its first load) keeps the stepper in place while
  // another day is loading.
  const base = qc.getQueryData(["staff-live-view", unitId, null]);
  const stepDay = day || data?.day || base?.day || null;
  const maxDay = data?.today || base?.today;

  // Stepping BACK is the common move: the day before is fetched in the
  // background, so it opens at once.
  const prevDay = data ? shiftISO(data.day, -1) : null;
  useEffect(() => {
    if (!unitId || !prevDay) return;
    qc.prefetchQuery({
      queryKey: ["staff-live-view", unitId, prevDay],
      queryFn: () => fetchView(unitId, prevDay),
      staleTime: 60_000,
    });
  }, [qc, unitId, prevDay]);

  const refresh = useMutation({
    mutationFn: () => fetchView(unitId, day, true),
    onSuccess: (res) => qc.setQueryData(viewKey, res),
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const closeDay = useMutation({
    mutationFn: () => api.post("/api/staff-live/close", { manager_id: unitId, day: data.day }).then((r) => r.data),
    onSuccess: () => { setConfirmClose(false); qc.invalidateQueries({ queryKey: ["staff-live-view"] }); toast(t("staffLive.t.closed"), "success"); },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });
  const reopenDay = useMutation({
    mutationFn: () => api.delete("/api/staff-live/close", { params: { manager_id: unitId, day: data.day } }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-live-view"] }); toast(t("staffLive.t.reopened"), "success"); },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const rows = useMemo(() => data?.rows || [], [data]);
  const c = data?.counts || {};
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "inside") return r.status === "inside" || r.status === "break";
        if (filter === "left") return r.status === "left";
        if (filter === "absent") return r.status === "absent" || r.status === "not_yet";
        if (filter === "late") return !!r.late;
        if (filter === "early") return !!r.early_out;
        if (filter === "missing") return r.missing;
        if (filter === "moved") return r.status === "moved_out" || r.moved?.dir === "in";
        return r.status !== "off";
      })
      .filter((r) => !q || tl(r.name).toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q))
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)));
  }, [rows, filter, search, tl]);

  const filters = [
    ["all", `${t("staffLive.f.all")} · ${(c.total || 0) - (c.off || 0)}`],
    ["inside", `${t("staffLive.f.inside")} · ${c.inside || 0}`],
    ["left", `${t("staffLive.f.left")} · ${c.left || 0}`],
    ["absent", `${t("staffLive.f.absent")} · ${(c.absent || 0) + (c.not_yet || 0)}`],
    ["late", `${t("staffLive.f.late")} · ${c.late || 0}`],
    ["early", `${t("staffLive.f.early")} · ${c.early_out || 0}`],
    ["missing", `${t("staffLive.f.missing")} · ${c.missing || 0}`],
    ["moved", `${t("staffLive.f.moved")} · ${rows.filter((r) => r.status === "moved_out" || r.moved?.dir === "in").length}`],
  ];

  // Excel: the table exactly as it stands — filter, search, order and the
  // viewer's alphabet — rendered to text here; the server only lays it out.
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const headers = ["worker", "role", "cell", "schedule", "in", "late", "out", "earlyOut", "hours", "status", "note"]
        .map((k) => t(`staffLive.x.${k}`));
      const xrows = shown.map((r) => [
        tl(r.name),
        tx(r.role) || "",
        r.cell || "",
        r.begin && r.end ? `${r.begin}–${r.end}` : tx(r.schedule) || "",
        r.in || "",
        r.late || "",
        r.out || (r.status === "inside" || r.status === "break" ? t("staffLive.stillInside") : ""),
        r.early_out || "",
        r.hours != null ? Math.round(r.hours * 100) / 100 : "",
        t(`staffLive.st.${r.status}`),
        [
          r.missing ? t("staffLive.missing") : "",
          r.moved ? fill(t(r.moved.dir === "out" ? "staffLive.movedOut" : "staffLive.movedIn"),
            { unit: tl(r.moved.unit || "—"), t: r.moved.at }) : "",
          r.pending?.length ? fill(t("staffLive.pending"), { n: r.pending.length }) : "",
          r.so_far && r.hours != null ? t("staffLive.x.soFar") : "",
        ].filter(Boolean).join("; "),
      ]);
      const filterLabel = (filters.find(([v]) => v === filter) || [, ""])[1];
      const via = await exportXlsx("/api/staff-live/export.xlsx", {
        body: {
          title: fill(t("staffLive.tableTitle"), { unit: tl(data.unit.name) }),
          subtitle: [data.day, filterLabel, search.trim() ? `«${search.trim()}»` : "",
            fill(t("staffLive.updated"), { time: (data.pulled_at || "").slice(11, 16) })].filter(Boolean).join(" · "),
          headers,
          numeric: [5, 7, 8],
          rows: xrows,
          filename: `verifix_live_${data.day}.xlsx`,
        },
        fallbackName: `verifix_live_${data.day}.xlsx`,
      });
      toast(t(via === "download" ? "staff.exportDownloaded" : "staff.exportToast"), "success");
    } catch (e) {
      toast(`${t("staffLive.x.failed")}: ${e?.response?.data?.detail || e?.message || ""}`, "error");
    } finally {
      setExporting(false);
    }
  };


  const toolbar = (
    <div className="flex items-center gap-2 flex-wrap">
      <SupervisorSelect value={unitId} onChange={(v) => { setUnitId(v); setDay(null); }} supervisors={supervisors} />
      {stepDay ? (
        <DayStepper value={stepDay} onChange={(iso) => setDay(iso)} max={maxDay} />
      ) : unitId ? (
        <SkeletonBlock className="h-[38px] w-[340px] rounded-xl" />
      ) : null}
      <Button size="lg" variant="primary" icon={RefreshCw} loading={refresh.isPending}
        disabled={!unitId} onClick={() => refresh.mutate()}>
        {t("staffLive.refresh")}
      </Button>
      <SegmentedToggle value={auto} onChange={setAuto}
        options={[["on", t("staffLive.autoOn")], ["off", t("staffLive.autoOff")]]} />
      {unitId && (
        <span className="text-xs tabular-nums inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
          {(view.isFetching || refresh.isPending) && <Loader2 size={13} className="animate-spin" />}
          {view.isFetching || refresh.isPending
            ? t("staffLive.loading")
            : data ? fill(t("staffLive.updated"), { time: (data.pulled_at || "").slice(11, 16) }) : ""}
        </span>
      )}
    </div>
  );

  return (
    <Layout title={t("nav.staffLive")}>
      <div className="space-y-4">
        <div className="rounded-xl px-3 py-2.5 text-[13px] flex gap-2"
          style={{ background: "var(--bg-inner)", border: "1px dashed var(--border-md)", color: "var(--text-2)" }}>
          <FlaskConical size={16} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
          <span>{t("staffLive.lab")}</span>
        </div>

        <SegmentedToggle asTabs value={tab} onChange={setTab}
          options={[["workers", t("staffLive.tab.workers")], ["requests", t("staffLive.tab.requests")],
            ["cells", t("staffLive.tab.cells")]]} />

        {toolbar}

        {!unitId ? (
          <div className="text-sm py-12 text-center" style={{ color: "var(--text-3)" }}>{t("staffLive.pickUnit")}</div>
        ) : error ? (
          <div className="rounded-xl px-3 py-3 text-sm flex gap-2"
            style={{ background: "#ef444414", border: "1px solid #ef444455", color: "var(--text-1)" }}>
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <span>
              {error === "not_configured" ? t("staffLive.err.not_configured")
                : fill(t("staffLive.err.generic"), { msg: view.data?.message || error })}
            </span>
          </div>
        ) : !data ? (
          <div className="space-y-4" aria-busy="true">
            <SkeletonBlock className="h-[52px] rounded-xl" />
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-[112px] rounded-2xl" />)}
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SkeletonTable rows={10} cols={7} />
            </div>
          </div>
        ) : (
          <>
            <CloseBar close={data.close} t={t} busy={closeDay.isPending || reopenDay.isPending}
              onClose={() => setConfirmClose(true)} onReopen={() => reopenDay.mutate()}
              onRequests={() => setTab("requests")} />

            {tab === "workers" && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                  <KPICard icon={LogIn} color="#22c55e" label={t("staffLive.k.inside")} value={c.inside ?? 0}
                    sub={fill(t("staffLive.k.cameOf"), { n: c.came ?? 0 })} />
                  <KPICard icon={LogOut} color="#94a3b8" label={t("staffLive.k.left")} value={c.left ?? 0}
                    sub={c.moved_out ? fill(t("staffLive.k.movedOut"), { n: c.moved_out }) : " "} />
                  <KPICard icon={UserX} color="#ef4444" label={t("staffLive.k.absent")} value={(c.absent ?? 0) + (c.not_yet ?? 0)}
                    sub={c.not_yet ? fill(t("staffLive.k.notYet"), { n: c.not_yet }) : " "} />
                  <KPICard icon={Clock} color="#eab308" label={t("staffLive.k.late")} value={c.late ?? 0}
                    sub={fill(t("staffLive.k.earlyOut"), { n: c.early_out ?? 0 })} />
                  <KPICard icon={AlertTriangle} color="#ef4444" label={t("staffLive.k.missing")} value={c.missing ?? 0}
                    sub={fill(t("staffLive.k.missingSub"), { n: data.rules?.missing_after ?? 60 })} />
                  <KPICard icon={Timer} color="#C8973F" label={t("staffLive.k.hours")} value={n1(c.hours)}
                    sub={data.formula ? t("staffLive.k.hoursFormula") : t("staffLive.k.hoursClock")} />
                </div>

                <TableCard icon={BadgeCheck} title={fill(t("staffLive.tableTitle"), { unit: tl(data.unit.name) })}
                  minWidth={1080}
                  right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{shown.length}</span>}
                  toolbar={(
                    <div className="flex items-center gap-2 flex-wrap w-full">
                      <SegmentedToggle value={filter} onChange={setFilter} options={filters} />
                      <SearchInput value={search} onChange={setSearch} placeholder={t("staffLive.search")}
                        className="w-full sm:w-56 sm:ml-auto" />
                      <Button size="lg" variant="secondary" loading={exporting}
                        disabled={shown.length === 0}
                        icon={!exporting ? <FileSpreadsheet size={14} /> : null}
                        onClick={exportExcel} title={t("staffLive.x.export")} aria-label={t("staffLive.x.export")}>
                        <span className="hidden sm:inline">{t("staffLive.x.export")}</span>
                      </Button>
                    </div>
                  )}
                  footer={(
                    <div className="text-[11px] space-y-1 w-full" style={{ color: "var(--text-3)" }}>
                      <div>
                        {data.formula
                          ? fill(t("staffLive.hoursRule"), {
                            kinds: data.formula.names.map((k) => tx(k)).join(" + "),
                            pct: `${Math.round((data.formula.share || 0) * 100)}%`,
                          })
                          : t("staffLive.hoursClock")}
                      </div>
                      <div>{fill(t("staffLive.rules"), {
                        late: data.rules?.late_grace, early: data.rules?.early_grace,
                        miss: data.rules?.missing_after, close: data.rules?.close_after,
                      })}</div>
                      <div>
                        <div className="inline-flex items-center gap-1 font-semibold">
                          <Info size={11} /> {t("staffLive.diag")}
                        </div>
                        <div className="mt-1 tabular-nums">
                          {fill(t("staffLive.diagLine"), {
                            e: data.diag?.employees, r: data.diag?.report_rows, m: data.diag?.marks,
                            types: Object.entries(data.diag?.mark_types || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—",
                          })}
                        </div>
                        <div className="mt-0.5 tabular-nums">
                          {fill(t("staffLive.diagIn"), {
                            report: data.diag?.in_sources?.report || 0,
                            mark: data.diag?.in_sources?.mark || 0,
                          })}
                        </div>
                        <div className="mt-0.5 tabular-nums">
                          {fill(t("staffLive.diagOut"), {
                            report: data.diag?.out_sources?.report || 0,
                            mark: data.diag?.out_sources?.mark || 0,
                            last: data.diag?.out_sources?.last_mark || 0,
                          })}
                        </div>
                        {data.diag && !data.diag.directed && data.diag.marks > 0 && (
                          <div className="mt-0.5">{t("staffLive.diagUndirected")}</div>
                        )}
                      </div>
                    </div>
                  )}>
                  <thead>
                    <tr>
                      <Th label={t("staffLive.c.worker")} />
                      <Th label={t("staffLive.c.role")} />
                      <Th label={t("staffLive.c.cell")} />
                      <Th label={t("staffLive.c.schedule")} />
                      <Th label={t("staffLive.c.in")} />
                      <Th label={t("staffLive.c.out")} />
                      <Th label={t("staffLive.c.hours")} align="right" />
                      <Th label={t("staffLive.c.status")} />
                      <Th label="" align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
                        {rows.length ? t("staffLive.noMatch") : t("staffLive.noRows")}
                      </td></tr>
                    ) : shown.map((r) => (
                      <Fragment key={r.employee_id}>
                      <tr>
                        <td className="px-3 py-2">
                          <button type="button" className="text-left underline decoration-dotted underline-offset-2"
                            style={{ color: "var(--text-1)" }} title={t("staffLive.rawHint")}
                            onClick={() => setOpenRow((v) => (v === r.employee_id ? null : r.employee_id))}>
                            {tl(r.name)}
                          </button>
                          {(r.from || r.until) && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                              {r.from ? fill(t("staffLive.from"), { t: r.from }) : ""}
                              {r.from && r.until ? " · " : ""}
                              {r.until ? fill(t("staffLive.until"), { t: r.until }) : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                          {tx(r.role) || "—"}
                          {r.role_changes?.length > 0 && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                              {tx(r.role0)} → {r.role_changes.map((x) => `${tx(x.role)} (${x.at})`).join(" → ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--text-2)" }}>
                          {r.cell || "—"}
                          {r.cell_changes?.length > 0 && (
                            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                              {r.cell_changes.map((x) => `${x.cell || "—"} (${x.at})`).join(" → ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>
                          {r.begin && r.end ? `${r.begin}–${r.end}` : tx(r.schedule) || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.in
                            ? (r.in_src && r.in_src !== "report"
                              ? <span title={t("staffLive.inMark")} className="underline decoration-dotted underline-offset-2">{r.in}</span>
                              : r.in)
                            : "—"}
                          {r.late ? <span className="ml-1.5"><Chip color="#eab308">{fill(t("staffLive.lateMin"), { n: r.late })}</Chip></span> : null}
                          {r.early_in ? <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>{fill(t("staffLive.earlyIn"), { n: r.early_in })}</span> : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.out
                            ? (r.out_src && r.out_src !== "report"
                              ? <span title={t(r.out_src === "last_mark" ? "staffLive.outLastMark" : "staffLive.outMark")} className="underline decoration-dotted underline-offset-2">{r.out}</span>
                              : r.out)
                            : (r.status === "inside" || r.status === "break" ? <span style={{ color: "#22c55e" }}>{t("staffLive.stillInside")}</span> : "—")}
                          {r.early_out ? <span className="ml-1.5"><Chip color="#eab308">{fill(t("staffLive.earlyOut"), { n: r.early_out })}</Chip></span> : null}
                          {r.missing ? <span className="ml-1.5"><Chip color="#ef4444">{t("staffLive.missing")}</Chip></span> : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-right"
                          title={r.share != null && r.share < 1 ? fill(t("staffLive.shareHint"), { total: n1(r.hours_total) }) : undefined}>
                          {r.hours != null ? n1(r.hours) : "—"}
                          {r.so_far && r.hours != null ? <span style={{ color: "var(--text-3)" }}>*</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1 items-start">
                            <StatusChip status={r.status} t={t} />
                            {r.moved && (
                              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                                {fill(t(r.moved.dir === "out" ? "staffLive.movedOut" : "staffLive.movedIn"),
                                  { unit: tl(r.moved.unit || "—"), t: r.moved.at })}
                              </span>
                            )}
                            {r.pending?.length > 0 && (
                              <Chip color="#eab308" dashed title={r.pending.map((p) => `${t(`staffLive.r.kind.${p.kind}`)} ${p.at}`).join(", ")}>
                                {fill(t("staffLive.pending"), { n: r.pending.length })}
                              </Chip>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.status !== "moved_out" && (
                            <span className="inline-flex gap-1.5">
                              <Button size="sm" variant="secondary" tint onClick={() => setDialog({ mode: "move", row: r })}>
                                {t("staffLive.a.move")}
                              </Button>
                              <Button size="sm" variant="secondary" tint onClick={() => setDialog({ mode: "role", row: r })}>
                                {t("staffLive.a.role")}
                              </Button>
                            </span>
                          )}
                        </td>
                      </tr>
                      {openRow === r.employee_id && r.raw && (
                        <tr>
                          <td colSpan={9} className="px-3 py-2" style={{ background: "var(--bg-inner)" }}>
                            <div className="text-[11px] font-mono space-y-1 whitespace-normal" style={{ color: "var(--text-2)" }}>
                              <div>
                                {t("staffLive.rawReport")}: in {r.raw.report?.input_time || "—"} · out {r.raw.report?.output_time || "—"}
                                {" · "}{r.raw.report?.begin_time || "—"} → {r.raw.report?.end_time || "—"}
                                {" · "}{r.raw.report?.day_kind || "—"}
                              </div>
                              <div>{t("staffLive.rawWindow")}: {(r.raw.window || []).map((x) => (x || "—").replace("T", " ")).join(" → ")}</div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                <span>{fill(t("staffLive.rawMarks"), { n: r.raw.marks_total ?? 0 })}:</span>
                                {(r.raw.marks || []).length === 0 ? <span>—</span> : r.raw.marks.map(([tm, type, inWin], i) => (
                                  <span key={i} style={{ opacity: inWin ? 1 : 0.5 }}>{tm} {type || "?"}</span>
                                ))}
                              </div>
                              <div>
                                {t("staffLive.rawFacts")}: {Object.entries(r.raw.facts || {}).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </TableCard>
                {rows.some((r) => r.so_far) && (
                  <div className="text-[11px] px-1" style={{ color: "var(--text-3)" }}>{t("staffLive.soFarNote")}</div>
                )}
              </>
            )}

            {tab === "requests" && (
              <RequestsTab view={data} meta={meta} t={t} tl={tl} tx={tx} toast={toast} />
            )}

            {tab === "cells" && (
              <CellsTab view={data} rows={rows} t={t} tl={tl}
                onCell={(row) => setDialog({ mode: "cell", row })} />
            )}
          </>
        )}
      </div>

      {dialog && data && (
        <ChangeModal mode={dialog.mode} row={dialog.row} view={data} meta={meta} t={t} tl={tl} tx={tx}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); toast(msg, "success"); }} />
      )}
      <ConfirmDialog
        open={confirmClose}
        title={t("staffLive.close.confirmTitle")}
        message={t("staffLive.close.confirmBody")}
        confirmLabel={t("staffLive.close.closeNow")}
        loading={closeDay.isPending}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => closeDay.mutate()}
      />
      {toastNode}
    </Layout>
  );
}
