// A goal opened up: the summary (ring, status, period, pace, forecast), then
// every key result with the controls that move it — a check-in with its date
// and note for a numeric target, a done switch for a yes/no one, a checklist
// for a task list — and the check-in history under each. Every write goes up
// through `onChange` as a whole new goal; nothing is stored here.
import { useState } from "react";
import {
  Target as TargetIcon, Pencil, Trash2, Plus, X, Square, SquareCheckBig,
  CalendarClock, Gauge, Rocket, UserRound,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import ProgressRing from "./ProgressRing";
import Sparkline from "./Sparkline";
import { StatusChip, CategoryTag, TypeIcon, DirIcon, OwnerAvatar, PaceBar, MiniBar } from "./bits";
import { DaysLeft } from "./GoalCard";
import { INPUT_CLS, INPUT_STYLE } from "./targetsUi";
import { useLang } from "../../context/LangContext";
import { GREEN, RED } from "../../utils/statusBands";
import {
  goalProgress, goalStatus, elapsed, daysLeft, projection, targetProgress, targetStatus,
  remaining, neededPerDay, lastCheckin, series, applyCheckin, removeCheckin,
  fmtValue, fmtNumber, fmtPct, fmtDate, fill, hexA, categoryColor, isNumeric, num, uid,
  STATUS_COLOR,
} from "../../utils/targets";

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl px-3 py-2 min-w-0" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--text-4)" }}>
        {Icon && <Icon size={11} />}{label}
      </div>
      <div className="text-xs mt-0.5 min-w-0" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

export default function GoalDetailModal({ goal, today, onClose, onChange, onEdit, onDelete }) {
  const { t } = useLang();
  const p = goalProgress(goal);
  const st = goalStatus(goal, today);
  const e = elapsed(goal, today);
  const left = daysLeft(goal, today);
  const proj = projection(goal, today);
  const color = STATUS_COLOR[st];
  const targets = goal.targets ?? [];
  const done = targets.filter((tg) => targetProgress(tg) >= 1).length;

  const updateTarget = (id, fn) =>
    onChange({ ...goal, targets: targets.map((tg) => (tg.id === id ? fn(tg) : tg)) });

  // What the pace so far says. Above 100% the percent stops meaning anything
  // and the DATE is the answer; past the deadline only the date is left.
  const finishLine = proj.finish ? fill(t("targets.projectionFinish"), { date: fmtDate(proj.finish, t, today) }) : null;
  const forecast = (() => {
    if (st === "achieved") return { main: t("targets.st.achieved"), sub: null };
    if (proj.atDue === null) return { main: t("targets.projectionNone"), sub: null };
    if (left !== null && left < 0) return { main: finishLine ?? t("targets.projectionNone"), sub: null };
    if (proj.atDue >= 1) return { main: finishLine ?? t("targets.st.on_track"), sub: t("targets.projectionEarly") };
    return { main: fill(t("targets.projectionAtDue"), { p: Math.round(proj.atDue * 100) }), sub: finishLine };
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={goal.title}
      subtitle={`${t(`targets.cat.${goal.category}`)}${goal.owner ? ` · ${goal.owner}` : ""}`}
      icon={<TargetIcon size={16} style={{ color: categoryColor(goal.category) }} />}
      maxWidth="max-w-3xl"
      bodyClassName="px-5 py-4 space-y-4"
      footer={
        <>
          <Button variant="secondary" icon={<Pencil size={13} />} onClick={onEdit}>{t("common.edit")}</Button>
          <Button variant="danger" tint icon={<Trash2 size={13} />} onClick={onDelete}>{t("common.delete")}</Button>
          <Button variant="primary" onClick={onClose}>{t("targets.close")}</Button>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-4">
        <ProgressRing value={p} size={96} stroke={10} color={color} sub={t("targets.progress")} />
        <div className="flex-1 min-w-[220px] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={st} t={t} size="md" />
            <CategoryTag category={goal.category} t={t} />
          </div>
          {goal.description && <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{goal.description}</p>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Fact icon={UserRound} label={t("targets.owner")}>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <OwnerAvatar name={goal.owner} size={18} />
                <span className="truncate" style={{ color: goal.owner ? "var(--text-1)" : "var(--text-4)" }}>{goal.owner || t("targets.noOwner")}</span>
              </span>
            </Fact>
            <Fact icon={CalendarClock} label={t("targets.period")}>
              {goal.start && goal.due ? (
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span>{fmtDate(goal.start, t, today)} – {fmtDate(goal.due, t, today)}</span>
                  {st !== "achieved" && <DaysLeft left={left} t={t} />}
                </span>
              ) : t("targets.noDates")}
            </Fact>
            <Fact icon={Gauge} label={t("targets.expected")}>
              <span className="font-mono font-semibold" title={t("targets.expectedHint")}>{e === null ? "—" : fmtPct(e)}</span>
            </Fact>
            <Fact icon={Rocket} label={t("targets.projection")}>
              <span>{forecast.main}</span>
              {forecast.sub && (
                <span className="block text-[11px]" style={{ color: "var(--text-4)" }}>{forecast.sub}</span>
              )}
            </Fact>
          </div>
        </div>
      </div>

      <div>
        <PaceBar progress={p} expected={e} color={color} height={10} />
        <div className="text-[11px] mt-1" style={{ color: "var(--text-4)" }}>{t("targets.paceLegend")}</div>
      </div>

      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
          {t("targets.results")} · {fill(t("targets.resultsCount"), { done, total: targets.length })}
        </div>
        {targets.map((tg) => (
          <TargetBlock key={tg.id} tg={tg} goal={goal} today={today} t={t} onUpdate={(fn) => updateTarget(tg.id, fn)} />
        ))}
      </div>
    </Modal>
  );
}

function TargetBlock({ tg, goal, today, t, onUpdate }) {
  const p = targetProgress(tg);
  const st = targetStatus(tg, goal, today);
  const color = STATUS_COLOR[st];
  const numeric = isNumeric(tg.type);
  const [ci, setCi] = useState(null);       // the inline check-in draft
  const [showAll, setShowAll] = useState(false);
  const [newItem, setNewItem] = useState("");
  const last = lastCheckin(tg);
  const rem = remaining(tg);
  const perDay = neededPerDay(tg, goal, today);
  const items = tg.items ?? [];
  const checkins = tg.checkins ?? [];
  const ciValid = ci !== null && ci.value !== "" && Number.isFinite(Number(ci.value));

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    onUpdate((cur) => ({ ...cur, items: [...(cur.items ?? []), { id: uid(), text, done: false }] }));
    setNewItem("");
  };

  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: hexA(color, 0.14), color }}>
            <TypeIcon type={tg.type} size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{tg.title}</div>
            <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-4)" }}>
              <span>{t(`targets.type.${tg.type}`)}</span>
              {numeric && (
                <span className="inline-flex items-center gap-1">· <DirIcon direction={tg.direction} /> {t(`targets.dir.${tg.direction}`)}</span>
              )}
              {num(tg.weight, 1) > 1 && <span>· {t("targets.weight")} ×{num(tg.weight, 1)}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm tabular-nums" style={{ color }}>{fmtPct(p)}</span>
          <StatusChip status={st} t={t} />
        </div>
      </div>

      <MiniBar value={p} color={color} />

      {numeric && (
        <>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{t("targets.start")}</div>
              <div className="font-mono text-sm" style={{ color: "var(--text-3)" }}>{fmtValue(tg.start, tg)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{t("targets.current")}</div>
              <div className="font-mono text-xl font-bold leading-tight" style={{ color }}>{fmtValue(tg.current, tg)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>{t("targets.target")}</div>
              <div className="font-mono text-sm font-semibold" style={{ color: "var(--text-1)" }}>{fmtValue(tg.target, tg)}</div>
            </div>
            <Sparkline points={series(tg, goal)} target={num(tg.target)} color={color} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            {rem !== null && <span>{fill(t("targets.remaining"), { v: fmtValue(rem, tg) })}</span>}
            {perDay !== null && <span>{fill(t("targets.neededPerDay"), { v: fmtValue(perDay, tg) })}</span>}
            {last && <span>{fill(t("targets.lastCheckin"), { date: fmtDate(last.at, t, today) })}</span>}
          </div>

          {ci ? (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <FormField label={t("targets.checkinNew")} required>
                  <input
                    type="number" step="any" inputMode="decimal" autoFocus
                    className={`${INPUT_CLS} font-mono`} style={INPUT_STYLE}
                    value={ci.value} onChange={(ev) => { const v = ev.target.value; setCi((c) => ({ ...c, value: v })); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter" && ciValid) { onUpdate((cur) => applyCheckin(cur, ci)); setCi(null); } }}
                  />
                </FormField>
                <FormField label={t("targets.checkinDate")}>
                  <DateRangePicker
                    single dateFrom={ci.at} dateTo={ci.at} max={today}
                    setDateFrom={(v) => setCi((c) => ({ ...c, at: v }))} setDateTo={() => {}}
                    triggerClassName="px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField label={t("targets.checkinNote")}>
                  <input
                    className={INPUT_CLS} style={INPUT_STYLE}
                    value={ci.note} onChange={(ev) => { const v = ev.target.value; setCi((c) => ({ ...c, note: v })); }}
                  />
                </FormField>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setCi(null)}>{t("common.cancel")}</Button>
                <Button size="sm" variant="primary" disabled={!ciValid} onClick={() => { onUpdate((cur) => applyCheckin(cur, ci)); setCi(null); }}>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="primary" tint icon={<Plus size={12} />} onClick={() => setCi({ value: String(num(tg.current, num(tg.start))), at: today, note: "" })}>
              {t("targets.checkin")}
            </Button>
          )}

          {checkins.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-4)" }}>{t("targets.history")}</div>
              <ul className="space-y-1">
                {[...checkins].reverse().slice(0, showAll ? undefined : 3).map((c) => {
                  const idx = checkins.findIndex((x) => x.id === c.id);
                  const prev = idx > 0 ? checkins[idx - 1].value : num(tg.start);
                  const delta = c.value - prev;
                  const good = tg.direction === "down" ? delta < 0 : delta > 0;
                  return (
                    <li key={c.id} className="flex items-center gap-2 text-xs min-w-0">
                      <span className="font-mono w-16 flex-shrink-0 text-[11px]" style={{ color: "var(--text-4)" }}>{fmtDate(c.at, t, today)}</span>
                      <span className="font-mono font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{fmtValue(c.value, tg)}</span>
                      {delta !== 0 && (
                        <span className="font-mono text-[11px] tabular-nums" style={{ color: good ? GREEN : RED }}>
                          {delta > 0 ? "+" : ""}{fmtNumber(delta)}
                        </span>
                      )}
                      {c.note && <span className="truncate flex-1 min-w-0" style={{ color: "var(--text-3)" }}>{c.note}</span>}
                      <Button
                        variant="ghost" size="sm" icon={<X size={12} />} className="ml-auto flex-shrink-0"
                        aria-label={t("targets.checkinDelete")} title={t("targets.checkinDelete")}
                        onClick={() => onUpdate((cur) => removeCheckin(cur, c.id))}
                      />
                    </li>
                  );
                })}
              </ul>
              {checkins.length > 3 && (
                <button type="button" className="text-[11px] underline underline-offset-2 mt-1" style={{ color: "var(--text-3)" }} onClick={() => setShowAll((s) => !s)}>
                  {showAll ? t("targets.showLess") : fill(t("targets.showAll"), { n: checkins.length })}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {tg.type === "boolean" && (
        <SegmentedToggle
          size="sm" value={tg.done ? "yes" : "no"}
          onChange={(v) => onUpdate((cur) => ({ ...cur, done: v === "yes" }))}
          options={[["no", t("targets.markUndone")], ["yes", t("targets.markDone")]]}
        />
      )}

      {tg.type === "tasks" && (
        <div className="space-y-1.5">
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-1 text-xs min-w-0">
                <button
                  type="button"
                  onClick={() => onUpdate((cur) => ({ ...cur, items: cur.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) }))}
                  className="inline-flex items-center gap-2 text-left flex-1 min-w-0 py-0.5"
                  style={{ color: it.done ? "var(--text-4)" : "var(--text-1)" }}
                >
                  {it.done
                    ? <SquareCheckBig size={15} className="flex-shrink-0" style={{ color: GREEN }} />
                    : <Square size={15} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />}
                  <span className={`truncate ${it.done ? "line-through" : ""}`}>{it.text}</span>
                </button>
                <Button
                  variant="ghost" size="sm" icon={<X size={12} />} aria-label={t("targets.form.remove")} title={t("targets.form.remove")}
                  onClick={() => onUpdate((cur) => ({ ...cur, items: cur.items.filter((x) => x.id !== it.id) }))}
                />
              </li>
            ))}
          </ul>
          <form onSubmit={(ev) => { ev.preventDefault(); addItem(); }} className="flex items-center gap-1.5">
            <input
              className={INPUT_CLS} style={{ ...INPUT_STYLE, background: "var(--bg-card)" }}
              value={newItem} placeholder={t("targets.taskPlaceholder")}
              onChange={(ev) => setNewItem(ev.target.value)}
            />
            <Button type="submit" size="md" variant="primary" tint icon={<Plus size={13} />} disabled={!newItem.trim()} className="whitespace-nowrap">
              {t("targets.addTask")}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
