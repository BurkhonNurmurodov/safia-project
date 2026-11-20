// «Hisobotlar» — which page each figure is READ FROM, and so which page it
// opens (the operator, 2026-11-20: «when these figures are clicked, we should
// be able to go to the page of that metric to see in detail info»).
//
// Nothing in the report is measured by the report: every figure is one another
// page already prints (services/reports.py says which, docs/reports-and-ontime.md
// in words). This is that list again, as links — the page that owns the
// figure, opened on the scope the figure was read over: the MONTH of the
// column pressed (the running month's days so far), the report's shift and
// brigadirs. The plant is the shared one already. The URLs themselves are
// `utils/scopeLinks.js`; each page reads its own with `useUrlScope` (the
// shared filters with the provider) and KEEPS the scope, like any other
// filter somebody picks.
//
// A figure no page prints is not here and stays plain text — Verifix's
// overtime is the one today (the report is the only place it is shown). A
// page the viewer may not open is plain text too, never a dead link.
import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import {
  planLink, zagruzkaLink, attendanceLink, downtimeLink, qualityLink,
  concernsSpanLink, leadersKpiLink, ontimeLink, arcLink,
} from "../../utils/scopeLinks";

// `page` — the access key the viewer must hold («tab:<id>» = an admin tab);
// `label` — the page's own name, as the menu spells it; `to(scope)` — the URL.
// `scope`: { from, to, ym, shift, units, unitNames, arcUnits }.
const PLAN = { page: "plan", label: "nav.planFulfillment", to: planLink };
const ZAGRUZKA = { page: "zagruzka", label: "nav.zagruzka", to: zagruzkaLink };
const ATTENDANCE = { page: "workers", label: "nav.workers", to: attendanceLink };
const TURNOVER = {
  page: "leaders-kpi", label: "nav.leadersKpi",
  to: (s) => leadersKpiLink({ tab: "turnover", month: s.ym, shift: s.shift, units: s.units }),
};
const DOWNTIME = { page: "downtime", label: "nav.idleTime", to: (s) => downtimeLink(s, "analysis") };
// «Xarajat» is in the payload only for those the tab is for (COST_ROLES), so
// the row this hangs on is already theirs.
const COST = { page: "downtime", label: "nav.idleTime", to: (s) => downtimeLink(s, "cost") };
// The Quality register is narrowed by the unit's NAME (`r.sup`), which is what
// the report's brigadir options carry — and by ONE brigadir at most (its chain
// is single-pick), so a report narrowed to several opens the register on the
// month and the shift, every brigadir listed. The closure rate is read hair
// aside (the page's «Sochsiz»); the count of complaints with it.
const quality = (hair) => ({
  page: "quality", label: "nav.quality",
  to: (s) => qualityLink({
    brigadir: s.unitNames?.length === 1 ? s.unitNames[0] : undefined,
    from: s.from, to: s.to, shift: s.shift, hair,
  }),
});
const QUALITY = quality();
const QUALITY_ALL = quality("with");
const CONCERNS = { page: "concerns", label: "nav.concerns", to: concernsSpanLink };
// The logistics sheet names no brigade — the figure is printed only while the
// report reads the whole plant, so there is no scope to hand over but the span.
const ONTIME = { page: "ontime", label: "nav.ontime", to: ontimeLink };
// The requests FILED in the month — the register with the period set, on the
// report's shift and on the units the server narrowed the count to
// (`scope.arc_managers`: the brigadir picks, or every unit of the plant picked
// — IT's register knows no plant, only the units whose cells its tickets
// name). None while the report reads the whole plant.
const ARC = {
  page: "arc", label: "nav.arc",
  to: (s) => arcLink({ from: s.from, to: s.to, shift: s.shift, units: s.arcUnits ?? s.units }),
};
// «Qamrov» counts what STANDS (a month's last day) — registers with no period,
// opened as they are today; `timeless` keeps the month out of the link's hint.
const CELLS = { page: "cells", label: "nav.cells", to: () => "/cells", timeless: true };
const ORG = { page: "tab:orgchart", label: "admin.tabOrgChart", to: () => "/panel/orgchart", timeless: true };

// Keyed «<section>.<row>» — the section a row BELONGS to (a summary row names
// its own; a section's row is read under the section it sits in), which is
// `deltaTone`'s rule in reportsUtil.js and for the same reason: «closure» and
// «resolved» belong to two sections.
const TARGETS = {
  "production.planMin": PLAN,
  "production.actualMin": PLAN,
  "production.shortMin": PLAN,
  "production.fulfil": PLAN,
  "production.eff": ZAGRUZKA,
  "production.loadStart": ZAGRUZKA,
  "production.loadEnd": ZAGRUZKA,

  "personnel.listed": ATTENDANCE,
  "personnel.came": ATTENDANCE,
  "personnel.onLeave": ATTENDANCE,
  "personnel.attRate": ATTENDANCE,
  "personnel.wfInitial": TURNOVER,
  "personnel.wfHires": TURNOVER,
  "personnel.wfDismissals": TURNOVER,
  "personnel.wfAttrition": TURNOVER,
  "personnel.working": TURNOVER,
  "personnel.left": TURNOVER,
  "personnel.turnRate": TURNOVER,

  "idle.idleMin": DOWNTIME,
  "idle.idlePct": DOWNTIME,
  "idle.idlePerDay": DOWNTIME,
  "idle.unitDays": DOWNTIME,
  "idle.flaggedDays": DOWNTIME,
  "idle.idlePersonMin": DOWNTIME,
  "idle.workedMin": DOWNTIME,

  "cost.costSum": COST,
  "cost.pricedMin": COST,
  "cost.unpricedMin": COST,
  "cost.costPerDay": COST,
  "cost.hc": COST,

  "quality.complaints": QUALITY_ALL,
  "quality.actionable": QUALITY,
  "quality.resolved": QUALITY,
  "quality.closure": QUALITY,
  "quality.openLeft": QUALITY,

  "concerns.filed": CONCERNS,
  "concerns.counted": CONCERNS,
  "concerns.resolved": CONCERNS,
  "concerns.closure": CONCERNS,
  "concerns.uplifted": CONCERNS,
  "concerns.openLeft": CONCERNS,

  "ontime.pct": ONTIME,
  "arc.filed": ARC,

  "summary.vfxCells": CELLS,
  "summary.vfxShiftManagers": ORG,
  "summary.vfxBrigadirs": ORG,
  "summary.vfxLeaders": ORG,
};

/** The page a row opens, or undefined. */
export const targetOf = (row, secKey) =>
  TARGETS[`${row.section || secKey || ""}.${String(row.key).split(".").pop()}`];

/**
 * `link(row, secKey, month)` → `{ to, page, timeless }` for a figure this
 * viewer can follow, else null. `month` is one of the payload's `months` — the
 * column pressed; `page` is the target's name in the reader's language, for
 * the link's «opens on …» hint, which names the month unless `timeless`.
 *
 * `scope` is the report's own narrowing: `{ shift, units, unitNames }`, plus
 * `arcUnits` — the units the server narrowed the ARC count to.
 */
export function useFigureLinks({ shift, units, unitNames, arcUnits }) {
  const { auth } = useAuth();
  const { t } = useLang();
  const { access } = usePageAccess();
  const { capPages, deniedPages, capTabs } = useCapabilities();
  const role = auth?.role;

  return useMemo(() => {
    const may = (page) => (page.startsWith("tab:")
      ? role === "admin" || (capTabs || []).includes(page.slice(4))
      : canAccessPage(role, page, access, capPages, deniedPages));
    return (row, secKey, month) => {
      const target = targetOf(row, secKey);
      if (!target || !month || !may(target.page)) return null;
      return {
        to: target.to({ from: month.from, to: month.to, ym: month.ym, shift, units, unitNames, arcUnits }),
        page: t(target.label),
        timeless: !!target.timeless,
      };
    };
  }, [role, access, capPages, deniedPages, capTabs, shift, units, unitNames, arcUnits, t]);
}
