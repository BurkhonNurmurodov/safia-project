import { useQuery } from "@tanstack/react-query";
import api from "../utils/api";
import { hedged } from "../utils/hedge";
import { DEFAULT_PAGE_ACCESS } from "../config/pages";

// Fetches the admin-configured page-access matrix. Falls back to the defaults
// (which match the original behavior) until the request resolves.
export function usePageAccess() {
  const { data, isLoading } = useQuery({
    queryKey: ["page-access"],
    // Every route waits on it, so it is asked again when it hangs
    // (utils/hedge.js). React-query's own signal is deliberately not taken:
    // consuming it makes a fetch abort whenever its last observer unmounts.
    queryFn: () => hedged((signal) => api.get("/api/page-access", { signal })).then((r) => r.data),
    staleTime: 300_000,
  });
  return {
    access: data?.pages ?? DEFAULT_PAGE_ACCESS,
    isLoading,
  };
}
