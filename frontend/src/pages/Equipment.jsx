// «Uskunalar» (/equipment) — the plant's equipment register, an app of
// «Avtomatizatsiya». Page key `equipment` (admins + personal grants; the API is
// require_page("equipment") on every route). A plain table kept by hand: add,
// edit, delete. Every row is one line; search, a department and a condition
// filter, sorting and paging all run on the rows the server returned (a few
// hundred). Columns are shown / hidden / reordered with `ColumnsPicker`, saved
// per profile (/api/ui-prefs/equipment_cols). «Mas'ul shaxs» is PICKED from the
// Verifix directory (`ResponsibleField`), never typed.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, Plus, Pencil, Trash2, AlertTriangle, RotateCw, Building2, Gauge } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import ActionMenu from "../components/ui/ActionMenu";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import StyledSelect from "../components/ui/StyledSelect";
import ColumnsPicker from "../components/ui/ColumnsPicker";
import { PersonLink } from "../components/people/peopleUtil";
import { useTranslit } from "../utils/transliterate";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import api from "../utils/api";
import { useET, fill } from "./equipmentText";

const PAGE_SIZE = 50;
const NUM = new Intl.NumberFormat("ru-RU");
const EMPTY = { name_real: "", name_doc: "", serial: "", status: "", inv_code: "", department: "", brigadir: "", leader: "", cell_code: "", responsible: "", responsible_id: "" };
const FIELD_KEYS = Object.keys(EMPTY);
// What the search box reads — never the Verifix id behind «Mas'ul shaxs».
const SEARCH_KEYS = FIELD_KEYS.filter((k) => k !== "responsible_id");
// The table's columns in their default order (the ⋮ is always last and not
// among them). «Uskuna nomi (Doc)» is the locked identity column: 4 seeded rows
// lack it against 103 without the Real name.
const COL_KEYS = ["no", "name_real", "name_doc", "serial", "status", "inv_code", "department", "brigadir", "leader", "cell_code", "responsible"];
const LOCKED = new Set(["name_doc"]);
const COL_LABEL = { no: "colNo", name_real: "colReal", name_doc: "colDoc", serial: "colSerial", status: "colStatus", inv_code: "colInv", department: "colDept", brigadir: "colBrig", leader: "colLeader", cell_code: "colCell", responsible: "colResp" };
const COL_PREF_KEY = "equipment_cols";
const MORE = "__more__";       // the «more matches» line of the person picker
const TYPED = "__typed__";     // a «Mas'ul shaxs» typed by hand before the picker
const workPlace = (w) => [w?.job, w?.code || w?.unit].filter(Boolean).join(" · ");
const GRADES = ["a", "b", "c"];
const inputCls = "w-full rounded-xl px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

const fold = (s) => String(s ?? "").toLowerCase();
const nameOf = (r) => r.name_real || r.name_doc || `#${r.id}`;

export default function Equipment() {
  const T = useET();
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["equipment"],
    queryFn: () => api.get("/api/admin/equipment").then((r) => r.data.rows),
    placeholderData: keepPreviousData,
  });
  const rows = listQ.data || [];

  // ── filters, sort, page ────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [grade, setGrade] = useState("");
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [page, setPage] = useState(1);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  // ── column visibility / order (per profile, /api/ui-prefs) ────────────────
  const prefQ = useQuery({
    queryKey: ["ui-pref", COL_PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${COL_PREF_KEY}`).then((r) => r.data?.value),
    staleTime: Infinity,
  });
  const [colsLocal, setColsLocal] = useState(null);
  const colCfg = useMemo(() => {
    const saved = colsLocal ?? prefQ.data;
    const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((k) => COL_KEYS.includes(k)) : [];
    const order = [...savedOrder, ...COL_KEYS.filter((k) => !savedOrder.includes(k))];
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((k) => COL_KEYS.includes(k) && !LOCKED.has(k)) : [];
    return { order, hidden };
  }, [colsLocal, prefQ.data]);
  const saveCols = useMutation({ mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }) });
  const onColsChange = (value) => {
    setColsLocal(value);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], value);
    saveCols.mutate(value);
  };
  const visible = useMemo(() => {
    const hidden = new Set(colCfg.hidden);
    return colCfg.order.filter((k) => !hidden.has(k));
  }, [colCfg]);
  const pickerCols = useMemo(() => COL_KEYS.map((k) => ({ key: k, label: T[COL_LABEL[k]], locked: LOCKED.has(k) })), [T]);
  const nCols = visible.length + 1;   // + the ⋮
  // A sort on a column the reader has just hidden falls back to the list's own order.
  const sortNow = sort.key === "id" || visible.includes(sort.key) ? sort : { key: "id", dir: "asc" };

  const depts = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const shown = useMemo(() => {
    const n = fold(q).trim();
    const list = rows.filter((r) =>
      (!dept || r.department === dept) && (!grade || r.status === grade) &&
      (!n || SEARCH_KEYS.some((k) => fold(r[k]).includes(n)) || (r.responsible && fold(tl(r.responsible)).includes(n))));
    const dir = sortNow.dir === "asc" ? 1 : -1;
    const key = sortNow.key;
    const val = (r) => (key === "id" ? r.id : fold(r[key]));
    return list.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      // blanks always last, whichever way the column runs
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
    });
  }, [rows, q, dept, grade, sortNow, tl]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pageCount);
  const pageRows = shown.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);
  const onSort = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  const filtered = !!q || !!dept || !!grade;
  const clearAll = () => { setQ(""); setDept(""); setGrade(""); setPage(1); };

  const sections = [
    {
      key: "dept", icon: Building2, label: T.fDept, active: !!dept, display: dept, onClear: () => reset(setDept)(""),
      render: ({ close }) => <PickFilter searchable opts={depts.map((d) => ({ value: d, label: d }))} value={dept} onChange={reset(setDept)} close={close} />,
    },
    {
      key: "status", icon: Gauge, label: T.fStatus, active: !!grade, display: grade ? T.grade.replace("{g}", grade.toUpperCase()) : "",
      onClear: () => reset(setGrade)(""),
      render: ({ close }) => <PickFilter opts={GRADES.map((g) => ({ value: g, label: fill(T.grade, { g: g.toUpperCase() }) }))} value={grade} onChange={reset(setGrade)} close={close} />,
    },
  ];

  // ── add / edit / delete ────────────────────────────────────────────────────
  const [form, setForm] = useState(null);   // {id|null, ...fields}
  const [gone, setGone] = useState(null);   // the row asked to be deleted
  const after = (msg) => { qc.invalidateQueries({ queryKey: ["equipment"] }); toast.success(msg); };

  const save = useMutation({
    mutationFn: ({ id, ...body }) => (id ? api.put(`/api/admin/equipment/${id}`, body) : api.post("/api/admin/equipment", body)),
    onSuccess: (_, v) => { setForm(null); after(v.id ? T.saved : T.created); },
    onError: () => toast.error(T.failed),
  });
  const drop = useMutation({
    mutationFn: (r) => api.delete(`/api/admin/equipment/${r.id}`),
    onSuccess: () => { setGone(null); after(T.deleted); },
  });

  const openNew = () => setForm({ id: null, ...EMPTY, department: dept });
  const openEdit = (r) => setForm({ id: r.id, ...Object.fromEntries(FIELD_KEYS.map((k) => [k, r[k] ?? ""])) });
  const nameMissing = form && !form.name_real.trim() && !form.name_doc.trim();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const dash = <span style={{ color: "var(--text-4)" }}>—</span>;
  const txt = (v, w = 220) => (v
    ? <span className="block truncate" style={{ maxWidth: w }} title={v.length > 28 ? v : undefined}>{v}</span>
    : dash);

  // One cell of a row, by column key — so hiding and reordering cost nothing.
  const cell = (k, r, i) => {
    switch (k) {
      case "no": return <td key={k} className="px-3 py-2 tabular-nums text-right w-12" style={{ color: "var(--text-3)" }}>{(at - 1) * PAGE_SIZE + i + 1}</td>;
      case "name_real": return <td key={k} className="px-3 py-2 font-medium">{txt(r.name_real, 240)}</td>;
      case "name_doc": return <td key={k} className="px-3 py-2">{txt(r.name_doc, 240)}</td>;
      case "serial": return <td key={k} className="px-3 py-2 tabular-nums">{txt(r.serial, 160)}</td>;
      case "status": return (
        <td key={k} className="px-3 py-2">
          {r.status
            ? <span className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold uppercase" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>{r.status}</span>
            : dash}
        </td>
      );
      case "inv_code": return <td key={k} className="px-3 py-2 tabular-nums">{txt(r.inv_code, 120)}</td>;
      case "department": return <td key={k} className="px-3 py-2">{txt(r.department, 200)}</td>;
      case "brigadir": return <td key={k} className="px-3 py-2">{txt(r.brigadir, 180)}</td>;
      case "leader": return <td key={k} className="px-3 py-2">{txt(r.leader, 180)}</td>;
      case "cell_code": return <td key={k} className="px-3 py-2 tabular-nums">{txt(r.cell_code, 100)}</td>;
      case "responsible": return (
        <td key={k} className="px-3 py-2">
          {r.responsible && r.responsible_id
            ? <span className="block truncate" style={{ maxWidth: 200 }} title={tl(r.responsible)}>
                <PersonLink employeeId={r.responsible_id}>{tl(r.responsible)}</PersonLink>
              </span>
            : txt(r.responsible, 200)}
        </td>
      );
      default: return null;
    }
  };

  let tbody;
  if (listQ.isPending || prefQ.isPending) {
    tbody = Array.from({ length: 10 }).map((_, i) => (
      <tr key={i}>{Array.from({ length: nCols }).map((__, j) => <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3 w-20" /></td>)}</tr>
    ));
  } else if (!pageRows.length) {
    tbody = <tr><td colSpan={nCols} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
      {filtered ? <span className="inline-flex items-center gap-2">{T.none}
        <button type="button" className="underline" style={{ color: "var(--brand-text)" }} onClick={clearAll}>{T.clearAll}</button>
      </span> : T.empty}
    </td></tr>;
  } else {
    tbody = pageRows.map((r, i) => (
      <tr key={r.id}>
        {visible.map((k) => cell(k, r, i))}
        <td className="px-1 py-1 w-12">
          <ActionMenu label={fill(T.actions, { name: nameOf(r) })} items={[
            { key: "edit", label: T.edit, icon: Pencil, onSelect: () => openEdit(r) },
            { key: "del", label: T.del, icon: Trash2, tone: "danger", onSelect: () => { drop.reset(); setGone(r); } },
          ]} />
        </td>
      </tr>
    ));
  }

  return (
    <Layout title={T.title}>
      {listQ.isError && !listQ.data ? (
        <EmptyState tone="danger" icon={AlertTriangle} title={T.errTitle} message={T.errMsg} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => listQ.refetch()} icon={<RotateCw size={14} />}>{T.retry}</Button>} />
      ) : (
        <>
          <TableCard
            icon={Hammer}
            title={T.title}
            headSize="lg"
            subtitle={T.sub}
            right={<span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
              {fill(T.rowsN, { n: NUM.format(shown.length) })}
            </span>}
            maxHeight="68vh"
            toolbar={<>
              <SearchInput value={q} onChange={reset(setQ)} placeholder={T.search} clearLabel={T.clear} className="w-full sm:w-72" />
              <FilterPanel sections={sections} onClearAll={() => { setDept(""); setGrade(""); setPage(1); }} />
              <Button size="lg" className="ml-auto" onClick={openNew} icon={<Plus size={15} />}>{T.add}</Button>
              <ColumnsPicker columns={pickerCols} order={colCfg.order} hidden={colCfg.hidden} onChange={onColsChange} />
            </>}
          >
            <thead>
              <tr>
                {visible.map((k) => (k === "no"
                  ? <Th key={k} label={T.colNo} align="right" cls="w-12" />
                  : <Th key={k} label={T[COL_LABEL[k]]} k={k} sort={sortNow} onSort={onSort} />))}
                <Th label="" />
              </tr>
            </thead>
            <tbody>{tbody}</tbody>
          </TableCard>
          <Pagination page={at} pageCount={pageCount} total={shown.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {form && (
        <Modal
          onClose={() => setForm(null)}
          title={form.id ? T.editTitle : T.newTitle}
          icon={<Hammer size={18} />}
          maxWidth="max-w-2xl"
          footer={<>
            <Button variant="secondary" onClick={() => setForm(null)}>{T.cancel}</Button>
            <Button onClick={() => save.mutate(form)} loading={save.isPending} disabled={nameMissing}>{T.save}</Button>
          </>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={T.colReal} required error={nameMissing ? T.nameReq : null}>
              <input className={inputCls} style={inputStyle} value={form.name_real} onChange={set("name_real")} maxLength={200} />
            </FormField>
            <FormField label={T.colDoc} required>
              <input className={inputCls} style={inputStyle} value={form.name_doc} onChange={set("name_doc")} maxLength={200} />
            </FormField>
            <FormField label={T.colSerial}>
              <input className={inputCls} style={inputStyle} value={form.serial} onChange={set("serial")} maxLength={100} />
            </FormField>
            <FormField label={T.colStatus}>
              <StyledSelect value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={[{ value: "", label: "—" }, ...GRADES.map((g) => ({ value: g, label: g.toUpperCase() }))]} />
            </FormField>
            <FormField label={T.colInv}>
              <input className={inputCls} style={inputStyle} value={form.inv_code} onChange={set("inv_code")} maxLength={50} />
            </FormField>
            <FormField label={T.colDept}>
              <input className={inputCls} style={inputStyle} value={form.department} onChange={set("department")} maxLength={120} list="equipment-depts" />
              <datalist id="equipment-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist>
            </FormField>
            <FormField label={T.colBrig}>
              <input className={inputCls} style={inputStyle} value={form.brigadir} onChange={set("brigadir")} maxLength={120} />
            </FormField>
            <FormField label={T.colLeader}>
              <input className={inputCls} style={inputStyle} value={form.leader} onChange={set("leader")} maxLength={120} />
            </FormField>
            <FormField label={T.colCell}>
              <input className={inputCls} style={inputStyle} value={form.cell_code} onChange={set("cell_code")} maxLength={40} />
            </FormField>
            <ResponsibleField T={T} id={form.responsible_id} name={form.responsible}
              onPick={(p) => setForm((f) => ({ ...f, ...p }))} />
          </div>
        </Modal>
      )}

      {gone && (
        <ConfirmDialog
          tone="danger"
          title={T.delTitle}
          message={fill(T.delMsg, { name: nameOf(gone) })}
          confirmLabel={T.del}
          loading={drop.isPending}
          error={drop.isError ? T.failed : null}
          onCancel={() => setGone(null)}
          onConfirm={() => drop.mutate(gone)}
        />
      )}
      {toast.node}
    </Layout>
  );
}

/** «Mas'ul shaxs» — one of the plant's CURRENT workers, picked from the Verifix
 *  directory with a server-side search (the /assessment candidate picker's
 *  pattern), never typed. A name typed by hand before the picker stays as an
 *  option of its own until somebody is picked over it; «—» clears the field. */
function ResponsibleField({ T, id, name, onPick }) {
  const { tl } = useTranslit();
  const [query, setQuery] = useState("");
  const [dq, setDq] = useState("");            // the query, once typing pauses
  const [picked, setPicked] = useState(id ? { employee_id: id, name } : null);

  useEffect(() => {
    const t = setTimeout(() => setDq(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = useQuery({
    queryKey: ["equipment-people", dq],
    queryFn: () => api.get("/api/admin/equipment/people", { params: { q: dq } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const typed = query.trim().length >= 2;
  const rows = useMemo(() => (typed ? search.data?.rows || [] : []), [typed, search.data]);
  const dir = search.data?.directory;
  const handTyped = !id && name ? name : "";

  const options = useMemo(() => {
    const opts = [];
    if (!typed && (id || handTyped)) opts.push({ value: "", label: "—", title: T.respNone });
    if (handTyped) opts.push({ value: TYPED, label: tl(handTyped), short: tl(handTyped), title: T.respTyped });
    const list = picked && id && !rows.some((w) => w.employee_id === picked.employee_id) ? [picked, ...rows] : rows;
    for (const w of list) {
      const place = workPlace(w);
      opts.push({
        value: w.employee_id,
        title: [tl(w.name), place].filter(Boolean).join(" · "),
        short: tl(w.name),
        label: (
          <>
            <span className="block truncate">{tl(w.name)}</span>
            {place && <span className="block truncate text-[11px]" style={{ color: "var(--text-3)" }}>{place}</span>}
          </>
        ),
      });
    }
    if (typed && search.data?.more) opts.push({ value: MORE, label: T.respMore, title: T.respMore, disabled: true });
    return opts;
  }, [rows, picked, id, handTyped, typed, search.data, tl, T]);

  const searchEmpty = dir && dir.count === 0 ? T.respDirEmpty
    : !typed ? T.respTypeMore
    : search.isFetching || dq !== query.trim() ? T.respSearching
    : T.respNotFound;

  const hint = handTyped ? T.respTypedHint : (picked && id && workPlace(picked)) || null;

  return (
    <FormField label={T.colResp} hint={hint}>
      <StyledSelect value={id || (handTyped ? TYPED : null)} ariaLabel={T.colResp}
        onChange={(v) => {
          if (v === "") { setPicked(null); onPick({ responsible_id: "", responsible: "" }); return; }
          const w = rows.find((r) => r.employee_id === v);
          if (w) { setPicked(w); onPick({ responsible_id: w.employee_id, responsible: w.name }); }
        }}
        options={options} placeholder={T.respPick}
        searchable onQuery={setQuery} searchPlaceholder={T.respSearch} searchEmpty={searchEmpty} />
    </FormField>
  );
}
