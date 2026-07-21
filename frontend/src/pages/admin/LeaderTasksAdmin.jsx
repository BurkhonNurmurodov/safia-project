import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, ListChecks, Radio } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

// Status colors: enabled = traffic-light green, disabled = "not active" grey
// (never red — red is reserved for problems platform-wide).
const C_ON = "#22c55e", C_OFF = "#94a3b8", C_WARN = "#eab308";

const LANGS = ["uz", "uz_cyrl", "ru", "en"];
const LANG_LABELS = { uz: "UZ", uz_cyrl: "УЗ", ru: "РУ", en: "EN" };

const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = {
  background: "var(--bg-inner)",
  border: "1px solid var(--border)",
  color: "var(--text-1)",
};

// «Liderlar monitoringi» admin tab: the supervisors × tasks config matrix
// driving the bot's /tasks checklist (enabled / min photos / weight per cell,
// column-wide overwrite) plus the archive-channel id the proof photos are
// relayed into.
export default function LeaderTasksAdmin() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [toast, setToast] = useState(false);
  const [chan, setChan] = useState("");
  const [chanErr, setChanErr] = useState("");
  const [cell, setCell] = useState(null);   // {mid, tid, enabled, min_media, weight}
  const [col, setCol] = useState(null);     // {tid, enabled, min_media, weight, names}

  const { data, isLoading } = useQuery({
    queryKey: ["ltasks-config"],
    queryFn: () => api.get("/admin/leader-tasks/config").then((r) => r.data),
  });
  useEffect(() => { setChan(data?.channel?.chat_id ?? ""); }, [data]);

  const ping = () => {
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ltasks-config"] });

  const cellMut = useMutation({
    mutationFn: (body) => api.put("/admin/leader-tasks/cell", body),
    onSuccess: () => { invalidate(); setCell(null); ping(); },
    onError: (e) => alert(e?.response?.data?.detail || t("admin.ltasks.fail")),
  });
  const colMut = useMutation({
    mutationFn: (body) => api.put("/admin/leader-tasks/column", body),
    onSuccess: () => { invalidate(); setCol(null); ping(); },
    onError: (e) => alert(e?.response?.data?.detail || t("admin.ltasks.fail")),
  });
  const chanMut = useMutation({
    mutationFn: (body) => api.put("/admin/leader-tasks/channel", body),
    onSuccess: () => { setChanErr(""); invalidate(); ping(); },
    onError: (e) => setChanErr(e?.response?.data?.detail || t("admin.ltasks.channelFail")),
  });

  const tasks = data?.tasks ?? [];
  const managers = data?.managers ?? [];
  const settings = data?.settings ?? {};
  const tname = (task) => task.name?.[lang] || task.name?.uz || `T${task.id}`;
  const getCell = (mid, tid) =>
    settings[String(mid)]?.[String(tid)] ?? { enabled: true, min_media: 1, weight: 0 };

  // Per-supervisor sum of ENABLED weights — ≠100 trips the row warning.
  const sums = useMemo(() => {
    const out = {};
    for (const m of managers) {
      out[m.id] = tasks.reduce((acc, task) => {
        const c = getCell(m.id, task.id);
        return acc + (c.enabled ? Number(c.weight) || 0 : 0);
      }, 0);
    }
    return out;
  }, [managers, tasks, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusToggle = (value, onChange) => (
    <SegmentedToggle
      fill
      value={value}
      onChange={onChange}
      options={[[true, t("admin.ltasks.enabled")], [false, t("admin.ltasks.disabled")]]}
    />
  );

  const numField = (label, value, onChange, max) => (
    <FormField label={label} required>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        style={inputStyle}
      />
    </FormField>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Archive channel */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Radio} title={t("admin.ltasks.channel")} />
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.channelHint")}</p>
          <div className="flex items-center gap-2">
            <input
              value={chan}
              onChange={(e) => setChan(e.target.value)}
              placeholder="-100…"
              className={`${inputCls} flex-1`}
              style={inputStyle}
            />
            <Button
              size="lg"
              loading={chanMut.isPending}
              onClick={() => chanMut.mutate({ chat_id: chan })}
            >
              {t("admin.ltasks.save")}
            </Button>
          </div>
          {chanErr && <p className="text-xs" style={{ color: "#ef4444" }}>{chanErr}</p>}
        </div>
      </div>

      {/* Supervisors × tasks matrix */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ListChecks} title={t("admin.ltasks.matrix")} />
        <div className="px-4 pt-3">
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.desc")}</p>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="p-4 overflow-x-auto">
            {/* Fixed layout: the name/warning columns take their set widths and
                every task column splits the remaining width EQUALLY, so the
                matrix always fills the card edge-to-edge. */}
            <table className="w-full text-xs" style={{ color: "var(--text-1)", borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed", minWidth: 640 }}>
              <thead>
                <tr>
                  <th className="text-left pr-2 font-semibold sticky left-0 z-10" style={{ color: "var(--text-3)", background: "var(--bg-card)", width: 170 }}>
                    {t("admin.ltasks.supervisor")}
                  </th>
                  {tasks.map((task) => (
                    <th key={task.id}>
                      <button
                        type="button"
                        title={tname(task)}
                        onClick={() => {
                          const first = getCell(managers[0]?.id, task.id);
                          setCol({
                            tid: task.id,
                            enabled: first.enabled,
                            min_media: first.min_media,
                            weight: first.weight,
                            names: { ...task.name },
                          });
                        }}
                        className="w-full py-1.5 rounded-lg font-bold transition-opacity hover:opacity-75"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--brand-text)" }}
                      >
                        T{task.id}
                      </button>
                    </th>
                  ))}
                  <th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id}>
                    <td className="pr-2 whitespace-nowrap sticky left-0 z-10" style={{ background: "var(--bg-card)" }}>
                      <span className="font-medium">{tl(m.name)}</span>
                      {m.shift && (
                        <span className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold" style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>
                          S{m.shift}
                        </span>
                      )}
                    </td>
                    {tasks.map((task) => {
                      const c = getCell(m.id, task.id);
                      return (
                        <td key={task.id}>
                          <button
                            type="button"
                            title={`${tname(task)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · 📸${c.min_media} · ${c.weight}%`}
                            onClick={() => setCell({ mid: m.id, tid: task.id, ...c })}
                            className="w-full h-7 rounded-md transition-opacity hover:opacity-75"
                            style={{ background: c.enabled ? C_ON : C_OFF, opacity: c.enabled ? 1 : 0.45 }}
                          />
                        </td>
                      );
                    })}
                    <td className="text-center">
                      {sums[m.id] !== 100 && (
                        <span title={t("admin.ltasks.weightWarn").replace("{sum}", sums[m.id])}>
                          <AlertTriangle size={15} color={C_WARN} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cell modal */}
      {cell && (
        <Modal
          title={t("admin.ltasks.cellTitle")}
          subtitle={tl(managers.find((m) => m.id === cell.mid)?.name || "")}
          icon={<ListChecks size={14} />}
          onClose={() => setCell(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCell(null)}>{t("admin.broadcast.cancel")}</Button>
              <Button
                loading={cellMut.isPending}
                onClick={() => cellMut.mutate({
                  manager_id: cell.mid,
                  task_id: cell.tid,
                  enabled: cell.enabled,
                  min_media: Number(cell.min_media) || 0,
                  weight: Number(cell.weight) || 0,
                })}
              >
                {t("admin.ltasks.save")}
              </Button>
            </>
          }
        >
          <FormField label={t("admin.ltasks.taskName")}>
            <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {tname(tasks.find((task) => task.id === cell.tid) || {})}
            </p>
          </FormField>
          <FormField label={t("admin.ltasks.status")} required>
            {statusToggle(cell.enabled, (v) => setCell((c) => ({ ...c, enabled: v })))}
          </FormField>
          {numField(t("admin.ltasks.minMedia"), cell.min_media, (v) => setCell((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), cell.weight, (v) => setCell((c) => ({ ...c, weight: v })), 100)}
        </Modal>
      )}

      {/* Column modal — overwrites the task for every supervisor */}
      {col && (
        <Modal
          title={`${t("admin.ltasks.colTitle")} — T${col.tid}`}
          icon={<ListChecks size={14} />}
          onClose={() => setCol(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCol(null)}>{t("admin.broadcast.cancel")}</Button>
              <Button
                loading={colMut.isPending}
                onClick={() => colMut.mutate({
                  task_id: col.tid,
                  enabled: col.enabled,
                  min_media: Number(col.min_media) || 0,
                  weight: Number(col.weight) || 0,
                  names: col.names,
                })}
              >
                {t("admin.ltasks.save")}
              </Button>
            </>
          }
        >
          <p className="text-xs font-medium" style={{ color: C_WARN }}>{t("admin.ltasks.colHint")}</p>
          {LANGS.map((l) => (
            <FormField key={l} label={`${t("admin.ltasks.taskName")} (${LANG_LABELS[l]})`}>
              <input
                value={col.names?.[l] || ""}
                onChange={(e) => setCol((c) => ({ ...c, names: { ...c.names, [l]: e.target.value } }))}
                className={inputCls}
                style={inputStyle}
              />
            </FormField>
          ))}
          <FormField label={t("admin.ltasks.status")} required>
            {statusToggle(col.enabled, (v) => setCol((c) => ({ ...c, enabled: v })))}
          </FormField>
          {numField(t("admin.ltasks.minMedia"), col.min_media, (v) => setCol((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), col.weight, (v) => setCol((c) => ({ ...c, weight: v })), 100)}
        </Modal>
      )}

      {toast && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 340,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("admin.ltasks.saved")}</span>
        </div>
      )}
    </div>
  );
}
