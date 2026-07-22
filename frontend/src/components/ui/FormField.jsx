/**
 * Canonical form field wrapper — THE template for labelled controls in
 * modal forms: small uppercase label, red asterisk when required.
 *
 * Side-by-side fields (a `grid grid-cols-2` row) stretch to the tallest cell, so
 * a label that wraps to two lines would otherwise shove its own control below
 * its neighbour's. The column flex + growing label keeps labels top-aligned and
 * the CONTROLS aligned on one line no matter how many lines each label takes.
 * Stacked (non-stretched) fields are unaffected — `h-full` against an auto-height
 * parent resolves to auto.
 */
export default function FormField({ label, required, children }) {
  return (
    <div className="flex flex-col h-full">
      <div className="text-[11px] uppercase tracking-wider mb-1 flex-1" style={{ color: "var(--text-3)" }}>
        {label}{required && <span className="text-red-400"> *</span>}
      </div>
      {children}
    </div>
  );
}
