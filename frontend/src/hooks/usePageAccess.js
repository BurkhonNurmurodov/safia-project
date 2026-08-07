import { useQuery } from "@tanstack/react-query";
import api from "../utils/api";
import { DEFAULT_PAGE_ACCESS } from "../config/pages";

// Fetches the admin-configured page-access matrix. Falls back to the defaults
// (which match the original behavior) until the request resolves.
export function usePageAccess() {
  const { data, isLoading } = useQuery({
    queryKey: ["page-access"],
    queryFn: () => api.get("/api/page-access").then((r) => r.data),
    staleTime: 300_000,
  });
  return {
    access: data?.pages ?? DEFAULT_PAGE_ACCESS,
    isLoading,
  };
}
