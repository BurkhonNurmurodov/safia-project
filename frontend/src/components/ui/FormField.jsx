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
 *
 * Props:
 *   label / required – the label row
 *   hint  – muted explanatory line UNDER the control. Consequential copy
 *           ("this resets manual edits", "re-uploading replaces the day")
 *           belongs here at 11px/--text-3, not buried at --text-4 where the
 *           eye skips it.
 *   error – validation message shown under the control in status red, and the
 *           reason a form can attach an error to the field that caused it
 *           rather than dumping one paragraph below every field.
 *   alignTop – for a side-by-side row where only SOME fields carry a hint or an
 *           error. That line makes its own cell the tallest, and the growing
 *           label hands the difference to the neighbour WITHOUT one — which
 *           parks its control a whole hint below its partner's, and jolts it
 *           the moment a validation error appears. `alignTop` puts the slack at
 *           the BOTTOM of the cell instead, so the controls stay on one line.
 *           Set it on EVERY field of such a row; labels there must be short
 *           enough not to wrap, since that is the alignment it trades away.
 */
export default function FormField({ label, required, hint, error, alignTop, children }) {
  return (
    <div className="flex flex-col h-full">
      {label && (
        <div
          className={`text-[11px] uppercase tracking-wider mb-1${alignTop ? "" : " flex-1"}`}
          style={{ color: "var(--text-3)" }}
        >
          {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
        </div>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-[11px] leading-snug font-medium" style={{ color: "#ef4444" }}>{error}</p>
      )}
    </div>
  );
}
