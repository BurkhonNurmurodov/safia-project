import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Braces, Table2 } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SkeletonTable } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { vget, vfxError, num, fill } from "./vfx";
import { AccessNotice, Chip } from "./VfxState";

/* Verifix's rows exactly as the API returns them (already scrubbed by the
 * server): one column per field, in the order the first rows carry them.
 * A nested object or list prints as compact JSON with the whole value on
 * hover — the raw viewer's job is to show the SHAPE of the data. */

const preview = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "object") {
    if (Array.isArray(v) && v.length === 0) return "[]";
    const s = JSON.stringify(v);
    return s.length > 70 ? `${s.slice(0, 68)}…` : s;
  }
  return String(v);
};

export function RawTable({ rows, maxHeight = "60vh", title, icon, right }) {
  const { t } = useLang();
  const cols = useMemo(() => {
    const seen = new Map();
    for (const r of (rows || []).slice(0, 80)) for (const k of Object.keys(r)) if (!seen.has(k)) seen.set(k, true);
    return [...seen.keys()];
  }, [rows]);
  if (!rows?.length) {
    return <p className="text-xs py-6 text-center" style={{ color: "var(--text-3)" }}>{t("vfx.raw.noRows")}</p>;
  }
  return (
    <TableCard title={title} icon={icon} right={right} maxHeight={maxHeight}>
      <thead>
        <tr>
          <Th label="#" align="right" />
          {cols.map((c) => <Th key={c} label={<span className="font-mono normal-case">{c}</span>} />)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--text-4)" }}>{i + 1}</td>
            {cols.map((c) => {
              const v = r[c];
              const p = preview(v);
              const nested = v != null && typeof v === "object";
              return (
                <td key={c} className={`px-3 py-1.5 max-w-[280px] truncate ${nested ? "font-mono text-[11px]" : ""}`}
                  title={nested ? JSON.stringify(v, null, 2) : p || undefined}
                  style={{ color: p == null ? "var(--text-4)" : nested ? "var(--text-2)" : "var(--text-1)" }}>
                  {p ?? "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

/** Rows as a table or as the JSON Verifix sent — the viewer's two lenses. */
export function RawView({ rows, maxHeight }) {
  const { t } = useLang();
  const [mode, setMode] = useState("table");
  return (
    <div className="space-y-2">
      <SegmentedToggle size="sm" value={mode} onChange={setMode} options={[
        { value: "table", label: <span className="inline-flex items-center gap-1"><Table2 size={12} />{t("vfx.raw.table")}</span>, title: t("vfx.raw.table") },
        { value: "json", label: <span className="inline-flex items-center gap-1"><Braces size={12} />JSON</span>, title: "JSON" },
      ]} />
      {mode === "table" ? <RawTable rows={rows} maxHeight={maxHeight} /> : (
        <pre className="rounded-xl p-3 text-[11px] leading-relaxed overflow-auto font-mono"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)", maxHeight: maxHeight || "60vh" }}>
          {JSON.stringify(rows, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** A small Verifix list shown whole on a page (a dictionary): its rows, or
 * the reason the API role does not open it. */
export function RawPanel({ methodKey, title, form, icon }) {
  const { t } = useLang();
  const q = useQuery({
    queryKey: ["vfx", "rows", methodKey],
    queryFn: () => vget("/methods/rows", { key: methodKey, limit: 500 }),
    staleTime: 5 * 60_000,
  });
  const d = q.data;
  const err = q.error ? vfxError(q.error)
    : d && !["ok", "empty"].includes(d.status) ? { code: d.status, message: d.error } : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{title}</h3>
        <span className="font-mono text-[11px]" style={{ color: "var(--text-4)" }}>{methodKey}</span>
        {d?.status === "ok" && <Chip color="#94a3b8">{fill(t("vfx.raw.rowsN"), { n: num(d.rows.length) })}{d.next_cursor ? "+" : ""}</Chip>}
      </div>
      {q.isLoading ? <SkeletonTable rows={3} cols={4} />
        : err ? <AccessNotice error={err} form={form} />
        : d?.status === "empty" ? <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.raw.empty")}</p>
        : <RawTable rows={d?.rows || []} maxHeight="40vh" icon={icon} />}
    </div>
  );
}
