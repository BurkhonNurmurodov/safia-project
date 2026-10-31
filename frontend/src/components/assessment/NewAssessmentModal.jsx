import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { UserPlus, Shuffle, AlertTriangle, UserRound, History } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { useAT, fill, errText, detailOf, fmtDateTime, workPlace } from "./assessmentUtil";
import { PersonLink } from "../people/peopleUtil";

const MORE = "__more__";
const inputCls = "w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Open a sitting for one of the plant's CURRENT WORKERS — picked from the
 *  Verifix directory, never typed in — on a date; the 20 questions are drawn
 *  on the server the moment it is created. */
export default function NewAssessmentModal({ onClose, onCreated }) {
  const T = useAT();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [dq, setDq] = useState("");            // the query, once typing pauses
  const [picked, setPicked] = useState(null);  // the worker chosen
  const [note, setNote] = useState("");
  const [heldOn, setHeldOn] = useState(localISO(new Date()));
  const [err, setErr] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = useQuery({
    queryKey: ["assessment-workers", dq],
    queryFn: () => api.get("/api/assessment/workers", { params: { q: dq } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const typed = query.trim().length >= 2;
  const rows = useMemo(() => (typed ? search.data?.rows || [] : []), [typed, search.data]);
  const dir = search.data?.directory;

  // The picked worker stays among the options, or the trigger could not name them.
  const options = useMemo(() => {
    const list = picked && !rows.some((w) => w.employee_id === picked.employee_id) ? [picked, ...rows] : rows;
    const opts = list.map((w) => ({
      value: w.employee_id,
      title: [tl(w.name), workPlace(w)].filter(Boolean).join(" · "),
      short: tl(w.name),
      label: (
        <>
          <span className="block truncate">{tl(w.name)}</span>
          {workPlace(w) && <span className="block truncate text-[11px]" style={{ color: "var(--text-3)" }}>{workPlace(w)}</span>}
        </>
      ),
    }));
    if (typed && search.data?.more) opts.push({ value: MORE, label: T.moreHits, title: T.moreHits, disabled: true });
    return opts;
  }, [rows, picked, typed, search.data, tl, T]);

  const searchEmpty = dir && dir.count === 0 ? T.dirEmpty
    : !typed ? T.typeMore
    : search.isFetching || dq !== query.trim() ? T.searching
    : T.notFound;

  const create = useMutation({
    mutationFn: () => api.post("/api/assessment/assessments",
      { employee_id: picked.employee_id, candidate_note: note.trim(), held_on: heldOn }).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["assessment-list"] });
      qc.invalidateQueries({ queryKey: ["assessment-workers"] });
      onClose();
      onCreated?.(d.id);
    },
    onError: (e) => setErr(e),
  });

  const shorts = detailOf(err)?.code === "pool_short" ? detailOf(err).shorts || [] : null;
  const hint = dir?.count
    ? fill(T.dirInfo, { n: thousands(dir.count), at: dir.read_at ? fmtDateTime(dir.read_at) : "—" })
    : dir ? T.dirEmpty : T.candidateHint;

  return (
    <Modal open onClose={onClose} title={T.newTitle} subtitle={T.newSub} icon={<UserPlus size={18} />}
      dirty={!!picked || !!note.trim()}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.cancel}</Button>
          <Button onClick={() => { setErr(null); create.mutate(); }} disabled={!picked || create.isPending}
            loading={create.isPending}>
            {T.create}
          </Button>
        </>
      )}>
      <FormField label={T.candidate} required hint={hint}>
        <StyledSelect value={picked?.employee_id ?? null} ariaLabel={T.candidate}
          onChange={(v) => {
            const w = rows.find((r) => r.employee_id === v);
            if (w) { setPicked(w); setErr(null); }
          }}
          options={options} placeholder={T.candidatePick}
          searchable onQuery={setQuery} searchPlaceholder={T.workerSearch} searchEmpty={searchEmpty} />
      </FormField>

      {picked && (
        <div className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
          <UserRound size={18} className="mt-[2px] shrink-0" style={{ color: "var(--text-3)" }} aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold break-words" style={{ color: "var(--text-1)" }}>
              <PersonLink employeeId={picked.employee_id}>{tl(picked.name)}</PersonLink>
            </div>
            {picked.job && <div className="text-xs break-words" style={{ color: "var(--text-2)" }}>{picked.job}</div>}
            {(picked.code || picked.unit) && (
              <div className="text-xs break-words" style={{ color: "var(--text-3)" }}>
                {[picked.code && `${T.cell} ${picked.code}`, picked.unit].filter(Boolean).join(" · ")}
              </div>
            )}
            {picked.assessments > 0 && (
              <div className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: "var(--brand-text)" }}>
                <History size={12} className="mt-[2px] shrink-0" aria-hidden="true" />
                <span>{fill(T.candidateTimes, { n: picked.assessments })} — {T.retakeHint}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <FormField label={T.note} hint={T.noteHint}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh}
          maxLength={500} className={inputCls} style={inputStyle} autoComplete="off" />
      </FormField>
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
