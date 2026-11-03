import { createContext, useContext, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";

// The «unsaved changes» guard's hooks. The provider — the link catcher and the
// confirm — is components/layout/LeaveGuard.jsx, mounted by Layout.
export const LeaveGuardCtx = createContext(null);

/** Mark this page as holding unsaved edits while `isDirty` is true. */
export function useLeaveGuard(isDirty) {
  const ctx = useContext(LeaveGuardCtx);
  const id = useId();
  const setDirty = ctx?.setDirty;
  useEffect(() => {
    if (!setDirty) return undefined;
    setDirty(id, !!isDirty);
    return () => setDirty(id, false);
  }, [isDirty, setDirty, id]);
}

/** `navigate` that asks first while the page holds a draft. Outside a Layout
 *  it is plain `navigate`. */
export function useGuardedNavigate() {
  const ctx = useContext(LeaveGuardCtx);
  const navigate = useNavigate();
  return ctx?.guardedNavigate ?? navigate;
}
