import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../../context/LangContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import { LeaveGuardCtx as Ctx } from "../../hooks/useLeaveGuard";

/**
 * «Unsaved changes» — asked before a page holding a draft is left.
 *
 * A page with pending edits calls `useLeaveGuard(true)` (hooks/useLeaveGuard.js) (the page-access
 * matrix, a translation pass, a capability draft, the broadcast composer…).
 * While any caller is dirty, Layout's provider asks first before the reader
 * leaves the page through:
 *   - any in-app LINK — the sidebar rows, the logo, the launcher button, the
 *     bell's rows, a link inside the page itself — caught by one click
 *     listener, so a new link anywhere is covered without knowing about it;
 *   - `useGuardedNavigate()` — for a control that navigates in code (the
 *     header search's results).
 * A link to the SAME path (a query change) never asks: the page stays mounted
 * and the draft with it. Not covered, as before: the browser's back gesture
 * (that needs a data router's useBlocker) and closing the tab.
 *
 * It lives in Layout (one per page), so a draft dies with its page's Layout
 * and can never ask on a page that holds none.
 */


export function LeaveGuardProvider({ children }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const [pending, setPending] = useState(null);
  const dirty = dirtyIds.size > 0;

  const setDirty = useCallback((id, on) => {
    setDirtyIds((cur) => {
      if (on === cur.has(id)) return cur;
      const next = new Set(cur);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const leaves = useCallback((to) => {
    try {
      const url = new URL(to, window.location.href);
      return url.origin === window.location.origin && url.pathname !== window.location.pathname;
    } catch { return false; }
  }, []);

  // Every in-app link, caught before React Router sees the click.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (!leaves(a.href)) return;
      e.preventDefault();
      e.stopPropagation();
      const url = new URL(a.href, window.location.href);
      setPending(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, leaves]);

  const guardedNavigate = useCallback((to, opts) => {
    if (dirty && typeof to === "string" && leaves(to)) { setPending(to); return; }
    navigate(to, opts);
  }, [dirty, leaves, navigate]);

  const value = useMemo(() => ({ setDirty, guardedNavigate }), [setDirty, guardedNavigate]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog
        open={!!pending}
        title={t("admin.unsavedTitle")}
        message={t("admin.unsavedMsg")}
        confirmLabel={t("admin.unsavedDiscard")}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const to = pending;
          setPending(null);
          setDirtyIds(new Set());
          navigate(to);
        }}
      />
    </Ctx.Provider>
  );
}
