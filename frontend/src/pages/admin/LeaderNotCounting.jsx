import AdminTabs from "./AdminTabs";
import LeaderDayExclusions from "./LeaderDayExclusions";
import LeaderCutoffs from "./LeaderCutoffs";

// «Hisobga olinmaydi» — `/panel/ltexclude`: what does not count, about a NIGHT
// (excluded days) and about a PERSON (a leader cut off from a date). Two pages
// until 2026-11-16; `/panel/ltcutoff` lands on the second tab.
const TABS = [
  { value: "days",    labelKey: "admin.tabLtExclude", descKey: "admin.desc.ltexclude", Page: LeaderDayExclusions },
  { value: "leaders", labelKey: "admin.tabLtCutoff",  descKey: "admin.desc.ltcutoff",  Page: LeaderCutoffs },
];

export default function LeaderNotCounting() {
  return <AdminTabs id="ltexclude" tabs={TABS} />;
}
