/**
 * Shared pieces of the per-cell attendance model (the isolated
 * `cell_attendance` table) — used by the /cell-attendance page and the Staff
 * page's cell view, which must agree on what identifies a cell and which rows
 * the загрузка counts.
 */

// One identity for a cell across the catalog and the rows. Unmatched codes have
// no cell_id, so they key off the raw code instead — string-prefixed so they can
// never collide with a real numeric id.
export const cellKey = (o) => String(o.cell_id ?? `x:${o.verifix_code ?? ""}`);

// «Zagruzkada hisoblanadigan» — the slice the production load actually counts:
// every flavour of konditer plus the fasovchiks, inside a cell the admin has
// TICKED on the «Sozlash» tab. Which cells belong in the load used to be
// inferred from "the cell has a brigadir"; since 2026-07-31 it is an explicit
// decision stored on the cell (`in_load`), so a cell can be left out even with
// an owner, and unmatched codes — which carry no cell record at all — still
// drop out here. Job titles arrive raw from the upload ("Konditer/Tsekh
// prigotovleniya…", "Кондитер"), so match a substring instead of an exact list.
export const LOAD_ROLE_RE = /kondit|конди|fasov|фасов/i;
export const countsInLoad = (r) => r.in_load === true && LOAD_ROLE_RE.test(r.job_title || "");

// Worked = green, day-off / excused markers = neutral slate (traffic-light
// convention — brand gold is never a status). Mirrors the upload-tab preview.
export function CellStatusChip({ status }) {
  const color = status === "worked" ? "#22c55e" : "#94a3b8";
  return (
    <span className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `${color}1f` }}>
      {status || "—"}
    </span>
  );
}
