import { createContext, useContext, useState } from "react";

/**
 * Ghost Mode — an admin-only toggle (in the header) that suppresses the
 * notifications normally triggered by the admin's changes. The state is kept in
 * sessionStorage (NOT localStorage) so it survives reloads within a session but
 * is cleared automatically when the app/webview is closed — closing the app
 * always turns Ghost Mode off, so it can never silently leak into a later
 * session. The axios request interceptor (utils/api.js) reads the same key to
 * attach `X-Ghost-Mode: 1` while it is on. The backend honours it for admins only.
 */
const GhostContext = createContext(null);

export function GhostProvider({ children }) {
  const [ghost, setGhost] = useState(() => sessionStorage.getItem("ghost_mode") === "1");

  function toggleGhost() {
    setGhost((prev) => {
      const next = !prev;
      if (next) sessionStorage.setItem("ghost_mode", "1");
      else sessionStorage.removeItem("ghost_mode");
      return next;
    });
  }

  return (
    <GhostContext.Provider value={{ ghost, toggleGhost }}>
      {children}
    </GhostContext.Provider>
  );
}

export const useGhost = () => useContext(GhostContext);
