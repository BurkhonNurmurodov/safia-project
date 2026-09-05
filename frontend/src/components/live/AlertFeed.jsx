import { useState } from "react";
import { Siren, CheckCircle2 } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import { catColor } from "../idle/categories";
import { STATUS_COLOR, hexA, tp, alertText, catCode } from "./liveUtils";

const MAX = 14;

// The attention column: every problem the platform can currently see, most
// severe first, one sentence each. A key that was not in the previous poll
// SLIDES IN — that entrance is the whole alerting mechanism of this page,
// so it is never suppressed for anything but reduced-motion.
export default function AlertFeed({ alerts, newKeys, t, tl }) {
  const [showAll, setShowAll] = useState(false);
  const list = alerts || [];
  const shown = showAll ? list : list.slice(0, MAX);
  const crit = list.filter((a) => a.sev === "crit").length;
  const warn = list.filter((a) => a.sev === "warn").length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={Siren}
        title={t("live.feed")}
        right={
          <div className="flex items-center gap-1.5">
            {crit > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full live-glow"
                style={{ background: hexA(STATUS_COLOR.crit, 0.16), color: STATUS_COLOR.crit }}>{crit}</span>
            )}
            {warn > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: hexA(STATUS_COLOR.warn, 0.16), color: STATUS_COLOR.warn }}>{warn}</span>
            )}
          </div>
        }
      />
      {!list.length ? (
        <EmptyState icon={CheckCircle2} title={t("live.feedEmpty")} message={t("live.feedEmptySub")} showUploadLink={false} height="h-40" />
      ) : (
        <div className="flex flex-col p-2 gap-1.5">
          {shown.map((a) => {
            const c = STATUS_COLOR[a.sev] || STATUS_COLOR.info;
            const fresh = newKeys?.has(a.key);
            const isCell = !!a.cell;
            return (
              <div key={a.key} className={`flex items-stretch gap-2.5 rounded-xl px-3 py-2 ${fresh ? "live-in" : ""}`}
                style={{ background: hexA(c, a.sev === "crit" ? 0.1 : 0.06), border: `1px solid ${hexA(c, 0.28)}` }}>
                <span className="w-1 rounded-full flex-shrink-0" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c }}>{t(`live.sev.${a.sev}`)}</span>
                    {isCell && (
                      <CellLink id={a.cell_id} className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                        {a.cell}
                      </CellLink>
                    )}
                    {(a.cats || []).map((k) => (
                      <span key={k} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: hexA(catColor(k), 0.16), color: catColor(k) }} title={t(`downtime.cat.${catCode(k)}.label`)}>
                        {catCode(k)}
                      </span>
                    ))}
                  </div>
                  <div className="text-sm font-medium mt-0.5 leading-snug" style={{ color: "var(--text-1)" }}>{alertText(t, a, tl)}</div>
                  {(isCell || a.note) && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                      {isCell && <span>{tl(a.unit || "")}{a.leader ? ` · ${tl(a.leader)}` : ""}</span>}
                      {a.note && <span>{isCell ? " · " : ""}«{a.note}»</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {list.length > MAX && (
            <button type="button" onClick={() => setShowAll((v) => !v)}
              className="text-xs font-semibold py-1.5 rounded-lg" style={{ color: "var(--brand-text)", background: "var(--bg-inner)" }}>
              {showAll ? t("live.all") : tp(t, "live.feedMore", { n: list.length - MAX })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
