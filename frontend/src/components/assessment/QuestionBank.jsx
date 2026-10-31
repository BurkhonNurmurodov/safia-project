import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Library, Pencil, Archive, ArchiveRestore, CheckCircle2, AlertTriangle } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { SkeletonTable } from "../ui/Skeleton";
import { FilterPanel, PickFilter } from "../ui/ColumnFilter";
import { useToast } from "../ui/Toast";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { useAT, fill, errText, DeptChip, TypeChip, DEPT_ICON, TYPE_ICON, fmtDate, VERDICT } from "./assessmentUtil";

const DEPTS = ["kaizen", "production", "tb", "hr", "okk"];
const TYPES = ["theory", "practical"];
const ALL = "all";

/** Does the bank fill a draw? One line per block: need vs have, ticked or not. */
function PoolCard({ pool, T }) {
  if (!pool) return null;
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: pool.ready ? VERDICT.pass.ink : VERDICT.fail.ink }}>
        {pool.ready ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
        {pool.ready ? T.bankReady : T.bankShort}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>{T.bankNeed}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {pool.blocks.map((b) => (
          <div key={b.key} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)" }}>
            <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{T.block[b.key]}</div>
            <ul className="mt-1 space-y-0.5">
              {b.parts.map((p) => {
                const ok = p.have >= p.need;
                return (
                  <li key={`${p.department || "all"}-${p.qtype || "any"}`} className="flex items-center justify-between gap-2 text-[11px]">
                    <span style={{ color: "var(--text-2)" }}>
                      {/* a department's own minimum, the block's total, or a single-department block's «any type» */}
                      {p.department ? `${T.dept[p.department]} · ${T.type[p.qtype]}`
                        : p.qtype ? `${T.partTotal} · ${T.type[p.qtype]}` : T.partAny}
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: ok ? VERDICT.pass.ink : VERDICT.fail.ink }}>
                      {fill(T.haveNeed, { have: p.have, need: p.need })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionModal({ initial, onClose, onSaved, T }) {
  const editing = !!initial?.id;
  const [dept, setDept] = useState(initial?.department || "kaizen");
  const [qtype, setQtype] = useState(initial?.qtype || "theory");
  const [text, setText] = useState(initial?.text || "");
  const [err, setErr] = useState(null);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).length;

  const save = useMutation({
    mutationFn: () => editing
      ? api.put(`/api/assessment/questions/${initial.id}`, { department: dept, qtype, text }).then((r) => r.data)
      : api.post("/api/assessment/questions", { department: dept, qtype, text }).then((r) => r.data),
    onSuccess: (d) => { onSaved(d, editing); onClose(); },
    onError: (e) => setErr(e),
  });

  return (
    <Modal open onClose={onClose} title={editing ? T.editTitle : T.addTitle}
      icon={editing ? <Pencil size={18} /> : <Plus size={18} />} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.cancel}</Button>
          <Button onClick={() => { setErr(null); save.mutate(); }} disabled={!text.trim()} loading={save.isPending}>
            {T.save}
          </Button>
        </>
      )}>
      <FormField label={T.colDept} required>
        <StyledSelect value={dept} onChange={setDept} ariaLabel={T.colDept}
          options={DEPTS.map((d) => {
            const Icon = DEPT_ICON[d];
            return { value: d, label: <span className="inline-flex items-center gap-1.5"><Icon size={13} />{T.dept[d]}</span>, title: T.dept[d] };
          })} />
      </FormField>
      <FormField label={T.colType} required>
        <SegmentedToggle value={qtype} onChange={setQtype} fill ariaLabel={T.colType}
          options={TYPES.map((t) => {
            const Icon = TYPE_ICON[t];
            return { value: t, label: <><Icon size={13} aria-hidden="true" />{T.type[t]}</> };
          })} />
      </FormField>
      <FormField label={T.qText} required hint={editing ? null : T.qTextHintMany}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={T.qTextPh}
          rows={editing ? 4 : 6} className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-y"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
        {!editing && lines > 1 && (
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>{fill(T.linesN, { n: lines })}</div>
        )}
      </FormField>
      {err && <div role="alert" className="text-xs" style={{ color: "var(--status-bad)" }}>{errText(err, T)}</div>}
    </Modal>
  );
}

export default function QuestionBank() {
  const T = useAT();
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [fDept, setFDept] = usePersistentState("assessment_bank_dept", ALL);
  const [fType, setFType] = usePersistentState("assessment_bank_type", ALL);
  const [fState, setFState] = usePersistentState("assessment_bank_state", "active");
  const [sort, setSort] = useState({ k: "dept", d: "asc" });
  const [editing, setEditing] = useState(null);   // {} = add, a row = edit

  const bank = useQuery({
    queryKey: ["assessment-bank"],
    queryFn: () => api.get("/api/assessment/questions").then((r) => r.data),
  });

  const archive = useMutation({
    mutationFn: (row) => api.post(`/api/assessment/questions/${row.id}/archive`, { archived: !row.archived_at }).then((r) => r.data),
    onSuccess: (_, row) => {
      qc.invalidateQueries({ queryKey: ["assessment-bank"] });
      toast.success(row.archived_at ? T.restoredT : T.archivedT);
    },
    onError: (e) => toast.error(errText(e, T)),
  });

  const rows = useMemo(() => {
    const all = bank.data?.rows || [];
    const needle = q.trim().toLowerCase();
    const f = all.filter((r) =>
      (fDept === ALL || r.department === fDept)
      && (fType === ALL || r.qtype === fType)
      && (fState === ALL || (fState === "active" ? !r.archived_at : !!r.archived_at))
      && (!needle || `${r.text} ${tx(r.text)}`.toLowerCase().includes(needle)));
    const key = (r) => sort.k === "dept" ? `${DEPTS.indexOf(r.department)}-${TYPES.indexOf(r.qtype)}-${String(1e9 - r.id).padStart(10, "0")}`
      : sort.k === "type" ? `${TYPES.indexOf(r.qtype)}-${DEPTS.indexOf(r.department)}`
      : sort.k === "used" ? r.used
      : sort.k === "text" ? r.text.toLowerCase()
      : r.created_at || "";
    const dir = sort.d === "asc" ? 1 : -1;
    return f.map((r) => [key(r), r]).sort((a, b) => (a[0] > b[0] ? dir : a[0] < b[0] ? -dir : 0)).map((x) => x[1]);
  }, [bank.data, q, fDept, fType, fState, sort, tx]);

  const onSort = (k) => setSort((s) => (s.k === k ? { k, d: s.d === "asc" ? "desc" : "asc" } : { k, d: k === "used" || k === "added" ? "desc" : "asc" }));

  const sections = [
    {
      key: "dept", icon: Library, label: T.fDept, active: fDept !== ALL,
      display: fDept === ALL ? T.allDepts : T.dept[fDept], onClear: () => setFDept(ALL),
      render: ({ close }) => (
        <PickFilter value={fDept} onChange={setFDept} close={close}
          opts={[{ value: ALL, label: T.allDepts }, ...DEPTS.map((d) => ({ value: d, label: T.dept[d] }))]} />
      ),
    },
    {
      key: "type", icon: TYPE_ICON.theory, label: T.fType, active: fType !== ALL,
      display: fType === ALL ? T.allTypes : T.type[fType], onClear: () => setFType(ALL),
      render: () => (
        <SegmentedToggle fill value={fType} onChange={setFType} ariaLabel={T.fType}
          options={[[ALL, T.allTypes], ...TYPES.map((t) => [t, T.type[t]])]} />
      ),
    },
    {
      key: "state", icon: Archive, label: T.fState, active: fState !== "active",
      display: fState === ALL ? T.stAll : fState === "active" ? T.stActive : T.stArchived,
      onClear: () => setFState("active"),
      render: () => (
        <SegmentedToggle fill value={fState} onChange={setFState} ariaLabel={T.fState}
          options={[["active", T.stActive], ["archived", T.stArchived], [ALL, T.stAll]]} />
      ),
    },
  ];

  const onSaved = (d, wasEdit) => {
    qc.invalidateQueries({ queryKey: ["assessment-bank"] });
    if (wasEdit) toast.success(T.saved);
    else toast.success(fill(T.addedN, { n: d.added }) + (d.skipped_duplicate ? fill(T.skippedN, { n: d.skipped_duplicate }) : ""));
  };

  const empty = !bank.isLoading && rows.length === 0;
  const emptyNode = bank.isError ? (
    <EmptyState tone="danger" title={T.loadFailed} message={errText(bank.error, T)} showUploadLink={false}
      action={<Button variant="secondary" onClick={() => bank.refetch()}>{T.retry}</Button>} />
  ) : (bank.data?.rows || []).length === 0 ? (
    <EmptyState title={T.bankEmpty} message={T.bankEmptyMsg} showUploadLink={false} icon={Library}
      action={<Button icon={Plus} onClick={() => setEditing({})}>{T.addQ}</Button>} />
  ) : (
    <EmptyState title={T.noMatch} message="" showUploadLink={false} icon={Library} />
  );

  // Icon buttons in the table (a word each would not fit beside a question);
  // the phone card, with room to spare, spells them out.
  const actions = (r, words = false) => (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant="secondary" tint icon={Pencil} onClick={() => setEditing(r)}
        title={T.edit} aria-label={T.edit}>
        {words ? T.edit : null}
      </Button>
      <Button size="sm" variant={r.archived_at ? "primary" : "danger"} tint
        icon={r.archived_at ? ArchiveRestore : Archive} loading={archive.isPending && archive.variables?.id === r.id}
        onClick={() => archive.mutate(r)} title={r.archived_at ? T.restore : T.archive}
        aria-label={r.archived_at ? T.restore : T.archive}>
        {words ? (r.archived_at ? T.restore : T.archive) : null}
      </Button>
    </span>
  );

  const mobile = bank.isLoading ? <div className="p-4"><SkeletonTable rows={4} cols={2} /></div> : empty ? emptyNode : (
    <ul>
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)", opacity: r.archived_at ? 0.6 : 1 }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <DeptChip dept={r.department} T={T} /><TypeChip type={r.qtype} T={T} />
            {r.archived_at && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.archivedChip}</span>}
            {r.used > 0 && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{fill(T.usedTip, { n: r.used })}</span>}
          </div>
          <p className="mt-1.5 text-sm whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>{tx(r.text)}</p>
          <div className="mt-2">{actions(r, true)}</div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <PoolCard pool={bank.data?.pool} T={T} />
      <TableCard icon={Library} title={T.tabBank}
        right={bank.data ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.rowsN, { n: rows.length })}</span> : null}
        toolbar={(
          <>
            <SearchInput value={q} onChange={setQ} placeholder={T.searchQ} className="w-full sm:w-64" />
            <FilterPanel sections={sections} />
            <Button size="lg" icon={Plus} onClick={() => setEditing({})} className="sm:ml-auto">{T.addQ}</Button>
          </>
        )}
        mobile={mobile} fixed minWidth={760}>
        <colgroup>
          <col style={{ width: 150 }} /><col style={{ width: 110 }} /><col />
          <col style={{ width: 84 }} /><col style={{ width: 104 }} /><col style={{ width: 112 }} />
        </colgroup>
        <thead>
          <tr>
            <Th label={T.colDept} k="dept" sort={sort} onSort={onSort} />
            <Th label={T.colType} k="type" sort={sort} onSort={onSort} />
            <Th label={T.colText} k="text" sort={sort} onSort={onSort} />
            <Th label={T.colUsed} k="used" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colAdded} k="added" sort={sort} onSort={onSort} />
            <Th label="" />
          </tr>
        </thead>
        <tbody>
          {bank.isLoading ? (
            [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="px-3 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--bg-inner)" }} /></td></tr>
            ))
          ) : empty ? (
            <tr><td colSpan={6}>{emptyNode}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} style={{ opacity: r.archived_at ? 0.6 : 1 }}>
              <td className="px-3 py-2"><DeptChip dept={r.department} T={T} /></td>
              <td className="px-3 py-2"><TypeChip type={r.qtype} T={T} /></td>
              <td className="px-3 py-2 truncate" title={tx(r.text)}>
                {r.archived_at && <span className="mr-2 text-[11px]" style={{ color: "var(--text-3)" }}>{T.archivedChip}</span>}
                {tx(r.text)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" title={fill(T.usedTip, { n: r.used })}>{r.used || "—"}</td>
              <td className="px-3 py-2 tabular-nums" title={r.created_by || ""}>{fmtDate(r.created_at)}</td>
              <td className="px-3 py-1.5">{actions(r)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {editing && <QuestionModal initial={editing} onClose={() => setEditing(null)} onSaved={onSaved} T={T} />}
      {toast.node}
    </div>
  );
}
