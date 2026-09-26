// Create / edit a goal and its key results — ONE form for both, on the Modal
// template. Everything is a draft until Save; validation lands on the field
// that caused it (FormField `error`), never as one paragraph under the form.
//
// Number boxes are TEXT with a decimal keypad, so «47,5» and «43 200 000» are
// read the way a person types them (utils/targets `parseNum`).
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
  TYPES, CATEGORIES, isNumeric, newGoal, newTarget, uid, num, parseNum, fmtInput, fill,
} from "../../utils/targets";
import { TypeIcon } from "./bits";
import { INPUT_CLS, INPUT_STYLE, AREA_ICON } from "./targetsUi";

const NUM_FIELDS = ["start", "target", "current"];

// The draft shows numbers as the reader would type them («43 200 000»).
function toDraft(goal) {
  const g = JSON.parse(JSON.stringify(goal));
  g.targets = (g.targets ?? []).map((tg) => (isNumeric(tg.type)
    ? { ...tg, ...Object.fromEntries(NUM_FIELDS.map((k) => [k, fmtInput(tg[k])])) }
    : tg));
  return g;
}

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
      const s = parseNum(tg.start), g = parseNum(tg.target);
      if (!Number.isFinite(s) || !Number.isFinite(g)) {
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
        current: numeric ? num(tg.current, start) : 0,
        weight: num(tg.weight, 1) || 1,
        items: tg.type === "tasks"
          ? (tg.items ?? []).filter((i) => String(i.text).trim()).map((i) => ({ ...i, text: String(i.text).trim() }))
          : [],
      };
    }),
  };
}

export default function GoalFormModal({ initial, today, onClose, onSave, zIndex = 50 }) {
  const { t } = useLang();
  // A new goal opens with one blank numeric result: its target and current
  // boxes EMPTY, so the form asks for them rather than proposing a 0.
  const [draft, setDraft] = useState(() => (initial
    ? toDraft(initial)
    : { ...newGoal(today), targets: [{ ...newTarget("number"), start: "0", target: "", current: "" }] }));
  const [errors, setErrors] = useState(null);
  const [fresh, setFresh] = useState(null); // the result just added — its title takes focus

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setTg = (id, patch) => setDraft((d) => ({
    ...d,
    targets: d.targets.map((tg) => (tg.id === id ? { ...tg, ...(typeof patch === "function" ? patch(tg) : patch) } : tg)),
  }));
  const addTg = () => {
    const tg = { ...newTarget("number"), start: "0", target: "", current: "" };
    setDraft((d) => ({ ...d, targets: [...d.targets, tg] }));
    setFresh(tg.id);
  };
  const removeTg = (id) => setDraft((d) => ({ ...d, targets: d.targets.filter((tg) => tg.id !== id) }));

  const submit = () => {
    const err = validate(draft, t);
    setErrors(err);
    if (err) return;
    onSave(finalize(draft));
  };

  const catOptions = CATEGORIES.map((c) => {
    const Icon = AREA_ICON[c];
    return {
      value: c,
      title: t(`targets.cat.${c}`),
      label: (
        <span className="inline-flex items-center gap-2">
          <Icon size={14} className="flex-shrink-0" style={{ color: "var(--text-2)" }} aria-hidden />
          {t(`targets.cat.${c}`)}
        </span>
      ),
    };
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? t("targets.editGoal") : t("targets.newGoal")}
      subtitle={initial ? initial.title : null}
      icon={<TargetIcon size={16} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-2xl"
      zIndex={zIndex}
      bodyClassName="px-5 py-4 space-y-4"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" size="lg" onClick={submit}>{t("common.save")}</Button>
        </>
      }
    >
      <FormField label={t("targets.form.title")} required error={errors?.title}>
        <input
          className={INPUT_CLS} style={INPUT_STYLE} autoFocus={!initial}
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
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label={t("targets.form.start")} alignTop>
            <DateRangePicker
              single dateFrom={draft.start} dateTo={draft.start}
              setDateFrom={(v) => set({ start: v })} setDateTo={() => {}}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label={t("targets.form.due")} alignTop error={errors?.dates}>
            <DateRangePicker
              single dateFrom={draft.due} dateTo={draft.due}
              setDateFrom={(v) => set({ due: v })} setDateTo={() => {}}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </FormField>
        </div>
        <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{t("targets.form.periodHint")}</p>
      </div>

      <div className="pt-1 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("targets.form.results")}<span style={{ color: "#ef4444" }}> *</span>
          </div>
          <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-3)" }}>{t("targets.form.resultsHint")}</div>
          {errors?.results && <p className="mt-1 text-[11px] font-medium" style={{ color: "#ef4444" }}>{errors.results}</p>}
        </div>

        {draft.targets.map((tg, i) => (
          <TargetEditor
            key={tg.id} index={i} tg={tg} t={t}
            err={errors?.targets?.[tg.id]}
            focus={fresh === tg.id}
            canRemove={draft.targets.length > 1}
            onChange={(patch) => setTg(tg.id, patch)}
            onRemove={() => removeTg(tg.id)}
          />
        ))}

        <button
          type="button" onClick={addTg}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--brand-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          style={{ border: "1px dashed var(--brand-border)", color: "var(--brand-text)" }}
        >
          <Plus size={16} aria-hidden /> {t("targets.form.addResult")}
        </button>
      </div>
    </Modal>
  );
}

function TargetEditor({ index, tg, err, t, focus, canRemove, onChange, onRemove }) {
  const numeric = isNumeric(tg.type);
  const showCurrent = !(tg.checkins?.length);
  const typeOptions = TYPES.map((ty) => ({
    value: ty,
    title: t(`targets.type.${ty}`),
    label: (
      <span className="inline-flex items-center gap-2">
        <TypeIcon type={ty} size={14} style={{ color: "var(--text-2)" }} />
        {t(`targets.type.${ty}`)}
      </span>
    ),
  }));
  const setType = (ty) => onChange((cur) => ({
    type: ty,
    // A percent result that still carries a blank or 0 target gets the one
    // target a percent almost always means.
    target: ty === "percent" && !parseNum(cur.target) ? "100" : cur.target,
  }));
  const fields = [
    ["start", "targets.start", true],
    ["target", "targets.target", true],
    ...(showCurrent ? [["current", "targets.current", false]] : []),
  ];

  return (
    <div className="rounded-xl p-3 sm:p-4 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--brand-text)" }}>
          {fill(t("targets.form.resultN"), { n: index + 1 })}
        </span>
        {canRemove && (
          <Button
            variant="ghost" size="md" icon={<X size={14} />} onClick={onRemove}
            aria-label={t("targets.form.remove")} title={t("targets.form.remove")} className="-my-1 -mr-1"
          />
        )}
      </div>

      <FormField label={t("targets.form.resultTitle")} required error={err?.title}>
        <input
          className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }} autoFocus={focus}
          value={tg.title} placeholder={t("targets.form.resultTitlePh")}
          onChange={(ev) => { const v = ev.target.value; onChange({ title: v }); }}
        />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t("targets.form.type")} hint={t(`targets.type.${tg.type}.hint`)} alignTop>
          <StyledSelect value={tg.type} onChange={setType} options={typeOptions} />
        </FormField>
        <FormField label={t("targets.weight")} hint={t("targets.weightHint")} alignTop>
          <StyledSelect
            value={num(tg.weight, 1) || 1} onChange={(v) => onChange({ weight: v })}
            options={[1, 2, 3].map((w) => ({ value: w, label: `×${w}` }))}
          />
        </FormField>
      </div>

      {numeric && (
        <FormField label={t("targets.form.direction")}>
          <SegmentedToggle
            fill value={tg.direction} onChange={(v) => onChange({ direction: v })}
            ariaLabel={t("targets.form.direction")}
            options={[
              { value: "up", title: t("targets.dir.up"), label: <span className="inline-flex items-center gap-1.5"><ArrowUp size={13} aria-hidden />{t("targets.dir.up")}</span> },
              { value: "down", title: t("targets.dir.down"), label: <span className="inline-flex items-center gap-1.5"><ArrowDown size={13} aria-hidden />{t("targets.dir.down")}</span> },
            ]}
          />
        </FormField>
      )}

      {numeric && (
        <div>
          <div className={`grid gap-3 grid-cols-2 ${tg.type === "percent" ? (showCurrent ? "sm:grid-cols-3" : "sm:grid-cols-2") : (showCurrent ? "sm:grid-cols-4" : "sm:grid-cols-3")}`}>
            {fields.map(([k, key, required]) => (
              <FormField key={k} label={t(key)} required={required} alignTop>
                <input
                  type="text" inputMode="decimal" autoComplete="off"
                  className={`${INPUT_CLS} font-mono tabular-nums`}
                  style={{ ...INPUT_STYLE, background: "var(--bg-card)", ...(err?.numbers && k !== "current" ? { border: "1px solid #ef4444" } : null) }}
                  value={tg[k] ?? ""}
                  placeholder={k === "current" ? String(tg.start ?? "") : undefined}
                  onChange={(ev) => { const v = ev.target.value; onChange({ [k]: v }); }}
                />
              </FormField>
            ))}
            {tg.type !== "percent" && (
              <FormField label={t("targets.form.unitShort")} alignTop>
                <input
                  className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
                  value={tg.unit ?? ""} placeholder={tg.type === "currency" ? "so'm" : t("targets.form.unitPh")}
                  onChange={(ev) => { const v = ev.target.value; onChange({ unit: v }); }}
                />
              </FormField>
            )}
          </div>
          {err?.numbers
            ? <p className="mt-1 text-[11px] leading-snug font-medium" style={{ color: "#ef4444" }}>{err.numbers}</p>
            : !showCurrent && <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{t("targets.form.currentHint")}</p>}
        </div>
      )}

      {tg.type === "tasks" && (
        <FormField label={t("targets.form.items")} required error={err?.items}>
          <div className="space-y-2">
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
                  variant="ghost" size="lg" icon={<X size={14} />} className="flex-shrink-0"
                  aria-label={fill(t("targets.removeItem"), { item: it.text || "…" })} title={t("targets.form.remove")}
                  onClick={() => onChange((cur) => ({ items: cur.items.filter((x) => x.id !== it.id) }))}
                />
              </div>
            ))}
            <Button
              size="md" variant="secondary" icon={<Plus size={13} />}
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
