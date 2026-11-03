import { useMemo } from "react";
import Demographics from "../../components/workers/Demographics";
import { WorkersPage, ScopeSwitch } from "../../components/workers/WorkersPage";
import { useFilters } from "../../context/FilterContext";
import { useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";

// «Tarkib» — the third of «Odam soni»'s three pages (/workers/composition; one
// page's tabs until 2026-11-03, see components/workers/WorkersPage.jsx): who is
// on the lists today. Admins only (the operator, 2026-10-23) — the route is
// RequireAdmin and the endpoint refuses everybody else.
export default function WorkersComposition() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  // The same population switch as «Davomat» — one state, so both pages are
  // about the same people.
  const [scope, setScope] = usePersistentState("workers_scope", "all");   // "all" | "zagruzka"
  // A snapshot of today: the plant / shift / brigadir scope without the
  // period, so a period picked on another page does not refetch it.
  const fparams = useFactoryParams(params);
  const demoParams = useMemo(() => {
    const { date_from, date_to, ...rest } = fparams || {}; // eslint-disable-line no-unused-vars
    return rest;
  }, [fparams]);

  // Verifix keeps only today's placement, so the period would change nothing
  // here — it is not offered.
  return (
    <WorkersPage titleKey="nav.workersComposition" period={false}>
      <Demographics
        params={demoParams}
        ready={ready}
        scope={scope}
        scopeSwitch={<ScopeSwitch scope={scope} setScope={setScope} t={t} />}
      />
    </WorkersPage>
  );
}
