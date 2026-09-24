/**
 * «Imtihon» — the admin destination (/admin/upload?tab=exam). Three sub-tabs:
 * Natijalar (every attempt, drill-down, cancel, Excel) · Tayinlash (a
 * shift → unit → leader tree, a deadline, a note) · Vazifalar banki (the
 * pass mark, the badge switch, and each of the fifty tasks on or off).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Users, ListChecks, Calendar, FileSpreadsheet, XCircle, Send, Save, Clock, Filter, Layers, BadgeCheck,
} from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { exportXlsx } from "../../utils/exportXlsx";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useAdminDirty } from "./AdminPanel";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import KPICard from "../../components/ui/KPICard";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import SearchInput from "../../components/ui/SearchInput";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FormField from "../../components/ui/FormField";
import RequestStateChip from "../../components/ui/RequestStateChip";
import CheckboxTree, { CheckBox, collectLeafKeys, filterGroups } from "../../components/ui/CheckboxTree";
import DateRangePicker, { localISO } from "../../components/ui/DateRangePicker";
import { FilterPanel, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { AREAS, ATTEMPT_STATE, TASK_STATE, areaOf, fill } from "../../components/exam/examAreas";

const STATUSES = ["assigned", "running", "submitted", "expired", "cancelled"];

/** A card with the platform's SectionHead and an optional toolbar row, for
 *  content that is not a table (TableCard wraps its children in <table>). */
function Card({ icon, title, right, toolbar, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} right={right} />
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>{toolbar}</div>
      )}
      {children}
    </div>
  );
}
const fmtDT = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");
const fmtMin = (s) => `${Math.round((s || 0) / 60)}`;

export default function ExamAdmin() {
  const { t } = useLang();
  const [tab, setTab] = usePersistentState("exam_admin_tab", "results");
  const [prefill, setPrefill] = useState(null);
  return (
    <div className="space-y-4">
      <SegmentedToggle
        asTabs
        value={tab}
        onChange={setTab}
        options={[["results", t("exam.admin.results")], ["assign", t("exam.admin.assign")], ["bank", t("exam.admin.bank")]]}
      />
      {tab === "results" && <Results onReassign={(k) => { setPrefill(k); setTab("assign"); }} />}
      {/* Stays on this tab after a send: the toast naming what happened lives here. */}
      {tab === "assign" && <Assign prefill={prefill} onDone={() => setPrefill(null)} />}
      {tab === "bank" && <Bank />}
    </div>
  );
}

// ── Natijalar ─────────────────────────────────────────────────────────────────

function Results({ onReassign }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [shift, setShift] = usePersistentState("exam_admin_shift", null);
  const [status, setStatus] = usePersistentState("exam_admin_status", null);
  const [unit, setUnit] = usePersistentState("exam_admin_unit", null);
  const [sort, setSort] = usePersistentState("exam_admin_sort", { key: "assigned_at", dir: "desc" });
  const [detail, setDetail] = useState(null);
  const [cancelId, setCancelId] = useState(null);

  const res = useQuery({ queryKey: ["exam-admin-results"], queryFn: () => api.get("/admin/exam/results").then((r) => r.data) });
  const rows = res.data?.rows || [];

  const units = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { if (r.manager_id) m.set(r.manager_id, r.unit); });
    return [...m.entries()].map(([value, label]) => ({ value: String(value), label: tl(label) }));
  }, [rows, tl]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) =>
      (shift == null || r.shift === shift)
      && (!status || r.status === status)
      && (!unit || String(r.manager_id) === unit)
      && (!needle || `${r.leader} ${r.unit || ""}`.toLowerCase().includes(needle)));
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r) => {
      switch (sort.key) {
        case "leader": return r.leader || "";
        case "unit": return r.unit || "";
        case "status": return STATUSES.indexOf(r.status);
        case "score": return r.score_pct ?? -1;
        case "deadline": return r.deadline || "";
        case "seconds": return r.seconds || 0;
        default: return r.assigned_at || "";
      }
    };
    out = [...out].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
    return out;
  }, [rows, q, shift, status, unit, sort]);

  const onSort = (k) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }));

  const kpi = useMemo(() => {
    const done = shown.filter((r) => r.status === "submitted" || r.status === "expired");
    const passed = done.filter((r) => r.passed).length;
    const avg = done.length ? Math.round(done.reduce((s, r) => s + (r.score_pct || 0), 0) / done.length) : null;
    return { assigned: shown.length, done: done.length, passed, avg };
  }, [shown]);

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/admin/exam/attempts/${id}/cancel`),
    onSuccess: () => { setCancelId(null); qc.invalidateQueries({ queryKey: ["exam-admin-results"] }); toast.success(t("exam.admin.cancelled")); },
  });

  const exportFile = async () => {
    try {
      const labels = {
        leader: t("exam.admin.col.leader"), unit: t("exam.admin.col.unit"), shift: t("exam.admin.col.shift"),
        assigned_at: t("exam.admin.col.assigned"), deadline: t("exam.admin.col.deadline"), status: t("exam.admin.col.status"),
        score_pct: t("exam.admin.col.score"), passed: t("exam.admin.col.passed"), seconds: t("exam.admin.col.minutes"),
        submitted_at: t("exam.admin.col.submitted"), yes: t("common.yes"), no: t("common.no"),
      };
      const status_labels = Object.fromEntries(STATUSES.map((s) => [s, t(ATTEMPT_STATE[s].key)]));
      const where = await exportXlsx("/admin/exam/results.xlsx", { body: { ids: shown.map((r) => r.id), labels, status_labels }, fallbackName: "imtihon.xlsx" });
      toast.success(where === "telegram" ? t("exam.admin.sentTg") : t("exam.admin.downloaded"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("exam.err"));
    }
  };

  const sections = [
    {
      key: "shift", icon: Clock, label: t("filter.shift"), active: shift != null,
      display: shift != null ? `${t("filter.shift")} ${shift}` : "",
      onClear: () => setShift(null),
      render: ({ close }) => (
        <PickFilter opts={[{ value: 1, label: `${t("filter.shift")} 1` }, { value: 2, label: `${t("filter.shift")} 2` }]}
                    value={shift} onChange={setShift} close={close} />
      ),
    },
    {
      key: "unit", icon: Users, label: t("exam.admin.col.unit"), active: !!unit,
      display: units.find((u) => u.value === unit)?.label || "",
      onClear: () => setUnit(null),
      render: ({ close }) => <PickFilter opts={units} value={unit} onChange={setUnit} close={close} searchable />,
    },
    {
      key: "status", icon: Filter, label: t("exam.admin.col.status"), active: !!status,
      display: status ? t(ATTEMPT_STATE[status].key) : "",
      onClear: () => setStatus(null),
      render: ({ close }) => (
        <PickFilter opts={STATUSES.map((s) => ({ value: s, label: t(ATTEMPT_STATE[s].key) }))} value={status} onChange={setStatus} close={close} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label={t("exam.admin.kpi.assigned")} value={kpi.assigned} icon={GraduationCap} />
        <KPICard label={t("exam.admin.kpi.done")} value={kpi.done} icon={ListChecks} />
        <KPICard label={t("exam.admin.kpi.passed")} value={kpi.passed} icon={BadgeCheck} color="#22c55e" />
        <KPICard label={t("exam.admin.kpi.avg")} value={kpi.avg == null ? "—" : `${kpi.avg}%`} icon={Layers} />
      </div>
      <TableCard
        icon={GraduationCap}
        title={t("exam.admin.results")}
        right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{shown.length}</span>}
        toolbar={(
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput value={q} onChange={setQ} placeholder={t("exam.admin.search")} className="w-56" />
            <FilterPanel sections={sections} />
            <span className="flex-1" />
            <Button size="lg" variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportFile}>Excel</Button>
          </div>
        )}
      >
        {res.isLoading ? (
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <tr key={i}><td colSpan={8} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td></tr>
            ))}
          </tbody>
        ) : (
          <>
            <thead><tr>
              <Th label={t("exam.admin.col.leader")} k="leader" sort={sort} onSort={onSort} />
              <Th label={t("exam.admin.col.unit")} k="unit" sort={sort} onSort={onSort} />
              <Th label={t("exam.admin.col.assigned")} k="assigned_at" sort={sort} onSort={onSort} />
              <Th label={t("exam.admin.col.deadline")} k="deadline" sort={sort} onSort={onSort} />
              <Th label={t("exam.admin.col.status")} k="status" sort={sort} onSort={onSort} />
              <Th label={t("exam.admin.col.score")} k="score" sort={sort} onSort={onSort} align="right" />
              <Th label={t("exam.admin.col.minutes")} k="seconds" sort={sort} onSort={onSort} align="right" />
              <Th label="" k="actions" />
            </tr></thead>
            <tbody>
              {shown.map((r) => {
                const st = ATTEMPT_STATE[r.status] || ATTEMPT_STATE.assigned;
                const open = r.status === "assigned" || r.status === "running";
                return (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setDetail(r.id)}>
                    <td className="px-3 py-2 font-medium">{tl(r.leader)}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.unit ? tl(r.unit) : "—"}{r.shift ? ` · S${r.shift}` : ""}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{fmtDT(r.assigned_at)}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{r.deadline || "—"}</td>
                    <td className="px-3 py-2"><RequestStateChip state={st.chip} label={t(st.key)} /></td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: r.score_pct == null ? "var(--text-4)" : r.passed ? "#22c55e" : "#ef4444" }}>
                      {r.score_pct == null ? "—" : `${r.score_pct}%`}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-3)" }}>{fmtMin(r.seconds)}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {open
                          ? <Button size="sm" variant="danger" tint icon={<XCircle size={13} />} onClick={() => setCancelId(r.id)}>{t("exam.admin.cancel")}</Button>
                          : <Button size="sm" variant="secondary" tint icon={<Send size={13} />} onClick={() => onReassign(r.profile_key)}>{t("exam.admin.reassign")}</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{t("exam.admin.noRows")}</td></tr>}
            </tbody>
          </>
        )}
      </TableCard>
      {detail != null && <ResultDetail id={detail} onClose={() => setDetail(null)} />}
      {cancelId != null && (
        <ConfirmDialog
          tone="danger"
          title={t("exam.admin.cancel")}
          message={t("exam.admin.cancelConfirm")}
          confirmLabel={t("exam.admin.cancel")}
          loading={cancel.isPending}
          error={cancel.error?.response?.data?.detail}
          onCancel={() => setCancelId(null)}
          onConfirm={() => cancel.mutate(cancelId)}
        />
      )}
      {toast.node}
    </div>
  );
}

function ResultDetail({ id, onClose }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const d = useQuery({ queryKey: ["exam-admin-result", id], queryFn: () => api.get(`/admin/exam/results/${id}`).then((r) => r.data) });
  const data = d.data;
  return (
    <Modal open onClose={onClose} title={data ? tl(data.leader) : "…"} subtitle={data ? `${data.unit ? tl(data.unit) : ""} · ${t(ATTEMPT_STATE[data.status]?.key || "exam.attempt.assigned")}` : ""} maxWidth="max-w-2xl"
           footer={<Button variant="secondary" onClick={onClose}>{t("exam.close")}</Button>}>
      {!data ? <SkeletonTable rows={8} cols={3} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-[11px] uppercase" style={{ color: "var(--text-4)" }}>{t("exam.admin.col.score")}</div>
              <div className="font-semibold" style={{ color: data.score_pct == null ? "var(--text-4)" : data.passed ? "#22c55e" : "#ef4444" }}>{data.score_pct == null ? "—" : `${data.score_pct}%`}</div></div>
            <div><div className="text-[11px] uppercase" style={{ color: "var(--text-4)" }}>{t("exam.admin.col.minutes")}</div><div>{fmtMin(data.seconds)}</div></div>
            <div><div className="text-[11px] uppercase" style={{ color: "var(--text-4)" }}>{t("exam.admin.col.submitted")}</div><div>{fmtDT(data.submitted_at)}</div></div>
          </div>
          <div className="space-y-1">
            {data.tasks.map((x) => {
              const s = TASK_STATE[x.status] || TASK_STATE.open;
              const a = areaOf(x.area);
              return (
                <div key={x.key} className="flex items-start gap-2 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: a.color }} />
                  <span className="text-xs w-6 flex-shrink-0 pt-0.5" style={{ color: "var(--text-3)" }}>{x.n}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "var(--text-1)" }}>{t(`exam.t.${x.key}`)}</div>
                    {x.answer && <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{t("exam.admin.answer")}: {tx(String(x.answer))}</div>}
                    <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{fmtMin(x.seconds)} {t("exam.admin.min")} · {x.checks} {t("exam.admin.checks")}</div>
                  </div>
                  <RequestStateChip state={s.chip} size="xs" label={x.status === "unavailable" ? t(x.reason === "page" ? "exam.st.noPage" : "exam.st.noData") : t(s.key)} />
                </div>
              );
            })}
          </div>
          {data.written?.length > 0 && (
            <div>
              <div className="text-[11px] uppercase mb-1" style={{ color: "var(--text-4)" }}>{t("exam.admin.written")}</div>
              <ul className="text-sm space-y-1">
                {data.written.map((w, i) => (
                  <li key={i} style={{ color: "var(--text-2)" }}>
                    <span className="text-[11px] mr-1 px-1 rounded" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>{t(`exam.admin.kind.${w.kind}`)}</span>
                    {tx(w.text || "")}{w.worker ? ` — ${tl(w.worker)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.purged && <div className="text-xs" style={{ color: "var(--text-4)" }}>{t("exam.admin.purged")}</div>}
        </div>
      )}
    </Modal>
  );
}

// ── Tayinlash ─────────────────────────────────────────────────────────────────

function Assign({ prefill, onDone }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [sel, setSel] = useState(() => (prefill ? [prefill] : []));
  const [filter, setFilter] = useState("");
  const tomorrow = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return localISO(d); }, []);
  const [deadline, setDeadline] = useState(tomorrow);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  useAdminDirty(sel.length > 0 || note.trim().length > 0);

  const lq = useQuery({ queryKey: ["exam-admin-leaders"], queryFn: () => api.get("/admin/exam/leaders").then((r) => r.data) });
  const leaders = lq.data?.leaders || [];
  const taskCount = lq.data?.task_count || 0;

  const groups = useMemo(() => {
    const byShift = new Map();
    leaders.forEach((l) => {
      const s = l.shift || 0;
      const shiftG = byShift.get(s) || { key: `s${s}`, label: s ? `${t("filter.shift")} ${s}` : t("exam.admin.noShift"), children: new Map() };
      const uKey = `u${l.manager_id || 0}`;
      const unitG = shiftG.children.get(uKey) || { key: uKey, label: l.unit ? tl(l.unit) : t("exam.admin.noUnit"), children: [] };
      unitG.children.push({
        key: l.profile_key, label: tl(l.name),
        sub: l.open_attempt ? t("exam.admin.hasOpen") : (l.unavailable ? fill(t("exam.admin.unavailableN"), { n: l.unavailable }) : undefined),
        disabled: !!l.open_attempt,
      });
      shiftG.children.set(uKey, unitG);
      byShift.set(s, shiftG);
    });
    return [...byShift.values()].sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => ({ ...g, children: [...g.children.values()].sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [leaders, t, tl]);

  const picked = leaders.filter((l) => sel.includes(l.profile_key));
  const unavailable = picked.filter((l) => l.unavailable > 0).length;

  const assign = useMutation({
    mutationFn: () => api.post("/admin/exam/assign", { profile_keys: sel, deadline, note: note.trim() || null }).then((r) => r.data),
    onSuccess: (d) => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["exam-admin-results"] });
      qc.invalidateQueries({ queryKey: ["exam-admin-leaders"] });
      toast.success(fill(t("exam.admin.assigned"), { n: d.assigned.length, s: d.skipped.length }));
      setSel([]); setNote("");
      onDone();
    },
  });

  const selectVisible = () => setSel(collectLeafKeys(filterGroups(groups, filter)).filter((k) => !leaders.find((l) => l.profile_key === k)?.open_attempt));
  const minDeadline = localISO(new Date(Date.now() + 86400000));
  const deadlineOk = deadline && deadline >= minDeadline;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
      <Card icon={Users} title={t("exam.admin.pickLeaders")}
                 right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(t("exam.admin.selectedN"), { n: sel.length })}</span>}
                 toolbar={(
                   <div className="flex items-center gap-2 flex-wrap">
                     <SearchInput value={filter} onChange={setFilter} placeholder={t("exam.admin.searchLeader")} className="w-56" />
                     <Button size="lg" variant="ghost" onClick={selectVisible}>{t("exam.admin.selectVisible")}</Button>
                     <Button size="lg" variant="ghost" onClick={() => setSel([])}>{t("exam.admin.clear")}</Button>
                   </div>
                 )}>
        <div className="p-2">
          {lq.isLoading ? <SkeletonTable rows={8} cols={2} /> : (
            <CheckboxTree groups={groups} selected={sel} onChange={setSel} filter={filter} emptyText={t("exam.admin.noLeaders")} />
          )}
        </div>
      </Card>
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <FormField label={t("exam.admin.deadline")} required error={!deadlineOk ? t("exam.admin.deadlineMin") : null}>
          <DateRangePicker single dateFrom={deadline} setDateFrom={setDeadline} dateTo={deadline} setDateTo={() => {}} weekday />
        </FormField>
        <FormField label={t("exam.admin.note")} hint={t("exam.admin.noteHint")}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={400}
                    className="w-full rounded-xl px-3 py-2 text-sm"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
        </FormField>
        <div className="text-xs" style={{ color: "var(--text-3)" }}>
          {fill(t("exam.admin.preview"), { n: sel.length, m: taskCount, k: unavailable })}
        </div>
        <Button size="lg" className="w-full" icon={<Send size={16} />} disabled={!sel.length || !deadlineOk} onClick={() => setConfirm(true)}>
          {t("exam.admin.assignBtn")}
        </Button>
      </div>
      {confirm && (
        <ConfirmDialog
          title={t("exam.admin.assignBtn")}
          message={fill(t("exam.admin.assignConfirm"), { n: sel.length, d: deadline })}
          confirmLabel={t("exam.admin.assignBtn")}
          loading={assign.isPending}
          error={assign.error?.response?.data?.detail}
          onCancel={() => setConfirm(false)}
          onConfirm={() => assign.mutate()}
        />
      )}
      {toast.node}
    </div>
  );
}

// ── Vazifalar banki ───────────────────────────────────────────────────────────

function Bank() {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();
  const bq = useQuery({ queryKey: ["exam-admin-tasks"], queryFn: () => api.get("/admin/exam/tasks").then((r) => r.data) });
  const [draft, setDraft] = useState(null);       // Set of disabled keys
  const [mark, setMark] = useState(null);
  const [badge, setBadge] = useState(null);
  const tasks = bq.data?.tasks || [];
  const disabled = draft ?? new Set(tasks.filter((x) => !x.enabled).map((x) => x.key));
  const passMark = mark ?? bq.data?.pass_mark ?? 80;
  const badgeOn = badge ?? bq.data?.badge ?? false;
  const dirtyBank = draft != null && JSON.stringify([...draft].sort()) !== JSON.stringify(tasks.filter((x) => !x.enabled).map((x) => x.key).sort());
  const dirtySettings = (mark != null && mark !== bq.data?.pass_mark) || (badge != null && badge !== bq.data?.badge);
  useAdminDirty(dirtyBank || dirtySettings);

  const saveSettings = useMutation({
    mutationFn: () => api.put("/admin/settings", { exam_pass_mark: String(passMark), exam_badge: badgeOn ? "1" : "0" }),
    onSuccess: () => { setMark(null); setBadge(null); qc.invalidateQueries({ queryKey: ["exam-admin-tasks"] }); qc.invalidateQueries({ queryKey: ["exam-me"] }); toast.success(t("exam.admin.saved")); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });
  const saveBank = useMutation({
    mutationFn: () => api.put("/admin/exam/tasks", { disabled: [...disabled] }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ["exam-admin-tasks"] }); toast.success(t("exam.admin.saved")); },
    onError: (e) => toast.error(e?.response?.data?.detail || t("exam.err")),
  });

  const toggle = (key) => setDraft((d) => { const n = new Set(d ?? disabled); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const setArea = (area, on) => setDraft((d) => {
    const n = new Set(d ?? disabled);
    tasks.filter((x) => x.area === area).forEach((x) => (on ? n.delete(x.key) : n.add(x.key)));
    return n;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label={t("exam.admin.passMark")} hint={t("exam.admin.passMarkHint")}>
            <input type="number" min={0} max={100} value={passMark} onChange={(e) => setMark(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                   className="w-32 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
          </FormField>
          <FormField label={t("exam.admin.badge")} hint={t("exam.admin.badgeHint")}>
            <SegmentedToggle value={badgeOn ? "on" : "off"} onChange={(v) => setBadge(v === "on")}
                             options={[["off", t("exam.off")], ["on", t("exam.on")]]} size="sm" />
          </FormField>
        </div>
        <div className="flex justify-end">
          <Button icon={<Save size={15} />} disabled={!dirtySettings} loading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>{t("common.save")}</Button>
        </div>
      </div>

      <Card icon={ListChecks} title={t("exam.admin.bank")}
                 right={<span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(t("exam.admin.enabledN"), { n: tasks.length - disabled.size, m: tasks.length })}</span>}
                 toolbar={(
                   <div className="flex items-center gap-2 flex-wrap">
                     <span className="text-xs" style={{ color: "var(--text-3)" }}>{t("exam.admin.bankHint")}</span>
                     <span className="flex-1" />
                     <Button size="lg" icon={<Save size={15} />} disabled={!dirtyBank} loading={saveBank.isPending} onClick={() => saveBank.mutate()}>{t("common.save")}</Button>
                   </div>
                 )}>
        {bq.isLoading ? <SkeletonTable rows={10} cols={4} /> : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {AREAS.map((a) => {
              const list = tasks.filter((x) => x.area === a.key);
              if (!list.length) return null;
              return (
                <div key={a.key} className="px-3 py-2">
                  <div className="flex items-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-1)" }}>{a.letter} · {t(`exam.area.${a.key}`)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setArea(a.key, true)}>{t("exam.admin.allOn")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setArea(a.key, false)}>{t("exam.admin.allOff")}</Button>
                  </div>
                  {list.map((x) => {
                    const off = disabled.has(x.key);
                    return (
                      <div key={x.key} role="checkbox" aria-checked={!off} tabIndex={0}
                           onClick={() => toggle(x.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(x.key); } }}
                           className="flex items-start gap-2 py-1.5 px-1 rounded-lg cursor-pointer hover:bg-[var(--bg-inner)]"
                           style={{ opacity: off ? 0.55 : 1 }}>
                        <CheckBox state={off ? "off" : "on"} />
                        <span className="text-xs w-6 flex-shrink-0 pt-0.5" style={{ color: "var(--text-3)" }}>{x.n}</span>
                        <span className="text-sm flex-1" style={{ color: "var(--text-1)" }}>{t(`exam.t.${x.key}`)}</span>
                        <span className="text-[11px] flex-shrink-0 px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                          {t(`exam.kind.${x.kind}`)}{x.page ? ` · ${x.page}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {toast.node}
    </div>
  );
}
