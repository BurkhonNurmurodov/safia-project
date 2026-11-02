import { Lock, Inbox, Check, X, ListChecks, Users, MessageSquareText } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { useTranslit } from "../../utils/transliterate";
import { useAT, fill, pct0, DeptChip, TypeChip, VERDICT, fmtDateTime } from "./assessmentUtil";

function Mark({ v }) {
  if (v === "pass") return <Check size={15} strokeWidth={3} style={{ color: VERDICT.pass.ink }} aria-label="pass" />;
  if (v === "fail") return <X size={15} strokeWidth={3} style={{ color: VERDICT.fail.ink }} aria-label="fail" />;
  return <span style={{ color: "var(--text-4)" }}>—</span>;
}

function Bar({ pct }) {
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: "var(--brand)" }} />
    </div>
  );
}

/** The panel's verdicts at a glance — one square per question, grouped by the
 *  department that judged it (the seats' own order), each filled with the
 *  toggle's verdict colour; a question whose judge has not submitted is a
 *  dashed square. Nothing is computed: it is the rows below, drawn small. */
function VerdictStrip({ rows, seats, T }) {
  const label = (r) => `${r.position}. ${r.text} — ${r.submitted ? (r.verdict === "pass" ? T.pass : r.verdict === "fail" ? T.fail : "—") : T.notSubmitted}`;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-3">
      {seats.map((s) => {
        const mine = rows.filter((r) => r.department === s.department).sort((a, b) => a.position - b.position);
        if (!mine.length) return null;
        return (
          <div key={s.department} className="min-w-0">
            <div className="mb-1.5"><DeptChip dept={s.department} T={T} /></div>
            <div className="flex flex-wrap gap-1">
              {mine.map((r) => {
                const v = r.submitted ? r.verdict : null;
                const style = v ? { background: VERDICT[v].bg, color: VERDICT[v].fg }
                  : { background: "transparent", color: "var(--text-3)", border: "1px dashed var(--border-md)" };
                return (
                  <span key={r.item_id} title={label(r)} aria-label={label(r)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-semibold tabular-nums"
                    style={style}>{r.position}</span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A small «share» card — a label, the pass share, its base. No traffic
 *  light: the platform has no pass mark for a candidate, so a colour here
 *  would be a verdict nobody has defined. */
function Share({ label, node, s }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)" }}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate" style={{ color: "var(--text-2)" }}>{node || label}</span>
        <span className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{pct0(s?.pct)}</span>
      </div>
      <div className="mt-1.5"><Bar pct={s?.pct} /></div>
      <div className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{s ? `${s.passed}/${s.judged}` : "—"}</div>
    </div>
  );
}

export default function ResultsView({ data }) {
  const T = useAT();
  const { tl } = useTranslit();

  if (data.results_hidden) {
    return <EmptyState icon={Lock} title={T.hiddenTitle} message={T.hiddenMsg} showUploadLink={false} height="h-56" />;
  }
  const res = data.results;
  if (!res || res.judges.length === 0) {
    return <EmptyState icon={Inbox} title={T.noneTitle} message={T.noneMsg} showUploadLink={false} height="h-56" />;
  }
  const seats = data.seats;
  const judged = new Map(res.judges.map((j) => [j.department, j]));
  const notes = res.rows.filter((r) => r.note);
  // A question's verdict is its own department's judge's; until that judge
  // submits, the cell says so instead of a dash that reads as «ungraded».
  const verdictCell = (r) => (r.submitted ? <Mark v={r.verdict} /> : (
    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.notSubmitted}</span>
  ));

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{T.overallRes}</div>
            <div className="mt-1 text-4xl font-medium tabular-nums" style={{ color: "var(--text-1)" }}>{pct0(res.overall.pct)}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
              {fill(T.overallResSub, { p: res.overall.passed, j: res.overall.judged })}
            </div>
            {res.judges.length < 5 && (
              <div className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>{fill(T.partialNote, { n: res.judges.length })}</div>
            )}
          </div>
          <div className="space-y-3 min-w-0">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-3)" }}>{T.byType}</div>
              <div className="grid grid-cols-2 gap-2">
                {["theory", "practical"].map((t) => (
                  <Share key={t} node={<TypeChip type={t} T={T} />} s={res.by_type[t]} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-3)" }}>{T.stripTitle}</div>
          <VerdictStrip rows={res.rows} seats={seats} T={T} />
        </div>
      </div>

      {/* By judge */}
      <TableCard icon={Users} title={T.byJudge} maxHeight="none"
        mobile={(
          <ul>
            {seats.map((s) => {
              const j = judged.get(s.department);
              return (
                <li key={s.department} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)", opacity: j ? 1 : 0.6 }}>
                  <DeptChip dept={s.department} T={T} />
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-1)" }}>{s.judge_name ? tl(s.judge_name) : "—"}</span>
                  <span className="text-xs tabular-nums" style={{ color: j ? "var(--text-1)" : "var(--text-3)" }}>
                    {j ? `${pct0(j.pct)} · ${j.passed}/${j.total ?? j.graded}` : T.notSubmitted}
                  </span>
                </li>
              );
            })}
          </ul>
        )}>
        <thead>
          <tr>
            <Th label={T.colDept} /><Th label={T.colJudge} /><Th label={T.colPassed} align="right" />
            <Th label={T.colPct} align="right" /><Th label={T.colSubmittedAt} />
          </tr>
        </thead>
        <tbody>
          {seats.map((s) => {
            const j = judged.get(s.department);
            return (
              <tr key={s.department} style={{ opacity: j ? 1 : 0.6 }}>
                <td className="px-3 py-2"><DeptChip dept={s.department} T={T} /></td>
                <td className="px-3 py-2">{s.judge_name ? tl(s.judge_name) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{j ? `${j.passed}/${j.total ?? j.graded}` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{j ? pct0(j.pct) : "—"}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: j ? "var(--text-1)" : "var(--text-3)" }}>
                  {j ? fmtDateTime(j.submitted_at) : T.notSubmitted}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      {/* Every question with its own department's verdict */}
      <TableCard icon={ListChecks} title={T.matrix} maxHeight="none" fixed minWidth={720}
        mobile={(
          <ul>
            {res.rows.map((r) => (
              <li key={r.item_id} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold tabular-nums w-5 shrink-0" style={{ color: "var(--text-3)" }}>{r.position}</span>
                  <p className="text-sm flex-1 min-w-0 break-words" style={{ color: "var(--text-1)" }}>{r.text}</p>
                  <span className="shrink-0">{verdictCell(r)}</span>
                </div>
                <div className="mt-1.5 ml-7 flex flex-wrap items-center gap-1.5">
                  <DeptChip dept={r.department} T={T} /><TypeChip type={r.qtype} T={T} />
                </div>
                {r.note && <p className="mt-1 ml-7 text-xs break-words" style={{ color: "var(--text-2)" }}>{r.note}</p>}
              </li>
            ))}
          </ul>
        )}>
        <colgroup>
          <col style={{ width: 44 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 110 }} />
          <col style={{ width: 110 }} /><col style={{ width: 240 }} />
        </colgroup>
        <thead>
          <tr>
            <Th label={T.colN} align="center" />
            <Th label={T.colQ} />
            <Th label={T.colDept} />
            <Th label={T.colType} />
            <Th label={T.colVerdict} align="center" />
            <Th label={T.colNote} />
          </tr>
        </thead>
        <tbody>
          {res.rows.map((r) => (
            <tr key={r.item_id}>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{r.position}</td>
              <td className="px-3 py-2 truncate" title={r.text}>{r.text}</td>
              <td className="px-3 py-2"><DeptChip dept={r.department} T={T} /></td>
              <td className="px-3 py-2"><TypeChip type={r.qtype} T={T} /></td>
              <td className="px-3 py-2 text-center"><span className="inline-flex justify-center">{verdictCell(r)}</span></td>
              <td className="px-3 py-2 truncate" title={r.note ? r.note : undefined}
                style={{ color: r.note ? "var(--text-2)" : "var(--text-4)" }}>{r.note ? r.note : "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {/* Overall feedback of every submitted judge */}
      <section className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
          <MessageSquareText size={14} aria-hidden="true" />{T.feedbackTitle}
        </h3>
        {res.judges.map((j) => (
          <div key={j.department} className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <DeptChip dept={j.department} T={T} />
              <span className="font-medium" style={{ color: "var(--text-1)" }}>{j.judge_name ? tl(j.judge_name) : "—"}</span>
              <span className="ml-auto tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDateTime(j.submitted_at)}</span>
            </div>
            <p className="mt-1.5 text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{j.overall_feedback || ""}</p>
          </div>
        ))}
      </section>

      {/* Notes on questions */}
      <section className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{T.notesTitle}</h3>
        {notes.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.noNotes}</p>
        ) : notes.map((r) => (
          <div key={r.item_id} className="text-sm">
            <div className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              {r.position}. <span className="font-normal">{r.text}</span>
            </div>
            <p className="mt-0.5 ml-4 text-xs break-words" style={{ color: "var(--text-1)" }}>
              <span className="font-medium" style={{ color: "var(--text-2)" }}>{T.dept[r.department]}</span>
              {r.judge_name ? ` · ${tl(r.judge_name)}` : ""}: {r.note}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
