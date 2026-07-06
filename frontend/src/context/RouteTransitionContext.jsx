import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const RouteTransitionContext = createContext(false);

/**
 * Turns `true` for a short beat after every pathname change. Layout consumes
 * it to cover the content area with the branded loader while the new page
 * mounts, keeping the header and sidebar visible during page switches.
 * Query-param-only changes don't count as a switch.
 */
export function RouteTransitionProvider({ children }) {
  const location = useLocation();
  const [switching, setSwitching] = useState(false);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current === location.pathname) return;
    prevPath.current = location.pathname;
    setSwitching(true);
    const t = setTimeout(() => setSwitching(false), 500);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <RouteTransitionContext.Provider value={switching}>
      {children}
    </RouteTransitionContext.Provider>
  );
}

export function useRouteTransition() {
  return useContext(RouteTransitionContext);
}
