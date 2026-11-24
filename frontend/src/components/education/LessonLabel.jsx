import { useMemo } from "react";
import { Tag } from "lucide-react";
import { useLang } from "../../context/LangContext";
import StyledSelect from "../ui/StyledSelect";
import { useMarkDraft } from "../ui/dialogLayers";
import { normLabel } from "../../utils/lessonLabels";

/**
 * A lesson's LABEL — the subject it belongs to («SAP», «IMS», …), 2026-11-24:
 * the chip that shows it and the picker that sets it. The helpers and the
 * rules (one label, no table of labels, one spelling up to case) are in
 * `utils/lessonLabels.js`; the record is `docs/education.md`.
 */

/** The label as a chip — a NAME, not a status, so it is neutral (no traffic
 *  light, no brand gold, which never stands for a category). Renders nothing
 *  for a lesson nobody labelled. */
export default function LessonLabel({ label, className = "" }) {
  if (!label) return null;
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      title={label}
    >
      <Tag size={11} aria-hidden className="shrink-0" style={{ color: "var(--text-3)" }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * The picker on the lesson form: «Yorliqsiz», every existing label, and — when
 * the search box holds text no label matches — a row adding it as a new one.
 * Rendered INSIDE the form's `Modal`, so adding a label marks the form as
 * edited (`useMarkDraft`) exactly like picking one does.
 */
export function LessonLabelPicker({ value, onChange, labels }) {
  const { t } = useLang();
  const markDraft = useMarkDraft();

  // The current value stays among the options even when no other lesson
  // carries it yet — a label just added here, or the lesson's own — or the
  // trigger could not name it.
  const all = useMemo(() => {
    const list = [...(labels || [])];
    if (value && !list.some((x) => x.toLowerCase() === value.toLowerCase())) list.push(value);
    return list.sort((a, b) => a.localeCompare(b));
  }, [labels, value]);

  const match = (v) => all.find((x) => x.toLowerCase() === v.toLowerCase());

  return (
    <StyledSelect
      value={value || ""}
      onChange={(v) => onChange(v || "")}
      options={[
        { value: "", label: t("education.labelNone") },
        ...all.map((x) => ({ value: x, label: x })),
      ]}
      searchable
      searchPlaceholder={t("education.labelSearch")}
      creatable
      createLabel={(q) => {
        const v = normLabel(q);
        // Nothing typed, or the text already names a label (that one is in
        // the list below) — no row offering to create it.
        if (!v || match(v)) return null;
        return t("education.labelCreate").replace("{label}", v);
      }}
      onCreate={(q) => {
        const v = normLabel(q);
        if (!v) return;
        markDraft();
        onChange(match(v) || v);
      }}
      ariaLabel={t("education.label")}
    />
  );
}
