import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Shuffle, AlertTriangle } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { useAT, fill, errText, detailOf } from "./assessmentUtil";

const NEW = "__new__";
const inputCls = "w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

/** Open a sitting: pick a candidate (or name a new one), a date — and the 20
 *  questions are drawn on the server the moment it is created. */
export default function NewAssessmentModal({ onClose, onCreated }) {
  const T = useAT();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [pick, setPick] = useState(NEW);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [heldOn, setHeldOn] = useState(localISO(new Date()));
  const [err, setErr] = useState(null);

  const cands = useQuery({
    queryKey: ["assessment-candidates"],
    queryFn: () => api.get("/api/assessment/candidates").then((r) => r.data),
  });
  const options = useMemo(() => [
    { value: NEW, label: T.candidateNew },
    ...(cands.data || []).map((c) => ({
      value: c.id,
      label: `${tl(c.full_name)}${c.assessments ? ` · ${fill(T.candidateTimes, { n: c.assessments })}` : ""}`,
    })),
  ], [cands.data, T, tl]);
  const existing = pick !== NEW ? (cands.data || []).find((c) => c.id === pick) : null;

  const create = useMutation({
    mutationFn: () => api.post("/api/assessment/assessments", pick === NEW
      ? { candidate_name: name.trim(), candidate_note: note.trim(), held_on: heldOn }
      : { candidate_id: pick, held_on: heldOn }).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["assessment-list"] });
      qc.invalidateQueries({ queryKey: ["assessment-candidates"] });
      onClose();
      onCreated?.(d.id);
    },
    onError: (e) => setErr(e),
  });

  const shorts = detailOf(err)?.code === "pool_short" ? detailOf(err).shorts || [] : null;
  const canCreate = (pick !== NEW || name.trim()) && !create.isPending;
  const dirty = pick !== NEW || !!name.trim() || !!note.trim();

  return (
    <Modal open onClose={onClose} title={T.newTitle} subtitle={T.newSub} icon={<UserPlus size={18} />}
      dirty={dirty}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.cancel}</Button>
          <Button onClick={() => { setErr(null); create.mutate(); }} disabled={!canCreate} loading={create.isPending}>
            {T.create}
          </Button>
        </>
      )}>
      <FormField label={T.candidate} required>
        <StyledSelect value={pick} onChange={(v) => { setPick(v); setErr(null); }} options={options}
          searchable={(cands.data || []).length > 6} placeholder={T.candidatePick} ariaLabel={T.candidate} />
      </FormField>
      {pick === NEW ? (
        <>
          <FormField label={T.name} required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={T.namePh}
              maxLength={200} className={inputCls} style={inputStyle} autoComplete="off" />
          </FormField>
          <FormField label={T.note} hint={T.noteHint}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh}
              maxLength={500} className={inputCls} style={inputStyle} autoComplete="off" />
          </FormField>
        </>
      ) : existing?.assessments ? (
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.retakeHint}</p>
      ) : null}
      <FormField label={T.heldOn}>
        <DateRangePicker single dateFrom={heldOn} setDateFrom={(v) => setHeldOn(v || localISO(new Date()))}
          triggerClassName="px-3 py-2 text-sm" />
      </FormField>
      <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
        style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
        <Shuffle size={14} className="mt-[1px] shrink-0" style={{ color: "var(--brand-text)" }} aria-hidden="true" />
        <span>{T.drawRule}</span>
      </div>
      {err && (
        <div role="alert" className="rounded-xl px-3 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "var(--text-1)" }}>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--status-bad)" }}>
            <AlertTriangle size={14} aria-hidden="true" />
            {shorts ? T.poolShortTitle : errText(err, T)}
          </div>
          {shorts && (
            <ul className="mt-1 space-y-0.5">
              {shorts.map((s) => (
                <li key={`${s.block}-${s.department || ""}-${s.qtype}`}>
                  {fill(T.poolShortLine, {
                    block: s.department ? T.dept[s.department] : T.block[s.block],
                    type: s.qtype ? ` · ${T.type[s.qtype]}` : "",
                    need: s.need, have: s.have,
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
