import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import CellLink from "../ui/CellLink";
import { catColor } from "../idle/categories";
import { shortPerson } from "../../utils/personName";
import { STATUS_COLOR, STATUS_INK, tp, alertText, catCode, fmtTimer, stopStartedAt } from "./liveUtils";

const MAX = 8;

// One running stop: the cell, how long it has been standing (the timer ticks
// every second — the motion IS the news that it is still stopped), why, and
// whose it is. A stop past the critical line is red; a young one amber.
function Stop({ c, frame, now, fresh, t, tl }) {
  const idle = c.idle || {};
  const at = stopStartedAt(frame, idle.since);
  const age = at != null ? now - at : (idle.now_min || 0) * 60000;
  const crit = c.status === "crit";
  const col = crit ? STATUS_COLOR.crit : STATUS_COLOR.warn;
  const cat = (idle.now_cats || [])[0];
  const code = cat ? catCode(cat) : null;
  const catLabel = code ? t(`downtime.cat.${code}.label`) : null;
  return (
    <li className={`relative px-4 py-3 ${fresh ? "live-in live-ring" : ""}`} style={{ borderTop: "1px solid var(--border)" }}>
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: col }} aria-hidden="true" />
      <div className="flex items-baseline justify-between gap-3">
        <CellLink id={c.id} className="text-[19px] font-semibold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{c.code}</CellLink>
        <span className="text-[19px] font-semibold tabular-nums leading-none" style={{ color: crit ? STATUS_INK.crit : STATUS_INK.warn }}
          aria-label={tp(t, "live.stoppedFor", { m: Math.floor(age / 60000) })}>
          {fmtTimer(age)}
        </span>
      </div>
      {catLabel && (
        <div className="mt-1.5 flex items-center gap-1.5 min-w-0 text-[13px]" style={{ color: "var(--text-1)" }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColor(cat) }} aria-hidden="true" />
          <span className="truncate" title={catLabel}>{catLabel}</span>
        </div>
      )}
      {idle.now_note && (
        <div className="mt-0.5 text-[12px] leading-snug line-clamp-2" style={{ color: "var(--text-2)" }}>«{idle.now_note}»</div>
      )}
      <div className="mt-1.5 text-[11px] truncate" style={{ color: "var(--text-3)" }}>
        {[tl(c.unit || ""), c.leader ? shortPerson(tl(c.leader)) : null, tp(t, "live.stoppedSince", { since: idle.since })].filter(Boolean).join(" · ")}
      </div>
    </li>
  );
}

// A cell alert's sentence starts with the cell's code — that code IS the
// link to the cell, so it is never printed a second time under the sentence.
function Sentence({ a, text }) {
  if (a.cell && a.cell_id && text.startsWith(a.cell)) {
    return (
      <>
        <CellLink id={a.cell_id} className="font-semibold tabular-nums">{a.cell}</CellLink>
        {text.slice(a.cell.length)}
      </>
    );
  }
  return text;
}

// The attention column: what is stopped RIGHT NOW first — live timers — and
// under it every other problem the platform can see, one line each, the most
// severe first. A key that was not in the previous poll slides in.
export default function AlertFeed({ alerts, cells, frame, now, newKeys, t, tl }) {
  const [showAll, setShowAll] = useState(false);
  const stops = (cells || []).filter((c) => c.idle?.stopped_now)
    .sort((a, b) => (b.idle.now_min || 0) - (a.idle.now_min || 0));
  const list = (alerts || []).filter((a) => a.kind !== "cell_stopped_now");
  const shown = showAll ? list : list.slice(0, MAX);
  const crit = list.filter((a) => a.sev === "crit").length;
  const warn = list.filter((a) => a.sev === "warn").length;
  const freshStop = (c) => newKeys?.has(`cell_stopped_now:${c.unit_id}:${c.id}`);

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {stops.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: STATUS_INK.crit }}>{t("live.kpi.stopped")}</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: STATUS_INK.crit }}>{stops.length}</span>
          </div>
          <ul>{stops.map((c) => <Stop key={c.id} c={c} frame={frame} now={now} fresh={freshStop(c)} t={t} tl={tl} />)}</ul>
          <div className="h-2" style={{ background: "var(--bg-inner)" }} aria-hidden="true" />
        </>
      )}
      <SectionHead
        title={t("live.feed")}
        right={
          (crit > 0 || warn > 0) ? (
            <span className="flex items-center gap-3 text-[11px] font-medium tabular-nums" style={{ color: "var(--text-3)" }}>
              {crit > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.crit }} />{crit}</span>}
              {warn > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.warn }} />{warn}</span>}
            </span>
          ) : null
        }
      />
      {!list.length ? (
        <div className="px-4 py-8 flex flex-col items-center text-center gap-2">
          <CheckCircle2 size={22} style={{ color: STATUS_INK.ok }} aria-hidden="true" />
          <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{t("live.feedEmpty")}</div>
          <div className="text-xs max-w-[260px]" style={{ color: "var(--text-3)" }}>{t("live.feedEmptySub")}</div>
        </div>
      ) : (
        <ul>
          {shown.map((a, i) => {
            const c = STATUS_COLOR[a.sev] || STATUS_COLOR.info;
            const fresh = newKeys?.has(a.key);
            return (
              <li key={a.key} className={`flex gap-3 px-4 py-2.5 ${fresh ? "live-in" : ""}`} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <span className="mt-[6px] w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} aria-label={t(`live.sev.${a.sev}`)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug" style={{ color: "var(--text-1)" }}>
                    <Sentence a={a} text={alertText(t, a, tl)} />
                  </div>
                  {a.cell && (
                    <div className="mt-0.5 text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                      {tl(a.unit || "")}{a.leader ? ` · ${shortPerson(tl(a.leader))}` : ""}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > MAX && (
        <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium min-h-[32px]" style={{ color: "var(--brand-text)" }}>
            {showAll ? t("live.feedLess") : tp(t, "live.feedMore", { n: list.length - MAX })}
          </button>
        </div>
      )}
    </section>
  );
}
