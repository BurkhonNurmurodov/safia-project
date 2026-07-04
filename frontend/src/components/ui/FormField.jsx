/**
 * Canonical form field wrapper — THE template for labelled controls in
 * modal forms: small uppercase label, red asterisk when required.
 */
export default function FormField({ label, required, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>
        {label}{required && <span className="text-red-400"> *</span>}
      </div>
      {children}
    </div>
  );
}
