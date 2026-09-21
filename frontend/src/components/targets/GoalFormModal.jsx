// Create / edit a goal and its key results — ONE form for both, on the Modal
// template. Everything is a draft until Save; validation lands on the field
// that caused it (FormField `error`), never as one paragraph under the form.
import { useState } from "react";
import { Plus, X, Target as TargetIcon, ArrowUp, ArrowDown } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker from "../ui/DateRangePicker";
import { useLang } from "../../context/LangContext";
import {
  TYPES, CATEGORIES, isNumeric, newGoal, newTarget, uid, categoryColor, num,
} from "../../utils/targets";
import { TypeIcon } from "./bits";
import { INPUT_CLS, INPUT_STYLE } from "./targetsUi";

const clone = (g) => JSON.parse(JSON.stringify(g));

function validate(d, t) {
  const err = { targets: {} };
  let any = false;
  if (!d.title.trim()) { err.title = t("targets.form.errTitle"); any = true; }
  if (d.start && d.due && d.due < d.start) { err.dates = t("targets.form.errDates"); any = true; }
  if (!d.targets.length) { err.results = t("targets.form.errResults"); any = true; }
  d.targets.forEach((tg) => {
    const e = {};
    if (!String(tg.title).trim()) e.title = t("targets.form.errResultTitle");
    if (isNumeric(tg.type)) {
      const s = Number(tg.start), g = Number(tg.target);
      if (tg.start === "" || tg.target === "" || !Number.isFinite(s) || !Number.isFinite(g)) {
        e.numbers = t("targets.form.errNumbers");
      } else if (tg.direction === "down" ? g >= s : g <= s) {
        e.numbers = t(tg.direction === "down" ? "targets.form.errDown" : "targets.form.errUp");
      }
    }
    if (tg.type === "tasks" && !(tg.items ?? []).some((i) => String(i.text).trim())) e.items = t("targets.form.errItems");
    if (Object.keys(e).length) { err.targets[tg.id] = e; any = true; }
  });
  return any ? err : null;
}

// Strings typed into number boxes become numbers, blanks become their default,
// and an empty list item is dropped rather than saved as a nameless task.
function finalize(d) {
  return {
    ...d,
    title: d.title.trim(),
    description: String(d.description ?? "").trim(),
    owner: String(d.owner ?? "").trim(),
    targets: d.targets.map((tg) => {
      const numeric = isNumeric(tg.type);
      const start = numeric ? num(tg.start) : 0;
      return {
        ...tg,
        title: String(tg.title).trim(),
        unit: tg.type === "percent" ? "" : String(tg.unit ?? "").trim(),
        start,
        target: numeric ? num(tg.target) : 1,
        current: numeric ? (tg.current === "" ? start : num(tg.current, start)) : 0,
        weight: num(tg.weight, 1) || 1,
        items: tg.type === "tasks" ? (tg.items ?? []).filter((i) => String(i.text).trim()).map((i) => ({ ...i, text: String(i.text).trim() })) : [],
      };
    }),
  };
}

export default function GoalFormModal({ initial, today, onClose, onSave, zIndex = 50 }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(() => (initial ? clone(initial) : newGoal(today)));
  const [errors, setErrors] = useState(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setTg = (id, patch) => setDraft((d) => ({
    ...d,
    targets: d.targets.map((tg) => (tg.id === id ? { ...tg, ...(typeof patch === "function" ? patch(tg) : patch) } : tg)),
  }));
  const addTg = () => setDraft((d) => ({ ...d, targets: [...d.targets, newTarget("number")] }));
  const removeTg = (id) => setDraft((d) => ({ ...d, targets: d.targets.filter((tg) => tg.id !== id) }));

  const submit = () => {
    const err = validate(draft, t);
    setErrors(err);
    if (err) return;
    onSave(finalize(draft));
  };

  const catOptions = CATEGORIES.map((c) => ({
    value: c,
    title: t(`targets.cat.${c}`),
    label: (
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: categoryColor(c) }} />
        {t(`targets.cat.${c}`)}
      </span>
    ),
  }));

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? t("targets.editGoal") : t("targets.newGoal")}
      icon={<TargetIcon size={16} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-2xl"
      zIndex={zIndex}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit}>{t("common.save")}</Button>
        </>
      }
    >
      <FormField label={t("targets.form.title")} required error={errors?.title}>
        <input
          className={INPUT_CLS} style={INPUT_STYLE} autoFocus
          value={draft.title} placeholder={t("targets.form.titlePh")}
          onChange={(ev) => set({ title: ev.target.value })}
        />
      </FormField>
      <FormField label={t("targets.form.desc")}>
        <textarea
          className={`${INPUT_CLS} resize-none`} style={INPUT_STYLE} rows={2}
          value={draft.description} placeholder={t("targets.form.descPh")}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t("targets.form.owner")}>
          <input
            className={INPUT_CLS} style={INPUT_STYLE}
            value={draft.owner} placeholder={t("targets.form.ownerPh")}
            onChange={(ev) => set({ owner: ev.target.value })}
          />
        </FormField>
        <FormField label={t("targets.form.category")}>
          <StyledSelect value={draft.category} onChange={(v) => set({ category: v })} options={catOptions} />
        </FormField>
      </div>
      <FormField label={t("targets.form.period")} hint={t("targets.form.periodHint")} error={errors?.dates}>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            single dateFrom={draft.start} dateTo={draft.start}
            setDateFrom={(v) => set({ start: v })} setDateTo={() => {}}
            triggerClassName="px-3 py-2 text-sm"
          />
          <span style={{ color: "var(--text-4)" }}>→</span>
          <DateRangePicker
            single dateFrom={draft.due} dateTo={draft.due}
            setDateFrom={(v) => set({ due: v })} setDateTo={() => {}}
            triggerClassName="px-3 py-2 text-sm"
          />
        </div>
      </FormField>

      <div className="flex items-start justify-between gap-2 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("targets.form.results")}<span style={{ color: "#ef4444" }}> *</span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t("targets.form.resultsHint")}</div>
        </div>
        <Button size="sm" variant="primary" tint icon={<Plus size={13} />} onClick={addTg}>{t("targets.form.addResult")}</Button>
      </div>
      {errors?.results && <p className="text-[11px]" style={{ color: "#ef4444" }}>{errors.results}</p>}

      {draft.targets.map((tg, i) => (
        <TargetEditor
          key={tg.id} index={i} tg={tg} t={t}
          err={errors?.targets?.[tg.id]}
          onChange={(patch) => setTg(tg.id, patch)}
          onRemove={() => removeTg(tg.id)}
        />
      ))}
    </Modal>
  );
}

function TargetEditor({ index, tg, err, t, onChange, onRemove }) {
  const numeric = isNumeric(tg.type);
  const typeOptions = TYPES.map((ty) => ({
    value: ty,
    title: t(`targets.type.${ty}`),
    label: (
      <span className="inline-flex items-center gap-1">
        <TypeIcon type={ty} size={12} />
        {t(`targets.type.${ty}`)}
      </span>
    ),
  }));
  const setType = (ty) => onChange((cur) => ({
    type: ty,
    // A percent target that still carries the number default of 0 gets the
    // one target a percent almost always means.
    target: ty === "percent" && num(cur.target) === 0 ? 100 : cur.target,
  }));

  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-end gap-2">
        <span
          className="grid place-items-center w-7 h-7 rounded-lg text-[11px] font-bold flex-shrink-0 mb-0.5"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <FormField label={t("targets.form.resultTitle")} required error={err?.title}>
            <input
              className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
              value={tg.title} placeholder={t("targets.form.resultTitlePh")}
              onChange={(ev) => { const v = ev.target.value; onChange({ title: v }); }}
            />
          </FormField>
        </div>
        <Button variant="ghost" size="md" icon={<X size={14} />} onClick={onRemove} aria-label={t("targets.form.remove")} title={t("targets.form.remove")} className="mb-0.5" />
      </div>

      <FormField label={t("targets.form.type")} hint={t(`targets.type.${tg.type}.hint`)}>
        <SegmentedToggle fill size="sm" value={tg.type} onChange={setType} options={typeOptions} />
      </FormField>

      <div className={`grid gap-3 ${numeric ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {numeric && (
          <FormField label={t("targets.form.direction")}>
            <SegmentedToggle
              fill size="sm" value={tg.direction} onChange={(v) => onChange({ direction: v })}
              options={[
                { value: "up", title: t("targets.dir.up"), label: <span className="inline-flex items-center gap-1"><ArrowUp size={12} />{t("targets.dir.up")}</span> },
                { value: "down", title: t("targets.dir.down"), label: <span className="inline-flex items-center gap-1"><ArrowDown size={12} />{t("targets.dir.down")}</span> },
              ]}
            />
          </FormField>
        )}
        <FormField label={t("targets.weight")} hint={t("targets.weightHint")}>
          <StyledSelect
            value={num(tg.weight, 1) || 1} onChange={(v) => onChange({ weight: v })}
            options={[1, 2, 3].map((w) => ({ value: w, label: `×${w}` }))}
          />
        </FormField>
      </div>

      {numeric && (
        <div className={`grid gap-2 ${tg.type === "percent" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          {[["start", "targets.start"], ["current", "targets.current"], ["target", "targets.target"]].map(([k, key]) => (
            <FormField key={k} label={t(key)} required={k !== "current"} error={k === "target" ? err?.numbers : undefined}>
              <input
                type="number" step="any" inputMode="decimal"
                className={`${INPUT_CLS} font-mono`} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
                value={tg[k] ?? ""}
                onChange={(ev) => { const v = ev.target.value; onChange({ [k]: v }); }}
              />
            </FormField>
          ))}
          {tg.type !== "percent" && (
            <FormField label={t("targets.form.unit")}>
              <input
                className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
                value={tg.unit ?? ""} placeholder={tg.type === "currency" ? "so'm" : t("targets.form.unitPh")}
                onChange={(ev) => { const v = ev.target.value; onChange({ unit: v }); }}
              />
            </FormField>
          )}
        </div>
      )}

      {tg.type === "tasks" && (
        <FormField label={t("targets.form.items")} required error={err?.items}>
          <div className="space-y-1.5">
            {(tg.items ?? []).map((it) => (
              <div key={it.id} className="flex items-center gap-1.5">
                <input
                  className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
                  value={it.text} placeholder={t("targets.taskPlaceholder")}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    onChange((cur) => ({ items: cur.items.map((x) => (x.id === it.id ? { ...x, text: v } : x)) }));
                  }}
                />
                <Button
                  variant="ghost" size="md" icon={<X size={13} />} aria-label={t("targets.form.remove")} title={t("targets.form.remove")}
                  onClick={() => onChange((cur) => ({ items: cur.items.filter((x) => x.id !== it.id) }))}
                />
              </div>
            ))}
            <Button
              size="sm" variant="secondary" tint icon={<Plus size={12} />}
              onClick={() => onChange((cur) => ({ items: [...(cur.items ?? []), { id: uid(), text: "", done: false }] }))}
            >
              {t("targets.addTask")}
            </Button>
          </div>
        </FormField>
      )}
    </div>
  );
}
