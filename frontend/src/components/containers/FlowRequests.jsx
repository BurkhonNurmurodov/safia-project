// «Konteyner berish» → «So'rovlar» (2026-11-14, the operator): AXO does not
// pick brigadirs — a request names the counts, the hour and ONE logistics
// person («Nuriddin aka»); that person splits it across brigadirs, which closes
// it. docs/containers-flow.md.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Check, ClipboardList, Plus, Split, Trash2 } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import CountStepper from "../ui/CountStepper";
import ActionMenu from "../ui/ActionMenu";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { tashkentNow } from "../production/HourlyContainers";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import {
  KEYS, span, hhmm, sum, fmt, errText, Chip, ReasonFields, reasonOk, fieldCls, fieldStyle,
} from "./flowUtil";

const REFRESH_MS = 60_000;

function StateChip({ r, t }) {
  if (r.status === "requested" && r.overdue) return <Chip tone="bad">{t("cflow.st.overdue")}</Chip>;
  const tone = { requested: "warn", assigned: "ok", cancelled: "idle" }[r.status] ?? "idle";
  return <Chip tone={tone}>{t(`cflow.req.st.${r.status}`)}</Chip>;
}

export function RequestsTab({ t, day, roles, toast, onNew }) {
  const { tl } = useTranslit();
  const q = useQuery({
    queryKey: ["cflow-requests", day],
    queryFn: () => api.get("/api/container-flow/requests", { params: { day } }).then((r) => r.data),
    refetchInterval: REFRESH_MS,
  });
  const [assign, setAssign] = useState(null);
  const [cancel, setCancel] = useState(null);
  const list = q.data?.requests ?? [];
  const me = q.data?.me;
  const done = (msg) => { toast.success(msg); q.refetch(); };
  const fail = (e) => toast.error(errText(t, e));
  const mayAssign = (r) => r.status === "requested" && roles.logistics && (roles.admin || r.logistics_key === me);
  const unitsLine = (r) => r.parts.map((p) => `${tl(p.unit) || "—"}: ${KEYS.filter((k) => p.counts[k])
    .map((k) => `${p.counts[k]} ${t(`cflow.ct.${k}`).toLowerCase()}`).join(", ")}`).join(" · ");

  return (
    <>
      <TableCard icon={ClipboardList} title={t("cflow.req.title")}
        subtitle={t(roles.axo ? "cflow.req.subAxo" : "cflow.req.subLog")} headSize="lg"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{list.length}</span>}>
        <thead>
          <tr>
            <Th label={t("cflow.hour")} />
            <Th label={t("cflow.req.to")} />
            {KEYS.map((k) => <Th key={k} label={t(`cflow.ct.${k}`)} hint={t(`production.cont.${k}`)} align="right" />)}
            <Th label={t("cflow.status")} align="center" />
            <Th label={t("cflow.req.units")} />
            <Th label={t("cflow.due")} align="center" />
            <Th label="" cls="w-px" />
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? Array.from({ length: 4 }).map((_, i) => (
            <tr key={i}><td colSpan={KEYS.length + 6} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : !list.length ? (
            <tr>
              <td colSpan={KEYS.length + 6} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                <span className="inline-flex flex-col items-center gap-3">
                  {t(roles.axo ? "cflow.req.noneAxo" : "cflow.req.noneLog")}
                  {roles.axo && <Button icon={<Plus size={14} />} onClick={onNew}>{t("cflow.req.new")}</Button>}
                </span>
              </td>
            </tr>
          ) : list.map((r) => {
            const given = {};
            for (const p of r.parts) for (const [k, n] of Object.entries(p.counts)) given[k] = (given[k] ?? 0) + n;
            const line = unitsLine(r);
            return (
              <tr key={r.id} className="text-sm">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{span(r.hour)}</td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }} title={r.note || undefined}>
                  {tl(r.logistics_name) || "—"}
                </td>
                {KEYS.map((k) => {
                  const ask = r.lines[k];
                  if (ask == null) return <td key={k} className="px-3 py-2 text-right" style={{ color: "var(--text-4)" }}>—</td>;
                  const short = r.status === "assigned" && (given[k] ?? 0) < ask;
                  return (
                    <td key={k} className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}
                      title={short ? t("cflow.req.gaveOf").replace("{n}", given[k] ?? 0).replace("{of}", ask) : undefined}>
                      {short ? <>{fmt(given[k] ?? 0)}<span style={{ color: "var(--status-bad)" }}> / {fmt(ask)}</span></> : fmt(ask)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1">
                    <StateChip r={r} t={t} />
                    {r.late && <Chip tone="bad" title={t("cflow.late")}>{t("cflow.req.lateShort")}</Chip>}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[320px] truncate" style={{ color: "var(--text-2)" }}
                  title={line || r.cancel_note || undefined}>
                  {r.status === "cancelled" ? <span style={{ color: "var(--text-3)" }}>{r.cancel_note}</span> : line || <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: r.overdue ? "var(--status-bad)" : "var(--text-3)" }}>
                  {hhmm(r.due_at)}
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center justify-end gap-1 min-w-[140px]">
                    {mayAssign(r) && (
                      <Button size="sm" tint icon={<Split size={13} />} onClick={() => setAssign(r)}>{t("cflow.req.assign")}</Button>
                    )}
                    <ActionMenu label={`${t("cflow.actions")}: ${span(r.hour)}`} items={[
                      roles.axo && r.status === "requested" && {
                        key: "cancel", label: t("cflow.req.cancel"), icon: Ban, tone: "danger", onSelect: () => setCancel(r),
                      },
                    ]} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      {assign && (
        <AssignModal t={t} r={assign} onClose={() => setAssign(null)}
          onDone={() => { setAssign(null); done(t("cflow.req.assigned")); }} onFail={fail} />
      )}
      {cancel && (
        <CancelModal t={t} r={cancel} onClose={() => setCancel(null)}
          onDone={() => { setCancel(null); done(t("cflow.req.cancelled")); }} onFail={fail} />
      )}
    </>
  );
}

// AXO: counts, the hour, and the logistics person it goes to.
export function NewRequestModal({ t, day, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const people = useQuery({
    queryKey: ["cflow-logistics"],
    queryFn: () => api.get("/api/container-flow/logistics").then((r) => r.data.people),
  });
  const list = people.data ?? [];
  const [who, setWho] = useState(null);
  const to = who ?? (list.length === 1 ? list[0].key : null);
  const [hour, setHour] = useState(() => Math.min(47, Math.floor(tashkentNow().min / 60) + 1));
  const [counts, setCounts] = useState({});
  const [note, setNote] = useState("");
  const any = KEYS.some((k) => counts[k] > 0);
  const m = useMutation({
    mutationFn: () => api.post("/api/container-flow/requests", {
      day, hour, logistics_key: to, note,
      counts: Object.fromEntries(KEYS.filter((k) => counts[k] > 0).map((k) => [k, counts[k]])),
    }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.req.new")} subtitle={t("cflow.req.newSub")} maxWidth="max-w-xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={m.isPending} disabled={!to || !any} onClick={() => m.mutate()}>{t("cflow.req.send")}</Button>
        </>
      )}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label={t("cflow.req.to")} required
          hint={!people.isLoading && !list.length ? t("cflow.req.noLogistics") : undefined}>
          <StyledSelect value={to} onChange={setWho} placeholder={t("cflow.pick")} disabled={!list.length}
            options={list.map((p) => ({ value: p.key, label: tl(p.name) }))} />
        </FormField>
        <FormField label={t("cflow.req.forHour")} required hint={t("cflow.req.forHourHint")}>
          <StyledSelect value={hour} onChange={setHour}
            options={Array.from({ length: 32 }, (_, h) => ({ value: h, label: h > 23 ? `${span(h)} (+1)` : span(h) }))} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <FormField key={k} label={t(`production.cont.${k}`)}>
            <CountStepper min={0} value={counts[k] ?? null} placeholder="0" onChange={(n) => setCounts((c) => ({ ...c, [k]: n }))} />
          </FormField>
        ))}
      </div>
      <FormField label={t("cflow.comment")}>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}

// Logistics: the request across brigadirs — a row per brigadir, a count per
// requested container; what is left shows under the rows.
function AssignModal({ t, r, onClose, onDone, onFail }) {
  const { tl } = useTranslit();
  const types = KEYS.filter((k) => r.lines[k] != null);
  const units = useQuery({
    queryKey: ["cflow-all-units"],
    queryFn: () => api.get("/api/container-flow/units").then((x) => x.data.units),
    staleTime: 10 * 60_000,
  });
  const [rows, setRows] = useState([{ id: 1, unit: null, counts: {} }]);
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const given = useMemo(() => {
    const g = {};
    for (const row of rows) for (const k of types) g[k] = (g[k] ?? 0) + (row.counts[k] ?? 0);
    return g;
  }, [rows, types]);
  const over = types.some((k) => given[k] > r.lines[k]);
  // «Why fewer?» only once something is split — not on an empty form.
  const short = types.some((k) => given[k] < r.lines[k]) && types.some((k) => given[k] > 0);
  const filled = rows.filter((row) => row.unit != null && sum(row.counts) > 0);
  const bad = rows.some((row) => (row.unit == null) !== (sum(row.counts) === 0));
  const taken = new Set(rows.map((x) => x.unit).filter((x) => x != null));
  const opts = (mine) => (units.data ?? []).filter((u) => u.id === mine || !taken.has(u.id))
    .map((u) => ({ value: u.id, label: `${tl(u.name)}${u.shift ? ` · S${u.shift}` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label));   // by the name as shown, not the stored script
  const set = (id, patch) => setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/assign`, {
      parts: filled.map((row) => ({ manager_id: row.unit, counts: row.counts })),
      ...(short ? { reason, comment } : {}),
    }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.req.assign")}
      subtitle={`${span(r.hour)} · ${types.map((k) => `${t(`cflow.ct.${k}`)} ${r.lines[k]}`).join(" · ")}`}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<Check size={14} />} loading={m.isPending}
            disabled={!filled.length || bad || over || (short && !reasonOk(reason, comment))} onClick={() => m.mutate()}>
            {t("cflow.req.assignSend")}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={row.id} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <FormField label={`${t("containers.brigadir")} ${i + 1}`} required>
                  <StyledSelect searchable value={row.unit} onChange={(v) => set(row.id, { unit: v })}
                    placeholder={t("cflow.pick")} options={opts(row.unit)} />
                </FormField>
              </div>
              {rows.length > 1 && (
                <Button size="lg" variant="ghost" aria-label={t("cflow.req.removeRow")} title={t("cflow.req.removeRow")}
                  icon={<Trash2 size={15} />} onClick={() => setRows((rs) => rs.filter((x) => x.id !== row.id))} />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {types.map((k) => (
                <FormField key={k} label={t(`cflow.ct.${k}`)}>
                  <CountStepper min={0} max={r.lines[k]} value={row.counts[k] ?? null} placeholder="0"
                    onChange={(n) => set(row.id, { counts: { ...row.counts, [k]: n ?? 0 } })} />
                </FormField>
              ))}
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" icon={<Plus size={14} />}
            onClick={() => setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, unit: null, counts: {} }])}>
            {t("cflow.req.addRow")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          {types.map((k) => {
            const left = r.lines[k] - (given[k] ?? 0);
            return (
              <span key={k} style={{ color: left < 0 ? "var(--status-bad)" : left > 0 ? "var(--status-warn)" : "var(--status-ok)" }}>
                {t(`cflow.ct.${k}`)}: {t("cflow.req.left").replace("{n}", left)}
              </span>
            );
          })}
        </div>
        {over && <p className="text-xs" style={{ color: "var(--status-bad)" }}>{t("cflow.err.over_req")}</p>}
        {short && !over && <ReasonFields {...{ reason, setReason, comment, setComment, t }} />}
      </div>
    </Modal>
  );
}

function CancelModal({ t, r, onClose, onDone, onFail }) {
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/api/container-flow/requests/${r.id}/cancel`, { note: note.trim() }),
    onSuccess: onDone, onError: onFail,
  });
  return (
    <Modal onClose={onClose} title={t("cflow.req.cancel")} subtitle={span(r.hour)}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={m.isPending} disabled={!note.trim()} onClick={() => m.mutate()}>{t("cflow.req.cancel")}</Button>
        </>
      )}>
      <FormField label={t("cflow.req.cancelWhy")} required>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} style={fieldStyle} />
      </FormField>
    </Modal>
  );
}
