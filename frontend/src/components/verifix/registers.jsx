import { useMemo } from "react";
import { Loader2, TriangleAlert, Check, X, RefreshCw } from "lucide-react";
import DateRangePicker from "../ui/DateRangePicker";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import VfxPhoto from "./VfxPhoto";
import VfxTable from "./VfxTable";
import { AccessNotice, CellChip, Chip, StatusDot } from "./VfxState";
import { fill, num, dmy, C_OK, C_WARN, C_BAD, C_NONE } from "./vfx";
import { dash } from "./registerKit";

/* Phase 2 of «Verifix (test)» — the components the nine register pages
 * share (devices, requests, absences, HR moves, timebooks, shifts,
 * incidents, dictionaries, payroll); their hooks and formatters are in
 * `registerKit.jsx`. A section's own state — closed to the API role, still
 * loading, partial, being refreshed — is said by `SectionNote`, where the
 * rows would be. */

export function RangePicker({ from, to, setFrom, setTo, max = null }) {
  return (
    <DateRangePicker dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo} compactLabel max={max} />
  );
}

// ── states ────────────────────────────────────────────────────────────────────

function Line({ icon: Icon, spin, color, children }) {
  return (
    <div className="flex items-center gap-2 text-xs px-1" style={{ color: color || "var(--text-3)" }}>
      <Icon size={13} className={`flex-shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span>{children}</span>
    </div>
  );
}

/** A register's own state, said where its rows are: closed to the role (with
 * the Verifix form to attach), still arriving, refreshing, or cut short. */
export function SectionNote({ s, form }) {
  const { t } = useLang();
  if (!s) return null;
  if (s.error && !s.partial) return <AccessNotice error={s.error} form={form} />;
  if (s.loading) {
    return <Line icon={Loader2} spin>{fill(t("vfx.r.loadingPages"), { n: num(s.pages || 0) })}</Line>;
  }
  if (s.refreshing) return <Line icon={RefreshCw} spin>{t("vfx.r.refreshing")}</Line>;
  if (s.partial) {
    return (
      <Line icon={TriangleAlert} color={C_WARN}>
        {s.error ? fill(t("vfx.r.partialErr"), { n: num(s.pages || 0), msg: s.error.message || s.error.code })
          : fill(t("vfx.r.partial"), { n: num(s.pages || 0) })}
      </Line>
    );
  }
  return null;
}

/** Which Verifix list answered — and which were closed before it. */
export function SourceNote({ s }) {
  const { t } = useLang();
  if (!s?.source) return null;
  const tried = (s.tried || []).map((x) => x.source.split("/")[0]);
  return (
    <span className="text-[11px] inline-flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-3)" }}>
      <Chip color="#64748b" mono title={s.source}>{s.source}</Chip>
      {tried.length > 0 && <span>{fill(t("vfx.r.fellBack"), { from: tried.map((m) => t(`vfx.mod.${m}`)).join(", ") })}</span>}
    </span>
  );
}

// ── cells of a row ────────────────────────────────────────────────────────────

/** A person a row names: their photo, name and (where their org unit is one
 * of OUR cells) the cell code. A staff record nobody could resolve reads
 * «Shtat #id». */
export function Who({ id, name, frame, staff, sub, px = 28 }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const p = id ? frame?.people?.[id] : null;
  const shown = tl(name || p?.name || "") || (staff ? fill(t("vfx.r.staffN"), { id: staff }) : id ? `#${id}` : "—");
  const cell = p ? frame?.cells?.[p.unit] || frame?.cells?.[p.div] : null;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <VfxPhoto sha={p?.photo} name={shown} px={px} />
      <div className="min-w-0">
        <div className="truncate max-w-[220px] font-medium" style={{ color: "var(--text-1)" }}>{shown}</div>
        {(cell || sub) && (
          <div className="text-[11px] flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-3)" }}>
            {cell && <CellChip cell={cell} compact />}
            {sub && <span className="truncate max-w-[200px]">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A Verifix node a row names (department / org unit / workplace): our cell
 * code above its Verifix name where it is one of our cells. */
export function Node({ id, name, frame }) {
  const { tx } = useTranslit();
  const cell = id ? frame?.cells?.[id] : null;
  const label = tx(name || frame?.divisions?.[id] || "") || (id ? `#${id}` : "");
  if (!cell && !label) return dash;
  return (
    <div className="min-w-0 max-w-[230px]">
      {cell && <CellChip cell={cell} compact />}
      <div className={`truncate ${cell ? "text-[11px]" : ""}`} style={{ color: cell ? "var(--text-3)" : "var(--text-2)" }}>{label}</div>
    </div>
  );
}

const REQ_TONE = { N: C_WARN, A: C_OK, C: C_OK, D: C_BAD, R: C_BAD };

/** A request's status — the word where Verifix's letter is known, the
 * letter itself where it is not. */
export function ReqStatus({ code }) {
  const { t } = useLang();
  if (!code) return dash;
  const k = `vfx.rq.st.${code}`;
  const s = t(k);
  return <StatusDot color={REQ_TONE[code] || C_NONE} label={s === k ? code : s} title={`Verifix: ${code}`} />;
}

/** A journal posted («проведён») or still a draft. */
export function Posted({ v }) {
  const { t } = useLang();
  if (v == null) return dash;
  return <StatusDot color={v ? C_OK : C_NONE} label={t(v ? "vfx.r.posted" : "vfx.r.draft")} />;
}

export function Flag({ ok, title }) {
  return ok
    ? <span title={title} className="inline-grid place-items-center w-5 h-5 rounded-md" style={{ background: `${C_OK}22`, color: C_OK }}><Check size={13} /></span>
    : <span title={title} className="inline-grid place-items-center w-5 h-5 rounded-md" style={{ background: `${C_BAD}1c`, color: C_BAD }}><X size={13} /></span>;
}

export function Journal({ r }) {
  if (!r?.jnum && !r?.jdate) return dash;
  return (
    <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
      №{r.jnum ? String(r.jnum).replace(/^0+/, "") || r.jnum : "—"}{r.jdate ? ` · ${dmy(r.jdate)}` : ""}
    </span>
  );
}

export function Muted({ children, max = 260 }) {
  if (children == null || children === "") return dash;
  return <span className="block truncate text-xs" style={{ color: "var(--text-2)", maxWidth: max }} title={String(children)}>{children}</span>;
}

// ── a list whose shape Verifix does not document ──────────────────────────────

const preview = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 70 ? `${s.slice(0, 68)}…` : s;
  }
  return String(v);
};

/** Rows shown field by field, paged and sortable — for a register Verifix's
 * documentation gives no example of (rank changes, expenses by location). */
export function GenericTable({ rows, icon, title, right, toolbar, loading, empty }) {
  const indexed = useMemo(() => (rows || []).map((r, i) => ({ ...r, __i: i })), [rows]);
  const cols = useMemo(() => {
    const seen = new Map();
    for (const r of (rows || []).slice(0, 80)) for (const k of Object.keys(r)) if (!seen.has(k)) seen.set(k, true);
    const keys = [...seen.keys()];
    const first = keys.filter((k) => /name/.test(k)).concat(keys.filter((k) => !/name/.test(k) && !/_id$/.test(k)));
    return first.concat(keys.filter((k) => /_id$/.test(k) && !/name/.test(k)));
  }, [rows]);
  const columns = cols.map((c) => ({
    key: c, label: <span className="font-mono normal-case">{c}</span>,
    sort: (r) => (typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c]),
    render: (r) => {
      const p = preview(r[c]);
      return (
        <span className={`block truncate max-w-[260px] ${typeof r[c] === "object" ? "font-mono text-[11px]" : "text-xs"}`}
          title={p || undefined} style={{ color: p == null ? "var(--text-4)" : "var(--text-1)" }}>{p ?? "—"}</span>
      );
    },
  }));
  return (
    <VfxTable icon={icon} title={title} right={right} toolbar={toolbar} rows={indexed}
      columns={columns.length ? columns : [{ key: "_", label: "—", render: () => null }]}
      rowKey={(r) => r.__i} loading={loading} empty={empty} />
  );
}

