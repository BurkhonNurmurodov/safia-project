import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, UserRound } from "lucide-react";
import Layout from "../layout/Layout";
import Tooltip from "../ui/Tooltip";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import { SectionHead } from "../ui/DataTable";
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
export function WorkersPage({ titleKey, period = true, children }) {
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
      </div>
      {children}
    </Layout>
  );
}

// Chart card that composes the canonical SectionHead (+ optional info icon).
export function ChartCard({ icon, title, info, right, children, className = "" }) {
  const head = info ? (
    <span className="inline-flex items-center gap-1">{title}<Tooltip text={info} /></span>
  ) : title;
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={head} right={right} />
      <div className="p-4">{children}</div>
    </div>
  );
}

// WHICH people — every role, or only the zagruzka-counted ones. One definition
// so the segments can never drift between the cards (and the pages: «Davomat»
// and «Tarkib» share the `workers_scope` state) that carry it.
export function ScopeSwitch({ scope, setScope, t }) {
  return (
    <SegmentedToggle
      size="sm" value={scope} onChange={setScope}
      options={[["all", t("workers.tmAll")], ["zagruzka", t("workers.tmZagruzka")]]} />
  );
}
