import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Camera, CheckCircle, ChevronRight, History, Layers, ListChecks,
  Pencil, Plus, Radio, RotateCcw, Users, X,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import EmptyState from "../../components/ui/EmptyState";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const C_ON = "#22c55e";
const C_OFF = "#94a3b8";
const C_WARN = "#eab308";
const C_BAD = "#ef4444";
const LANGS = ["uz", "uz_cyrl", "ru", "en"];
const LANG_LABELS = { uz: "Oʻz", uz_cyrl: "Ўз", ru: "Ру", en: "En" };
const OV_RING = "inset 0 0 0 2px rgba(255,255,255,0.75)";

const IN_CLS = "w-full rounded-lg px-2 py-1.5 text-sm outline-none";
const IN_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

// ── pure resolution helpers (mirror the backend 3-level chain) ────────────────
const tnameOf = (task, lang) => task?.name?.[lang] || task?.name?.uz || `T${task?.id}`;
const cellOf = (settings, mid, tid) =>
  settings?.[mid]?.[tid] || { enabled: true, min_media: 1, weight: 0, names: {} };
const ovOf = (leaderSettings, lid, tid) => leaderSettings?.[lid]?.[tid] || null;
const supTaskNameOf = (settings, tasks, mid, tid, lang) =>
  cellOf(settings, mid, tid).names?.[lang] || tnameOf(tasks.find((t) => t.id === tid), lang);
const anyName = (names) => !!names && LANGS.some((l) => names[l]);
const cellIsCustom = (settings, mid, task) => {
  const c = cellOf(settings, mid, task.id);
  return c.enabled !== true || c.min_media !== 1 || c.weight !== task.default_weight || anyName(c.names);
};
const supEnabledCount = (settings, tasks, mid) =>
  tasks.filter((t) => cellOf(settings, mid, t.id).enabled).length;
const supWeightSum = (settings, tasks, mid) =>
  tasks.reduce((s, t) => { const c = cellOf(settings, mid, t.id); return s + (c.enabled ? Number(c.weight) : 0); }, 0);
const weightTone = (enabledCount, sum) => {
  if (enabledCount === 0) return C_OFF;
  if (sum === 0) return C_BAD;
  if (sum === 100) return C_ON;
  return C_WARN;
};

// ── small shared bits ─────────────────────────────────────────────────────────
function WhenBar({ when, setWhen, nextDate, t }) {
  return (
    <div className="space-y-1.5">
      <SegmentedToggle
        fill
        value={when}
        onChange={setWhen}
        options={[["now", t("admin.ltasks.applyNow")], ["next_day", t("admin.ltasks.applyNext")]]}
      />
      <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        {when === "next_day"
          ? t("admin.ltasks.timingNext").replace("{date}", nextDate || "")
          : t("admin.ltasks.timingNow")}
      </p>
    </div>
  );
}

function NameFields({ names, setNames, placeholderFor }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {LANGS.map((l) => (
        <div key={l} className="flex items-center gap-1.5">
          <span className="text-[10px] w-6 shrink-0" style={{ color: "var(--text-3)" }}>{LANG_LABELS[l]}</span>
          <input
            className={IN_CLS}
            style={IN_STYLE}
            value={names[l] || ""}
            placeholder={placeholderFor ? placeholderFor(l) : ""}
            onChange={(e) => setNames({ ...names, [l]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

const NumInput = ({ value, onChange, max, disabled }) => (
  <input
    type="number" min={0} max={max} disabled={disabled}
    className={IN_CLS} style={{ ...IN_STYLE, opacity: disabled ? 0.5 : 1 }}
    value={value} onChange={(e) => onChange(e.target.value)}
  />
);

// ── Tasks view (global layer) ────────────────────────────────────────────────
function TasksView({ data, t, lang, onEditTask, onApplyAll }) {
  const { tasks, managers, settings } = data;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 520 }}>
          <thead>
            <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }} className="text-[11px] uppercase">
              <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.task")}</th>
              <th className="text-center px-3 py-2 font-medium w-24">{t("admin.ltasks.colDefault")}</th>
              <th className="text-center px-3 py-2 font-medium w-28">{t("admin.ltasks.colCustom")}</th>
              <th className="px-3 py-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const custom = managers.filter((m) => cellIsCustom(settings, m.id, task)).length;
              return (
                <tr key={task.id} style={{ borderTop: "1px solid var(--border)" }} className="hover:bg-[var(--bg-inner)]">
                  <td className="px-3 py-2 cursor-pointer" onClick={() => onEditTask(task)}>
                    <span className="text-[11px] font-mono mr-1.5" style={{ color: "var(--text-3)" }}>T{task.id}</span>
                    {tnameOf(task, lang)}
                  </td>
                  <td className="text-center px-3 py-2" style={{ color: "var(--text-2)" }}>{task.default_weight}%</td>
                  <td className="text-center px-3 py-2">
                    {custom > 0 ? (
                      <span className="text-[11px] rounded-md px-1.5 py-0.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                        {custom}/{managers.length}
                      </span>
                    ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => onEditTask(task)}>
                        {t("admin.ltasks.editTask")}
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={t("admin.ltasks.applyAll")} title={t("admin.ltasks.applyAll")}
                        icon={<Users size={13} />} onClick={() => onApplyAll(task)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Supervisors view ─────────────────────────────────────────────────────────
function SupervisorsView({ data, t, tl, onEdit }) {
  const { managers, tasks, settings, leaders, leader_settings } = data;
  const [q, setQ] = useState("");
  const ovCount = useMemo(() => {
    const byMgr = {};
    for (const p of leaders) {
      const n = Object.keys(leader_settings[p.id] || {}).length;
      if (n) byMgr[p.manager_id] = (byMgr[p.manager_id] || 0) + n;
    }
    return byMgr;
  }, [leaders, leader_settings]);
  const rows = managers.filter((m) => tl(m.name).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder={t("admin.ltasks.tab.sup")} className="max-w-xs" />
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 520 }}>
            <thead>
              <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }} className="text-[11px] uppercase">
                <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.supervisor")}</th>
                <th className="text-center px-3 py-2 font-medium w-20">{t("admin.ltasks.colEnabled")}</th>
                <th className="text-center px-3 py-2 font-medium w-20">{t("admin.ltasks.colSum")}</th>
                <th className="text-center px-3 py-2 font-medium w-24">{t("admin.ltasks.colOverrides")}</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const en = supEnabledCount(settings, tasks, m.id);
                const sum = supWeightSum(settings, tasks, m.id);
                const tone = weightTone(en, sum);
                return (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}
                    className="hover:bg-[var(--bg-inner)] cursor-pointer" onClick={() => onEdit(m.id)}>
                    <td className="px-3 py-2">
                      {tl(m.name)}
                      {m.shift ? <span className="text-[10px] ml-1.5 rounded px-1" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>S{m.shift}</span> : null}
                    </td>
                    <td className="text-center px-3 py-2" style={{ color: "var(--text-2)" }}>{en}/{tasks.length}</td>
                    <td className="text-center px-3 py-2 font-medium" style={{ color: tone }}>{sum}%</td>
                    <td className="text-center px-3 py-2">
                      {ovCount[m.id] ? (
                        <span className="text-[11px] rounded-md px-1.5 py-0.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{ovCount[m.id]}</span>
                      ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                    </td>
                    <td className="px-3 py-2 text-right"><ChevronRight size={15} style={{ color: "var(--text-3)" }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Exceptions view ──────────────────────────────────────────────────────────
function ExceptionsView({ data, t, lang, tl, onEdit, onAdd }) {
  const { leaders, managers, tasks, leader_settings, settings } = data;
  const [q, setQ] = useState("");
  const mgrById = useMemo(() => Object.fromEntries(managers.map((m) => [m.id, m])), [managers]);
  const taskById = useMemo(() => Object.fromEntries(tasks.map((tk) => [tk.id, tk])), [tasks]);
  const rows = useMemo(() => {
    const out = [];
    for (const p of leaders) {
      const ov = leader_settings[p.id];
      if (!ov) continue;
      for (const tid of Object.keys(ov)) out.push({ leader: p, tid: Number(tid), ov: ov[tid] });
    }
    return out.filter((r) => tl(r.leader.name).toLowerCase().includes(q.trim().toLowerCase()));
  }, [leaders, leader_settings, q, tl]);

  const chip = (label) => (
    <span key={label} className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>{label}</span>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder={t("admin.ltasks.leader")} className="max-w-xs" />
        <Button size="lg" className="ml-auto" icon={<Plus size={15} />} onClick={onAdd}>{t("admin.ltasks.addException")}</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("admin.ltasks.noExc")} message="" showUploadLink={false} />
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 620 }}>
              <thead>
                <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }} className="text-[11px] uppercase">
                  <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.leader")}</th>
                  <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.supervisor")}</th>
                  <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.task")}</th>
                  <th className="text-left px-3 py-2 font-medium">{t("admin.ltasks.override")}</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mid = r.leader.manager_id;
                  const base = cellOf(settings, mid, r.tid);
                  const chips = [];
                  if (r.ov.enabled != null) chips.push(chip(`${t("admin.ltasks.status")}: ${r.ov.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")}`));
                  if (r.ov.weight != null) chips.push(chip(`${t("admin.ltasks.weight")} ${r.ov.weight} ← ${base.weight}`));
                  if (r.ov.min_media != null) chips.push(chip(`${t("admin.ltasks.photos")} ${r.ov.min_media} ← ${base.min_media}`));
                  if (anyName(r.ov.names)) chips.push(chip(t("admin.ltasks.taskName")));
                  return (
                    <tr key={`${r.leader.id}-${r.tid}`} style={{ borderTop: "1px solid var(--border)" }}
                      className="hover:bg-[var(--bg-inner)] cursor-pointer" onClick={() => onEdit(r.leader.id, r.tid)}>
                      <td className="px-3 py-2">{tl(r.leader.name)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{mgrById[mid] ? tl(mgrById[mid].name) : "—"}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                        <span className="text-[11px] font-mono mr-1" style={{ color: "var(--text-3)" }}>T{r.tid}</span>
                        {tnameOf(taskById[r.tid], lang)}
                      </td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{chips}</div></td>
                      <td className="px-3 py-2 text-right"><ChevronRight size={15} style={{ color: "var(--text-3)" }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only overview matrix (desktop) ──────────────────────────────────────
function MatrixView({ data, t, lang, tl, onCell }) {
  const { managers, tasks, settings, leaders, leader_settings } = data;
  return (
    <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Layers} title={t("admin.ltasks.overview")} />
      <div className="overflow-x-auto p-2">
        <table style={{ borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }} className="sticky left-0 z-10" />
              {tasks.map((tk) => (
                <th key={tk.id} style={{ width: 46 }} title={tnameOf(tk, lang)} className="text-[10px] font-medium align-bottom pb-1">
                  <div className="truncate" style={{ color: "var(--text-2)" }}>{tnameOf(tk, lang)}</div>
                  <div className="font-mono" style={{ color: "var(--text-4)" }}>T{tk.id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {managers.map((m) => {
              const kids = leaders.filter((p) => p.manager_id === m.id);
              return (
                <tr key={m.id}>
                  <td className="sticky left-0 z-10 text-xs pr-2 truncate" style={{ width: 150, background: "var(--bg-card)" }} title={tl(m.name)}>
                    {tl(m.name)}{m.shift ? <span className="text-[10px] ml-1" style={{ color: "var(--text-4)" }}>S{m.shift}</span> : null}
                  </td>
                  {tasks.map((tk) => {
                    const c = cellOf(settings, m.id, tk.id);
                    const hasOv = kids.some((p) => ovOf(leader_settings, p.id, tk.id));
                    return (
                      <td key={tk.id}>
                        <button
                          onClick={() => onCell(m.id)}
                          title={`${supTaskNameOf(settings, tasks, m.id, tk.id, lang)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · ${c.weight}%`}
                          className="w-full h-7 rounded text-[11px] font-medium"
                          style={{ background: c.enabled ? C_ON : C_OFF, opacity: c.enabled ? 1 : 0.45, color: "#fff", boxShadow: hasOv ? OV_RING : "none" }}
                        >{c.weight}%</button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Task editor (global def) ─────────────────────────────────────────────────
function TaskEditor({ task, t, nextDate, mut, onClose }) {
  const [names, setNames] = useState({ ...(task.name || {}) });
  const [note, setNote] = useState({ ...(task.note || {}) });
  const [dw, setDw] = useState(String(task.default_weight ?? 0));
  const [when, setWhen] = useState("now");
  const save = () => mut.mutate({ task_id: task.id, names, note, default_weight: Number(dw) || 0, when });
  return (
    <Modal title={t("admin.ltasks.editTask")} subtitle={`T${task.id}`} icon={<Layers size={14} />} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("admin.broadcast.cancel")}</Button>
        <Button loading={mut.isPending} onClick={save}>{t("admin.ltasks.save")}</Button>
      </>}>
      <FormField label={t("admin.ltasks.taskName")} required><NameFields names={names} setNames={setNames} /></FormField>
      <FormField label={t("admin.ltasks.note")}><NameFields names={note} setNames={setNote} /></FormField>
      <FormField label={t("admin.ltasks.colDefault")} required><NumInput value={dw} onChange={setDw} max={100} /></FormField>
      <WhenBar when={when} setWhen={setWhen} nextDate={nextDate} t={t} />
    </Modal>
  );
}

// ── Supervisor batch editor ──────────────────────────────────────────────────
function SupervisorEditor({ mid, data, t, lang, tl, nextDate, mut, onClose }) {
  const { managers, tasks, settings } = data;
  const mgr = managers.find((m) => m.id === mid);
  const init = () => tasks.map((tk) => {
    const c = cellOf(settings, mid, tk.id);
    return { task_id: tk.id, enabled: !!c.enabled, min_media: c.min_media, weight: c.weight, names: { ...(c.names || {}) } };
  });
  const [rows, setRows] = useState(init);
  const [when, setWhen] = useState("now");
  const [renameFor, setRenameFor] = useState(null);

  const setRow = (tid, patch) => setRows((rs) => rs.map((r) => (r.task_id === tid ? { ...r, ...patch } : r)));
  const enabled = rows.filter((r) => r.enabled);
  const sum = enabled.reduce((s, r) => s + Number(r.weight || 0), 0);
  const tone = weightTone(enabled.length, sum);

  const normalize = () => {
    const total = enabled.reduce((s, r) => s + Number(r.weight || 0), 0);
    if (total <= 0) return;
    const scaled = enabled.map((r) => ({ tid: r.task_id, w: Math.round((Number(r.weight || 0) / total) * 100) }));
    const diff = 100 - scaled.reduce((s, x) => s + x.w, 0);
    scaled.sort((a, b) => b.w - a.w);
    if (scaled.length) scaled[0].w = Math.max(0, scaled[0].w + diff);
    setRows((rs) => rs.map((r) => { const f = scaled.find((x) => x.tid === r.task_id); return f ? { ...r, weight: f.w } : r; }));
  };
  const copyFrom = (srcId) => {
    if (!srcId) return;
    setRows(tasks.map((tk) => {
      const c = cellOf(settings, Number(srcId), tk.id);
      return { task_id: tk.id, enabled: !!c.enabled, min_media: c.min_media, weight: c.weight, names: { ...(c.names || {}) } };
    }));
  };
  const save = () => mut.mutate({ manager_id: mid, cells: rows, when });
  const renameRow = renameFor != null ? rows.find((r) => r.task_id === renameFor) : null;

  return (
    <Modal title={t("admin.ltasks.editSup")} subtitle={mgr ? tl(mgr.name) : ""} icon={<Users size={14} />} maxWidth="max-w-2xl" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("admin.broadcast.cancel")}</Button>
        <Button loading={mut.isPending} onClick={save}>{t("admin.ltasks.saveAll")}</Button>
      </>}>
      <div className="flex items-center gap-2">
        <StyledSelect value="" onChange={copyFrom} triggerClassName="px-2.5 py-1.5 text-xs" placeholder={t("admin.ltasks.copyFrom")}
          options={managers.filter((m) => m.id !== mid).map((m) => ({ value: String(m.id), label: tl(m.name) }))} />
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="grid px-2 py-1.5 text-[10px] uppercase" style={{ gridTemplateColumns: "1fr 92px 56px 56px", gap: 8, color: "var(--text-3)", background: "var(--bg-inner)" }}>
          <span>{t("admin.ltasks.task")}</span><span className="text-center">{t("admin.ltasks.status")}</span>
          <span className="text-center"><Camera size={12} className="inline" /></span><span className="text-center">%</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {rows.map((r) => {
            const tk = tasks.find((x) => x.id === r.task_id);
            return (
              <div key={r.task_id} className="grid items-center px-2 py-1.5" style={{ gridTemplateColumns: "1fr 92px 56px 56px", gap: 8, borderTop: "1px solid var(--border)" }}>
                <button className="text-left text-sm truncate flex items-center gap-1" onClick={() => setRenameFor(r.task_id)} title={t("admin.ltasks.rename")}>
                  <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>T{r.task_id}</span>
                  <span className="truncate">{r.names?.[lang] || tnameOf(tk, lang)}</span>
                  {anyName(r.names) ? <Pencil size={10} style={{ color: C_WARN }} /> : null}
                </button>
                <div className="flex justify-center">
                  <SegmentedToggle size="sm" value={r.enabled} onChange={(v) => setRow(r.task_id, { enabled: v })}
                    options={[[true, t("admin.ltasks.colEnabled")], [false, "—"]]} />
                </div>
                <NumInput value={r.min_media} max={20} disabled={!r.enabled} onChange={(v) => setRow(r.task_id, { min_media: Number(v) })} />
                <NumInput value={r.weight} max={100} disabled={!r.enabled} onChange={(v) => setRow(r.task_id, { weight: Number(v) })} />
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)" }}>
          <span className="text-sm font-medium" style={{ color: tone }}>{sum} / 100</span>
          {sum !== 100 && enabled.length > 0 && (
            <span className="text-[11px]" style={{ color: sum === 0 ? C_BAD : "var(--text-3)" }}>
              {sum === 0 ? t("admin.ltasks.sumZero") : t("admin.ltasks.leftToPlace").replace("{n}", 100 - sum)}
            </span>
          )}
          <Button variant="secondary" size="sm" className="ml-auto" onClick={normalize}>{t("admin.ltasks.normalize")}</Button>
        </div>
      </div>
      <WhenBar when={when} setWhen={setWhen} nextDate={nextDate} t={t} />

      {renameRow && (
        <Modal title={t("admin.ltasks.rename")} subtitle={tnameOf(tasks.find((x) => x.id === renameFor), lang)} icon={<Pencil size={14} />} zIndex={70} onClose={() => setRenameFor(null)}
          footer={<Button onClick={() => setRenameFor(null)}>{t("admin.ltasks.confirm")}</Button>}>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.supNameHint")}</p>
          <NameFields names={renameRow.names} setNames={(nm) => setRow(renameFor, { names: nm })}
            placeholderFor={(l) => tnameOf(tasks.find((x) => x.id === renameFor), l)} />
        </Modal>
      )}
    </Modal>
  );
}

// ── Exception (per-leader override) editor ────────────────────────────────────
function TriField({ label, on, setOn, children, inheritedText, t }) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-2">
        <SegmentedToggle size="sm" value={on} onChange={setOn}
          options={[[false, t("admin.ltasks.inherit")], [true, t("admin.ltasks.override")]]} />
        {on ? <div className="flex-1">{children}</div>
          : <span className="text-xs" style={{ color: "var(--text-3)" }}>{inheritedText}</span>}
      </div>
    </FormField>
  );
}

function ExceptionEditor({ preset, data, t, lang, tl, nextDate, mut, onClose, onRemove }) {
  const { leaders, tasks, settings, leader_settings } = data;
  const adding = !preset;
  const [lid, setLid] = useState(preset ? String(preset.lid) : "");
  const [tid, setTid] = useState(preset ? String(preset.tid) : "");
  const leader = leaders.find((p) => String(p.id) === lid);
  const mid = leader?.manager_id;
  const base = mid && tid ? cellOf(settings, mid, Number(tid)) : { enabled: true, min_media: 1, weight: 0 };
  const ov = preset ? leader_settings[preset.lid]?.[preset.tid] : null;

  const [enOn, setEnOn] = useState(!!(ov && ov.enabled != null));
  const [enVal, setEnVal] = useState(ov?.enabled ?? base.enabled);
  const [mmOn, setMmOn] = useState(!!(ov && ov.min_media != null));
  const [mmVal, setMmVal] = useState(ov?.min_media ?? base.min_media);
  const [wOn, setWOn] = useState(!!(ov && ov.weight != null));
  const [wVal, setWVal] = useState(ov?.weight ?? base.weight);
  const [names, setNames] = useState({ ...(ov?.names || {}) });
  const [when, setWhen] = useState("now");

  const save = () => mut.mutate({
    leader_id: Number(lid), task_id: Number(tid),
    enabled: enOn ? enVal : null,
    min_media: mmOn ? Number(mmVal) : null,
    weight: wOn ? Number(wVal) : null,
    names: anyName(names) ? names : null,
    reset: false, when,
  });

  return (
    <Modal title={t("admin.ltasks.leaderCellTitle")} subtitle={leader ? tl(leader.name) : t("admin.ltasks.addException")} icon={<ListChecks size={14} />} onClose={onClose}
      footer={<>
        {preset && <Button variant="danger" className="mr-auto" icon={<RotateCcw size={14} />} onClick={onRemove}>{t("admin.ltasks.removeOverride")}</Button>}
        <Button variant="secondary" onClick={onClose}>{t("admin.broadcast.cancel")}</Button>
        <Button loading={mut.isPending} disabled={!lid || !tid} onClick={save}>{t("admin.ltasks.save")}</Button>
      </>}>
      {adding && (
        <>
          <FormField label={t("admin.ltasks.leader")} required>
            <StyledSelect value={lid} onChange={setLid} searchable placeholder={t("admin.ltasks.leader")}
              options={leaders.map((p) => ({ value: String(p.id), label: tl(p.name) }))} />
          </FormField>
          <FormField label={t("admin.ltasks.task")} required>
            <StyledSelect value={tid} onChange={setTid} placeholder={t("admin.ltasks.task")}
              options={tasks.map((tk) => ({ value: String(tk.id), label: `T${tk.id} · ${tnameOf(tk, lang)}` }))} />
          </FormField>
        </>
      )}
      <TriField label={t("admin.ltasks.status")} on={enOn} setOn={setEnOn} t={t}
        inheritedText={base.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")}>
        <SegmentedToggle size="sm" value={enVal} onChange={setEnVal}
          options={[[true, t("admin.ltasks.enabled")], [false, t("admin.ltasks.disabled")]]} />
      </TriField>
      <TriField label={t("admin.ltasks.minMedia")} on={mmOn} setOn={setMmOn} t={t} inheritedText={String(base.min_media)}>
        <NumInput value={mmVal} max={20} onChange={setMmVal} />
      </TriField>
      <TriField label={t("admin.ltasks.weight")} on={wOn} setOn={setWOn} t={t} inheritedText={`${base.weight}%`}>
        <NumInput value={wVal} max={100} onChange={setWVal} />
      </TriField>
      <FormField label={t("admin.ltasks.taskName")}>
        <NameFields names={names} setNames={setNames}
          placeholderFor={(l) => (mid && tid ? supTaskNameOf(settings, tasks, mid, Number(tid), l) : "")} />
      </FormField>
      <WhenBar when={when} setWhen={setWhen} nextDate={nextDate} t={t} />
    </Modal>
  );
}

// ── Apply-to-all modal ───────────────────────────────────────────────────────
function ApplyAllModal({ task, data, t, lang, nextDate, mut, onClose, onConfirm }) {
  const [enabled, setEnabled] = useState(true);
  const [mm, setMm] = useState(1);
  const [w, setW] = useState(task.default_weight ?? 0);
  const [when, setWhen] = useState("now");
  const submit = () => onConfirm({ task_id: task.id, enabled, min_media: Number(mm), weight: Number(w), when });
  return (
    <Modal title={t("admin.ltasks.applyAll")} subtitle={`T${task.id} · ${tnameOf(task, lang)}`} icon={<Users size={14} />} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("admin.broadcast.cancel")}</Button>
        <Button loading={mut.isPending} onClick={submit}>{t("admin.ltasks.applyAll")}</Button>
      </>}>
      <p className="text-[11px]" style={{ color: C_WARN }}>{t("admin.ltasks.applyAllHint").replace("{n}", data.managers.length)}</p>
      <FormField label={t("admin.ltasks.status")}>
        <SegmentedToggle fill value={enabled} onChange={setEnabled}
          options={[[true, t("admin.ltasks.enabled")], [false, t("admin.ltasks.disabled")]]} />
      </FormField>
      <FormField label={t("admin.ltasks.minMedia")}><NumInput value={mm} max={20} onChange={setMm} /></FormField>
      <FormField label={t("admin.ltasks.weight")}><NumInput value={w} max={100} onChange={setW} /></FormField>
      <WhenBar when={when} setWhen={setWhen} nextDate={nextDate} t={t} />
    </Modal>
  );
}

// ── Scheduled-changes panel + history ────────────────────────────────────────
function describePending(pc, data, t, lang, tl) {
  if (pc.kind === "global_task") {
    const tk = data.tasks.find((x) => x.id === pc.task_id);
    return `${t("admin.ltasks.editTask")}: ${tk ? tnameOf(tk, lang) : "T" + pc.task_id}`;
  }
  if (pc.kind === "leader") {
    const p = data.leaders.find((x) => x.id === pc.leader_id);
    const tk = data.tasks.find((x) => x.id === pc.task_id);
    return `${p ? tl(p.name) : "?"} · ${tk ? tnameOf(tk, lang) : "T" + pc.task_id}`;
  }
  const m = data.managers.find((x) => x.id === pc.manager_id);
  return m ? tl(m.name) : `#${pc.manager_id}`;
}

function ScheduledPanel({ data, t, lang, tl, onCancel }) {
  const pending = data.pending || [];
  if (!pending.length) return null;
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Calendar size={14} style={{ color: C_WARN }} />
        <span className="text-xs font-medium uppercase" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.scheduled")}</span>
        <span className="text-[11px] rounded px-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{pending.length}</span>
      </div>
      <div className="space-y-1">
        {pending.map((pc) => (
          <div key={pc.id} className="flex items-center gap-2 text-sm">
            <span className="truncate">{describePending(pc, data, t, lang, tl)}</span>
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.appliesFrom").replace("{date}", pc.effective_date)}</span>
            <Button variant="ghost" size="sm" className="ml-auto" aria-label={t("admin.ltasks.cancelChange")} icon={<X size={13} />} onClick={() => onCancel(pc)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryDrawer({ data, t, lang, tl, onClose, onRevert }) {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["ltasks-audit"],
    queryFn: () => api.get("/admin/leader-tasks/audit").then((r) => r.data.audit),
  });
  const label = (a) => describePending({ kind: a.kind, task_id: a.task_id, manager_id: a.manager_id, leader_id: a.leader_id }, data, t, lang, tl);
  return (
    <Modal title={t("admin.ltasks.history")} icon={<History size={14} />} maxWidth="max-w-2xl" onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>{t("admin.broadcast.cancel")}</Button>}>
      {isLoading ? (
        [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-8 w-full mb-1" />)
      ) : !audit?.length ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--text-3)" }}>—</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto -mx-1">
          {audit.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-1 py-1.5 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[10px] rounded px-1.5 py-0.5 uppercase" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>{t(`admin.ltasks.act.${a.action}`)}</span>
              <span className="truncate">{label(a)}</span>
              <span className="text-[11px] shrink-0" style={{ color: "var(--text-4)" }}>{a.ts ? a.ts.slice(0, 16).replace("T", " ") : ""}</span>
              {a.revertible && (
                <Button variant="ghost" size="sm" className="ml-auto shrink-0" icon={<RotateCcw size={13} />} onClick={() => onRevert(a)}>{t("admin.ltasks.revert")}</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Container ────────────────────────────────────────────────────────────────
export default function LeaderTasksAdmin() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [toast, setToast] = useState("");
  const [chan, setChan] = useState("");
  const [chanErr, setChanErr] = useState("");
  const [view, setView] = useState("supervisors");
  const [editTask, setEditTask] = useState(null);
  const [applyTask, setApplyTask] = useState(null);
  const [editMid, setEditMid] = useState(null);
  const [editExc, setEditExc] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ltasks-config"],
    queryFn: () => api.get("/admin/leader-tasks/config").then((r) => r.data),
  });
  useEffect(() => { if (data?.channel) setChan(data.channel.chat_id || ""); }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ltasks-config"] });
    qc.invalidateQueries({ queryKey: ["ltasks-audit"] });
  };
  const ping = () => { setToast(t("admin.ltasks.saved")); setTimeout(() => setToast(""), 3000); };
  const onErr = (e) => {
    const d = e?.response?.data?.detail;
    const msg = Array.isArray(d)
      ? d.map((x) => x?.msg || String(x)).join("; ")
      : (typeof d === "string" && d) || t("admin.ltasks.fail");
    alert(msg);
  };

  const taskMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/task", b), onSuccess: () => { invalidate(); setEditTask(null); ping(); }, onError: onErr });
  const supMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/supervisor-batch", b), onSuccess: () => { invalidate(); setEditMid(null); ping(); }, onError: onErr });
  const leaderMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/leader-cell", b), onSuccess: () => { invalidate(); setEditExc(null); setConfirm(null); ping(); }, onError: onErr });
  const applyMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/apply-all", b), onSuccess: () => { invalidate(); setApplyTask(null); setConfirm(null); ping(); }, onError: onErr });
  const chanMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/channel", b), onSuccess: () => { invalidate(); setChanErr(""); ping(); }, onError: (e) => setChanErr(e?.response?.data?.detail || t("admin.ltasks.channelFail")) });
  const cancelMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/pending/cancel", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const revertMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/revert", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });

  const nextDates = data?.next_dates || {};
  const nextForMid = (mid) => {
    const m = data?.managers.find((x) => x.id === mid);
    return nextDates[String(m?.shift === 2 ? 2 : 1)] || "";
  };

  const askRemove = (lid, tid) => setConfirm({
    title: t("admin.ltasks.removeOverride"), message: t("admin.ltasks.removeOverrideMsg"),
    tone: "danger", confirmLabel: t("admin.ltasks.removeOverride"),
    onConfirm: () => leaderMut.mutate({ leader_id: lid, task_id: tid, reset: true, when: "now" }),
  });
  const askCancel = (pc) => setConfirm({
    title: t("admin.ltasks.cancelChange"), message: t("admin.ltasks.cancelChangeMsg"),
    tone: "danger", confirmLabel: t("admin.ltasks.cancelChange"),
    onConfirm: () => cancelMut.mutate({ pending_id: pc.id }),
  });
  const askRevert = (a) => setConfirm({
    title: t("admin.ltasks.revert"), message: t("admin.ltasks.revertMsg"),
    tone: "warning", confirmLabel: t("admin.ltasks.revert"),
    onConfirm: () => revertMut.mutate({ audit_id: a.id }),
  });
  const askApplyAll = (payload) => setConfirm({
    title: t("admin.ltasks.applyAll"), message: t("admin.ltasks.applyAllHint").replace("{n}", data.managers.length),
    tone: "danger", confirmLabel: t("admin.ltasks.applyAll"),
    onConfirm: () => applyMut.mutate(payload),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Radio} title={t("admin.ltasks.channel")} />
        <p className="text-[11px] mt-1 mb-2" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.channelHint")}</p>
        <div className="flex items-center gap-2">
          <input className={IN_CLS} style={IN_STYLE} value={chan} placeholder="-100…" onChange={(e) => setChan(e.target.value)} />
          <Button size="lg" loading={chanMut.isPending} onClick={() => chanMut.mutate({ chat_id: chan })}>{t("admin.ltasks.save")}</Button>
        </div>
        {chanErr && <p className="text-xs mt-1" style={{ color: C_BAD }}>{chanErr}</p>}
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-9 w-full" />)}</div>
      ) : (
        <>
          <ScheduledPanel data={data} t={t} lang={lang} tl={tl} onCancel={askCancel} />

          <div className="flex items-center gap-2">
            <SegmentedToggle value={view} onChange={setView} options={[
              ["tasks", t("admin.ltasks.tab.tasks")],
              ["supervisors", t("admin.ltasks.tab.sup")],
              ["exceptions", t("admin.ltasks.tab.exc")],
            ]} />
            <Button variant="secondary" size="lg" className="ml-auto" icon={<History size={15} />} onClick={() => setShowHistory(true)}>{t("admin.ltasks.history")}</Button>
          </div>

          {view === "tasks" && <TasksView data={data} t={t} lang={lang} onEditTask={setEditTask} onApplyAll={setApplyTask} />}
          {view === "supervisors" && <SupervisorsView data={data} t={t} tl={tl} onEdit={setEditMid} />}
          {view === "exceptions" && <ExceptionsView data={data} t={t} lang={lang} tl={tl} onEdit={(lid, tid) => setEditExc({ lid, tid })} onAdd={() => setEditExc("add")} />}

          <MatrixView data={data} t={t} lang={lang} tl={tl} onCell={(mid) => setEditMid(mid)} />
        </>
      )}

      {editTask && <TaskEditor task={editTask} t={t} nextDate={nextDates["1"]} mut={taskMut} onClose={() => setEditTask(null)} />}
      {applyTask && <ApplyAllModal task={applyTask} data={data} t={t} lang={lang} nextDate={nextDates["1"]} mut={applyMut} onClose={() => setApplyTask(null)} onConfirm={askApplyAll} />}
      {editMid != null && <SupervisorEditor mid={editMid} data={data} t={t} lang={lang} tl={tl} nextDate={nextForMid(editMid)} mut={supMut} onClose={() => setEditMid(null)} />}
      {editExc && <ExceptionEditor
        preset={editExc === "add" ? null : editExc} data={data} t={t} lang={lang} tl={tl}
        nextDate={editExc !== "add" ? nextForMid(data.leaders.find((p) => p.id === editExc.lid)?.manager_id) : nextDates["1"]}
        mut={leaderMut} onClose={() => setEditExc(null)}
        onRemove={() => { const e = editExc; setEditExc(null); askRemove(e.lid, e.tid); }} />}
      {showHistory && <HistoryDrawer data={data} t={t} lang={lang} tl={tl} onClose={() => setShowHistory(false)} onRevert={askRevert} />}

      {confirm && (
        <ConfirmDialog open tone={confirm.tone} title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} cancelLabel={t("admin.broadcast.cancel")}
          loading={cancelMut.isPending || revertMut.isPending || leaderMut.isPending || applyMut.isPending}
          onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm} />
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white toast-in" style={{ background: C_ON }}>
          <CheckCircle size={16} />{toast}
        </div>
      )}
    </div>
  );
}
