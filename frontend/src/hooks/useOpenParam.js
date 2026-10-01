import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A notification's link can name ONE record — /concerns?open=12,
// /tasks?open=7. This hands that id to the page and drops it from the URL, so
// a reload or Back does not open the record again. It reads the param on EVERY
// arrival, not only on mount: the routes are not keyed, so a second link to the
// page the reader is already on would otherwise do nothing. The page opens the
// record once its own data has it and then calls the returned `done`.
export function useOpenParam(name = "open") {
  const location = useLocation();
  const navigate = useNavigate();
  const [id, setId] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const v = q.get(name);
    if (!v) return;
    setId(v);
    q.delete(name);
    const rest = q.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "", hash: location.hash },
      { replace: true, state: location.state });
  }, [location.search, location.pathname, location.hash, location.state, name, navigate]);
  const done = useCallback(() => setId(null), []);
  return [id, done];
}
