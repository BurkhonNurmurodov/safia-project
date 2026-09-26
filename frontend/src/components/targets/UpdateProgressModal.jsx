// «Update» — every result of one goal in one short dialog: type the new
// numbers, flip a yes/no, tick the list, save once. The weekly check-in takes
// one screen instead of one dialog per result.
//
// `only` narrows it to ONE result (the «Enter a value» button on a goal's
// page). There a save always records a check-in, even of an unchanged value —
// the reader asked to confirm that result. For a whole goal, a numeric result
// whose value did not move writes nothing, or every weekly update would bury
// the history under entries that say «still 47».
import { useRef, useState } from "react";
import { RefreshCw, Square, SquareCheckBig } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import { TypeIcon } from "./bits";
import { INPUT_CLS, INPUT_STYLE, krParts } from "./targetsUi";
import { useLang } from "../../context/LangContext";
import { GREEN, RED } from "../../utils/statusBands";
import {
  isNumeric, parseNum, num, fmtInput, fmtNumber, applyCheckin, direction, fill,
} from "../../utils/targets";

const FORM_ID = "targets-update-form";

const unitOf = (tg) =>
  tg.type === "percent" ? "%" : tg.type === "currency" ? (tg.unit || "so'm") : tg.unit;

function RowHead({ tg, htmlFor, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0"
        style={{ background: "var(--bg-card)", color: "var(--text-2)", border: "1px solid var(--border)" }}
      >
        <TypeIcon type={tg.type} size={15} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>
            {tg.title}
          </label>
        ) : (
          <div className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>{tg.title}</div>
        )}
        {children && <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>{children}</div>}
      </div>
    </div>
  );
}

export default function UpdateProgressModal({ goal, only = null, today, onClose, onSave, zIndex = 50 }) {
  const { t } = useLang();
  const single = !!only;
  const list = (goal.targets ?? []).filter((tg) => !only || tg.id === only);
  const [vals, setVals] = useState(() => Object.fromEntries(
    list.filter((tg) => isNumeric(tg.type)).map((tg) => [tg.id, fmtInput(num(tg.current, num(tg.start)))]),
  ));
  const [flags, setFlags] = useState(() => Object.fromEntries(
    list.filter((tg) => tg.type === "boolean").map((tg) => [tg.id, !!tg.done]),
  ));
  const [ticks, setTicks] = useState(() => Object.fromEntries(
    list.filter((tg) => tg.type === "tasks").map((tg) => [tg.id, Object.fromEntries((tg.items ?? []).map((i) => [i.id, !!i.done]))]),
  ));
  const [at, setAt] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const inputs = useRef({});
  const hasNumeric = list.some((tg) => isNumeric(tg.type));

  const submit = (ev) => {
    ev.preventDefault();
    const errs = {};
    list.forEach((tg) => {
      if (isNumeric(tg.type) && !Number.isFinite(parseNum(vals[tg.id]))) errs[tg.id] = t("targets.update.errNumber");
    });
    setErrors(errs);
    const firstBad = list.find((tg) => errs[tg.id]);
    if (firstBad) {
      inputs.current[firstBad.id]?.focus();
      return;
    }
    const picked = new Set(list.map((tg) => tg.id));
    onSave({
      ...goal,
      targets: (goal.targets ?? []).map((tg) => {
        if (!picked.has(tg.id)) return tg;
        if (isNumeric(tg.type)) {
          const v = parseNum(vals[tg.id]);
          const moved = v !== num(tg.current, num(tg.start));
          return moved || single ? applyCheckin(tg, { value: v, at, note }) : tg;
        }
        if (tg.type === "boolean") return { ...tg, done: !!flags[tg.id] };
        if (tg.type === "tasks") {
          return { ...tg, items: (tg.items ?? []).map((i) => ({ ...i, done: ticks[tg.id]?.[i.id] ?? i.done })) };
        }
        return tg;
      }),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      zIndex={zIndex}
      title={single ? t("targets.checkin") : t("targets.updateTitle")}
      subtitle={goal.title}
      icon={<RefreshCw size={16} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" size="lg" type="submit" form={FORM_ID}>{t("common.save")}</Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-3">
        {list.map((tg) => {
          const box = { background: "var(--bg-inner)", border: "1px solid var(--border)" };

          if (isNumeric(tg.type)) {
            const id = `upd-${tg.id}`;
            const { cur, tgt, unit: u } = krParts(tg, t);
            const unit = unitOf(tg);
            const was = num(tg.current, num(tg.start));
            const v = parseNum(vals[tg.id]);
            const delta = Number.isFinite(v) ? v - was : 0;
            const good = direction(tg) === "down" ? delta < 0 : delta > 0;
            const err = errors[tg.id];
            return (
              <div key={tg.id} className="rounded-xl p-3" style={box}>
                <RowHead tg={tg} htmlFor={id}>
                  {fill(t("targets.update.nowTarget"), { cur: `${cur}${u}`, tgt: `${tgt}${u}` })}
                </RowHead>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    id={id}
                    ref={(el) => { inputs.current[tg.id] = el; }}
                    type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
                    autoFocus={single}
                    className={`${INPUT_CLS} font-mono tabular-nums`}
                    style={{ ...INPUT_STYLE, background: "var(--bg-card)", ...(err ? { border: `1px solid ${RED}` } : null) }}
                    value={vals[tg.id] ?? ""}
                    aria-invalid={!!err}
                    aria-describedby={`${id}-msg`}
                    onFocus={(ev) => ev.target.select()}
                    onChange={(ev) => {
                      const val = ev.target.value;
                      setVals((s) => ({ ...s, [tg.id]: val }));
                      if (errors[tg.id]) setErrors((s) => ({ ...s, [tg.id]: undefined }));
                    }}
                  />
                  {unit && <span className="text-sm flex-shrink-0" style={{ color: "var(--text-2)" }}>{unit}</span>}
                </div>
                <p id={`${id}-msg`} className="mt-1.5 text-xs min-h-[1rem]" aria-live="polite"
                  style={{ color: err ? RED : delta ? (good ? GREEN : RED) : "var(--text-2)" }}>
                  {err || (delta
                    ? fill(t("targets.update.change"), { d: `${delta > 0 ? "+" : ""}${fmtNumber(delta)}${unit ? (unit === "%" ? "%" : ` ${unit}`) : ""}` })
                    : single ? t("targets.update.sameConfirm") : t("targets.update.same"))}
                </p>
              </div>
            );
          }

          if (tg.type === "boolean") {
            return (
              <div key={tg.id} className="rounded-xl p-3" style={box}>
                <RowHead tg={tg} t={t}>{t("targets.type.boolean")}</RowHead>
                <SegmentedToggle
                  fill className="mt-2.5"
                  value={flags[tg.id] ? "yes" : "no"}
                  onChange={(val) => setFlags((s) => ({ ...s, [tg.id]: val === "yes" }))}
                  options={[["no", t("targets.markUndone")], ["yes", t("targets.markDone")]]}
                  ariaLabel={tg.title}
                />
              </div>
            );
          }

          if (tg.type === "tasks") {
            const items = tg.items ?? [];
            const d = items.filter((i) => ticks[tg.id]?.[i.id]).length;
            return (
              <div key={tg.id} className="rounded-xl p-3" style={box}>
                <RowHead tg={tg} t={t}>{fill(t("targets.tasksDone"), { done: d, total: items.length })}</RowHead>
                {items.length ? (
                  <ul className="mt-2 -mx-1 space-y-0.5">
                    {items.map((i) => {
                      const on = !!ticks[tg.id]?.[i.id];
                      return (
                        <li key={i.id}>
                          <button
                            type="button" role="checkbox" aria-checked={on}
                            onClick={() => setTicks((s) => ({ ...s, [tg.id]: { ...s[tg.id], [i.id]: !on } }))}
                            className="w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                          >
                            {on
                              ? <SquareCheckBig size={17} className="flex-shrink-0 mt-px" style={{ color: GREEN }} aria-hidden />
                              : <Square size={17} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} aria-hidden />}
                            <span className={`min-w-0 break-words ${on ? "line-through" : ""}`} style={{ color: on ? "var(--text-3)" : "var(--text-1)" }}>
                              {i.text}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>{t("targets.update.noItems")}</p>
                )}
              </div>
            );
          }
          return null;
        })}

        {hasNumeric && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <FormField label={t("targets.checkinDate")} alignTop>
              <DateRangePicker
                single dateFrom={at} dateTo={at} max={today}
                setDateFrom={(val) => setAt(val)} setDateTo={() => {}}
                triggerClassName="w-full px-3 py-2 text-sm"
              />
            </FormField>
            <FormField label={t("targets.checkinNote")} alignTop>
              <input
                className={INPUT_CLS} style={INPUT_STYLE}
                value={note} placeholder={t("targets.update.notePh")}
                onChange={(ev) => setNote(ev.target.value)}
              />
            </FormField>
          </div>
        )}
      </form>
    </Modal>
  );
}
