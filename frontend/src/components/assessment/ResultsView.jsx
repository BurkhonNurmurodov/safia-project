import { useEffect, useState } from "react";
import { Lock, Inbox, Check, X, ListChecks, Quote } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { useTranslit } from "../../utils/transliterate";
import { useAT, fill, pct0, DeptChip, TypeChip, VERDICT, DEPT_ICON, fmtDateTime } from "./assessmentUtil";

function Mark({ v }) {
  if (v === "pass") return <Check size={15} strokeWidth={3} style={{ color: VERDICT.pass.ink }} aria-label="pass" />;
  if (v === "fail") return <X size={15} strokeWidth={3} style={{ color: VERDICT.fail.ink }} aria-label="fail" />;
  return <span style={{ color: "var(--text-4)" }}>—</span>;
}

/** The pass share as a ring that fills on arrival. Gold, never a traffic
 *  light: the platform has no pass mark for a candidate, so a colour here
 *  would be a verdict nobody has defined. */
function ScoreRing({ pct, passed, judged }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(pct ?? 0)); return () => cancelAnimationFrame(id); }, [pct]);
  const size = 136, sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inner)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--brand)" strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${((c * shown) / 100).toFixed(2)} ${c.toFixed(2)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 1s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-semibold tabular-nums leading-none tracking-[-0.02em]" style={{ color: "var(--text-1)" }}>{pct0(pct)}</span>
        <span className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{passed} / {judged}</span>
      </div>
    </div>
  );
}

function ShareRow({ label, s }) {
  return (
    <div className="min-w-0 rounded-xl p-3" style={{ background: "var(--bg-inner)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{pct0(s?.pct)}</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{s ? `${s.passed}/${s.judged}` : "—"}</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-card)" }}>
        <div className="h-full rounded-full" style={{ width: `${s?.pct ?? 0}%`, background: "var(--brand)", transition: "width .8s var(--ease-out)" }} />
      </div>
    </div>
  );
}

/** One department of the panel: its judge, the pass share of its questions,
 *  and every question as a square in the verdict colour (dashed until that
 *  judge submits). Nothing is computed: it is the rows, drawn small. */
function DeptColumn({ seat, judge, rows, T, tl }) {
  const Icon = DEPT_ICON[seat.department];
  const mine = rows.filter((r) => r.department === seat.department).sort((a, b) => a.position - b.position);
  const label = (r) => `${r.position}. ${r.text} — ${r.submitted ? (r.verdict === "pass" ? T.pass : r.verdict === "fail" ? T.fail : "—") : T.notSubmitted}`;
  return (
    <div className="min-w-0 rounded-xl p-3" style={{ background: "var(--bg-inner)", opacity: judge ? 1 : 0.75 }}
      title={judge ? `${tl(judge.judge_name || "")} · ${fmtDateTime(judge.submitted_at)}` : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold min-w-0" style={{ color: "var(--text-1)" }}>
          {Icon && <Icon size={14} style={{ color: "var(--text-3)" }} aria-hidden="true" />}
          <span className="truncate">{T.dept[seat.department]}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: judge ? "var(--text-1)" : "var(--text-3)" }}>
          {judge ? pct0(judge.pct) : "—"}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] truncate" style={{ color: "var(--text-3)" }}>
        {seat.judge_name ? tl(seat.judge_name) : T.seatFree}{!judge && seat.judge_name ? ` · ${T.notSubmitted}` : ""}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {mine.map((r) => {
          const v = r.submitted ? r.verdict : null;
          return (
            <span key={r.item_id} title={label(r)} aria-label={label(r)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-semibold tabular-nums"
              style={v ? { background: VERDICT[v].bg, color: VERDICT[v].fg }
                : { background: "transparent", color: "var(--text-3)", boxShadow: "inset 0 0 0 1px var(--border-md)", borderRadius: 6 }}>
              {r.position}
            </span>
          );
        })}
      </div>
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
  const failedRows = res.rows.filter((r) => r.submitted && r.verdict === "fail").sort((a, b) => a.position - b.position);
  const verdictCell = (r) => (r.submitted ? <Mark v={r.verdict} /> : (
    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.notSubmitted}</span>
  ));

  return (
    <div className="space-y-3">
      {/* Headline: the pass share, by type, and the panel department by department. */}
      <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
          <div className="flex items-center gap-5">
            <ScoreRing pct={res.overall.pct} passed={res.overall.passed} judged={res.overall.judged} />
            <div className="sm:hidden min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{T.overallRes}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>{fill(T.overallResSub, { p: res.overall.passed, j: res.overall.judged })}</div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="hidden sm:block">
              <div className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{T.overallRes}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>
                {fill(T.overallResSub, { p: res.overall.passed, j: res.overall.judged })}
                {res.judges.length < 5 && <> · {fill(T.partialNote, { n: res.judges.length })}</>}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {["theory", "practical"].map((t) => (
                <ShareRow key={t} label={<TypeChip type={t} T={T} />} s={res.by_type[t]} />
              ))}
            </div>
            {res.judges.length < 5 && (
              <div className="sm:hidden text-[11px]" style={{ color: "var(--text-3)" }}>{fill(T.partialNote, { n: res.judges.length })}</div>
            )}
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>{T.byQDept}</div>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {seats.map((s) => (
              <DeptColumn key={s.department} seat={s} judge={judged.get(s.department)} rows={res.rows} T={T} tl={tl} />
            ))}
          </div>
        </div>
      </section>

      {/* What the candidate did not pass, with the judges' notes — the part a
          decision is made on. */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{T.failedTitle}</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{failedRows.length}</span>
        </div>
        {failedRows.length === 0 ? (
          <div className="px-4 sm:px-5 py-6 flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <Check size={16} strokeWidth={3} style={{ color: VERDICT.pass.ink }} aria-hidden="true" />{T.noFailed}
          </div>
        ) : (
          <ul>
            {failedRows.map((r, i) => (
              <li key={r.item_id} className="px-4 sm:px-5 py-3 flex items-start gap-3" style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <span className="inline-flex items-center justify-center gap-0.5 min-w-[30px] h-7 px-1.5 rounded-lg text-xs font-semibold tabular-nums flex-shrink-0"
                  style={{ background: VERDICT.fail.bg, color: VERDICT.fail.fg }}>
                  <X size={11} strokeWidth={3} aria-hidden="true" />{r.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed break-words" style={{ color: "var(--text-1)" }}>{r.text}</p>
                  {r.note && (
                    <p className="mt-1 text-[13px] leading-relaxed break-words" style={{ color: "var(--text-2)" }}>
                      <span style={{ color: "var(--text-3)" }}>{tl(r.judge_name || "")}: </span>{r.note}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 max-sm:hidden"><DeptChip dept={r.department} T={T} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Every submitted judge's overall feedback, as what it is: their words. */}
      <section className="rounded-2xl p-4 sm:p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="text-[15px] font-semibold mb-3" style={{ color: "var(--text-1)" }}>{T.feedbackTitle}</div>
        <div className="grid gap-3 lg:grid-cols-2">
          {res.judges.map((j) => {
            const Icon = DEPT_ICON[j.department];
            return (
              <figure key={j.department} className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: "var(--bg-inner)" }}>
                <Quote size={16} style={{ color: "rgba(var(--brand-rgb), .7)" }} aria-hidden="true" />
                <blockquote className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>
                  {j.overall_feedback || "—"}
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                  {Icon && <Icon size={13} aria-hidden="true" />}
                  <span className="font-medium" style={{ color: "var(--text-2)" }}>{T.dept[j.department]}</span>
                  <span>· {j.judge_name ? tl(j.judge_name) : "—"}</span>
                  <span className="ml-auto tabular-nums">{fmtDateTime(j.submitted_at)}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      {/* The whole record: every question with its own department's verdict. */}
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
    </div>
  );
}
