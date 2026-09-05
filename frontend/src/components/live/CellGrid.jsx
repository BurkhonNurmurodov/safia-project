import { Grid3x3, Siren } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { catColor } from "../idle/categories";
import { shortPerson } from "../../utils/personName";
import { STATUS_COLOR, hexA, tp, fmtInt, fmtPct, catCode } from "./liveUtils";

// One tile per cell, grouped under its brigadir in the board's order (worst
// unit first, and inside a unit the stopped cells first). Tiles are INERT on
// purpose: a dense grid on a touch TV must not navigate away from the monitor
// — the feed and the board carry the links.
function Tile({ c, t }) {
  const st = c.status;
  const col = STATUS_COLOR[st] || STATUS_COLOR.quiet;
  const idle = c.idle || {};
  const stopped = idle.stopped_now;
  return (
    <div
      className={`relative rounded-xl px-2.5 py-2 flex flex-col gap-1 ${stopped ? "live-pulse" : ""}`}
      style={{
        width: 148,
        background: stopped ? hexA(STATUS_COLOR.crit, 0.16) : st === "quiet" ? "var(--bg-inner)" : hexA(col, 0.08),
        border: `1px solid ${st === "quiet" ? "var(--border)" : hexA(col, stopped ? 0.7 : 0.4)}`,
      }}
      title={[
        c.code, c.leader || "", c.unit,
        idle.events ? tp(t, "live.events", { n: idle.events }) : "",
        idle.last_end && !stopped ? tp(t, "live.lastStop", { t: idle.last_end }) : "",
        c.plan ? `${t("live.cellPlan")} ${fmtPct(c.plan.pct)} / ${tp(t, "live.plan.expected", { e: fmtInt(c.plan.expected_pct) })}` : "",
      ].filter(Boolean).join("\n")}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-bold text-lg leading-none tabular-nums" style={{ color: stopped ? STATUS_COLOR.crit : "var(--text-1)" }}>{c.code}</span>
        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${stopped ? "live-glow" : ""}`} style={{ background: col }} />
      </div>
      <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
        {c.leader ? shortPerson(c.leader) : "—"}
        {c.people > 0 ? <span style={{ color: "var(--text-4)" }}> · {fmtInt(c.people)}</span> : null}
      </div>
      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold tabular-nums">
        <span style={{ color: idle.idle_min > 0 ? col : "var(--text-4)" }}>
          {idle.idle_min > 0 ? `${fmtInt(idle.idle_min)} ${t("live.min")}` : idle.idle_all > 0 ? `${fmtInt(idle.idle_all)} ${t("live.min")}·H` : "—"}
        </span>
        {c.plan && c.plan.pct != null && (
          <span style={{ color: c.plan.status === "crit" ? STATUS_COLOR.crit : c.plan.status === "warn" ? STATUS_COLOR.warn : "var(--text-3)" }}>
            {fmtPct(c.plan.pct)}
          </span>
        )}
      </div>
      {stopped && (
        <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold" style={{ color: STATUS_COLOR.crit }}>
          <Siren size={11} />
          <span>{tp(t, "live.stoppedSince", { since: idle.since })}</span>
          <span>· {fmtInt(idle.now_min)} {t("live.min")}</span>
          {(idle.now_cats || []).slice(0, 2).map((k) => (
            <span key={k} className="px-1 rounded" style={{ background: hexA(catColor(k), 0.2), color: catColor(k) }}>{catCode(k)}</span>
          ))}
        </div>
      )}
      {!stopped && idle.by_cat && Object.keys(idle.by_cat).length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {Object.keys(idle.by_cat).slice(0, 3).map((k) => (
            <span key={k} className="text-[9px] font-bold px-1 rounded" style={{ background: hexA(catColor(k), 0.16), color: catColor(k) }}
              title={`${t(`downtime.cat.${catCode(k)}.label`)} · ${fmtInt(idle.by_cat[k])} ${t("live.min")}`}>
              {catCode(k)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CellGrid({ cells, units, onlyProblems, onToggleOnly, t, tl }) {
  const list = (cells || []).filter((c) => !onlyProblems || c.status === "crit" || c.status === "warn");
  const byUnit = new Map();
  for (const c of list) {
    if (!byUnit.has(c.unit_id)) byUnit.set(c.unit_id, []);
    byUnit.get(c.unit_id).push(c);
  }
  const groups = (units || []).filter((u) => byUnit.has(u.id));
  const stopped = (cells || []).filter((c) => c.idle?.stopped_now).length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={Grid3x3}
        title={t("live.cells")}
        subtitle={t("live.cellsSub")}
        right={
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
              {stopped > 0 && <span style={{ color: STATUS_COLOR.crit }} className="font-bold">{stopped} ⏹ · </span>}
              {(cells || []).length}
            </span>
            <SegmentedToggle
              size="sm"
              value={onlyProblems ? "problems" : "all"}
              onChange={(v) => onToggleOnly(v === "problems")}
              options={[["all", t("live.all")], ["problems", t("live.onlyProblems")]]}
            />
          </div>
        }
      />
      {!(cells || []).length ? (
        <EmptyState title={t("live.noCells")} message="" showUploadLink={false} height="h-32" />
      ) : !list.length ? (
        <EmptyState title={t("live.noProblemCells")} message="" showUploadLink={false} height="h-32" />
      ) : (
        <div className="p-3 flex flex-col gap-3">
          {groups.map((u) => {
            const uc = STATUS_COLOR[u.status] || STATUS_COLOR.quiet;
            const rows = byUnit.get(u.id) || [];
            return (
              <div key={u.id}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="w-1.5 h-4 rounded-full" style={{ background: uc }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{tl(u.name)}</span>
                  <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                    {rows.length}{u.cells_stopped > 0 ? ` · ${u.cells_stopped} ⏹` : ""}{u.idle?.basis !== "none" ? ` · ${fmtInt(u.idle?.min)} ${t("live.min")}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rows.map((c) => <Tile key={c.id} c={c} t={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
