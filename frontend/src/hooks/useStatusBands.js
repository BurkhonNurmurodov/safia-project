// The traffic-light bands this platform is judging by — one query, shared by
// every page that paints one, and the ONE thing that tells `utils/statusBands`
// what an admin has set.
//
// Calling it is not optional for a page that paints a band: the helpers there
// answer from module state, so a page that never subscribes would go on
// painting the defaults until something else re-rendered it. One line at the
// top of the page buys both — the answer, and the re-render when it lands.
import { useQuery } from "@tanstack/react-query";
import api from "../utils/api";
import { BAND_DEFAULTS, applyBands } from "../utils/statusBands";

export default function useStatusBands() {
  const { data } = useQuery({
    queryKey: ["status-bands"],
    queryFn: () => api.get("/api/status-bands").then((r) => applyBands(r.data?.bands)),
    // Configuration, not a measurement: it changes when an admin says so, and
    // the save invalidates this key itself.
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  return data || BAND_DEFAULTS;
}
