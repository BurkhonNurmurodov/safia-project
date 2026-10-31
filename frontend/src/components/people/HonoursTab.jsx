import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, ClipboardCheck, Lock, Plus, Trash2 } from "lucide-react";
import TableCard, { SectionHead, Th } from "../ui/DataTable";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { SkeletonBlock } from "../ui/Skeleton";
import { SeatDot } from "../assessment/AssessmentList";
import { useAT } from "../assessment/assessmentUtil";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { fill, fmtDate, Chip, errText } from "./peopleUtil";

const INPUT = "w-full rounded-xl px-3 py-2 text-sm max-md:text-base outline-none";
const INPUT_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

function HonourModal({ P, kinds, eid, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(kinds[0]);
  const [day, setDay] = useState(localISO(new Date()));
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  const save = useMutation({
    mutationFn: () => api.post(`/api/people/${encodeURIComponent(eid)}/honours`, { title, kind, date: day, note }).then((r) => r.data),
    onSuccess: (d) => onSaved(d),
    onError: (e) => setErr(errText(e, P)),
  });
  return (
    <Modal onClose={onClose} title={P.honourAdd} icon={Award}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{P.cancel}</Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => { setErr(null); save.mutate(); }}>{P.save}</Button>
        </>
      )}>
      <FormField label={P.hTitle} required error={err && !title.trim() ? err : null}>
        <input className={INPUT} style={INPUT_STYLE} value={title} maxLength={160} autoFocus
          placeholder={P.hTitlePh} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={P.hKind} required>
          <StyledSelect value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: P.hk[k] || k }))} />
        </FormField>
        <FormField label={P.hDate} required>
          <DateRangePicker single dateFrom={day} dateTo={day} max={localISO(new Date())}
            setDateFrom={setDay} setDateTo={setDay} triggerClassName="px-3 py-2 text-sm w-full" />
        </FormField>
      </div>
      <FormField label={P.hNote} hint={P.hNoteHint}>
        <textarea className={`${INPUT} min-h-[72px] resize-y`} style={INPUT_STYLE} value={note} maxLength={1000}
          onChange={(e) => setNote(e.target.value)} />
      </FormField>
      {err && title.trim() && <p className="text-xs" style={{ color: "var(--status-bad)" }}>{err}</p>}
    </Modal>
  );
}

function Result({ row, P, T }) {
  if (row.results_hidden) return <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{P.resultHidden}</span>;
  if (!row.overall) return <span style={{ color: "var(--text-3)" }}>—</span>;
  return (
    <span className="tabular-nums" title={fill(T.overallResSub, { p: row.overall.passed, j: row.overall.judged })}>
      <b style={{ color: "var(--text-1)" }}>{Math.round(row.overall.pct)}%</b>
      <span className="ml-1.5" style={{ color: "var(--text-3)" }}>{row.overall.passed}/{row.overall.judged}</span>
    </span>
  );
}

/** «Mukofot va baholash» — the sittings (as /assessment shows them to this
 *  viewer) and the honours register, the one thing this page writes. */
export default function HonoursTab({ data, P, eid, ready }) {
  const T = useAT();
  const { tl } = useTranslit();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const h = ready ? data.honours : null;
  const can = data.rights?.honours;
  const kinds = data.honour_kinds || [];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [rmErr, setRmErr] = useState(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["people-card", eid] });
  const remove = useMutation({
    mutationFn: (hid) => api.delete(`/api/people/${encodeURIComponent(eid)}/honours/${hid}`).then((r) => r.data),
    onSuccess: () => { setRemoving(null); toast.success(P.removed); refresh(); },
    onError: (e) => setRmErr(errText(e, P)),
  });

  const assess = h?.assessments;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <TableCard icon={ClipboardCheck} title={P.assess}
        right={assess ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{assess.length}</span> : null}>
        <thead>
          <tr>
            <Th label={P.colDate} />
            <Th label={P.colPanel} />
            <Th label={P.colResult} align="right" />
            <Th label={P.colStatus} />
          </tr>
        </thead>
        <tbody>
          {!h ? (
            [...Array(2)].map((_, i) => <tr key={i}><td colSpan={4} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>)
          ) : assess === null ? (
            <tr><td colSpan={4} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
              <span className="inline-flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />{P.assessNoAccess}</span>
            </td></tr>
          ) : assess.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{P.assessEmpty}</td></tr>
          ) : assess.map((r) => (
            <tr key={r.id} onClick={() => nav(`/assessment/${r.id}`)} className="cursor-pointer">
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.held_on)}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  {r.seats.map((s) => <SeatDot key={s.department} seat={s} T={T} tl={tl} />)}
                </span>
              </td>
              <td className="px-3 py-2 text-right"><Result row={r} P={P} T={T} /></td>
              <td className="px-3 py-2"><Chip>{r.status === "open" ? P.stOpen : P.stClosed}</Chip></td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Award} title={P.honoursTitle}
          right={can ? <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>{P.honourAdd}</Button> : null} />
        {!h ? (
          <div className="px-4 pb-4 space-y-2">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
        ) : h.list.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-sm" style={{ color: "var(--text-3)" }}>{P.honoursEmpty}</p>
        ) : (
          <ul>
            {h.list.map((x) => (
              <li key={x.id} className="px-4 py-2.5 flex items-center gap-3 min-h-[52px]" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                  <Award size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: "var(--text-1)" }} title={x.title}>{x.title}</span>
                  <span className="block text-xs truncate" style={{ color: "var(--text-3)" }} title={x.note || ""}>
                    {[P.hk[x.kind] || x.kind, x.by ? fill(P.hBy, { n: tl(x.by) }) : null, x.note].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Chip className="tabular-nums">{fmtDate(x.date)}</Chip>
                {can && (
                  <Button variant="danger" tint size="sm" icon={Trash2} aria-label={P.remove} title={P.remove}
                    onClick={() => { setRmErr(null); setRemoving(x); }} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <HonourModal P={P} kinds={kinds} eid={eid} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); toast.success(P.added); refresh(); }} />
      )}
      {removing && (
        <ConfirmDialog tone="danger" title={P.removeTitle} message={fill(P.removeMsg, { t: removing.title })}
          confirmLabel={P.remove} cancelLabel={P.cancel} loading={remove.isPending} error={rmErr}
          onCancel={() => setRemoving(null)} onConfirm={() => remove.mutate(removing.id)} />
      )}
      {toast.node}
    </div>
  );
}
