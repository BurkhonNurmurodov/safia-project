// One key result on a goal's page: where it stands and the controls that move
// it, each type drawn the way its data is shaped — a number as its values over
// time against the plan and the target (plus «Enter a value» and its history),
// a task list as blocks and ticks, a yes/no result as a switch. Every write
// goes up through `onChange` as a whole new result.
import { useState } from "react";
import { Plus, X, Square, SquareCheckBig, Trash2 } from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmDialog from "../ui/ConfirmDialog";
import ResultTrendChart from "./charts/ResultTrendChart";
import SegmentBar from "./charts/SegmentBar";
import { MARK_COLOR } from "./charts/chartKit";
import { StatusChip, TypeIcon, DirIcon } from "./bits";
import { INPUT_CLS, INPUT_STYLE } from "./targetsUi";
import { GREEN, RED } from "../../utils/statusBands";
import {
  targetProgress, targetStatus, remaining, neededPerDay, removeCheckin,
  fmtValue, fmtNumber, fmtPct, fmtDate, fill, hexA, isNumeric, num, uid, markDone, STATUS_COLOR,
} from "../../utils/targets";

const HISTORY_ROWS = 3;

export default function ResultCard({ tg, goal, today, t, onChange, onCheckin }) {
  const p = targetProgress(tg);
  const st = targetStatus(tg, goal, today);
  const color = STATUS_COLOR[st];
  const numeric = isNumeric(tg.type);
  const weight = num(tg.weight, 1);

  return (
    <article className="@container rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <header className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-xl flex-shrink-0" style={{ background: hexA(color, 0.14), color }}>
          <TypeIcon type={tg.type} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          {/* Chip above the title on a narrow card, beside it on a wide one —
              the goal cards' arrangement, sized by the card itself. */}
          <div className="flex flex-col-reverse items-start gap-1.5 @md:flex-row @md:gap-3">
            <h3 className="self-stretch @md:flex-1 min-w-0 text-[15px] font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>
              {tg.title}
            </h3>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{fmtPct(p)}</span>
              <StatusChip status={st} t={t} />
            </span>
          </div>
          {(numeric || weight > 1) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs" style={{ color: "var(--text-2)" }}>
              {numeric && (
                <span className="inline-flex items-center gap-1">
                  <DirIcon direction={tg.direction} />{t(`targets.dir.${tg.direction}`)}
                </span>
              )}
              {numeric && weight > 1 && <span aria-hidden style={{ color: "var(--text-4)" }}>·</span>}
              {weight > 1 && <span>{fill(t("targets.weightTimes"), { w: weight })}</span>}
            </div>
          )}
        </div>
      </header>

      {numeric && <NumericBody tg={tg} goal={goal} today={today} t={t} color={MARK_COLOR[st]} onChange={onChange} onCheckin={onCheckin} />}
      {tg.type === "boolean" && (
        <SegmentedToggle
          fill
          value={tg.done ? "yes" : "no"}
          onChange={(v) => onChange((cur) => ({ ...cur, ...markDone(v === "yes", today) }))}
          options={[["no", t("targets.markUndone")], ["yes", t("targets.markDone")]]}
          ariaLabel={tg.title}
        />
      )}
      {tg.type === "tasks" && <TasksBody tg={tg} t={t} today={today} color={MARK_COLOR[st]} onChange={onChange} />}
    </article>
  );
}

function NumericBody({ tg, goal, today, t, color, onChange, onCheckin }) {
  const [showAll, setShowAll] = useState(false);
  const [dropping, setDropping] = useState(null); // the check-in awaiting confirm
  const rem = remaining(tg);
  const perDay = neededPerDay(tg, goal, today);
  const checkins = tg.checkins ?? [];
  const newestFirst = [...checkins].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, HISTORY_ROWS);
  const facts = [
    rem !== null && rem > 0 ? fill(t("targets.remaining"), { v: fmtValue(rem, tg) }) : null,
    perDay !== null ? fill(t("targets.neededPerDay"), { v: fmtValue(perDay, tg) }) : null,
  ].filter(Boolean);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <div className="text-2xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{fmtValue(tg.current, tg)}</div>
        <div className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
          {fill(t("targets.startToTarget"), { s: fmtValue(tg.start, tg), g: fmtValue(tg.target, tg) })}
        </div>
      </div>

      <div>
        <ResultTrendChart tg={tg} goal={goal} today={today} t={t} />
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
          <li className="inline-flex items-center gap-1.5"><span className="w-4" style={{ borderTop: `2px solid ${color}` }} aria-hidden />{t("targets.chart.kr.value")}</li>
          {goal.start && goal.due && (
            <li className="inline-flex items-center gap-1.5"><span className="w-4" style={{ borderTop: "2px dashed var(--text-3)" }} aria-hidden />{t("targets.chart.kr.path")}</li>
          )}
        </ul>
      </div>

      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
          {facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}

      <Button size="lg" variant="primary" tint icon={<Plus size={15} />} onClick={onCheckin} className="w-full sm:w-auto">
        {t("targets.checkin")}
      </Button>

      {checkins.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-3)" }}>
            {t("targets.history")}
          </div>
          <ul>
            {shown.map((c) => {
              const idx = checkins.findIndex((x) => x.id === c.id);
              const prev = idx > 0 ? checkins[idx - 1].value : num(tg.start);
              const delta = c.value - prev;
              const good = tg.direction === "down" ? delta < 0 : delta > 0;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="w-[5.5rem] flex-shrink-0 text-xs truncate" style={{ color: "var(--text-2)" }}>{fmtDate(c.at, t, today)}</span>
                  <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>{fmtValue(c.value, tg)}</span>
                  {delta !== 0 && (
                    <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: good ? GREEN : RED }}>
                      {delta > 0 ? "+" : ""}{fmtNumber(delta)}
                    </span>
                  )}
                  {/* The note: its own line under the value on a narrow card, where
                      a truncated note is three letters and a tooltip; inline on a wide one. */}
                  {c.note && (
                    <span
                      className="order-last basis-full pl-[6.25rem] text-xs break-words @md:order-none @md:basis-0 @md:flex-1 @md:min-w-0 @md:pl-0 @md:truncate"
                      style={{ color: "var(--text-2)" }} title={c.note}
                    >
                      {c.note}
                    </span>
                  )}
                  <Button
                    variant="ghost" size="md" icon={<Trash2 size={13} />} className="flex-shrink-0 -my-1 ml-auto"
                    aria-label={t("targets.checkinDelete")} title={t("targets.checkinDelete")}
                    onClick={() => setDropping(c)}
                  />
                </li>
              );
            })}
          </ul>
          {checkins.length > HISTORY_ROWS && (
            <button
              type="button" onClick={() => setShowAll((s) => !s)}
              className="mt-1 text-xs font-medium underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              style={{ color: "var(--text-2)" }}
            >
              {showAll ? t("targets.showLess") : fill(t("targets.showAll"), { n: checkins.length })}
            </button>
          )}
        </div>
      )}

      {dropping && (
        <ConfirmDialog
          open tone="danger"
          title={t("targets.checkinDelete")}
          message={fill(t("targets.checkinDeleteMsg"), { date: fmtDate(dropping.at, t, today), v: fmtValue(dropping.value, tg) })}
          confirmLabel={t("common.delete")}
          onCancel={() => setDropping(null)}
          onConfirm={() => { onChange((cur) => removeCheckin(cur, dropping.id)); setDropping(null); }}
        />
      )}
    </>
  );
}

function TasksBody({ tg, t, today, color, onChange }) {
  const [text, setText] = useState("");
  const items = tg.items ?? [];
  const add = (ev) => {
    ev.preventDefault();
    const v = text.trim();
    if (!v) return;
    onChange((cur) => ({ ...cur, items: [...(cur.items ?? []), { id: uid(), text: v, done: false }] }));
    setText("");
  };
  const done = items.filter((i) => i.done).length;
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <SegmentBar items={items} color={color} height={10} className="flex-1" label={fill(t("targets.tasksDone"), { done, total: items.length })} />
          <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>
            {done}<span style={{ color: "var(--text-3)" }}> / {items.length}</span>
          </span>
        </div>
      )}
      {items.length > 0 && (
        <ul className="-mx-1 space-y-0.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-1">
              <button
                type="button" role="checkbox" aria-checked={it.done}
                onClick={() => onChange((cur) => ({ ...cur, items: cur.items.map((x) => (x.id === it.id ? { ...x, ...markDone(!x.done, today) } : x)) }))}
                className="flex-1 min-w-0 flex items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                {it.done
                  ? <SquareCheckBig size={17} className="flex-shrink-0 mt-px" style={{ color: GREEN }} aria-hidden />
                  : <Square size={17} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} aria-hidden />}
                <span className={`min-w-0 break-words ${it.done ? "line-through" : ""}`} style={{ color: it.done ? "var(--text-3)" : "var(--text-1)" }}>
                  {it.text}
                </span>
              </button>
              <Button
                variant="ghost" size="md" icon={<X size={14} />} className="flex-shrink-0 mt-0.5"
                aria-label={fill(t("targets.removeItem"), { item: it.text })} title={t("targets.form.remove")}
                onClick={() => onChange((cur) => ({ ...cur, items: cur.items.filter((x) => x.id !== it.id) }))}
              />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-center gap-2">
        <input
          className={INPUT_CLS} style={INPUT_STYLE}
          value={text} placeholder={t("targets.taskPlaceholder")} aria-label={t("targets.addTask")}
          onChange={(ev) => setText(ev.target.value)}
        />
        <Button type="submit" size="lg" variant="secondary" icon={<Plus size={15} />} disabled={!text.trim()}
          aria-label={t("targets.addTask")} className="flex-shrink-0">
          <span className="hidden sm:inline">{t("targets.addTask")}</span>
        </Button>
      </form>
    </div>
  );
}
