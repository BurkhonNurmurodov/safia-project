import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, UserRound } from "lucide-react";
import Layout from "../layout/Layout";
import Tooltip from "../ui/Tooltip";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { FilterPanel, PickFilter } from "../ui/ColumnFilter";
import { useFactorySection } from "../ui/FactorySelect";
import { useFactorySupervisors } from "../../context/FactoryContext";
import { useFilters } from "../../context/FilterContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";

// «Odam soni» — «Davomat», «O'zgarishlar» and «Tarkib» were the three tabs of
// ONE /workers page until 2026-11-03 (the operator); each is its own route and
// sidebar row now — /workers/attendance · /workers/movements ·
// /workers/composition, with /workers itself landing on the first. What the
// three share lives here: the page frame with its one-row filter bar, the
// chart card and the population switch. The filters are FilterContext's, so a
// period or a brigadir picked on one page is still picked on the next.

// The page frame: the header title names the family and the page
// («Odam Soni · Davomat»), then the ONE-ROW filter bar — period inline,
// plant / shift / supervisor inside the shared FilterPanel, active narrowings
// surfacing as chips. `period={false}` drops the period where it would change
// nothing («Tarkib» is today's lists).
//
// `right` sits at the row's far end: what moves the WHOLE page and is not a
// filter of the records — the «Jami / Zagruzka» population switch, «Tarkib»'s
// read line and refresh. It is said ONCE here; until 2026-11-13 the switch was
// repeated in the header of every card it drove (six of them on «Davomat»),
// and the cards that did not carry it silently ignored it.
export function WorkersPage({ titleKey, period = true, right, children }) {
  const { dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  // Plant switcher as a FilterPanel section (null on single-plant installs,
  // an inert chip for locked viewers).
  const factorySection = useFactorySection();

  // Full (period-independent) supervisor list for the inline picker — shares the
  // cache with the header Filters drawer so it's effectively free.
  const { data: allSupervisors = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
  });
  // Only the supervisors of the plant this tab is on — and if the currently
  // picked one isn't among them, the pick is dropped rather than left standing
  // over an empty page.
  const scopedSupervisors = useFactorySupervisors(
    allSupervisors, brigadirIds, setBrigadirIds);
  const supOptions = useMemo(
    () => [...scopedSupervisors]
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
      .map((b) => ({ value: String(b.manager_id), label: tl(b.name) })),
    [scopedSupervisors, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // The inline dropdown mirrors the global brigadir filter: a single pick maps to
  // one id, "All" clears it. A multi-select made in the drawer shows as "All".
  const supValue = brigadirIds.length === 1 ? String(brigadirIds[0]) : "All";

  return (
    <Layout title={`${t("nav.workers")} · ${t(titleKey)}`}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {period && (
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            compactLabel
            triggerClassName="px-3 py-2 text-sm"
          />
        )}
        <FilterPanel
          sections={[
            ...(factorySection ? [factorySection] : []),
            {
              key: "shift", icon: Layers, label: t("filter.shift"),
              active: shift != null,
              display: shift != null ? `S${shift}` : "",
              onClear: () => setShift(null),
              render: () => (
                <SegmentedToggle
                  fill
                  value={shift}
                  onChange={setShift}
                  options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
                />
              ),
            },
            {
              key: "supervisor", icon: UserRound, label: t("tasks.colSupervisor"),
              active: supValue !== "All",
              display: supValue !== "All" ? (supOptions.find((o) => o.value === supValue)?.label || "") : "",
              onClear: () => setBrigadirIds([]),
              render: ({ close } = {}) => (
                <PickFilter
                  searchable
                  close={close}
                  opts={[{ value: "All", label: t("tasks.allSupervisors") }, ...supOptions]}
                  value={supValue}
                  onChange={(v) => setBrigadirIds(v === "All" ? [] : [Number(v)])}
                />
              ),
            },
          ]}
        />
        {right && (
          <div className="ml-auto flex items-center justify-end gap-x-3 gap-y-2 flex-wrap min-w-0">{right}</div>
        )}
      </div>
      {children}
    </Layout>
  );
}

// THE chart card of the three pages: the canonical SectionHead (+ an optional
// info icon after the title, a `subtitle` under it) over a body. The card is a
// flex column, so in a stretched grid row a body may take `flex-1` and two
// neighbours end on one line whatever each one holds.
export function ChartCard({ icon, title, info, subtitle, right, children, className = "", bodyClassName = "p-4" }) {
  const head = info ? (
    <span className="inline-flex items-center gap-1">{title}<Tooltip text={info} /></span>
  ) : title;
  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col min-w-0 ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={head} subtitle={subtitle} right={right} />
      <div className={`flex-1 flex flex-col min-w-0 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

// The headline tiles while their figures load — the size the real ones take,
// so nothing under them moves when the answer lands.
export function TileSkeletons({ n = 4 }) {
  return Array.from({ length: n }).map((_, i) => (
    <div key={i} className="rounded-xl p-4 h-[168px] max-sm:h-[150px]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonBlock className="h-3 w-24 mb-4" />
      <SkeletonBlock className="h-8 w-20 mb-4" />
      <SkeletonBlock className="h-1.5 w-full mb-3" />
      <SkeletonBlock className="h-3 w-2/3" />
    </div>
  ));
}

// WHICH people — every role, or only the zagruzka-counted ones. One definition
// so the segments can never drift between the pages that carry it («Davomat»
// and «Tarkib» share the `workers_scope` state). `size="md"` is the toolbar's
// 38px baseline, where it lives.
export function ScopeSwitch({ scope, setScope, t, size = "md" }) {
  return (
    <SegmentedToggle
      size={size} value={scope} onChange={setScope}
      options={[["all", t("workers.tmAll")], ["zagruzka", t("workers.tmZagruzka")]]} />
  );
}
