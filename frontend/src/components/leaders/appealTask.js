import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../utils/api";

const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || o?.uz || "";

// The task's NAME, never its number twice. The server names an appeal's task
// down the leader's own chain and answers «#12» when that chain no longer
// carries it — which a card printed beside its «№12» as «№12 #12». The
// catalog (every definition, archived ones too) names it then; only a task the
// catalog does not know either is left to its number, by the caller.
const isPlaceholder = (n) => /^#\d+$/.test(String(n || "").trim());
export function useTaskCatalog() {
  const { data } = useQuery({
    queryKey: ["leader-task-catalog"],
    queryFn: () => api.get("/api/leader-tasks/catalog").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const m = {};
    for (const t of data?.tasks || []) m[Number(t.id)] = t.name || {};
    return m;
  }, [data]);
}
export const taskTitle = (it, lang, cat) => {
  const own = pick(it?.taskName, lang);
  if (own && !isPlaceholder(own)) return own;
  const c = cat?.[Number(it?.taskId)];
  return String((c && (c[lang] || c.ru || c.uz)) || "").trim();
};
