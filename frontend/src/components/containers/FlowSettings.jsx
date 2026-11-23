// «Konteyner berish» → «Sozlamalar»: each Telegram message the page sends has
// its own switch, and the readiness check — how much of each brigadir's plan
// the hours can see (a line with no hour adds nothing to their limit).
// The enrolled units and the top-up threshold belonged to the automatic
// batches, removed on 2026-11-18 (docs/containers-flow.md).
// «Jo'natish jadvali» (2026-11-19) heads the tab: AXO keeps it too, and sees
// it alone — the switches and the readiness check stay the admins'.
// «Qabul qilish» (2026-11-23) has a card of its own: the step is the admins'
// alone until its switch is on, and its 30-minute reminder has its own.
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, CheckCheck, ListChecks } from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { Chip, fmt, errText } from "./flowUtil";
import { SendAreasCard } from "./FlowSending";

export default function FlowSettings({ t, toast, day, data, loading, onSaved, isAdmin = false }) {
  const { tl } = useTranslit();
  // every switch is saved on the tap; `which` is its field
  const notify = useMutation({
    mutationFn: ({ which, on }) => api.put("/api/container-flow/settings", { [which]: on }),
    onSuccess: (_, { on, said }) => {
      toast.success(t(said?.[on ? 0 : 1] ?? (on ? "cflow.set.notifyOn" : "cflow.set.notifyOff")));
      onSaved();
    },
    onError: (e) => toast.error(errText(t, e)),
  });
  const SWITCHES = [
    { which: "notify", label: t("cflow.set.notifyLogistics"), hint: t("cflow.set.notifyHint") },
    { which: "notify_brigadirs", label: t("cflow.set.notifyBrigadirs"), hint: t("cflow.set.notifyBrigHint") },
    { which: "notify_axo", label: t("cflow.set.notifyAxo"), hint: t("cflow.set.notifyAxoHint") },
    { which: "notify_managers", label: t("cflow.set.notifyManagers"), hint: t("cflow.set.notifyManagersHint") },
    { which: "notify_extra", label: t("cflow.set.notifyExtra"), hint: t("cflow.set.notifyExtraHint") },
  ];
  // «Qabul qilish»: the step itself (OFF = the admins test it alone), and its reminder
  const ACCEPT = [
    { which: "accept_step", label: t("cflow.set.acceptStep"), hint: t("cflow.set.acceptStepHint"),
      said: ["cflow.set.acceptOn", "cflow.set.acceptOff"] },
    { which: "notify_unaccepted", label: t("cflow.set.notifyUnaccepted"), hint: t("cflow.set.notifyUnacceptedHint") },
  ];
  const switchRow = (s) => (
    <div key={s.which} className="grid grid-cols-1 sm:grid-cols-[200px_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{s.label}</span>
      {loading ? <SkeletonBlock className="h-[38px] w-40" /> : (
        <SegmentedToggle value={data?.[s.which] ? "on" : "off"}
          onChange={(v) => !notify.isPending && notify.mutate({ which: s.which, on: v === "on", said: s.said })}
          options={[["off", t("cflow.set.off")], ["on", t("cflow.set.on")]]} />
      )}
      <span className="text-xs" style={{ color: "var(--text-3)" }}>{s.hint}</span>
    </div>
  );
  const ready = useQuery({
    queryKey: ["cflow-readiness", day],
    queryFn: () => api.get("/api/container-flow/readiness", { params: { day } }).then((r) => r.data.units),
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  });

  return (
    <div className="flex flex-col gap-4">
      <SendAreasCard t={t} toast={toast} canEdit={isAdmin || !!data?.axo} />
      {isAdmin && <>
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={BellRing} title={t("cflow.set.notifyTitle")} subtitle={t("cflow.set.notifySub")} size="lg" />
        <div className="px-5 pb-5 flex flex-col gap-3">
          {SWITCHES.map(switchRow)}
        </div>
      </div>

      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={CheckCheck} title={t("cflow.set.acceptTitle")} subtitle={t("cflow.set.acceptSub")} size="lg" />
        <div className="px-5 pb-5 flex flex-col gap-3">
          {ACCEPT.map(switchRow)}
        </div>
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
                    <Chip tone={full ? "ok" : u.timed ? "warn" : "bad"}>{t(`cflow.ready.${full ? "full" : u.timed ? "part" : "blind"}`)}</Chip>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      </>}
    </div>
  );
}
