import { createContext, useContext, useState } from "react";

/**
 * Ghost Mode — an admin-only toggle (in the header) that suppresses the
 * notifications normally triggered by the admin's changes. The state is kept in
 * localStorage so it survives reloads within a session, and the axios request
 * interceptor (utils/api.js) reads the same key to attach `X-Ghost-Mode: 1` to
 * every request while it is on. The backend honours it for admins only.
 */
const GhostContext = createContext(null);

export function GhostProvider({ children }) {
  const [ghost, setGhost] = useState(() => localStorage.getItem("ghost_mode") === "1");

  function toggleGhost() {
    setGhost((prev) => {
      const next = !prev;
      if (next) localStorage.setItem("ghost_mode", "1");
      else localStorage.removeItem("ghost_mode");
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
