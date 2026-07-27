import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Calendar, CheckCircle, ChevronDown, ChevronRight, History,
  ListChecks, Radio, RotateCcw, X,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const C_ON = "#22c55e", C_OFF = "#94a3b8", C_WARN = "#eab308", C_BAD = "#ef4444";
const LANGS = ["uz", "uz_cyrl", "ru", "en"];
const LANG_LABELS = { uz: "UZ", uz_cyrl: "УЗ", ru: "РУ", en: "EN" };
const OV_RING = "inset 0 0 0 2px rgba(255,255,255,0.75)";
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

// Apply now vs stage to the target's next shift day.
function WhenBar({ when, setWhen, nextDate, t }) {
  return (
    <div className="space-y-1.5 pt-1">
      <SegmentedToggle fill value={when} onChange={setWhen}
        options={[["now", t("admin.ltasks.applyNow")], ["next_day", t("admin.ltasks.applyNext")]]} />
      <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        {when === "next_day" ? t("admin.ltasks.timingNext").replace("{date}", nextDate || "") : t("admin.ltasks.timingNow")}
      </p>
    </div>
  );
}

// «Liderlar monitoringi» admin tab: the supervisors × tasks config matrix
// driving the bot's /tasks checklist. Direct inline editing (click a cell);
// each supervisor row expands into its leaders (sparse overrides, ringed).
// Edits apply now or stage to the next day; a column header renames the task
// globally or pushes values to all supervisors; History/Revert + a scheduled-
// changes panel sit above the grid.
export default function LeaderTasksAdmin() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [toast, setToast] = useState(false);
  const [chan, setChan] = useState("");
  const [chanErr, setChanErr] = useState("");
  const [cell, setCell] = useState(null);
  const [lcell, setLcell] = useState(null);
  const [col, setCol] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExc, setShowExc] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ltasks-config"],
    queryFn: () => api.get("/admin/leader-tasks/config").then((r) => r.data),
  });
  const { data: audit } = useQuery({
    queryKey: ["ltasks-audit"],
    queryFn: () => api.get("/admin/leader-tasks/audit").then((r) => r.data.audit),
    enabled: showHistory,
  });
  useEffect(() => { setChan(data?.channel?.chat_id ?? ""); }, [data]);

  const ping = () => { setToast(true); setTimeout(() => setToast(false), 3000); };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ltasks-config"] });
    qc.invalidateQueries({ queryKey: ["ltasks-audit"] });
  };
  const onErr = (e) => {
    const d = e?.response?.data?.detail;
    alert(Array.isArray(d) ? d.map((x) => x?.msg || String(x)).join("; ") : (typeof d === "string" && d) || t("admin.ltasks.fail"));
  };

  const cellMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/cell", b), onSuccess: () => { invalidate(); setCell(null); ping(); }, onError: onErr });
  const leaderMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/leader-cell", b), onSuccess: () => { invalidate(); setLcell(null); setConfirm(null); ping(); }, onError: onErr });
  const taskMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/task", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  const applyMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/apply-all", b), onSuccess: () => { invalidate(); setCol(null); setConfirm(null); ping(); }, onError: onErr });
  const cancelMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/pending/cancel", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const revertMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/revert", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const chanMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/channel", b), onSuccess: () => { setChanErr(""); invalidate(); ping(); }, onError: (e) => setChanErr(e?.response?.data?.detail || t("admin.ltasks.channelFail")) });

  const tasks = data?.tasks ?? [];
  const managers = data?.managers ?? [];
  const settings = data?.settings ?? {};
  const leaders = data?.leaders ?? [];
  const leaderSettings = data?.leader_settings ?? {};
  const pending = data?.pending ?? [];
  const nextDates = data?.next_dates ?? {};
  const nextForShift = (shift) => nextDates[String(shift === 2 ? 2 : 1)] || "";

  const leadersByMgr = useMemo(() => {
    const out = {};
    for (const p of leaders) (out[p.manager_id] ||= []).push(p);
    return out;
  }, [leaders]);

  const tname = (task) => task.name?.[lang] || task.name?.uz || `T${task.id}`;
  const getCell = (mid, tid) => settings[String(mid)]?.[String(tid)] ?? { enabled: true, min_media: 1, weight: 0, names: {} };
  const supTaskName = (mid, task) => getCell(mid, task.id).names?.[lang] || tname(task);
  const getOv = (lid, tid) => leaderSettings[String(lid)]?.[String(tid)] ?? null;
  const leadEff = (lid, mid, tid) => {
    const base = getCell(mid, tid);
    const ov = getOv(lid, tid);
    return { enabled: ov?.enabled ?? base.enabled, min_media: ov?.min_media ?? base.min_media, weight: ov?.weight ?? base.weight };
  };
  const leadTaskName = (lid, mid, task) => getOv(lid, task.id)?.names?.[lang] || supTaskName(mid, task);

  const sums = useMemo(() => {
    const out = {};
    for (const m of managers) out[m.id] = tasks.reduce((a, task) => { const c = getCell(m.id, task.id); return a + (c.enabled ? Number(c.weight) || 0 : 0); }, 0);
    return out;
  }, [managers, tasks, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaderSums = useMemo(() => {
    const out = {};
    for (const p of leaders) out[p.id] = tasks.reduce((a, task) => { const c = leadEff(p.id, p.manager_id, task.id); return a + (c.enabled ? Number(c.weight) || 0 : 0); }, 0);
    return out;
  }, [leaders, tasks, settings, leaderSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const excRows = useMemo(() => {
    const out = [];
    for (const p of leaders) {
      const ov = leaderSettings[String(p.id)];
      if (!ov) continue;
      for (const tid of Object.keys(ov)) out.push({ p, tid: Number(tid), ov: ov[tid] });
    }
    return out;
  }, [leaders, leaderSettings]);

  const toggleOpen = (mid) => setOpen((s) => { const n = new Set(s); n.has(mid) ? n.delete(mid) : n.add(mid); return n; });

  const openLeaderCell = (p, mid, task) => {
    const ov = getOv(p.id, task.id);
    const eff = leadEff(p.id, mid, task.id);
    setLcell({
      lid: p.id, mid, tid: task.id, hasOv: !!ov, when: "now",
      enabled: eff.enabled, min_media: eff.min_media, weight: eff.weight,
      names: Object.fromEntries(LANGS.map((l) => [l, ov?.names?.[l] || ""])),
    });
  };
  const openLeaderByIds = (p, tid) => { const task = tasks.find((x) => x.id === tid); if (task) { setShowExc(false); openLeaderCell(p, p.manager_id, task); } };

  const saveLeaderCell = () => {
    const base = getCell(lcell.mid, lcell.tid);
    const mm = Number(lcell.min_media) || 0;
    const w = Number(lcell.weight) || 0;
    leaderMut.mutate({
      leader_id: lcell.lid, task_id: lcell.tid,
      enabled: lcell.enabled === base.enabled ? null : lcell.enabled,
      min_media: mm === Number(base.min_media) ? null : mm,
      weight: w === Number(base.weight) ? null : w,
      names: lcell.names, when: lcell.when,
    });
  };

  const askReset = () => setConfirm({
    title: t("admin.ltasks.reset"), message: t("admin.ltasks.removeOverrideMsg"), tone: "danger",
    confirmLabel: t("admin.ltasks.reset"),
    onConfirm: () => leaderMut.mutate({ leader_id: lcell.lid, task_id: lcell.tid, reset: true, when: "now" }),
  });
  const askApplyAll = (payload) => setConfirm({
    title: t("admin.ltasks.applyAll"), message: t("admin.ltasks.applyAllHint").replace("{n}", managers.length),
    tone: "danger", confirmLabel: t("admin.ltasks.applyAll"), onConfirm: () => applyMut.mutate(payload),
  });
  const askCancel = (pc) => setConfirm({
    title: t("admin.ltasks.cancelChange"), message: t("admin.ltasks.cancelChangeMsg"), tone: "danger",
    confirmLabel: t("admin.ltasks.cancelChange"), onConfirm: () => cancelMut.mutate({ pending_id: pc.id }),
  });
  const askRevert = (a) => setConfirm({
    title: t("admin.ltasks.revert"), message: t("admin.ltasks.revertMsg"), tone: "warning",
    confirmLabel: t("admin.ltasks.revert"), onConfirm: () => revertMut.mutate({ audit_id: a.id }),
  });

  const statusToggle = (value, onChange) => (
    <SegmentedToggle fill value={value} onChange={onChange}
      options={[[true, t("admin.ltasks.enabled")], [false, t("admin.ltasks.disabled")]]} />
  );
  const numField = (label, value, onChange, max) => (
    <FormField label={label} required>
      <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle} />
    </FormField>
  );
  const nameFields = (names, setName, placeholderFor) =>
    LANGS.map((l) => (
      <FormField key={l} label={`${t("admin.ltasks.taskName")} (${LANG_LABELS[l]})`}>
        <input value={names?.[l] || ""} placeholder={placeholderFor(l)} onChange={(e) => setName(l, e.target.value)} className={inputCls} style={inputStyle} />
      </FormField>
    ));
  const warnBadge = (sum) => (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums" style={{ color: sum === 0 ? C_BAD : C_WARN }}
      title={sum === 0 ? t("admin.ltasks.sumZero") : t("admin.ltasks.weightWarn").replace("{sum}", sum)}>
      <AlertTriangle size={15} color={sum === 0 ? C_BAD : C_WARN} />{sum}%
    </span>
  );
  const descPending = (pc) => {
    if (pc.kind === "global_task") { const k = tasks.find((x) => x.id === pc.task_id); return `${t("admin.ltasks.rename")}: ${k ? tname(k) : "T" + pc.task_id}`; }
    if (pc.kind === "leader") { const p = leaders.find((x) => x.id === pc.leader_id); const k = tasks.find((x) => x.id === pc.task_id); return `${p ? tl(p.name) : "?"} · ${k ? tname(k) : "T" + pc.task_id}`; }
    const m = managers.find((x) => x.id === pc.manager_id); return m ? tl(m.name) : `#${pc.manager_id}`;
  };
  const excChip = (label) => <span key={label} className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>{label}</span>;

  const cellTask = cell && (tasks.find((task) => task.id === cell.tid) || {});
  const lcellTask = lcell && (tasks.find((task) => task.id === lcell.tid) || {});
  const cellNext = cell && nextForShift(managers.find((m) => m.id === cell.mid)?.shift);
  const lcellNext = lcell && nextForShift(managers.find((m) => m.id === lcell.mid)?.shift);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Archive channel */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Radio} title={t("admin.ltasks.channel")} />
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.channelHint")}</p>
          <div className="flex items-center gap-2">
            <input value={chan} onChange={(e) => setChan(e.target.value)} placeholder="-100…" className={`${inputCls} flex-1`} style={inputStyle} />
            <Button size="lg" loading={chanMut.isPending} onClick={() => chanMut.mutate({ chat_id: chan })}>{t("admin.ltasks.save")}</Button>
          </div>
          {chanErr && <p className="text-xs" style={{ color: C_BAD }}>{chanErr}</p>}
        </div>
      </div>

      {/* Scheduled changes */}
      {pending.length > 0 && (
        <div className="rounded-2xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} style={{ color: C_WARN }} />
            <span className="text-xs font-medium uppercase" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.scheduled")}</span>
            <span className="text-[11px] rounded px-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{pending.length}</span>
          </div>
          <div className="space-y-1">
            {pending.map((pc) => (
              <div key={pc.id} className="flex items-center gap-2 text-sm">
                <span className="truncate">{descPending(pc)}</span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.appliesFrom").replace("{date}", pc.effective_date)}</span>
                <Button variant="ghost" size="sm" className="ml-auto" aria-label={t("admin.ltasks.cancelChange")} icon={<X size={13} />} onClick={() => askCancel(pc)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supervisors × tasks matrix */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ListChecks} title={t("admin.ltasks.matrix")} right={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => setShowExc(true)}>{t("admin.ltasks.tab.exc")}</Button>
            <Button variant="ghost" size="sm" icon={<History size={14} />} onClick={() => setShowHistory(true)}>{t("admin.ltasks.history")}</Button>
          </div>
        } />
        <div className="px-4 pt-3"><p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.desc")}</p></div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ color: "var(--text-1)", borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed", minWidth: 640 }}>
              <thead>
                <tr>
                  <th className="text-left pr-2 font-semibold sticky left-0 z-10" style={{ color: "var(--text-3)", background: "var(--bg-card)", width: 170 }}>{t("admin.ltasks.supervisor")}</th>
                  {tasks.map((task) => (
                    <th key={task.id}>
                      <button type="button" title={tname(task)}
                        onClick={() => { const f = getCell(managers[0]?.id, task.id); setCol({ tid: task.id, enabled: f.enabled, min_media: f.min_media, weight: f.weight, names: { ...task.name }, when: "now" }); }}
                        className="w-full py-1.5 rounded-lg font-bold transition-opacity hover:opacity-75"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--brand-text)" }}>T{task.id}</button>
                    </th>
                  ))}
                  <th style={{ width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const kids = leadersByMgr[m.id] || [];
                  const isOpen = open.has(m.id);
                  const childWarn = kids.some((p) => leaderSums[p.id] !== 100);
                  return (
                    <Fragment key={m.id}>
                      <tr>
                        <td className="pr-2 whitespace-nowrap sticky left-0 z-10" style={{ background: "var(--bg-card)" }}>
                          <span className="inline-flex items-center gap-1 max-w-full">
                            <button type="button" onClick={() => toggleOpen(m.id)} disabled={!kids.length}
                              className="p-0.5 -ml-1 rounded transition-opacity hover:opacity-70 disabled:opacity-30 flex-shrink-0" style={{ color: "var(--text-3)" }}>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <span className="font-medium truncate">{tl(m.name)}</span>
                            {m.shift && <span className="px-1 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>S{m.shift}</span>}
                            {childWarn && !isOpen && <span title={t("admin.ltasks.childWarn")} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C_WARN }} />}
                          </span>
                        </td>
                        {tasks.map((task) => {
                          const c = getCell(m.id, task.id);
                          return (
                            <td key={task.id}>
                              <button type="button"
                                title={`${supTaskName(m.id, task)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · ${t("admin.ltasks.photos")} ${c.min_media} · ${c.weight}%`}
                                onClick={() => setCell({ mid: m.id, tid: task.id, ...c, when: "now" })}
                                className="w-full h-7 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold text-white tabular-nums"
                                style={{ background: c.enabled ? C_ON : C_OFF, opacity: c.enabled ? 1 : 0.45 }}>{c.weight}%</button>
                            </td>
                          );
                        })}
                        <td className="text-center">{sums[m.id] !== 100 && warnBadge(sums[m.id])}</td>
                      </tr>
                      {isOpen && kids.map((p) => (
                        <tr key={`L${p.id}`}>
                          <td className="pr-2 whitespace-nowrap sticky left-0 z-10" style={{ background: "var(--bg-card)" }}>
                            <span className="inline-flex items-center max-w-full pl-5 text-[11px]" style={{ color: "var(--text-2)" }}><span className="truncate">{tl(p.name)}</span></span>
                          </td>
                          {tasks.map((task) => {
                            const ov = getOv(p.id, task.id);
                            const c = leadEff(p.id, m.id, task.id);
                            return (
                              <td key={task.id}>
                                <button type="button"
                                  title={`${leadTaskName(p.id, m.id, task)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · ${t("admin.ltasks.photos")} ${c.min_media} · ${c.weight}%${ov ? ` · ${t("admin.ltasks.overridden")}` : ""}`}
                                  onClick={() => openLeaderCell(p, m.id, task)}
                                  className="w-full h-6 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold text-white tabular-nums"
                                  style={{ background: c.enabled ? C_ON : C_OFF, opacity: c.enabled ? 1 : 0.45, boxShadow: ov ? OV_RING : undefined }}>{c.weight}%</button>
                              </td>
                            );
                          })}
                          <td className="text-center">{leaderSums[p.id] !== 100 && warnBadge(leaderSums[p.id])}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supervisor cell modal */}
      {cell && (
        <Modal title={t("admin.ltasks.cellTitle")} subtitle={tl(managers.find((m) => m.id === cell.mid)?.name || "")} icon={<ListChecks size={14} />} onClose={() => setCell(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setCell(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={cellMut.isPending} onClick={() => cellMut.mutate({ manager_id: cell.mid, task_id: cell.tid, enabled: cell.enabled, min_media: Number(cell.min_media) || 0, weight: Number(cell.weight) || 0, names: Object.fromEntries(LANGS.map((l) => [l, cell.names?.[l] || ""])), when: cell.when })}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.supNameHint")}</p>
          {nameFields(cell.names, (l, v) => setCell((c) => ({ ...c, names: { ...c.names, [l]: v } })), (l) => cellTask?.name?.[l] || "")}
          <FormField label={t("admin.ltasks.status")} required>{statusToggle(cell.enabled, (v) => setCell((c) => ({ ...c, enabled: v })))}</FormField>
          {numField(t("admin.ltasks.minMedia"), cell.min_media, (v) => setCell((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), cell.weight, (v) => setCell((c) => ({ ...c, weight: v })), 100)}
          <WhenBar when={cell.when} setWhen={(v) => setCell((c) => ({ ...c, when: v }))} nextDate={cellNext} t={t} />
        </Modal>
      )}

      {/* Leader cell modal */}
      {lcell && (
        <Modal title={t("admin.ltasks.leaderCellTitle")} subtitle={tl(leaders.find((p) => p.id === lcell.lid)?.name || "")} icon={<ListChecks size={14} />} onClose={() => setLcell(null)}
          footer={<>
            {lcell.hasOv && <Button variant="danger" className="mr-auto" icon={<RotateCcw size={14} />} onClick={askReset}>{t("admin.ltasks.reset")}</Button>}
            <Button variant="secondary" onClick={() => setLcell(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={leaderMut.isPending} onClick={saveLeaderCell}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.leaderHint")}</p>
          {nameFields(lcell.names, (l, v) => setLcell((c) => ({ ...c, names: { ...c.names, [l]: v } })), (l) => getCell(lcell.mid, lcell.tid).names?.[l] || lcellTask?.name?.[l] || "")}
          <FormField label={t("admin.ltasks.status")} required>{statusToggle(lcell.enabled, (v) => setLcell((c) => ({ ...c, enabled: v })))}</FormField>
          {numField(t("admin.ltasks.minMedia"), lcell.min_media, (v) => setLcell((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), lcell.weight, (v) => setLcell((c) => ({ ...c, weight: v })), 100)}
          <WhenBar when={lcell.when} setWhen={(v) => setLcell((c) => ({ ...c, when: v }))} nextDate={lcellNext} t={t} />
        </Modal>
      )}

      {/* Column header: global rename (decoupled) + apply-to-all (confirmed) */}
      {col && (
        <Modal title={`${t("admin.ltasks.editTask")} — T${col.tid}`} icon={<ListChecks size={14} />} onClose={() => setCol(null)}
          footer={<Button variant="secondary" onClick={() => setCol(null)}>{t("admin.broadcast.cancel")}</Button>}>
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{t("admin.ltasks.rename")}</p>
            {LANGS.map((l) => (
              <FormField key={l} label={`${t("admin.ltasks.taskName")} (${LANG_LABELS[l]})`}>
                <input value={col.names?.[l] || ""} onChange={(e) => setCol((c) => ({ ...c, names: { ...c.names, [l]: e.target.value } }))} className={inputCls} style={inputStyle} />
              </FormField>
            ))}
            <Button size="sm" loading={taskMut.isPending} onClick={() => taskMut.mutate({ task_id: col.tid, names: col.names, when: col.when })}>{t("admin.ltasks.rename")}</Button>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} className="my-3" />
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{t("admin.ltasks.applyAll")}</p>
            <p className="text-[11px]" style={{ color: C_WARN }}>{t("admin.ltasks.applyAllHint").replace("{n}", managers.length)}</p>
            <FormField label={t("admin.ltasks.status")} required>{statusToggle(col.enabled, (v) => setCol((c) => ({ ...c, enabled: v })))}</FormField>
            {numField(t("admin.ltasks.minMedia"), col.min_media, (v) => setCol((c) => ({ ...c, min_media: v })), 20)}
            {numField(t("admin.ltasks.weight"), col.weight, (v) => setCol((c) => ({ ...c, weight: v })), 100)}
            <Button size="sm" variant="secondary" onClick={() => askApplyAll({ task_id: col.tid, enabled: col.enabled, min_media: Number(col.min_media) || 0, weight: Number(col.weight) || 0, when: col.when })}>{t("admin.ltasks.applyAll")}</Button>
          </div>
          <WhenBar when={col.when} setWhen={(v) => setCol((c) => ({ ...c, when: v }))} nextDate={nextDates["1"]} t={t} />
        </Modal>
      )}

      {/* Exceptions drawer */}
      {showExc && (
        <Modal title={t("admin.ltasks.tab.exc")} subtitle={`${excRows.length}`} icon={<RotateCcw size={14} />} maxWidth="max-w-2xl" onClose={() => setShowExc(false)}
          footer={<Button variant="secondary" onClick={() => setShowExc(false)}>{t("admin.broadcast.cancel")}</Button>}>
          {excRows.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.noExc")}</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto -mx-1">
              {excRows.map((r) => {
                const mid = r.p.manager_id;
                const base = getCell(mid, r.tid);
                const k = tasks.find((x) => x.id === r.tid);
                const chips = [];
                if (r.ov.enabled != null) chips.push(excChip(`${t("admin.ltasks.status")}: ${r.ov.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")}`));
                if (r.ov.weight != null) chips.push(excChip(`${t("admin.ltasks.weight")} ${r.ov.weight} ← ${base.weight}`));
                if (r.ov.min_media != null) chips.push(excChip(`${t("admin.ltasks.photos")} ${r.ov.min_media} ← ${base.min_media}`));
                if (LANGS.some((l) => r.ov.names?.[l])) chips.push(excChip(t("admin.ltasks.taskName")));
                return (
                  <button key={`${r.p.id}-${r.tid}`} onClick={() => openLeaderByIds(r.p, r.tid)}
                    className="w-full text-left flex items-center gap-2 px-1 py-1.5 text-sm hover:bg-[var(--bg-inner)]" style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="truncate min-w-0" style={{ maxWidth: 130 }}>{tl(r.p.name)}</span>
                    <span className="text-[11px] shrink-0" style={{ color: "var(--text-3)" }}>{k ? tname(k) : "T" + r.tid}</span>
                    <span className="flex flex-wrap gap-1 ml-auto justify-end">{chips}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* History drawer */}
      {showHistory && (
        <Modal title={t("admin.ltasks.history")} icon={<History size={14} />} maxWidth="max-w-2xl" onClose={() => setShowHistory(false)}
          footer={<Button variant="secondary" onClick={() => setShowHistory(false)}>{t("admin.broadcast.cancel")}</Button>}>
          {!audit ? (
            [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-8 w-full mb-1" />)
          ) : !audit.length ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-3)" }}>—</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto -mx-1">
              {audit.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-1 py-1.5 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-[10px] rounded px-1.5 py-0.5 uppercase" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>{t(`admin.ltasks.act.${a.action}`)}</span>
                  <span className="truncate">{descPending({ kind: a.kind, task_id: a.task_id, manager_id: a.manager_id, leader_id: a.leader_id })}</span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--text-4)" }}>{a.ts ? a.ts.slice(0, 16).replace("T", " ") : ""}</span>
                  {a.revertible && <Button variant="ghost" size="sm" className="ml-auto shrink-0" icon={<RotateCcw size={13} />} onClick={() => askRevert(a)}>{t("admin.ltasks.revert")}</Button>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog open tone={confirm.tone} title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} cancelLabel={t("admin.broadcast.cancel")}
          loading={cancelMut.isPending || revertMut.isPending || leaderMut.isPending || applyMut.isPending}
          onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm} />
      )}

      {toast && (
        <div className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: C_ON, color: "#fff", maxWidth: 340, boxShadow: "0 8px 24px rgba(34,197,94,0.35)" }}>
          <CheckCircle size={15} style={{ flexShrink: 0 }} /><span>{t("admin.ltasks.saved")}</span>
        </div>
      )}
    </div>
  );
}
