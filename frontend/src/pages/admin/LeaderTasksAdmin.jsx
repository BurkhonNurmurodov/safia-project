import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Calendar, CheckCircle, ChevronDown, ChevronRight, Clock,
  History, ImagePlus, ListChecks, Radio, RotateCcw, Trash2, UserCog, Users, X,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import { ProxyPhoto } from "../../components/leaders/ProofPhoto";
import { usePersistentState } from "../../hooks/usePersistentState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Toast, { useToast } from "../../components/ui/Toast";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { FilterPanel, OptsFilter } from "../../components/ui/ColumnFilter";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock, SkeletonMatrix } from "../../components/ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const C_ON = "#22c55e", C_OFF = "#94a3b8", C_WARN = "#eab308", C_BAD = "#ef4444";
const LANGS = ["uz", "uz_cyrl", "ru", "en"];
const LANG_LABELS = { uz: "UZ", uz_cyrl: "УЗ", ru: "РУ", en: "EN" };
const OV_RING = "inset 0 0 0 2px rgba(255,255,255,0.75)";

/**
 * A disabled cell used to fade the WHOLE button to 0.45 opacity — white bold
 * text on #94a3b8 is already under AA at full strength, and at 45% over the card
 * it was effectively invisible (and nearly gone in light theme). Keep the grey
 * solid, switch the ink to dark, and add a non-colour cue so the on/off
 * distinction survives colourblindness and both themes.
 */
function cellStyle(c) {
  return c.enabled
    ? { background: C_ON, color: "#fff" }
    : { background: C_OFF, color: "#1f2937", textDecoration: "line-through" };
}

/** min_media had zero visual encoding — two equal-weight cells with different
 *  photo requirements looked identical without opening each modal. */
function MediaDots({ n }) {
  return (
    <span className="absolute top-0.5 right-0.5 flex gap-[1px]" aria-hidden>
      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
        <span key={i} className="block w-[3px] h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.85)" }} />
      ))}
    </span>
  );
}
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

// Optional EXAMPLE proof photos for one task — reference images the AI
// reviewer receives beside the written criteria (global per task, never shown
// to the leader). Uploads apply at once, exactly like the criteria text; the
// ids come from the live config query, so the strip re-renders on invalidate.
const EXAMPLES_MAX = 3;
function TaskExamples({ ids, busy, note, onUpload, onAskDelete, t }) {
  const fileRef = useRef(null);
  const full = ids.length >= EXAMPLES_MAX;
  const T = { photoFailed: t("admin.ltasks.photoFailed"), retry: t("common.retry") };
  return (
    <FormField label={t("admin.ltasks.examples")}
      hint={note ? `${t("admin.ltasks.examplesHint")} ${note}` : t("admin.ltasks.examplesHint")}>
      <div className="space-y-2">
        {ids.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {ids.map((id) => (
              <div key={id} className="relative">
                <ProxyPhoto T={T} deps={[id]} className="h-20" maxHeight={80}
                  load={() => api.get(`/admin/leader-tasks/examples/${id}`, { responseType: "blob" })} />
                <button type="button" aria-label={t("admin.ltasks.exampleDelTitle")}
                  onClick={() => onAskDelete(id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-md grid place-items-center"
                  style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" className="hidden"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
        <Button size="sm" tint icon={<ImagePlus size={13} />} loading={busy} disabled={full}
          onClick={() => fileRef.current?.click()}>
          {full ? t("admin.ltasks.examplesFull") : t("admin.ltasks.exampleAdd")}
        </Button>
      </div>
    </FormField>
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
  const toast2 = useToast();
  const [chan, setChan] = useState("");
  const [chanErr, setChanErr] = useState("");
  const [cell, setCell] = useState(null);
  const [lcell, setLcell] = useState(null);
  const [col, setCol] = useState(null);
  // Expanded supervisor rows, stored as an array (localStorage can't hold a
  // Set) and exposed as a Set.
  const [openArr, setOpenArr] = usePersistentState("ltasks_open_supervisors", []);
  const open = useMemo(() => new Set(openArr), [openArr]);
  const setOpen = (next) =>
    setOpenArr((prev) => Array.from(typeof next === "function" ? next(new Set(prev)) : next));
  // Matrix scope. Shift is single-valued (there are two of them); brigadir and
  // leader are checkbox sets. These are not decoration: a column-header push
  // writes exactly the rows they leave on screen.
  const [fShift, setFShift] = usePersistentState("ltasks_f_shift", 0);
  const [fMgrs, setFMgrs] = usePersistentState("ltasks_f_mgrs", []);
  const [fLeads, setFLeads] = usePersistentState("ltasks_f_leads", []);
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
  // Telegram's Mini App WebView blocks window.alert on iOS, so on the primary
  // phone platform a failed save produced NOTHING — the modal stayed open, the
  // spinner stopped, and the admin had no idea whether the edit applied. The
  // channel card already did this right with an inline error; the matrix
  // mutations were the inconsistent ones.
  const onErr = (e) => {
    const d = e?.response?.data?.detail;
    toast2.error(Array.isArray(d) ? d.map((x) => x?.msg || String(x)).join("; ")
      : (typeof d === "string" && d) || t("admin.ltasks.fail"));
  };

  const cellMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/cell", b), onSuccess: () => { invalidate(); setCell(null); ping(); }, onError: onErr });
  const leaderMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/leader-cell", b), onSuccess: () => { invalidate(); setLcell(null); setConfirm(null); ping(); }, onError: onErr });
  const taskMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/task", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  const applyMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/apply-all", b), onSuccess: () => { invalidate(); setCol(null); setConfirm(null); ping(); }, onError: onErr });
  const cancelMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/pending/cancel", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const revertMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/revert", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const chanMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/channel", b), onSuccess: () => { setChanErr(""); invalidate(); ping(); }, onError: (e) => setChanErr(e?.response?.data?.detail || t("admin.ltasks.channelFail")) });
  // The AI definition-of-done rides its own endpoint: it changes nothing the
  // leader sees in the bot, so it applies at once and never joins the
  // "from next day" staging the other fields go through.
  const critMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/criteria", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // Example proof photos live beside the criteria: instant like it (nothing
  // the leader sees changes), ids come from the live config so an upload or
  // delete re-renders the strip through the same invalidate.
  const exAddMut = useMutation({
    mutationFn: ({ taskId, file }) => {
      const fd = new FormData();
      fd.append("task_id", taskId);
      fd.append("file", file);
      return api.post("/admin/leader-tasks/examples", fd);
    },
    onSuccess: () => { invalidate(); ping(); },
    onError: (e) => {
      const d = e?.response?.data?.detail;
      toast2.error(d === "examples_full" ? t("admin.ltasks.examplesFull")
        : d === "photo_too_large" ? t("profile.photoTooLarge")
        : d === "invalid_image" ? t("profile.photoInvalid")
        : (typeof d === "string" && d) || t("admin.ltasks.fail"));
    },
  });
  const exDelMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/leader-tasks/examples/${id}`),
    onSuccess: () => { invalidate(); setConfirm(null); ping(); },
    // The confirm dialog must stay standing with the reason on it, so the
    // failure lands in the dialog's own error slot rather than a toast.
    onError: (e) => {
      const d = e?.response?.data?.detail;
      setConfirm((c) => (c ? { ...c, error: (typeof d === "string" && d) || t("admin.ltasks.fail") } : c));
    },
  });

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
  const mgrById = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);
  const leaderById = useMemo(() => new Map(leaders.map((p) => [p.id, p])), [leaders]);

  // The filter options cascade — brigadirs follow the shift, leaders follow
  // both — so a checkbox can never point at a row another filter has already
  // removed. The STORED selection is reconciled against the live options
  // rather than rewritten: narrowing the shift parks a leader's tick, clearing
  // it brings the tick back, and no selection is silently thrown away.
  const mgrOpts = useMemo(
    () => managers.filter((m) => !fShift || Number(m.shift) === fShift),
    [managers, fShift]);
  const mgrSel = useMemo(() => {
    const ok = new Set(mgrOpts.map((m) => m.id));
    return fMgrs.filter((id) => ok.has(id));
  }, [fMgrs, mgrOpts]);
  const leaderOpts = useMemo(() => {
    const pool = new Set(mgrSel.length ? mgrSel : mgrOpts.map((m) => m.id));
    return leaders.filter((p) => pool.has(p.manager_id));
  }, [leaders, mgrOpts, mgrSel]);
  const leadSel = useMemo(() => {
    const ok = new Set(leaderOpts.map((p) => p.id));
    return fLeads.filter((id) => ok.has(id));
  }, [fLeads, leaderOpts]);

  // The visible matrix. A leader filter drops the brigadirs it empties and
  // keeps the survivors expanded, so the table IS the list of rows a column
  // push will write — which is the entire point of filtering before pushing.
  const rows = useMemo(() => {
    const pickM = new Set(mgrSel);
    const pickL = new Set(leadSel);
    const out = [];
    for (const m of mgrOpts) {
      if (pickM.size && !pickM.has(m.id)) continue;
      const kids = leadersByMgr[m.id] || [];
      const shown = pickL.size ? kids.filter((p) => pickL.has(p.id)) : kids;
      if (pickL.size && !shown.length) continue;
      out.push({ m, kids: shown });
    }
    return out;
  }, [mgrOpts, mgrSel, leadSel, leadersByMgr]);
  const leaderRows = useMemo(() => rows.reduce((a, r) => a + r.kids.length, 0), [rows]);
  const anyFilter = fShift !== 0 || mgrSel.length > 0 || leadSel.length > 0;
  const clearFilters = () => { setFShift(0); setFMgrs([]); setFLeads([]); };
  // Leader ticks ⇒ write those leader rows as overrides; otherwise write the
  // brigadir rows on screen and let their leaders keep inheriting, as always.
  // Writing the parents while a leader filter is on would move every OTHER
  // leader under them — exactly the rows the admin just filtered away.
  const applyScope = useMemo(() => (
    leadSel.length
      ? { level: "leader", ids: rows.flatMap((r) => r.kids.map((p) => p.id)) }
      : { level: "supervisor", ids: rows.map((r) => r.m.id) }
  ), [rows, leadSel]);

  const tname = (task) => task.name?.[lang] || task.name?.uz || `T${task.id}`;
  const getCell = (mid, tid) => settings[String(mid)]?.[String(tid)] ?? { enabled: true, min_media: 1, weight: 0, names: {}, criteria: null };
  // The definition of done actually in force for a cell, walking the same
  // chain the backend reviewer walks: leader → supervisor → global.
  const critOf = (tid) => tasks.find((x) => x.id === tid)?.criteria || "";
  const supCrit = (mid, tid) => getCell(mid, tid).criteria || critOf(tid);
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
      criteria: ov?.criteria || "",
    });
  };
  const openLeaderByIds = (p, tid) => { const task = tasks.find((x) => x.id === tid); if (task) { setShowExc(false); openLeaderCell(p, p.manager_id, task); } };

  // Criteria never stage, so they are saved on their own endpoint alongside
  // whatever the cell's own Save does — one button, two writes, because an
  // admin editing a cell does not care which field routes where.
  const saveCriteria = (draft, stored, ids) => {
    if ((draft || "") === (stored || "")) return;
    critMut.mutate({ ...ids, criteria: draft || "" });
  };

  const saveCell = () => {
    saveCriteria(cell.criteria, getCell(cell.mid, cell.tid).criteria,
      { task_id: cell.tid, manager_id: cell.mid });
    cellMut.mutate({
      manager_id: cell.mid, task_id: cell.tid, enabled: cell.enabled,
      min_media: Number(cell.min_media) || 0, weight: Number(cell.weight) || 0,
      names: Object.fromEntries(LANGS.map((l) => [l, cell.names?.[l] || ""])),
      when: cell.when,
    });
  };

  const saveLeaderCell = () => {
    const base = getCell(lcell.mid, lcell.tid);
    const mm = Number(lcell.min_media) || 0;
    const w = Number(lcell.weight) || 0;
    saveCriteria(lcell.criteria, getOv(lcell.lid, lcell.tid)?.criteria,
      { task_id: lcell.tid, leader_id: lcell.lid });
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
  // The scope is stated three times on the way to a write — the warning line,
  // the button, and the confirm — because this is the one control on the page
  // that can rewrite ninety rows, and "all" is no longer what it does.
  const applyN = applyScope.ids.length;
  const applyMsg = () => (
    applyScope.level === "leader" ? t("admin.ltasks.applyLeadHint").replace("{n}", applyN)
      : anyFilter ? t("admin.ltasks.applyFiltHint").replace("{n}", applyN)
        : t("admin.ltasks.applyAllHint").replace("{n}", applyN)
  );
  const applyLabel = () => (
    applyScope.level === "leader"
      ? t("admin.ltasks.applyToLeads").replace("{n}", applyN)
      : t("admin.ltasks.applyToMgrs").replace("{n}", applyN)
  );
  const askApplyAll = (payload) => setConfirm({
    title: t("admin.ltasks.applyAll"), message: applyMsg(),
    tone: "danger", confirmLabel: applyLabel(), onConfirm: () => applyMut.mutate(payload),
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
  // "What makes this task truly done" — prompt material for the AI proof
  // reviewer, not UI copy, so it stays ONE free-text box in whatever language
  // the admin thinks in rather than the 4-language stack the names use.
  // `inherited` previews the level above: blank here means inherit, and an
  // admin has to be able to see what that inherits TO before leaving it blank.
  const criteriaField = (value, onChange, inherited) => (
    <FormField label={t("admin.ltasks.criteria")} hint={t("admin.ltasks.criteriaHint")}>
      <textarea rows={4} value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={inherited || t("admin.ltasks.criteriaPh")}
        className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 84 }} />
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

  // Scope sections for the matrix toolbar: shift as a two-value segmented pick,
  // brigadir and leader as checkbox lists. The leader list is grouped under its
  // brigadir — ninety-odd names in one flat column are unnavigable, and the
  // grouping is also what tells the admin which brigadir a leader belongs to.
  const mgrLabel = (id) => tl(mgrById.get(id)?.name || "") || `#${id}`;
  const leadLabel = (id) => tl(leaderById.get(id)?.name || "") || `#${id}`;
  const filterSections = [
    {
      key: "shift", icon: Clock, label: t("admin.ltasks.fShift"),
      active: fShift !== 0, display: fShift ? `S${fShift}` : "",
      onClear: () => setFShift(0),
      render: () => (
        <SegmentedToggle fill size="sm" value={fShift} onChange={setFShift}
          options={[[0, t("admin.ltasks.fAllShifts")], [1, "S1"], [2, "S2"]]} />
      ),
    },
    {
      key: "mgr", icon: UserCog, label: t("admin.ltasks.supervisor"),
      active: mgrSel.length > 0,
      display: mgrSel.length === 1 ? mgrLabel(mgrSel[0]) : String(mgrSel.length),
      onClear: () => setFMgrs([]),
      render: () => (
        <OptsFilter searchable opts={mgrOpts.map((m) => m.id)} sel={mgrSel}
          onChange={setFMgrs} render={mgrLabel} />
      ),
    },
    {
      key: "lead", icon: Users, label: t("admin.ltasks.fLeader"),
      active: leadSel.length > 0,
      display: leadSel.length === 1 ? leadLabel(leadSel[0]) : String(leadSel.length),
      onClear: () => setFLeads([]),
      render: () => (
        <OptsFilter searchable opts={leaderOpts.map((p) => p.id)} sel={leadSel}
          onChange={setFLeads} render={leadLabel}
          groupBy={(id) => {
            const mid = leaderById.get(id)?.manager_id;
            return mid ? mgrLabel(mid) : "—";
          }} />
      ),
    },
  ];

  const cellTask = cell && (tasks.find((task) => task.id === cell.tid) || {});
  const lcellTask = lcell && (tasks.find((task) => task.id === lcell.tid) || {});
  // Live task row behind the column modal — example ids must come from the
  // query (not the col draft) so an upload/delete re-renders the strip.
  const colTask = col && (tasks.find((task) => task.id === col.tid) || {});
  // Column modal saves the way its cell twins do: ONE footer button, name and
  // criteria routed to their own endpoints, each skipped when unchanged so a
  // no-op save writes no history entry. «Apply to all» keeps its own inline
  // button — it rewrites every leader and goes through a confirm.
  // A filtered matrix scopes the WHOLE modal, not just the numeric push. The
  // name and the definition-of-done live at the GLOBAL level, which is exactly
  // what every row without an override displays — writing them there would
  // reach straight past the filter into the shifts it excluded. Scoped, they
  // land as per-row overrides on the filtered rows instead.
  const colScope = () => (
    !anyFilter ? {}
      : applyScope.level === "leader"
        ? { leader_ids: applyScope.ids } : { manager_ids: applyScope.ids }
  );
  // Under a filter the modal WRITES the visible rows, so it must also SHOW
  // those rows' current values — the numeric trio always seeded from the first
  // visible row, but name/criteria seeded from the global layer, which a
  // previous scoped save may have already diverged from. Reopening the modal
  // then showed the old global text, which reads as "my edit was lost".
  // names0/criteria0 keep the seed so Save can skip fields the admin left
  // exactly as shown (unfiltered they are the global values, as before).
  const openCol = (task) => {
    const lead0 = applyScope.level === "leader" ? rows[0]?.kids[0] : null;
    const f = lead0
      ? leadEff(lead0.id, lead0.manager_id, task.id)
      : getCell(rows[0]?.m.id, task.id);
    const names0 = Object.fromEntries(LANGS.map((l) => [l,
      (anyFilter && (lead0
        ? getOv(lead0.id, task.id)?.names?.[l] || getCell(lead0.manager_id, task.id).names?.[l]
        : getCell(rows[0]?.m.id, task.id).names?.[l]))
      || task.name?.[l] || ""]));
    const criteria0 = (anyFilter
      ? (lead0
        ? getOv(lead0.id, task.id)?.criteria || supCrit(lead0.manager_id, task.id)
        : supCrit(rows[0]?.m.id, task.id))
      : task.criteria) || "";
    setCol({
      tid: task.id, enabled: f.enabled, min_media: f.min_media, weight: f.weight,
      names: { ...names0 }, names0, criteria: criteria0, criteria0, when: "now",
    });
  };
  const saveCol = () => {
    const ids = colScope();
    saveCriteria(col.criteria, col.criteria0, { task_id: col.tid, ...ids });
    if (LANGS.some((l) => (col.names?.[l] || "") !== (col.names0?.[l] || "")))
      taskMut.mutate({ task_id: col.tid, names: col.names, when: col.when, ...ids });
  };
  const askDeleteExample = (id) => setConfirm({
    title: t("admin.ltasks.exampleDelTitle"), message: t("admin.ltasks.exampleDelMsg"),
    tone: "danger", confirmLabel: t("common.delete"),
    onConfirm: () => exDelMut.mutate(id),
  });
  const uploadExample = (file) => {
    if (file.size > 10 * 1024 * 1024) { toast2.error(t("profile.photoTooLarge")); return; }
    exAddMut.mutate({ taskId: col.tid, file });
  };
  const cellNext = cell && nextForShift(managers.find((m) => m.id === cell.mid)?.shift);
  const lcellNext = lcell && nextForShift(managers.find((m) => m.id === lcell.mid)?.shift);

  return (
    <div className="space-y-6">
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
        <div className="px-4 pt-3 space-y-2.5">
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.desc")}</p>
          {/* FilterPanel must stay a DIRECT child of this row — its fit check
              measures the row's own children to decide inline vs grouped. */}
          <div className="flex items-center gap-2">
            <FilterPanel sections={filterSections} />
            <span className="ml-auto shrink-0 text-[11px] tabular-nums"
              style={{ color: anyFilter ? "var(--brand-text)" : "var(--text-4)" }}>
              {leadSel.length
                ? t("admin.ltasks.fCountLead").replace("{l}", leaderRows).replace("{n}", rows.length)
                : t("admin.ltasks.fCount").replace("{n}", rows.length).replace("{total}", managers.length)}
            </span>
          </div>
        </div>
        {isLoading ? (
          <SkeletonMatrix rows={8} />
        ) : (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ color: "var(--text-1)", borderCollapse: "separate", borderSpacing: 3, tableLayout: "fixed", minWidth: 640 }}>
              <thead>
                <tr>
                  <th className="text-left pr-2 pb-1.5 font-semibold align-bottom sticky left-0 top-0 z-20" style={{ color: "var(--text-3)", background: "var(--bg-card)", width: 170 }}>{t("admin.ltasks.supervisor")}</th>
                  {tasks.map((task) => (
                    <th key={task.id} className="align-bottom sticky top-0 z-10" style={{ background: "var(--bg-card)" }}>
                      {/* block, not inline-block: an inline button aligns on the baseline of its
                          LAST line, so one- vs two-line names staggered the whole header row. */}
                      <button type="button" title={tname(task)}
                        onClick={() => openCol(task)}
                        className="block w-full px-1 py-1.5 rounded-lg transition-opacity hover:opacity-75"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--brand-text)" }}>
                        <span className="block font-bold leading-none">T{task.id}</span>
                        {/* The name itself, on screen, in two lines — no hover required.
                            minHeight reserves both lines so short names keep the chip the same height. */}
                        <span
                          className="block text-[9px] font-medium leading-tight mt-0.5 overflow-hidden"
                          style={{ color: "var(--text-3)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: "2.5em" }}
                        >
                          {tname(task)}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th style={{ width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={tasks.length + 2} className="text-center py-8">
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.fNone")}</p>
                      <Button variant="ghost" size="sm" className="mt-1.5" onClick={clearFilters}>
                        {t("admin.ltasks.fClear")}
                      </Button>
                    </td>
                  </tr>
                )}
                {rows.map(({ m, kids }) => {
                  // A leader filter pins its brigadirs open: collapsing would
                  // hide the very rows the filter selected, and the apply
                  // button's promise ("these rows") would stop being visible.
                  const pinned = leadSel.length > 0;
                  const isOpen = pinned || open.has(m.id);
                  const childWarn = kids.some((p) => leaderSums[p.id] !== 100);
                  return (
                    <Fragment key={m.id}>
                      <tr>
                        <td className="pr-2 whitespace-nowrap sticky left-0 z-10" style={{ background: "var(--bg-card)" }}>
                          <span className="inline-flex items-center gap-1 max-w-full">
                            <button type="button" onClick={() => toggleOpen(m.id)} disabled={!kids.length || pinned}
                              title={pinned ? t("admin.ltasks.fPinned") : undefined}
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
                                onClick={() => setCell({ mid: m.id, tid: task.id, ...c, criteria: c.criteria || "", when: "now" })}
                                className="relative w-full h-9 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold tabular-nums rounded"
                                style={cellStyle(c)}>
                                {c.weight}%
                                {c.min_media > 1 && <MediaDots n={c.min_media} />}
                              </button>
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
                                  className="relative w-full h-8 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold tabular-nums rounded"
                                  style={{ ...cellStyle(c), boxShadow: ov ? OV_RING : undefined }}>
                                  {c.weight}%
                                  {c.min_media > 1 && <MediaDots n={c.min_media} />}
                                </button>
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
            <Button loading={cellMut.isPending || critMut.isPending} onClick={saveCell}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.supNameHint")}</p>
          {nameFields(cell.names, (l, v) => setCell((c) => ({ ...c, names: { ...c.names, [l]: v } })), (l) => cellTask?.name?.[l] || "")}
          <FormField label={t("admin.ltasks.status")} required>{statusToggle(cell.enabled, (v) => setCell((c) => ({ ...c, enabled: v })))}</FormField>
          {numField(t("admin.ltasks.minMedia"), cell.min_media, (v) => setCell((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), cell.weight, (v) => setCell((c) => ({ ...c, weight: v })), 100)}
          {criteriaField(cell.criteria, (v) => setCell((c) => ({ ...c, criteria: v })), critOf(cell.tid))}
          <WhenBar when={cell.when} setWhen={(v) => setCell((c) => ({ ...c, when: v }))} nextDate={cellNext} t={t} />
        </Modal>
      )}

      {/* Leader cell modal */}
      {lcell && (
        <Modal title={t("admin.ltasks.leaderCellTitle")} subtitle={tl(leaders.find((p) => p.id === lcell.lid)?.name || "")} icon={<ListChecks size={14} />} onClose={() => setLcell(null)}
          footer={<>
            {lcell.hasOv && <Button variant="danger" className="mr-auto" icon={<RotateCcw size={14} />} onClick={askReset}>{t("admin.ltasks.reset")}</Button>}
            <Button variant="secondary" onClick={() => setLcell(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={leaderMut.isPending || critMut.isPending} onClick={saveLeaderCell}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.leaderHint")}</p>
          {nameFields(lcell.names, (l, v) => setLcell((c) => ({ ...c, names: { ...c.names, [l]: v } })), (l) => getCell(lcell.mid, lcell.tid).names?.[l] || lcellTask?.name?.[l] || "")}
          <FormField label={t("admin.ltasks.status")} required>{statusToggle(lcell.enabled, (v) => setLcell((c) => ({ ...c, enabled: v })))}</FormField>
          {numField(t("admin.ltasks.minMedia"), lcell.min_media, (v) => setLcell((c) => ({ ...c, min_media: v })), 20)}
          {numField(t("admin.ltasks.weight"), lcell.weight, (v) => setLcell((c) => ({ ...c, weight: v })), 100)}
          {criteriaField(lcell.criteria, (v) => setLcell((c) => ({ ...c, criteria: v })), supCrit(lcell.mid, lcell.tid))}
          <WhenBar when={lcell.when} setWhen={(v) => setLcell((c) => ({ ...c, when: v }))} nextDate={lcellNext} t={t} />
        </Modal>
      )}

      {/* Column header: global rename (decoupled) + apply-to-all (confirmed) */}
      {col && (
        <Modal title={`${t("admin.ltasks.editTask")} — T${col.tid}`} icon={<ListChecks size={14} />} onClose={() => setCol(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setCol(null)}>{t("admin.broadcast.cancel")}</Button>
            {/* Filtered down to nothing: there is no row for a name or a
                definition-of-done to land on, so Save has no target. */}
            <Button loading={taskMut.isPending || critMut.isPending}
              disabled={anyFilter && !applyN} onClick={saveCol}>{t("admin.ltasks.save")}</Button>
          </>}>
          {/* One scope statement for the whole modal — every field below it
              writes to the same rows, so it is said once, at the top, before
              anything is typed. */}
          {anyFilter && (
            <div className="rounded-xl px-3 py-2 mb-1 text-[11px] leading-snug"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              {(applyScope.level === "leader"
                ? t("admin.ltasks.colScopedLead") : t("admin.ltasks.colScopedMgr")).replace("{n}", applyN)}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{t("admin.ltasks.rename")}</p>
            {LANGS.map((l) => (
              <FormField key={l} label={`${t("admin.ltasks.taskName")} (${LANG_LABELS[l]})`}>
                <input value={col.names?.[l] || ""} onChange={(e) => setCol((c) => ({ ...c, names: { ...c.names, [l]: e.target.value } }))} className={inputCls} style={inputStyle} />
              </FormField>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} className="my-3" />
          {/* The GROUPED definition-of-done: every supervisor and leader who
              has not written their own inherits this one, so editing it here
              is how the whole platform's answer to "what counts as done" is
              set in one place. */}
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              {anyFilter ? t("admin.ltasks.criteriaScoped") : t("admin.ltasks.criteriaGlobal")}
            </p>
            {criteriaField(col.criteria, (v) => setCol((c) => ({ ...c, criteria: v })), "")}
            <div className="pt-1">
              {/* Examples are keyed per TASK — there is no per-row storage, so
                  the filter genuinely cannot scope them. Say so rather than
                  letting the scope banner above imply otherwise. */}
              <TaskExamples ids={colTask.examples || []} busy={exAddMut.isPending}
                note={anyFilter ? t("admin.ltasks.examplesGlobalNote") : null}
                onUpload={uploadExample} onAskDelete={askDeleteExample} t={t} />
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} className="my-3" />
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>{t("admin.ltasks.applyAll")}</p>
            <p className="text-[11px]" style={{ color: C_WARN }}>{applyMsg()}</p>
            <FormField label={t("admin.ltasks.status")} required>{statusToggle(col.enabled, (v) => setCol((c) => ({ ...c, enabled: v })))}</FormField>
            {numField(t("admin.ltasks.minMedia"), col.min_media, (v) => setCol((c) => ({ ...c, min_media: v })), 20)}
            {numField(t("admin.ltasks.weight"), col.weight, (v) => setCol((c) => ({ ...c, weight: v })), 100)}
            {/* The target rides along explicitly, so the write can never reach
                past the matrix the admin is looking at. */}
            <Button size="sm" variant="secondary" disabled={!applyN}
              onClick={() => askApplyAll({
                task_id: col.tid, enabled: col.enabled,
                min_media: Number(col.min_media) || 0, weight: Number(col.weight) || 0,
                when: col.when,
                ...(applyScope.level === "leader"
                  ? { leader_ids: applyScope.ids } : { manager_ids: applyScope.ids }),
              })}>{applyLabel()}</Button>
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
            <div aria-hidden="true">
              {["w-1/2", "w-2/5", "w-3/5", "w-1/3", "w-1/2"].map((w, i) => (
                <div key={i} className="flex items-center gap-2 px-1 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <SkeletonBlock className="h-4 w-16" />
                  <SkeletonBlock className={`h-3.5 ${w}`} />
                  <SkeletonBlock className="h-3 w-24 ml-auto" />
                </div>
              ))}
            </div>
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
          confirmLabel={confirm.confirmLabel} cancelLabel={t("admin.broadcast.cancel")} error={confirm.error}
          loading={cancelMut.isPending || revertMut.isPending || leaderMut.isPending || applyMut.isPending || exDelMut.isPending}
          onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm} />
      )}

      <Toast open={toast} message={t("admin.ltasks.saved")} onClose={() => setToast(false)} />
      {toast2.node}
    </div>
  );
}
