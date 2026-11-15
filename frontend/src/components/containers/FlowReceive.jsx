// «Konteyner berish» → «Qabul» (2026-11-14): a brigadir confirms what reached
// their line from a split request — «Hammasi keldi» in one tap, or the counts
// that actually came with a reason. Page key `container-receive`, admin-only
// until the operator opens it to the brigadirs; a brigadir sees and confirms
// only their own unit, an admin every unit (and may confirm for one); the
// shift- and top-managers watching (`container-watch`) see every unit, no button.
// docs/containers-flow.md.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, PackageCheck, PencilLine } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import CountStepper from "../ui/CountStepper";
import EmptyState from "../ui/EmptyState";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { KEYS, span, hhmm, errText, Chip, CountPills, ReasonFields, reasonOk, refreshFlow, LIVE_LIST } from "./flowUtil";

const REFRESH_MS = 60_000;

function ReceiptChip({ x, t }) {
  if (!x.received) return <Chip tone="warn" icon={Clock}>{t("cflow.rcv.st.wait")}</Chip>;
  const short = KEYS.some((k) => (x.received[k] ?? 0) < (x.counts[k] ?? 0));
  return short
    ? <Chip tone="bad" icon={AlertTriangle}>{t("cflow.rcv.st.short")}</Chip>
    : <Chip tone="ok" icon={Check}>{t("cflow.rcv.st.all")}</Chip>;
}

export default function FlowReceive({ t, day, toast, isAdmin, openId = null, onOpened }) {
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cflow-receipts", day],
    queryFn: () => api.get("/api/container-flow/receipts", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
    ...LIVE_LIST,
  });
  // a card whose request was deleted or cancelled meanwhile says so and leaves the list
  const failed = (e) => {
    const code = e?.response?.data?.detail;
    toast.error(code === "gone" ? t("cflow.rcv.gone") : code === "state" ? t("cflow.rcv.changed") : errText(t, e));
    refreshFlow(qc);
  };
  const [edit, setEdit] = useState(null);
  const list = q.data?.receipts ?? [];
  const waiting = list.filter((x) => !x.received).length;
  const all = useMutation({
    mutationFn: (x) => api.post(`/api/container-flow/requests/${x.request_id}/receive`, { manager_id: x.manager_id }),
    onSuccess: () => { toast.success(t("cflow.rcv.saved")); refreshFlow(qc); },
    onError: failed,
  });
  // an admin reads every unit; a brigadir only theirs — their own cards need no name
  const showUnit = q.data?.unit == null;
  // who may confirm: an admin, or the brigadir on their own unit — the managers
  // watching (`container-watch`) read every unit and press nothing
  const canAct = isAdmin || q.data?.unit != null;
  // opened from the Telegram card's «Boshqa son»: that request's card, its
  // count dialog — once its data is here; a card already confirmed just stays
  useEffect(() => {
    if (openId == null || !q.data) return;
    const x = list.find((r) => String(r.request_id) === String(openId) && (q.data.unit == null || r.manager_id === q.data.unit));
    if (x && !x.received && canAct) setEdit(x);
    onOpened?.();
  }, [openId, q.data, list, canAct, onOpened]);

  if (q.isError) {
    return <EmptyState tone="danger" showUploadLink={false} title={t("cflow.loadFailed")} message={errText(t, q.error)} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={PackageCheck} title={t("cflow.rcv.title")} size="lg"
          subtitle={t(showUnit ? "cflow.rcv.subAdmin" : "cflow.rcv.sub")}
          right={q.isLoading || !list.length ? null
            // the slot stays filled once there is a list: a confirm never moves the cards under it
            : waiting > 0 ? <Chip tone="warn">{t("cflow.rcv.waiting").replace("{n}", waiting)}</Chip>
            : <Chip tone="ok" icon={Check}>{t("cflow.rcv.allDone")}</Chip>} />
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-44 w-full rounded-2xl" />)}
        </div>
      ) : !list.length ? (
        <EmptyState showUploadLink={false} icon={PackageCheck} title={t("cflow.rcv.none")} message={t("cflow.rcv.noneMsg")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((x) => {
            const open = !x.received;
            const busy = all.isPending && all.variables?.request_id === x.request_id && all.variables?.manager_id === x.manager_id;
            return (
              <article key={`${x.request_id}:${x.manager_id}`} className="rounded-2xl flex flex-col"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${open ? "color-mix(in srgb, #eab308 45%, var(--border))" : "var(--border)"}`,
                }}>
                <div className="p-3.5 flex flex-col gap-2.5 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{span(x.hour)}</div>
                      {showUnit && (
                        <div className="text-[13px] mt-0.5 truncate" style={{ color: "var(--text-2)" }}>{tl(x.unit) || "—"}</div>
                      )}
                    </div>
                    <ReceiptChip x={x} t={t} />
                  </div>
                  <CountPills counts={x.received ?? x.counts} of={x.received ? x.counts : undefined} t={t} />
                  <div className="text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--text-3)" }}>
                    <span>{t("cflow.rcv.from").replace("{x}", tl(x.from) || "—").replace("{at}", hhmm(x.assigned_at))}</span>
                    {x.received && (
                      <span>{t("cflow.rcv.by").replace("{x}", tl(x.received_by) || "—").replace("{at}", hhmm(x.received_at))}</span>
                    )}
                    {!x.received && x.reminded_at && (
                      <span style={{ color: "var(--status-warn)" }}>{t("cflow.rcv.reminded").replace("{at}", hhmm(x.reminded_at))}</span>
                    )}
                  </div>
                  {x.received_reason && (
                    <p className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                      {t(`cflow.reason.${x.received_reason}`)}{x.received_comment ? ` — ${x.received_comment}` : ""}
                    </p>
                  )}
                </div>
                {open && canAct && (
                  <div className="px-3.5 pb-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                    <Button size="lg" variant="secondary" icon={<PencilLine size={15} />} onClick={() => setEdit(x)}>
                      {t("cflow.rcv.other")}
                    </Button>
                    <Button size="lg" variant="success" icon={<Check size={15} />} loading={busy} onClick={() => all.mutate(x)}>
                      {t("cflow.rcv.all")}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {edit && (
        <ReceiveModal t={t} x={edit} onClose={() => setEdit(null)}
          onDone={() => { setEdit(null); toast.success(t("cflow.rcv.saved")); refreshFlow(qc); }}
          onFail={(e) => { setEdit(null); failed(e); }} />
      )}
    </div>
  );
}

// What actually came: a count per type (never more than was sent); fewer needs a reason.
function ReceiveModal({ t, x, onClose, onDone, onFail }) {
  const types = KEYS.filter((k) => x.counts[k] != null);
  const [counts, setCounts] = useState(() => ({ ...x.counts }));
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const short = types.some((k) => (counts[k] ?? 0) < x.counts[k]);
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${x.request_id}/receive`, {
      manager_id: x.manager_id,
      counts: Object.fromEntries(types.map((k) => [k, counts[k] ?? 0])),
      ...(short ? { reason, comment } : {}),
    }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.rcv.other")} subtitle={span(x.hour)}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending} disabled={short && !reasonOk(reason, comment)}
            onClick={() => m.mutate()}>
            {t("cflow.rcv.save")}
          </Button>
        </>
      )}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {types.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)} hint={t("cflow.rcv.sent").replace("{n}", x.counts[k])}>
            <CountStepper min={0} max={x.counts[k]} value={counts[k] ?? null} placeholder="0"
              onChange={(n) => setCounts((c) => ({ ...c, [k]: n ?? 0 }))} />
          </FormField>
        ))}
      </div>
      {short && <ReasonFields {...{ reason, setReason, comment, setComment, t }} />}
    </Modal>
  );
}
