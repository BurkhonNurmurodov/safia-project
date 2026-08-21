import { useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, Timer, AlertTriangle, Play, Square, Sunrise } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import SegmentedToggle from "../ui/SegmentedToggle";
import TimeWheelPicker from "../ui/TimeWheelPicker";
import api from "../../utils/api";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { CATS, iconFor, catByName } from "./categories";
import { DAY, toMin, fmtDur, durationOf, crossesMidnight } from "../../utils/idleTime";
import { useLang } from "../../context/LangContext";

// Add or correct ONE ojidaniya — the only writer for cell_ojidaniya_intervals.
//
// Every rule this form enforces is enforced by making the wrong answer
// UNPICKABLE rather than by rejecting it afterwards:
//   • the end wheel opens on the window [start + 1min, start + 23h59m], so a
//     zero-length range, a backwards range and a range longer than a day cannot
//     be produced at all — and a range that runs past midnight is reached by
//     simply scrolling on, which is what shift 2 needs;
//   • the end field stays disabled until a start exists, because "end before
//     start" is not a thing to be corrected if it is never expressible;
//   • moving the start onto the existing end clears the end rather than
//     silently leaving a 24-hour stop behind;
//   • Cat H's stopped/not-stopped toggle is locked, since that category has no
//     not-stopped half anywhere in the system.
// A duration longer than 8h is the one mistake that stays possible (a real
// range can be that long), so it WARNS instead of blocking — and it warns
// before Save, not after.
//
// Overlapping an existing ojidaniya is deliberately NOT prevented: a cell can
// genuinely wait on two causes at once. The union arithmetic on the server is
// what stops those shared minutes being counted twice.
export default function IntervalFormModal({
  open, onClose, cell, date, interval = null, initialCategory = "", onSaved,
  // Whether THIS save files a request or writes an ojidaniya outright. Handed
  // down from the server's per-cell `can_decide` — never re-derived from the
  // viewer's role here, which would be a second answer to a question the API
  // has already answered for this exact cell.
  canDecide = true,
}) {
  const { t } = useLang();
  const editing = !!interval;

  const [category, setCategory] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [stopped, setStopped] = useState(true);
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState(null);   // "start" | "end" | null
  const [err, setErr] = useState("");

  // Seed on the OPEN transition (and on which row is being edited), never on
  // `interval`'s object identity: a background refetch hands back an equal row
  // with a new reference, and re-seeding on that would wipe whatever the
  // operator had half-typed while the dialog stood open.
  useEffect(() => {
    if (!open) return;
    setCategory(interval?.category || initialCategory || "");
    setStart(interval?.start || "");
    setEnd(interval?.end || "");
    setStopped(interval ? !!interval.stopped : true);
    setNote(interval?.note || "");
    setErr("");
    setPicker(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interval?.id, initialCategory]);

  const cat = catByName(category);
  const lockedStopped = !!cat?.alwaysStopped;
  // Keep the answer honest when the category changes under it.
  useEffect(() => { if (lockedStopped) setStopped(true); }, [lockedStopped]);

  const startMin = toMin(start);
  // The end's whole legal range, expressed as the wheel's bounds.
  const endWindow = startMin == null ? null : { lo: startMin + 1, hi: startMin + DAY - 1 };
  const minutes = start && end ? durationOf(start, end) : 0;
  const nextDay = start && end && crossesMidnight(start, end);
  const longRun = minutes > 8 * 60;

  const catOptions = useMemo(
    () => CATS.map((c, i) => {
      const Icon = iconFor(c.code);
      const label = `${t("idleCell.category")} ${c.code}`;
      return {
        value: c.name,
        title: `${label} · ${t(`downtime.cat.${c.code}.label`)}`,
        label: (
          <span className="flex items-center gap-2 min-w-0">
            <Icon size={14} style={{ color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], flexShrink: 0 }} />
            <span className="flex-shrink-0">{label}</span>
            <span className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>
              {t(`downtime.cat.${c.code}.label`)}
            </span>
          </span>
        ),
      };
    }),
    [t],
  );

  const valid = !!category && !!start && !!end && note.trim().length > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = { cell_id: cell.cell_id, date, category, start, end, stopped, note: note.trim() };
      return editing
        ? api.put(`/api/idle-cell/intervals/${interval.id}`, body).then((r) => r.data)
        : api.post("/api/idle-cell/intervals", body).then((r) => r.data);
    },
    // The response says what actually happened, so the page can name it: a
    // leader's save becomes a REQUEST, and a toast reading «Saqlandi» would be
    // telling them their entry is on the register when it is in a queue.
    onSuccess: (row) => { onSaved?.(editing, row?.status || "approved"); onClose(); },
    // The failure stays ON the dialog: a modal that closes on error takes the
    // reason with it, and the operator is left guessing whether it saved.
    onError: (e) => {
      setErr(String(e?.response?.data?.detail || t("idleCell.saveError")));
    },
  });

  const timeButton = (which, value, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setPicker(which)}
      className="w-full rounded-lg px-3 py-2.5 text-base md:text-sm flex items-center justify-between gap-2 outline-none transition-colors disabled:cursor-not-allowed"
      style={{
        background: "var(--bg-inner)",
        border: `1px solid ${value ? "var(--border-md)" : "var(--border)"}`,
        color: value ? "var(--text-1)" : "var(--text-4)",
        opacity: disabled ? 0.5 : 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span className={value ? "font-semibold" : ""}>{value || "--:--"}</span>
      <Clock size={14} style={{ color: "var(--text-4)", flexShrink: 0 }} />
    </button>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={save.isPending ? undefined : onClose}
        dismissable={!save.isPending}
        icon={<Timer size={16} style={{ color: "var(--brand-text)" }} />}
        title={editing ? t("idleCell.editInterval") : t("idleCell.addInterval")}
        subtitle={`${cell?.verifix_code || ""} · ${date}`}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
              {t("idleCell.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!valid}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {t(canDecide ? "idleCell.save" : "idleCell.sendRequest")}
            </Button>
          </>
        }
      >
        <FormField label={t("idleCell.category")} required>
          <StyledSelect
            value={category}
            onChange={setCategory}
            options={catOptions}
            placeholder={t("idleCell.pickCategory")}
            triggerClassName="px-3 py-2.5 text-sm"
          />
        </FormField>
        {/* The definition of the category, where the choice is made — it used to
            live behind an ⓘ toggle on the row, i.e. everywhere except the
            moment somebody has to pick the right one. */}
        {cat && (
          <p className="text-[11px] leading-snug -mt-1" style={{ color: "var(--text-3)" }}>
            {t(`downtime.cat.${cat.code}.note`)}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* alignTop on BOTH: the end field's hint makes its cell the taller
              one, and a growing label would spend that height above the start
              button instead of leaving the two on one line. */}
          <FormField label={t("idleCell.startTime")} required alignTop>
            {timeButton("start", start, false)}
          </FormField>
          <FormField
            label={t("idleCell.endTime")}
            required
            alignTop
            hint={!start ? t("idleCell.endNeedsStart") : undefined}
          >
            {timeButton("end", end, !start)}
          </FormField>
        </div>

        {/* Duration read-out: the one number that says whether the two times
            picked mean what the operator thought they meant. */}
        <div
          className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
          style={{
            background: "var(--bg-inner)",
            border: `1px solid ${longRun ? "#eab308" : "var(--border)"}`,
          }}
        >
          <Timer size={16} style={{ color: minutes ? "var(--text-2)" : "var(--text-4)", flexShrink: 0 }} />
          {minutes ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                  {fmtDur(minutes, t)}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                  {start} → {end}
                </span>
                {nextDay && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(148,163,184,0.18)", color: "var(--text-2)" }}
                    title={t("idleCell.nextDayHint")}
                  >
                    <Sunrise size={10} />
                    {t("idleCell.nextDay")}
                  </span>
                )}
              </div>
              {longRun && (
                <div className="flex items-start gap-1.5 mt-1 text-[11px] leading-snug" style={{ color: "#eab308" }}>
                  <AlertTriangle size={12} className="flex-shrink-0 mt-px" />
                  <span>{t("idleCell.longRunWarn")}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-4)" }}>{t("idleCell.pickBothTimes")}</span>
          )}
        </div>

        <FormField
          label={t("idleCell.stoppedQuestion")}
          required
          hint={lockedStopped ? t("idleCell.catHAlwaysStopped") : t("idleCell.stoppedHint")}
        >
          <SegmentedToggle
            fill
            value={stopped}
            onChange={(v) => !lockedStopped && setStopped(v)}
            options={[
              {
                value: true,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Square size={12} />{t("idleCell.stopped")}
                  </span>
                ),
                title: t("idleCell.stopped"),
              },
              {
                value: false,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Play size={12} />{t("idleCell.notStopped")}
                  </span>
                ),
                title: t("idleCell.notStopped"),
                disabled: lockedStopped,
              },
            ]}
          />
        </FormField>

        <FormField label={t("idleCell.note")} required error={err || undefined}>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("idleCell.notePlaceholder")}
            className="w-full rounded-lg px-3 py-2 text-base md:text-sm outline-none resize-y"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
          />
        </FormField>
      </Modal>

      {/* Start: the whole clock, per the operator's call — a cell can wait at
          any hour, and a bound guessed from a shift would refuse honest data. */}
      <TimeWheelPicker
        open={picker === "start"}
        lo={0}
        hi={DAY - 1}
        value={start}
        title={t("idleCell.startTime")}
        onConfirm={(v) => {
          setStart(v);
          // An end equal to the new start would read as "crossed midnight" and
          // become a silent 24-hour stop — drop it and let it be re-picked.
          if (end && toMin(end) === toMin(v)) setEnd("");
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      {/* End: bounded to AFTER the start and shorter than a day. The wheel
          renders extended hours as wall clock, so scrolling past 23:59 simply
          continues into the next morning. */}
      <TimeWheelPicker
        open={picker === "end" && !!endWindow}
        lo={endWindow?.lo}
        hi={endWindow?.hi}
        value={end}
        title={t("idleCell.endTime")}
        onConfirm={(v) => { setEnd(v); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </>
  );
}
