import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A link can open a page ON a scope — `/quality?brigadir=…&from=…` — and the
// page turns those params into its own SAVED filters («exact scope,
// remembered», the operator's call 2026-09-30): the linked figure then reads
// the same on the page it came from, and the page keeps that scope afterwards
// exactly as it keeps any filter somebody picks by hand. The links themselves
// are built in `utils/scopeLinks.js`.
//
// `read(params)` is the PAGE's own answer, because only the page knows its
// storage keys: URLSearchParams → { storageKey: value } for every filter the
// link decides, where null REMOVES the key (that filter back to its default —
// which is how the link clears whatever else the reader had narrowed), or
// null when the URL carries no scope for this page.
//
// The keys are written inside a lazy useState initializer, i.e. during the
// first render and BEFORE the page's own `usePersistentState` initializers read
// them — so this must be called ABOVE every one of them. The page's first
// render then already stands on the linked scope and no request ever goes out
// for the old one. The params are then dropped from the address bar (replace):
// the scope is saved now, so a reload keeps it without re-imposing it over
// whatever the reader changes next.
export function useUrlScope(read) {
  const location = useLocation();
  const navigate = useNavigate();
  const [applied] = useState(() => {
    if (!location.search) return false;
    let entries = null;
    try {
      entries = read(new URLSearchParams(location.search));
    } catch {
      entries = null;
    }
    if (!entries) return false;
    for (const [key, value] of Object.entries(entries)) {
      try {
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* private mode / quota — the page falls back to its defaults */
      }
    }
    return true;
  });

  useEffect(() => {
    if (!applied) return;
    navigate({ pathname: location.pathname, hash: location.hash }, { replace: true, state: location.state });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
