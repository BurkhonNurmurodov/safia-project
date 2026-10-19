// «Liderlar KPI» — WHY a cell's compliance score is what it is: the rate,
// the band it lands in, the KPI points, then every person judged in the
// cell — who does not comply (and why), who does, and who is out of the
// count. The figures are the board's own; the people are asked when the
// dialog opens (`GET /api/category-compliance/people`), nothing is computed here.
import { useQuery } from "@tanstack/react-query";
import { Calculator, CircleAlert, CircleCheck, CircleOff } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/leadersKpiText";
import { ScoreChip, VerdictChip } from "./KpiBits";
import { bandLines, dmy, fetchPeople, n0, pct1, pts, scoreTone, toneInk, w100 } from "./kpiUtil";

function Section({ icon: Icon, title, count, caption, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          {title}{count != null && <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}> · {count}</span>}
        </h3>
      </div>
      {caption && <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{caption}</p>}
      {children}
    </section>
  );
}

// The score scale with the band the cell landed in framed.
function Scale({ bands, score }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bands.map(([label, s], i) => {
        const hit = score != null && s === score;
        return (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs tabular-nums whitespace-nowrap"
            style={{
              border: `1px solid ${hit ? toneInk(scoreTone(s)) : "var(--border)"}`,
              background: hit ? "var(--bg-inner)" : "transparent",
              color: hit ? "var(--text-1)" : "var(--text-3)", fontWeight: hit ? 600 : 400,
            }}>
            {label || "…"} → <span className="font-semibold" style={{ color: toneInk(scoreTone(s)) }}>{s}</span>
          </span>
        );
      })}
    </div>
  );
}

function PersonList({ rows, T, tl, tx }) {
  if (!rows.length) return <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.cpPeopleNone}</p>;
  return (
    <ul className="divide-y rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
      {rows.map((p) => (
        <li key={p.employee_id} className="px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium" style={{ color: "var(--text-1)" }}>
              {tl(p.name)}<span className="font-normal" style={{ color: "var(--text-2)" }}> · {p.job ? tx(p.job) : "—"}</span>
            </span>
            <VerdictChip counted={p.counted} compliant={p.compliant}>{T.cpV[p.verdict] || p.verdict}</VerdictChip>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2 tabular-nums" style={{ color: "var(--text-3)" }}>
            {p.hired && <span>{T.xl.colHired}: {dmy(p.hired)}</span>}
            {p.tenure != null && <span>{T.cpColTenure}: {fill(T.cpTenure, { n: n0(p.tenure) })}</span>}
            {p.expected && <span>{fill(T.cpExExpected, { c: tx(p.expected) })}</span>}
            <span>{T.cpColActual.toLowerCase()}: {p.actual ? tx(p.actual) : "—"}{p.since ? ` (${fill(T.cpExSince, { d: dmy(p.since) })})` : ""}</span>
            {p.placed_by === "journal" && <span>{T.cpExPlacedBy}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ComplianceExplain({ open, onClose, item, data, ym, T, tl, tx, title, subtitle, zIndex }) {
  const rule = data.rule;
  const w = w100(rule);
  const bands = bandLines("compliance", rule);
  const counted = item.counted ?? 0;
  const compliant = item.compliant ?? 0;
  const score = item.score ?? null;
  const points = item.points ?? null;
  const peopleQ = useQuery({
    queryKey: ["cc-people", ym, item.key],
    queryFn: () => fetchPeople(ym, [item.key]),
    enabled: open && !!item.key,
    staleTime: 60_000,
  });
  const rows = peopleQ.data?.[item.key] || [];
  const fail = rows.filter((p) => p.counted && !p.compliant);
  const ok = rows.filter((p) => p.counted && p.compliant);
  const out = rows.filter((p) => !p.counted);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-2xl" zIndex={zIndex}
      icon={<Calculator size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-6"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      {/* 1 — the arithmetic, with the real numbers in it */}
      <Section icon={Calculator} title={T.cpRule}>
        <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
          <div className="text-base font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {counted
              ? fill(T.cpExRate, { ok: n0(compliant), n: n0(counted), pct: pct1(item.rate) })
              : <span style={{ color: "var(--text-3)" }}>{T.cpExNoPeople}</span>}
          </div>
          <Scale bands={bands} score={score} />
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <ScoreChip score={score} size="sm" />
            {points != null && <span className="tabular-nums">{fill(T.cpExPoints, { score, w, p: pts(points) })}</span>}
          </div>
        </div>
      </Section>

      {peopleQ.isLoading && <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.cpPeopleLoading}</p>}
      {peopleQ.isError && (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--status-bad)" }}>
          {T.cpPeopleErr}
          <Button size="sm" variant="secondary" onClick={() => peopleQ.refetch()}>{T.retry}</Button>
        </div>
      )}
      {peopleQ.data && (
        <>
          {/* 2 — who does not comply */}
          <Section icon={CircleAlert} title={T.cpExFail} count={n0(fail.length)} caption={T.cpExWhyFail}>
            <PersonList rows={fail} T={T} tl={tl} tx={tx} />
          </Section>
          {/* 3 — who does */}
          <Section icon={CircleCheck} title={T.cpExOk} count={n0(ok.length)}>
            <PersonList rows={ok} T={T} tl={tl} tx={tx} />
          </Section>
          {/* 4 — in the cell, out of the count */}
          {out.length > 0 && (
            <Section icon={CircleOff} title={T.cpExOut} count={n0(out.length)} caption={T.cpExWhyOut}>
              <PersonList rows={out} T={T} tl={tl} tx={tx} />
            </Section>
          )}
        </>
      )}
    </Modal>
  );
}
