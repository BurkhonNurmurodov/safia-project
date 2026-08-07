import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import { useAuth } from "./AuthContext";
import { usePersistentState } from "../hooks/usePersistentState";

/**
 * The factory (plant) context — WHICH plant the six factory-aware pages are
 * reporting on (Overview, Zagruzka, Ojidaniya, Workers, Quality, Concerns).
 *
 * Why it is a context and not per-page state, when every other filter on this
 * platform is per-page (usePersistentState): a factory is not a filter, it is a
 * PLACE. Six pages that each remember a different plant would let you read
 * Overview for plant A and Ojidaniya for plant B in the same sitting, draw a
 * conclusion across them, and never see the contradiction — the numbers look
 * fine on both screens. So the selection is ONE value, shared by every page and
 * carried across navigation, and the tab strip is on screen the whole time.
 *
 * Three states, deliberately distinguished:
 *   • no stored choice → open on the admin-configured default tab
 *   • "all"            → the combined view (stored as the string "all", because
 *                        usePersistentState treats null as "forget this key")
 *   • a number         → that factory
 *
 * A LOCKED viewer (supervisor / leader — see services/factory_scope.py)
 * overrides all three: the value is forced to their own plant and the UI shows
 * a static chip instead of a switcher. The server pins them regardless; the
 * lock here only stops the UI from offering a choice that would be overruled.
 */

const FactoryContext = createContext(null);

// Shared across all six pages ON PURPOSE — see the note above.
const LS_KEY = "factory_current";
const ALL = "all";

// Language fallback for factory names, ru-first, matching utils/cellName.js:
// Russian is what the plant actually fills in, so it is the safest fallback
// before the remaining languages.
const NAME_LANGS = ["ru", "uz", "uz_cyrl", "en"];

export function factoryName(f, lang = "ru") {
  if (!f) return "";
  for (const l of [lang, ...NAME_LANGS]) {
    const v = f[`name_${l}`];
    if (v) return String(v);
  }
  return f.code || "";
}

export function FactoryProvider({ children }) {
  const { auth } = useAuth();
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  // "all" | <id> | null(unset). Never null-as-"all" — see the docblock.
  const [stored, setStored] = usePersistentState(LS_KEY, null);

  const load = useCallback(() => {
    return api
      .get("/api/factories")
      .then((r) => setData(r.data || null))
      .catch(() => setData(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (auth?.status !== "approved") return;
    load();
  }, [auth?.status, load]);

  const factories = useMemo(() => data?.factories || [], [data]);
  const lockedId = data?.locked_factory_id ?? null;
  const allTab = !!data?.all_tab;

  // Reconcile the stored choice against what actually exists NOW. A factory can
  // be archived, deleted or renamed between two visits, and a tab that points
  // at a factory nobody can see is worse than no memory at all: the page opens
  // empty with a selected tab, which reads as "there is no data" rather than
  // "that plant is gone".
  useEffect(() => {
    if (!ready || !data) return;
    if (lockedId !== null) {
      if (stored !== lockedId) setStored(lockedId);
      return;
    }
    const live = new Set(factories.map((f) => f.id));
    // The admin's configured landing tab (null there means they chose «All»),
    // then the first factory if the combined tab isn't on offer.
    const fallback = data.default_factory_id
      ?? (allTab ? ALL : (factories[0]?.id ?? null));
    if (stored === null || stored === undefined) {
      if (fallback !== null) setStored(fallback);
      return;
    }
    if (stored === ALL) {
      // The admin turned the combined tab off while it was the user's choice.
      if (!allTab) setStored(fallback === ALL ? (factories[0]?.id ?? null) : fallback);
      return;
    }
    if (!live.has(stored)) setStored(fallback);
  }, [ready, data, factories, lockedId, allTab, stored, setStored]);

  // null = «All factories» — the shape every page and query param speaks.
  const factory = useMemo(() => {
    if (lockedId !== null) return lockedId;
    if (stored === null || stored === undefined || stored === ALL) return null;
    return stored;
  }, [stored, lockedId]);

  const setFactory = useCallback(
    (v) => { if (lockedId === null) setStored(v == null ? ALL : v); },
    [lockedId, setStored]
  );

  const value = useMemo(() => ({
    factories,
    factory,                       // null = all factories
    setFactory,
    locked: lockedId !== null,
    lockedId,
    allTab,
    ready,
    // Whether any factory chrome should render at all. One plant is the state
    // this platform ran in for years — showing a switcher with a single option
    // would add a control that can never do anything.
    enabled: factories.length > 1,
    current: factories.find((f) => f.id === factory) || null,
    reload: load,
  }), [factories, factory, setFactory, lockedId, allTab, ready, load]);

  return <FactoryContext.Provider value={value}>{children}</FactoryContext.Provider>;
}

export const useFactory = () => useContext(FactoryContext) || {
  factories: [], factory: null, setFactory: () => {}, locked: false,
  lockedId: null, allTab: true, ready: false, enabled: false, current: null,
  reload: () => {},
};

/**
 * Merge the current factory into a page's request params.
 *
 * On «All factories» the key is left OFF entirely rather than sent as null —
 * that is the backend's "no narrowing" path, and it also keeps the react-query
 * key identical to what it was before this feature, so a single-plant install
 * reuses its existing cache instead of refetching everything once.
 */
export function useFactoryParams(params) {
  const { factory } = useFactory();
  return useMemo(
    () => (factory == null ? params : { ...params, factory }),
    [params, factory]
  );
}

/**
 * Keep a supervisor picker honest about the factory tab it is sitting on.
 *
 * Returns the supervisors that belong to the current plant, and — the part that
 * actually matters — clears a selected supervisor who does NOT. Without this,
 * switching plants while a supervisor is picked leaves a valid-looking toolbar
 * over an empty page, and every user reads that as "no data" rather than "that
 * person works somewhere else".
 *
 * `supervisors` is any array of objects carrying `factory_id` and an id under
 * `idKey` (/api/managers/all says `manager_id`, /api/quality says `id`).
 */
export function useFactorySupervisors(supervisors, selectedIds, onClear, idKey = "manager_id") {
  const { factory } = useFactory();

  const scoped = useMemo(() => {
    if (factory == null) return supervisors || [];
    return (supervisors || []).filter((s) => s.factory_id === factory);
  }, [supervisors, factory]);

  useEffect(() => {
    if (factory == null || !supervisors?.length || !selectedIds?.length) return;
    const live = new Set(scoped.map((s) => s[idKey]));
    const kept = selectedIds.filter((id) => live.has(id));
    if (kept.length !== selectedIds.length) onClear(kept);
    // `onClear` is re-created every render by FilterContext, so it stays out of
    // the deps; the real triggers are the plant, the loaded list and the pick.
  }, [factory, scoped, selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return scoped;
}
