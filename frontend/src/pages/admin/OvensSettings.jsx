import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CookingPot, Plus, Pencil, Power, Trash2 } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import FormField from "../../components/ui/FormField";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ActionMenu from "../../components/ui/ActionMenu";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useOT, fill, stamp, fmtN, errOf, errCode } from "../../components/ovens/ovensUtil";
import CollectorDevices from "../../components/ovens/CollectorDevices";

// «Pechlar» on the admin panel — which ovens the collector reads, at which
// factory-LAN address. Admin-only (the list is where the collector is sent,
// so the server takes private LAN addresses only). An oven nothing was ever
// collected from can be removed; one with history is switched off instead.

const QK = ["ovens-register"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const EMPTY = { name: "", ip: "", port: "8080", note: "" };

export default function OvensSettings() {
  const T = useOT();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });
  const { data, isLoading } = useQuery({
    queryKey: QK, queryFn: () => api.get("/api/admin/ovens").then((r) => r.data), refetchInterval: 60_000,
  });

  const [form, setForm] = useState(null);           // {id?, name, ip, port, note}
  const [formErr, setFormErr] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeErr, setRemoveErr] = useState(null);
  const done = (msg) => (r) => {
    qc.setQueryData(QK, r.data);
    qc.invalidateQueries({ queryKey: ["ovens-board"] });
    toast(msg, "success");
  };

  const save = useMutation({
    mutationFn: (f) => {
      const body = { name: f.name.trim(), ip: f.ip.trim(), port: Number(f.port) || 8080, note: f.note };
      return f.id ? api.put(`/api/admin/ovens/${f.id}`, body) : api.post("/api/admin/ovens", body);
    },
    onSuccess: (r, f) => { done(f.id ? T.saved : T.added)(r); setForm(null); },
    onError: (e) => setFormErr({ code: errCode(e), text: errOf(T, e) }),
  });
  const toggle = useMutation({
    mutationFn: (o) => api.put(`/api/admin/ovens/${o.id}`, { active: !o.active }),
    onSuccess: done(T.saved),
    onError: (e) => toast(errOf(T, e), "error"),
  });
  const remove = useMutation({
    mutationFn: (o) => api.delete(`/api/admin/ovens/${o.id}`),
    onSuccess: (r) => { done(T.removed)(r); setRemoving(null); },
    onError: (e) => setRemoveErr(errOf(T, e)),
  });

  if (isLoading || !data) return <SkeletonBlock className="h-64 rounded-2xl" />;
  const ovens = data.ovens || [];
  const p = data.poll || {};

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
        {fill(T.pollNote, { s: p.status_s, l: Math.round((p.logs_s || 0) / 60), h: Math.round((p.settings_s || 0) / 3600) })}
      </p>
      <CollectorDevices T={T} />
      <TableCard icon={CookingPot} title={T.regTitle}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(ovens.length)}</span>}
        toolbar={<Button size="lg" variant="primary" onClick={() => { setFormErr(null); setForm({ ...EMPTY }); }}><Plus size={14} /> {T.add}</Button>}
        fixed minWidth={820}
        mobile={ovens.length ? (
          <ul>
            {ovens.map((o) => (
              <li key={o.id} className="px-4 py-3 text-xs flex items-start gap-2" style={{ borderTop: "1px solid var(--border)", opacity: o.active ? 1 : 0.6 }}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" style={{ color: "var(--text-1)" }}>{o.name}</div>
                  <div className="tabular-nums" style={{ color: "var(--text-3)" }}>{o.ip}:{o.port} · {o.active ? T.actOn : T.actOff}</div>
                  <div style={{ color: o.error ? "var(--status-warn)" : "var(--text-3)" }}>
                    {T.cLast}: {o.status_at ? stamp(o.status_at) : T.never}{o.error ? ` · ${o.error}` : ""}
                  </div>
                </div>
                <RowMenu o={o} T={T} onEdit={() => { setFormErr(null); setForm({ ...o, port: String(o.port), note: o.note || "" }); }}
                  onToggle={() => toggle.mutate(o)} onRemove={() => { setRemoveErr(null); setRemoving(o); }} />
              </li>
            ))}
          </ul>
        ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noOvens}</div>}>
        <thead>
          <tr>
            <Th label={T.name} /><Th label={T.ip} /><Th label={T.active} /><Th label={T.cLast} />
            <Th label={T.cFiles} align="right" /><Th label={T.note} /><Th label="" />
          </tr>
        </thead>
        <tbody>
          {ovens.length ? ovens.map((o) => (
            <tr key={o.id} style={{ opacity: o.active ? 1 : 0.6 }}>
              <td className="px-3 py-2 max-w-0 truncate font-semibold" title={o.name}>{o.name}</td>
              <td className="px-3 py-2 max-w-0 truncate tabular-nums" style={{ color: "var(--text-2)" }} title={`${o.ip}:${o.port}`}>{o.ip}:{o.port}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{o.active ? T.actOn : T.actOff}</td>
              <td className="px-3 py-2 max-w-0 truncate tabular-nums" title={o.error || ""}
                style={{ color: o.error ? "var(--status-warn)" : "var(--text-2)" }}>
                {o.status_at ? stamp(o.status_at) : T.never}{o.error ? ` · ${o.error}` : ""}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(o.log_files)}</td>
              <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-3)" }} title={o.note || ""}>{o.note || ""}</td>
              <td className="px-2 py-1 text-right">
                <RowMenu o={o} T={T} onEdit={() => { setFormErr(null); setForm({ ...o, port: String(o.port), note: o.note || "" }); }}
                  onToggle={() => toggle.mutate(o)} onRemove={() => { setRemoveErr(null); setRemoving(o); }} />
              </td>
            </tr>
          )) : (
            <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{T.noOvens}</td></tr>
          )}
        </tbody>
      </TableCard>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? T.edit : T.add} icon={CookingPot}
        footer={<>
          <Button variant="secondary" onClick={() => setForm(null)}>{T.cancel}</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form?.name.trim() || !form?.ip.trim()}
            onClick={() => { setFormErr(null); save.mutate(form); }}>{T.save}</Button>
        </>}>
        {form && (
          <>
            <FormField label={T.name} required>
              <input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls} style={inputStyle} />
            </FormField>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <FormField label={T.ip} required hint={T.ipHint} error={formErr && ["bad_ip", "duplicate"].includes(formErr.code) ? formErr.text : undefined}>
                <input value={form.ip} inputMode="decimal" placeholder="192.168.0.100" spellCheck={false}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })} className={`${inputCls} font-mono`} style={inputStyle} />
              </FormField>
              <FormField label={T.port}>
                <input value={form.port} inputMode="numeric" onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, "") })}
                  className={`${inputCls} font-mono`} style={inputStyle} />
              </FormField>
            </div>
            <FormField label={T.note}>
              <input value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })}
                className={inputCls} style={inputStyle} />
            </FormField>
            {formErr && !["bad_ip", "duplicate"].includes(formErr.code) && <p className="text-xs" style={{ color: "var(--status-bad)" }}>{formErr.text}</p>}
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} tone="danger" title={T.removeTitle}
        message={fill(T.removeMsg, { n: removing?.name || "" })} confirmLabel={T.remove}
        loading={remove.isPending} error={removeErr}
        onCancel={() => { setRemoving(null); setRemoveErr(null); }}
        onConfirm={() => { setRemoveErr(null); remove.mutate(removing); }} />
      {toastNode}
    </div>
  );
}

function RowMenu({ o, T, onEdit, onToggle, onRemove }) {
  const hasHistory = o.log_files > 0 || !!o.status_at;
  return (
    <ActionMenu label={o.name} items={[
      { key: "edit", label: T.edit, icon: Pencil, onSelect: onEdit },
      { key: "toggle", label: o.active ? T.switchOff : T.switchOn, icon: Power, onSelect: onToggle },
      { key: "remove", label: T.remove, icon: Trash2, tone: "danger", onSelect: onRemove,
        disabled: hasHistory, title: hasHistory ? T.cantRemove : undefined },
    ]} />
  );
}
