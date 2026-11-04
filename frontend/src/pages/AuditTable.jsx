// «Audit jadvali» (/audit) — the public.audit table, read-only, admins only.
// Nothing here knows the table's columns in advance: the server reads them from
// the catalog (routers/audit_table.py) and the page draws whatever is there —
// a period on its date column, a search over its values, sorting, the column
// picker, a row opened whole, and the filtered rows as a workbook.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, ScrollText, ShieldAlert, AlertTriangle, RotateCw, Copy, Check } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import DateRangePicker, { ALL_TIME_FROM, localISO } from "../components/ui/DateRangePicker";
import ColumnsPicker from "../components/ui/ColumnsPicker";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { usePersistentState } from "../hooks/usePersistentState";
import { exportXlsx } from "../utils/exportXlsx";
import { copyText } from "../utils/copyText";
import api from "../utils/api";
import { useAT, fill } from "./auditTableText";

const PAGE_SIZE = 50;
const COL_PREF_KEY = "audit.table.cols";
const NUM = new Intl.NumberFormat("ru-RU");

// "2026-11-04T15:30:12" (already the plant's clock) → "04.11.2026 15:30:12".
function showTime(v, kind) {
  if (typeof v !== "string") return v;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return v;
  const d = `${m[3]}.${m[2]}.${m[1]}`;
  return kind === "date" || !m[4] ? d : `${d} ${m[4]}`;
}

function shown(v, kind, T) {
  if (v === null || v === undefined || v === "") return null;
  if (kind === "bool" || typeof v === "boolean") return v ? T.yes : T.no;
  if (kind === "timestamptz" || kind === "timestamp" || kind === "date") return showTime(v, kind);
  if (typeof v === "number") return NUM.format(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// A JSON value, pretty, when the text is JSON; otherwise the text as it is.
function pretty(v) {
  if (typeof v === "object" && v !== null) return JSON.stringify(v, null, 2);
  if (typeof v === "string" && /^[[{]/.test(v.trim())) {
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { /* cut or not JSON */ }
  }
  return null;
}

// A role name as SQL needs it: bare when it is a plain lower-case name.
const sqlName = (u) => (/^[a-z_][a-z0-9_$]*$/.test(u) ? u : `"${String(u).replace(/"/g, '""')}"`);

// What the database's owner has to run for the app to read the table — the
// app cannot grant itself, so the screen hands over the exact line.
function GrantHint({ user, T, toast }) {
  const cmd = `GRANT SELECT ON public.audit TO ${sqlName(user)};`;
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (await copyText(cmd)) { setDone(true); toast.success(T.copied); setTimeout(() => setDone(false), 2000); }
    else toast.error(T.copyFail);
  };
  return (
    <div className="mt-4 w-full max-w-xl mx-auto text-left space-y-2">
      <p className="text-xs" style={{ color: "var(--text-2)" }}>{T.grantAsk}</p>
      <div className="flex items-stretch gap-2">
        <pre className="flex-1 min-w-0 whitespace-pre-wrap rounded-lg px-3 py-2.5 text-xs font-mono select-all"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)", overflowWrap: "anywhere" }}>{cmd}</pre>
        <Button variant="secondary" onClick={copy}
          icon={done ? <Check size={14} /> : <Copy size={14} />}>{done ? T.copied : T.copy}</Button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.grantAfter}</p>
    </div>
  );
}

function errCode(e) {
  const raw = e?.response?.data?.detail_raw ?? e?.response?.data?.detail;
  return raw && typeof raw === "object" ? raw.code : null;
}

export default function AuditTable() {
  const T = useAT();
  const qc = useQueryClient();
  const toast = useToast();
  const today = localISO(new Date());

  const metaQ = useQuery({
    queryKey: ["audit-table", "meta"],
    queryFn: () => api.get("/api/audit-table/meta").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const meta = metaQ.data;
  const columns = useMemo(() => (meta?.columns || []), [meta]);
  const kindOf = useMemo(() => Object.fromEntries(columns.map((c) => [c.name, c.kind])), [columns]);

  // ── filters ────────────────────────────────────────────────────────────────
  const [range, setRange] = useState({ from: ALL_TIME_FROM, to: today });
  const allTime = range.from <= ALL_TIME_FROM;
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(h);
  }, [qInput]);
  const [sort, setSort] = usePersistentState("audit_sort", null);
  const names = useMemo(() => new Set(columns.map((c) => c.name)), [columns]);
  const sortNow = sort && names.has(sort.key) ? sort : (meta?.default_sort || null);
  const onSort = (k) => setSort(sortNow?.key === k
    ? { key: k, dir: sortNow.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: kindOf[k] === "text" ? "asc" : "desc" });

  const [page, setPage] = useState(1);
  const filterKey = `${q}|${allTime ? "" : `${range.from}~${range.to}`}|${sortNow?.key}|${sortNow?.dir}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {          // a new filter starts at page 1 — before anything is fetched
    setSeenKey(filterKey);
    setPage(1);
  }

  const params = useMemo(() => {
    const p = { page, size: PAGE_SIZE };
    if (q) p.q = q;
    if (meta?.time_column && !allTime) { p.date_from = range.from; p.date_to = range.to; }
    if (sortNow?.key) { p.sort = sortNow.key; p.dir = sortNow.dir; }
    return p;
  }, [page, q, meta?.time_column, allTime, range, sortNow]);

  const ready = !!meta?.exists && !!meta?.can_read;
  const rowsQ = useQuery({
    queryKey: ["audit-table", "rows", params],
    queryFn: () => api.get("/api/audit-table/rows", { params }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const data = rowsQ.data;

  // ── column visibility / order (per profile, /api/ui-prefs) ────────────────
  const { data: savedCols } = useQuery({
    queryKey: ["ui-pref", COL_PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${COL_PREF_KEY}`).then((r) => r.data?.value),
    staleTime: Infinity,
    enabled: ready,
  });
  const [colsLocal, setColsLocal] = useState(null);
  const colCfg = useMemo(() => {
    const saved = colsLocal ?? savedCols;
    const keys = columns.map((c) => c.name);
    const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((k) => keys.includes(k)) : [];
    const order = [...savedOrder, ...keys.filter((k) => !savedOrder.includes(k))];
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((k) => keys.includes(k)) : [];
    return { order, hidden };
  }, [colsLocal, savedCols, columns]);
  const saveCols = useMutation({ mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }) });
  const onColsChange = (value) => {
    setColsLocal(value);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], value);
    saveCols.mutate(value);
  };
  const visible = useMemo(() => {
    const hidden = new Set(colCfg.hidden);
    const order = colCfg.order.filter((k) => !hidden.has(k));
    return order.length ? order : colCfg.order.slice(0, 1);
  }, [colCfg]);

  const rowCols = data?.columns || [];
  const at = useMemo(() => Object.fromEntries(rowCols.map((c, i) => [c, i])), [rowCols]);
  const rows = data?.rows || [];
  const cap = data?.cap || 500;
  const anyCut = rows.some((r) => r.some((v) => typeof v === "string" && v.length > cap && v.endsWith("…")));

  // ── export ─────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      const scope = [
        meta?.time_column ? (allTime ? T.allTime : `${showTime(range.from, "date")} – ${showTime(range.to, "date")}`) : null,
        q ? `«${q}»` : null,
      ].filter(Boolean).join(" · ");
      const via = await exportXlsx("/api/audit-table/export.xlsx", {
        body: {
          q, sort: sortNow?.key || null, dir: sortNow?.dir || "desc", columns: visible,
          date_from: params.date_from || null, date_to: params.date_to || null,
          title: `${T.title} — public.audit`, scope,
          prepared: new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
        },
        fallbackName: "public-audit.xlsx",
      });
      toast.success(via === "download" ? T.exportDl : T.exportTg);
    } catch {
      toast.error(T.exportFail);
    } finally {
      setExporting(false);
    }
  };

  // ── the row opened whole ───────────────────────────────────────────────────
  const [open, setOpen] = useState(null);       // {row, n}
  const pk = meta?.pk || null;
  const pkVal = open && pk != null && at[pk] != null ? open.row[at[pk]] : null;
  const rowQ = useQuery({
    queryKey: ["audit-table", "row", pkVal],
    queryFn: () => api.get("/api/audit-table/row", { params: { key: String(pkVal) } }).then((r) => r.data),
    enabled: pkVal !== null && pkVal !== undefined,
    staleTime: 60_000,
  });

  // ── states before the table ────────────────────────────────────────────────
  let body = null;
  if (metaQ.isPending) {
    body = <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-5 w-full" />)}
    </div>;
  } else if (metaQ.isError) {
    body = <EmptyState tone="danger" icon={AlertTriangle} title={T.errTitle} message={T.errMsg}
      showUploadLink={false} action={<Button variant="secondary" onClick={() => metaQ.refetch()} icon={<RotateCw size={14} />}>{T.retry}</Button>} />;
  } else if (!meta.exists) {
    body = <EmptyState icon={ScrollText} title={T.missingTitle} message={T.missingMsg} showUploadLink={false} />;
  } else if (!meta.can_read) {
    body = <EmptyState tone="danger" icon={ShieldAlert} title={T.noReadTitle}
      message={fill(T.noReadMsg, { owner: meta.owner })} showUploadLink={false} height="min-h-40 py-10"
      action={meta.db_user ? <GrantHint user={meta.db_user} T={T} toast={toast} /> : null} />;
  }

  const total = data?.total;
  const countLabel = data
    ? (total != null ? fill(T.rowsN, { n: NUM.format(total) }) : fill(T.rowsApprox, { n: NUM.format(data.est_rows) }))
    : meta?.exists ? fill(T.rowsApprox, { n: NUM.format(meta.est_rows) }) : "";
  const pageCount = total != null
    ? Math.max(1, Math.ceil(total / PAGE_SIZE))
    : (rows.length === PAGE_SIZE ? page + 1 : page);
  const filtered = !!q || (!!meta?.time_column && !allTime);
  const clearFilters = () => { setQInput(""); setQ(""); setRange({ from: ALL_TIME_FROM, to: today }); };

  const cell = (v, kind, key) => {
    const s = shown(v, kind, T);
    if (s === null) return <span style={{ color: "var(--text-4)" }}>—</span>;
    const mono = kind === "json";
    return (
      <span className={`block truncate ${mono ? "font-mono text-[11px]" : ""}`}
        style={{ maxWidth: kind === "number" ? undefined : 320, color: v === "•••" ? "var(--text-3)" : undefined }}
        title={typeof v === "string" && v.length > 40 ? v : undefined} key={key}>
        {s}
      </span>
    );
  };

  let tbody;
  if (rowsQ.isError && !data) {
    tbody = <tr><td colSpan={visible.length} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
      <div className="flex flex-col items-center gap-2">
        <span>{T.errMsg}</span>
        <Button size="sm" variant="secondary" onClick={() => rowsQ.refetch()} icon={<RotateCw size={12} />}>{T.retry}</Button>
      </div>
    </td></tr>;
  } else if (!data) {
    tbody = Array.from({ length: 10 }).map((_, i) => (
      <tr key={i}>{visible.map((k) => <td key={k} className="px-3 py-2"><SkeletonBlock className="h-3 w-24" /></td>)}</tr>
    ));
  } else if (!rows.length) {
    tbody = <tr><td colSpan={visible.length} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
      {filtered ? <span className="inline-flex items-center gap-2">{T.none}
        <button type="button" className="underline" style={{ color: "var(--brand-text)" }} onClick={clearFilters}>{T.clearAll}</button>
      </span> : T.empty}
    </td></tr>;
  } else {
    tbody = rows.map((r, i) => (
      <tr key={i} className="cursor-pointer" onClick={() => setOpen({ row: r, n: (page - 1) * PAGE_SIZE + i + 1 })}>
        {visible.map((k) => (
          <td key={k} className={`px-3 py-2 ${kindOf[k] === "number" ? "text-right tabular-nums" : ""}`}>
            {cell(at[k] != null ? r[at[k]] : null, kindOf[k], k)}
          </td>
        ))}
      </tr>
    ));
  }

  const notes = [
    data?.masked?.length ? fill(T.masked, { cols: data.masked.join(", ") }) : null,
    anyCut ? T.cutNote : null,
  ].filter(Boolean);

  const detailRow = rowQ.data?.row ?? open?.row;
  const detailCols = rowQ.data?.columns ?? rowCols;

  return (
    <Layout title={T.title}>
      {body ?? (
        <>
          <TableCard
            icon={ScrollText}
            title="public.audit"
            headSize="lg"
            subtitle={fill(T.sub, { kind: T.kinds[meta.kind] || meta.kind, owner: meta.owner, size: meta.size })}
            right={<span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>{countLabel}</span>}
            maxHeight="68vh"
            toolbar={<>
              {meta.time_column && (
                <span title={fill(T.periodOn, { col: meta.time_column })}>
                  <DateRangePicker
                    dateFrom={range.from} dateTo={range.to}
                    setDateFrom={(v) => setRange((r) => ({ ...r, from: v }))}
                    setDateTo={(v) => setRange((r) => ({ ...r, to: v }))}
                    max={today} compactLabel triggerClassName="px-3 py-2 text-sm"
                  />
                </span>
              )}
              <SearchInput value={qInput} onChange={setQInput} placeholder={T.search}
                clearLabel={T.clear} className="w-full sm:w-72" />
              <Button size="lg" variant="secondary" onClick={doExport} loading={exporting} disabled={!rows.length}
                icon={<FileSpreadsheet size={15} />}>{T.excel}</Button>
              <ColumnsPicker
                className="ml-auto"
                columns={columns.map((c) => ({ key: c.name, label: c.name }))}
                order={colCfg.order}
                hidden={colCfg.hidden}
                onChange={onColsChange}
              />
            </>}
            footer={notes.length ? (
              <div className="text-[11px] space-y-0.5" style={{ color: "var(--text-3)" }}>
                {notes.map((n) => <div key={n}>{n}</div>)}
              </div>
            ) : null}
          >
            <thead>
              <tr>
                {visible.map((k) => (
                  <Th key={k} label={k} k={k} sort={sortNow} onSort={onSort}
                    align={kindOf[k] === "number" ? "right" : "left"}
                    hint={columns.find((c) => c.name === k)?.type} />
                ))}
              </tr>
            </thead>
            <tbody style={{ opacity: rowsQ.isPlaceholderData ? 0.6 : 1 }}>{tbody}</tbody>
          </TableCard>
          <Pagination page={page} pageCount={pageCount} total={total ?? data?.est_rows ?? 0}
            pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {open && (
        <Modal
          onClose={() => setOpen(null)}
          title={T.detailTitle}
          subtitle={pk && pkVal != null ? fill(T.detailSub, { col: pk, val: pkVal }) : fill(T.detailSubNoKey, { n: open.n })}
          icon={<ScrollText size={18} />}
          maxWidth="max-w-2xl"
          footer={<Button variant="secondary" onClick={() => setOpen(null)}>{T.close}</Button>}
        >
          {!pk && <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.detailCut}</p>}
          {rowQ.isError && errCode(rowQ.error) === "gone" && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.detailGone}</p>
          )}
          <dl className="space-y-3">
            {detailCols.map((k, i) => {
              const v = detailRow?.[i];
              const p = pretty(v);
              const s = shown(v, kindOf[k], T);
              return (
                <div key={k}>
                  <dt className="font-mono text-[11px] mb-0.5" style={{ color: "var(--text-3)" }}>{k}</dt>
                  <dd className="text-sm break-words">
                    {rowQ.isFetching && !rowQ.data && typeof v === "string" && v.endsWith("…")
                      ? <SkeletonBlock className="h-4 w-40" />
                      : p != null
                        ? <pre className="text-xs font-mono whitespace-pre-wrap break-words rounded-lg p-2.5"
                            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>{p}</pre>
                        : s === null
                          ? <span style={{ color: "var(--text-4)" }}>—</span>
                          : <span className="whitespace-pre-wrap">{s}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Modal>
      )}
      {toast.node}
    </Layout>
  );
}
