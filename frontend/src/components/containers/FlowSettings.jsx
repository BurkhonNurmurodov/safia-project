// «Konteyner berish» → «Sozlamalar»: which units the flow runs for (none by
// default — the engine drafts nothing until one is enrolled), the top-up
// threshold, and the readiness check: how much of each unit's plan the hours
// can see (docs/containers-flow.md).
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ListChecks, Save, Settings2 } from "lucide-react";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import CountStepper from "../ui/CountStepper";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { Chip, fmt, errText } from "./flowUtil";

export default function FlowSettings({ t, toast, day, data, loading, onSaved }) {
  const { tl } = useTranslit();
  const [units, setUnits] = useState([]);
  const [topup, setTopup] = useState(2);
  useEffect(() => {
    if (data) { setUnits(data.units); setTopup(data.topup_min); }
  }, [data]);
  const dirty = data && (topup !== data.topup_min || [...units].sort().join() !== [...data.units].sort().join());
  const save = useMutation({
    mutationFn: () => api.put("/api/container-flow/settings", { units, topup_min: topup }),
    onSuccess: () => { toast.success(t("cflow.set.saved")); onSaved(); },
    onError: (e) => toast.error(errText(t, e)),
  });
  const ready = useQuery({
    queryKey: ["cflow-readiness", day],
    queryFn: () => api.get("/api/container-flow/readiness", { params: { day } }).then((r) => r.data.units),
    staleTime: 5 * 60_000,
  });
  const on = new Set(data?.units ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Settings2} title={t("cflow.set.title")} subtitle={t("cflow.set.sub")} size="lg" />
        {loading ? <div className="p-5"><SkeletonBlock className="h-24 w-full" /></div> : (
          <div className="p-5 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-4 items-start">
            <FormField label={t("cflow.set.units")} hint={t("cflow.set.unitsHint")} alignTop>
              <StyledSelect multiple searchable value={units} onChange={setUnits}
                allLabel={units.length ? undefined : t("cflow.set.noneOn")}
                countLabel={(n) => t("cflow.set.nOn").replace("{n}", n)}
                options={(data?.all_units ?? []).map((u) => ({ value: u.id, label: `${tl(u.name)}${u.shift ? ` · S${u.shift}` : ""}` }))} />
            </FormField>
            <FormField label={t("cflow.set.topup")} hint={t("cflow.set.topupHint")} alignTop>
              <CountStepper min={1} max={1000} value={topup} onChange={(n) => setTopup(n ?? 1)} />
            </FormField>
            <div className="md:pt-[19px]">
              <Button size="lg" icon={<Save size={15} />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <TableCard icon={ListChecks} title={t("cflow.ready.title")} subtitle={t("cflow.ready.sub")} headSize="lg"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{ready.data?.length ?? ""}</span>} maxHeight="none">
        <thead>
          <tr>
            <Th label={t("containers.brigadir")} /><Th label={t("filter.shift")} align="center" />
            <Th label={t("cflow.ready.lines")} align="right" /><Th label={t("cflow.ready.withCap")} align="right" />
            <Th label={t("cflow.ready.timed")} align="right" hint={t("cflow.ready.timedHint")} />
            <Th label={t("cflow.ready.untimed")} align="right" hint={t("cflow.ready.untimedHint")} />
            <Th label={t("cflow.status")} align="center" />
          </tr>
        </thead>
        <tbody>
          {ready.isLoading ? Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}><td colSpan={7} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : !(ready.data ?? []).length ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.ready.none")}</td></tr>
          ) : ready.data.map((u) => {
            const full = u.with_cap === u.lines && u.untimed === 0;
            return (
              <tr key={u.id} className="text-sm">
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }}>{tl(u.name)}</td>
                <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }}>{u.shift ? `S${u.shift}` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(u.lines)}</td>
                <td className="px-3 py-2 text-right tabular-nums"
                  style={{ color: u.with_cap < u.lines ? "var(--status-warn)" : "var(--text-1)" }}>
                  {fmt(u.with_cap)} · {u.lines ? Math.round((100 * u.with_cap) / u.lines) : 0}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>{fmt(u.timed)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.untimed ? "var(--status-warn)" : "var(--text-4)" }}>{fmt(u.untimed)}</td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1">
                    {on.has(u.id) && <Chip tone="ok">{t("cflow.ready.on")}</Chip>}
                    <Chip tone={full ? "ok" : u.timed ? "warn" : "bad"}>{t(`cflow.ready.${full ? "full" : u.timed ? "part" : "blind"}`)}</Chip>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </div>
  );
}
