import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Calendar, Camera, CheckCircle, ChevronDown, ChevronRight,
  Clock, History, ImagePlus, ListChecks, Radio, RotateCcw, Trash2, UserCog,
  Users, X,
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
// The date rule as ONE value in the UI and TWO booleans on the wire — the same
// three modes the backend resolves (leader_ai.resolve_date_check +
// resolve_time_check). Read `date_check` FIRST: False answers the hour question
// too, so a row carrying `time_check` under an exempt date is not a fourth mode,
// just a leftover, and must still read as «off».
const dcMode = (v) => (v?.date_check === false ? "off"
  : v?.time_check === false ? "day" : "full");
const dcModeValues = (m) => ({ date_check: m !== "off", time_check: m === "full" });
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

/**
 * A native time input WITH a way back to blank. Blank is a real value on these
 * fields — it means "inherit the level above" — but no engine gives it an
 * affordance: Chrome wants a Delete on the focused segment, and Telegram's iOS
 * wheel picker has no clear at all, so on the primary device a time set once
 * could never be unset. The ✕ shows only when the field holds a value, and it
 * sits OUTSIDE the input, clear of whatever picker indicator the engine draws
 * inside the right edge.
 */
/** A cell whose proofs are SHOT in the app rather than uploaded. The matrix is
 *  read as a grid of weights, so the one thing that changes where the leader
 *  answers has to be visible without opening anything. */
function CamMark() {
  return (
    <Camera size={9} strokeWidth={2.6}
      className="absolute left-1 top-1 pointer-events-none"
      style={{ color: "var(--brand)" }} />
  );
}


function TimeInput({ value, placeholder, onChange, clearTitle }) {
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input type="time" value={value || ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls} style={inputStyle} />
      {value ? (
        <Button variant="ghost" tint size="lg" className="shrink-0"
          style={{ paddingInline: 8 }} icon={<X size={14} />}
          title={clearTitle} aria-label={clearTitle}
          onClick={() => onChange("")} />
      ) : null}
    </div>
  );
}

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
    if (d === "camera_needs_a_unit") { toast2.error(t("admin.ltasks.proofNeedsUnit")); return; }
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
  // The proof-photo window rides the same instant path as the criteria — but
  // unlike them it also re-judges verdicts already written, from the clock each
  // one stored, so an edit fixes the existing queue and not just future
  // reports. Nothing to stage: the bot reads the live value too.
  const winMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/window", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // The submission deadline is informational (shown to leaders on the /leaders
  // «Vazifalar» tab, judged by nothing), so it applies at once like the window
  // and has nothing to re-derive.
  const dlMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/deadline", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // "Is the photo's date judged at all" — instant AND re-judging, exactly like
  // the window: unticking it clears the date flags off reports already checked
  // (and the deductions they caused in the automatic regime), ticking it back
  // on restores them, both from stored clocks with no AI call.
  const dcMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/date-check", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // The middle mode: judge the DAY, never the hour. Its own endpoint, written
  // right after the one above and never in parallel with it (see saveDateRule)
  // — both materialise the SAME override row, and two concurrent inserts race
  // its unique key.
  const tcMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/time-check", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // WHERE the leader answers this task — the bot chat, or the mini-app camera.
  // Instant and never staged, unlike enabled/photos/weight: this is the one
  // field that changes what the leader is asked to DO, and a staged version
  // would leave the bot offering an upload for a task whose proofs are supposed
  // to be shot in the app for a whole shift. Nothing to re-judge: photos
  // already collected keep the clocks they were judged by.
  const pkMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/proof-kind", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
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
  const getCell = (mid, tid) => settings[String(mid)]?.[String(tid)] ?? { enabled: true, min_media: 1, weight: 0, names: {}, criteria: null, win_from: null, win_to: null, deadline: null, date_check: null, time_check: null, proof_kind: null };
  // The definition of done actually in force for a cell, walking the same
  // chain the backend reviewer walks: leader → supervisor → global.
  const critOf = (tid) => tasks.find((x) => x.id === tid)?.criteria || "";
  const supCrit = (mid, tid) => getCell(mid, tid).criteria || critOf(tid);

  // ── the proof-photo window ────────────────────────────────────────────────
  // Same chain, resolved per END (`k` is "win_from" or "win_to"), because both
  // inputs are independently optional: a supervisor may set only a closing time
  // and keep the opening they inherit. What a blank falls back to comes from the
  // SERVER (`shift_windows`) rather than being restated here — a placeholder
  // that disagreed with the hours the reviewer judges against would be worse
  // than no placeholder at all.
  const shiftWins = data?.shift_windows || {};
  const shiftOf = (mid) => managers.find((m) => m.id === mid)?.shift ?? 1;
  const winDefault = (shift, k) => (shiftWins[String(shift)] || [])[k === "win_from" ? 0 : 1] || "";
  const winOf = (tid, k) => tasks.find((x) => x.id === tid)?.[k] || "";
  // Placeholders: what this level would inherit if left blank.
  const supWinPh = (mid, tid, k) => winOf(tid, k) || winDefault(shiftOf(mid), k);
  const leadWinPh = (mid, tid, k) => getCell(mid, tid)[k] || supWinPh(mid, tid, k);
  // The global level serves BOTH shifts, so it cannot name one default — it
  // names both, labelled, instead of quietly showing shift 1's.
  const globalWinPh = (k) => Object.keys(shiftWins).sort()
    .map((s) => `${s}: ${winDefault(s, k)}`).join(" · ");
  // ── the submission deadline ──────────────────────────────────────────────
  // Same chain, ONE clock, no shift default: blank everywhere means the tab
  // shows the day's filing deadline instead, so the placeholder says that.
  const dlOf = (tid) => tasks.find((x) => x.id === tid)?.deadline || "";
  const supDlPh = (mid, tid) => dlOf(tid);
  const leadDlPh = (mid, tid) => getCell(mid, tid).deadline || supDlPh(mid, tid);
  // ── how the photo's DATE is judged ────────────────────────────────────────
  // Same chain, but BOOLEANS, so "inherit" cannot be a blank field — it is
  // expressed the way `enabled`/`weight` express it: the control opens on the
  // value in force, and Save sends null when it still equals what that level
  // inherits. `?? ` and not `||`: the meaningful value here is FALSE, and `||`
  // would read an inherited exemption as unset every time.
  //
  // TWO booleans, ONE control (see dateRuleField): the reader picks a mode and
  // the pair is derived from it, because "date off + time on" is not a mode
  // anybody means. They still resolve INDEPENDENTLY per level — like the two
  // window ends — so a supervisor may narrow one and keep inheriting the other.
  const dcOf = (tid) => tasks.find((x) => x.id === tid)?.date_check !== false;
  const supDc = (mid, tid) => getCell(mid, tid).date_check ?? dcOf(tid);
  const tcOf = (tid) => tasks.find((x) => x.id === tid)?.time_check !== false;
  const supTc = (mid, tid) => getCell(mid, tid).time_check ?? tcOf(tid);
  // ── how the proof is collected ────────────────────────────────────────────
  // Same chain, a STRING, so "inherit" really is the blank the other text
  // fields use — but the control is a two-way pick like the date rule, for the
  // same reason: the values that matter are the switch itself, and a control
  // whose "screenshot" and "unset" look identical is how a unit gets moved onto
  // the camera by accident.
  const pkOf = (tid) => tasks.find((x) => x.id === tid)?.proof_kind || "screenshot";
  const supPk = (mid, tid) => getCell(mid, tid).proof_kind || pkOf(tid);
  const supTaskName = (mid, task) => getCell(mid, task.id).names?.[lang] || tname(task);
  // The name a leader INHERITS in one language: the supervisor's own rename
  // when they wrote one, else the global name (NOT NULL, so never blank).
  const supNameOf = (mid, tid, l) => getCell(mid, tid).names?.[l] || tasks.find((x) => x.id === tid)?.name?.[l] || "";
  const getOv = (lid, tid) => leaderSettings[String(lid)]?.[String(tid)] ?? null;
  const leadEff = (lid, mid, tid) => {
    const base = getCell(mid, tid);
    const ov = getOv(lid, tid);
    return { enabled: ov?.enabled ?? base.enabled, min_media: ov?.min_media ?? base.min_media, weight: ov?.weight ?? base.weight };
  };
  // What a LEADER's proof mode resolves to — their own override, else the
  // brigadir's, else global. The row's 📷 is read straight off this, so the
  // matrix answers "will the bot offer this person the camera" without anyone
  // having to open a modal and reason about inheritance.
  const leadPk = (lid, mid, tid) => getOv(lid, tid)?.proof_kind || supPk(mid, tid);
  const leadTaskName = (lid, mid, task) => getOv(lid, task.id)?.names?.[lang] || supTaskName(mid, task);
  // What the leader modal INHERITS for its text fields, per field: names by
  // language, the definition of done, each window end, the deadline — the
  // value the supervisor's row resolves to (their override, else global, and
  // for the window on to the shift default). The modal opens on exactly these,
  // and Save treats "still equal to this" as inherit — see saveLeaderCell.
  const leadInherit = (mid, tid) => ({
    names: Object.fromEntries(LANGS.map((l) => [l, supNameOf(mid, tid, l)])),
    criteria: supCrit(mid, tid),
    win_from: leadWinPh(mid, tid, "win_from"),
    win_to: leadWinPh(mid, tid, "win_to"),
    deadline: leadDlPh(mid, tid),
    date_check: supDc(mid, tid),
    time_check: supTc(mid, tid),
    proof_kind: supPk(mid, tid),
  });

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

  // The leader modal opens on the value IN FORCE for every field — the
  // leader's own override where one exists, else what the supervisor's row
  // resolves to — the same way enabled / photos / weight always did. The text
  // fields used to open EMPTY with the inherited value as a placeholder, which
  // read as inherited right up to the first keystroke, when it vanished and
  // the admin had to retype a whole definition-of-done to change one word.
  const openLeaderCell = (p, mid, task) => {
    const ov = getOv(p.id, task.id);
    const eff = leadEff(p.id, mid, task.id);
    const inh = leadInherit(mid, task.id);
    setLcell({
      lid: p.id, mid, tid: task.id, hasOv: !!ov, when: "now",
      enabled: eff.enabled, min_media: eff.min_media, weight: eff.weight,
      names: Object.fromEntries(LANGS.map((l) => [l, ov?.names?.[l] || inh.names[l]])),
      criteria: ov?.criteria || inh.criteria,
      win_from: ov?.win_from || inh.win_from, win_to: ov?.win_to || inh.win_to,
      deadline: ov?.deadline || inh.deadline,
      date_check: ov?.date_check ?? inh.date_check,
      time_check: ov?.time_check ?? inh.time_check,
      proof_kind: ov?.proof_kind || inh.proof_kind,
    });
  };
  const openLeaderByIds = (p, tid) => { const task = tasks.find((x) => x.id === tid); if (task) { setShowExc(false); openLeaderCell(p, p.manager_id, task); } };

  // Criteria never stage, so they are saved on their own endpoint alongside
  // whatever the cell's own Save does — one button, two writes, because an
  // admin editing a cell does not care which field routes where.
  const saveCriteria = (draft, stored, ids) => {
    if ((draft || "") === (stored || "")) return undefined;
    return critMut.mutateAsync({ ...ids, criteria: draft || "" });
  };

  // Skipped when unchanged like the criteria — and for a sharper reason here:
  // every window write re-derives that task's existing verdicts, so a no-op
  // save would churn the triage queue for a modal the admin only opened to read.
  const saveWindow = (draft, stored, ids) => {
    const from = draft?.win_from || "";
    const to = draft?.win_to || "";
    if (from === (stored?.win_from || "") && to === (stored?.win_to || "")) return undefined;
    return winMut.mutateAsync({ ...ids, win_from: from, win_to: to });
  };
  const saveDeadline = (draft, stored, ids) => {
    const v = draft?.deadline || "";
    if (v === (stored?.deadline || "")) return undefined;
    return dlMut.mutateAsync({ ...ids, deadline: v });
  };
  // Same shape as the date rule's writer: the draft opens on the value IN
  // FORCE, so a draft still equal to what this level inherits goes out as null
  // ("keep inheriting") and only a divergence is stored. `inherited` is
  // undefined at the GLOBAL level, which inherits from nothing.
  const saveProofKind = async (draft, stored, inherited, ids) => {
    const v = draft?.proof_kind || "screenshot";
    const out = inherited === undefined ? v : (v === inherited ? null : v);
    if (out === (stored?.proof_kind ?? null)) return true;
    try {
      await pkMut.mutateAsync({ ...ids, proof_kind: out });
    } catch { return false; }
    return true;
  };
  // The boolean twin of saveWindow, and skipped-when-unchanged for the same
  // reason: a write re-derives every verdict of that task, so a no-op save
  // would churn the triage queue for a modal opened only to read.
  //
  // `inherited` is what this level would resolve to with no override of its own
  // (undefined at the GLOBAL level, which inherits from nothing) — a draft
  // still equal to it goes out as null, i.e. "keep inheriting", exactly as the
  // leader modal's numbers do. `stored` is the level's RAW value, null when it
  // holds no override, which is what makes the no-op test correct in both
  // directions: pinning True where True was inherited is a real change.
  //
  // The two flags of the date rule go out one AFTER the other, awaited, never
  // fired together: both materialise the same override row when the level has
  // none, and two concurrent inserts race its unique key. Awaiting also means a
  // failure stops the pair instead of half-applying a mode nobody picked.
  // Returns whether both writes landed, and NEVER rejects: two of its three
  // callers fire it without awaiting (the cell and column modals, like every
  // other writer there), and a rejected promise nobody catches is a console
  // error on a failure the mutation's own onError has already toasted.
  const saveDateRule = async (draft, stored, inherited, ids) => {
    for (const [key, mut] of [["date_check", dcMut], ["time_check", tcMut]]) {
      const v = draft?.[key] !== false;
      const inh = inherited?.[key];
      const out = inh === undefined ? v : (v === inh ? null : v);
      if (out === (stored?.[key] ?? null)) continue;
      try {
        await mut.mutateAsync({ ...ids, [key]: out });
      } catch {
        return false;
      }
    }
    return true;
  };

  // Every field of this modal lands on the SAME leader_task_settings row, and a
  // brigadir who has never been edited has no row at all — so fired together,
  // two of these INSERT it concurrently and one dies on the unique key. That is
  // not theoretical: it is how the camera pilot's very first unit saved
  // "successfully" and came back screenshot (user, 2026-08-19), and it is the
  // trap the leader modal was already written around. One after another, each
  // step skipping what is already stored, a failure stopping the chain — its
  // own onError has raised the toast and the modal stays open, so a retry runs
  // from live state.
  const saveCell = async () => {
    const stored = getCell(cell.mid, cell.tid);
    const ids = { task_id: cell.tid, manager_id: cell.mid };
    try {
      await saveCriteria(cell.criteria, stored.criteria, ids);
      await saveWindow(cell, stored, ids);
      await saveDeadline(cell, stored, ids);
      if (!await saveDateRule(cell, stored,
        { date_check: dcOf(cell.tid), time_check: tcOf(cell.tid) }, ids)) return;
      if (!await saveProofKind(cell, stored, pkOf(cell.tid), ids)) return;
    } catch { return; }
    cellMut.mutate({
      ...ids,
      enabled: cell.enabled,
      min_media: Number(cell.min_media) || 0, weight: Number(cell.weight) || 0,
      names: Object.fromEntries(LANGS.map((l) => [l, cell.names?.[l] || ""])),
      when: cell.when,
    });
  };

  // A leader-modal text left EQUAL to what it inherits is not an override:
  // it goes out as "" (clear / inherit), and only a diverging value is stored.
  const ownText = (v, inherited) => {
    const s = (v || "").trim();
    return s === (inherited || "").trim() ? "" : s;
  };
  // Every field of the leader modal opens on the value in force, so "inherit"
  // is expressed by leaving it equal to the supervisor's — the payload sends
  // "" / null for those and a value only where the admin diverged (the numbers
  // always worked this way; the texts now do too). The four writers behind
  // the one Save button all land on the SAME override row (criteria, window
  // and deadline are materialised onto it by their own endpoints), so they
  // run one after another: fired together they raced the row's unique key,
  // and the cell write — arriving last — decided whether the criteria just
  // written survived. A failed step stops the chain: its onError has already
  // raised the toast and the modal stays open, so a retry runs from live
  // state, each step skipping what is already stored.
  const saveLeaderCell = async () => {
    const { lid, mid, tid } = lcell;
    const base = getCell(mid, tid);
    const ov = getOv(lid, tid);
    const inh = leadInherit(mid, tid);
    const ids = { task_id: tid, leader_id: lid };
    const mm = Number(lcell.min_media) || 0;
    const w = Number(lcell.weight) || 0;
    const criteria = ownText(lcell.criteria, inh.criteria);
    const win_from = ownText(lcell.win_from, inh.win_from);
    const win_to = ownText(lcell.win_to, inh.win_to);
    const deadline = ownText(lcell.deadline, inh.deadline);
    try {
      if (criteria !== (ov?.criteria || ""))
        await critMut.mutateAsync({ ...ids, criteria });
      if (win_from !== (ov?.win_from || "") || win_to !== (ov?.win_to || ""))
        await winMut.mutateAsync({ ...ids, win_from, win_to });
      if (deadline !== (ov?.deadline || ""))
        await dlMut.mutateAsync({ ...ids, deadline });
      // Not a throw — see saveDateRule — so the chain stops on the answer.
      if (!await saveDateRule(lcell, ov, inh, ids)) return;
      if (!await saveProofKind(lcell, ov, inh.proof_kind, ids)) return;
    } catch { return; }
    leaderMut.mutate({
      ...ids,
      enabled: lcell.enabled === base.enabled ? null : lcell.enabled,
      min_media: mm === Number(base.min_media) ? null : mm,
      weight: w === Number(base.weight) ? null : w,
      names: Object.fromEntries(LANGS.map((l) => [l, ownText(lcell.names?.[l], inh.names[l])])),
      when: lcell.when,
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

  // The leader modal's rule — equal to the brigadir's ⇒ inherited, changed ⇒
  // this leader only — shown PER FIELD while typing, as a small mark beside
  // the label of every field that currently differs, instead of only stated in
  // a sentence at the top that nobody re-reads mid-edit. Null when nothing
  // differs, so the field helpers can take it as an optional trailing arg and
  // the other modals (which pass none) render exactly as before.
  const changedPill = (differs) => (differs ? (
    <span className="ml-1.5 align-middle rounded px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal"
      style={{ background: "rgba(200,151,63,0.12)", color: "var(--brand)", border: "1px solid rgba(200,151,63,0.35)" }}>
      {t("admin.ltasks.changed")}
    </span>
  ) : null);
  const withMark = (label, mark) => (mark ? <>{label}{mark}</> : label);

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
  const criteriaField = (value, onChange, inherited, mark) => (
    <FormField label={withMark(t("admin.ltasks.criteria"), mark)} hint={t("admin.ltasks.criteriaHint")}>
      <textarea rows={4} value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={inherited || t("admin.ltasks.criteriaPh")}
        className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 84 }} />
    </FormField>
  );
  // When a proof photo for this task may have been taken. TWO inputs, both
  // optional: an empty end inherits the level above, and the placeholder shows
  // exactly what that end would then be — the same value the reviewer uses and
  // the bot prints to the leader. Both go through the local TimeInput (there is
  // no time template in components/ui; the date rule covers date pickers),
  // styled like every other field in these modals so the row keeps the modal's
  // baseline — and each end carries its own ✕ back to blank.
  const windowField = (value, onChange, phFrom, phTo, mark) => (
    <FormField label={withMark(t("admin.ltasks.window"), mark)} hint={t("admin.ltasks.windowHint")}>
      <div className="flex items-center gap-2">
        <TimeInput value={value?.win_from} placeholder={phFrom}
          onChange={(v) => onChange({ win_from: v })} clearTitle={t("admin.ltasks.timeClear")} />
        <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>—</span>
        <TimeInput value={value?.win_to} placeholder={phTo}
          onChange={(v) => onChange({ win_to: v })} clearTitle={t("admin.ltasks.timeClear")} />
      </div>
      {/* A time input renders "--:--" when empty, which reads as broken rather
          than as inherited, so the inherited pair is spelled out under it. */}
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        {t("admin.ltasks.windowInherit")
          .replace("{from}", phFrom || "—").replace("{to}", phTo || "—")}
      </div>
    </FormField>
  );
  // By when the task should be submitted — ONE clock, informational: it is
  // what the /leaders «Vazifalar» tab tells the leader, nothing scores against
  // it. Blank inherits the level above; blank everywhere and the tab prints
  // the day's filing deadline instead, which the inherit line says.
  const deadlineField = (value, onChange, ph, mark) => (
    <FormField label={withMark(t("admin.ltasks.deadline"), mark)} hint={t("admin.ltasks.deadlineHint")}>
      <div className="flex items-center gap-2">
        <TimeInput value={value?.deadline} placeholder={ph}
          onChange={(v) => onChange({ deadline: v })} clearTitle={t("admin.ltasks.timeClear")} />
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        {ph ? t("admin.ltasks.deadlineInherit").replace("{t}", ph) : t("admin.ltasks.deadlineDay")}
      </div>
    </FormField>
  );
  // HOW the photo's date is judged — three mutually-exclusive modes. Sits
  // directly under the window it governs, because in two of the three that
  // window is not a rule at all, and the hint says which rather than leaving
  // two controls that look equally binding.
  //
  // One pick, not two toggles: the pair (date_check, time_check) has four
  // combinations and only three meanings — "the day is not judged" already
  // answers the hour question — so offering the fourth would let an admin
  // choose a state the backend cannot distinguish from another.
  //
  // A pick and not a blank-means-inherit field for the same reason as before:
  // the values that matter are the relaxations, and a control whose "off" and
  // "unset" look identical is how an exemption gets switched on by accident.
  const dateRuleField = (value, onChange, mark) => (
    <FormField label={withMark(t("admin.ltasks.dateCheck"), mark)}
      hint={t(`admin.ltasks.dateHint.${dcMode(value)}`)}>
      <SegmentedToggle fill value={dcMode(value)}
        onChange={(m) => onChange(dcModeValues(m))}
        options={[["full", t("admin.ltasks.dateFull")],
                  ["day", t("admin.ltasks.dateDayOnly")],
                  ["off", t("admin.ltasks.dateOff")]]} />
    </FormField>
  );
  // WHERE the leader answers this task. Two modes, one pick, and the hint spells
  // out what each one costs the leader — because switching to camera removes
  // their upload path entirely, and an admin flipping it has to know that
  // before they save, not after the first leader reports the bot "not
  // accepting" their photo.
  const proofKindField = (value, onChange, mark, scope) => {
    const v = value?.proof_kind || "screenshot";
    return (
      <FormField label={withMark(t("admin.ltasks.proofKind"), mark)}
        hint={`${t(`admin.ltasks.proofHint.${v}`)}${
          scope ? ` ${t(`admin.ltasks.proofScope.${scope}`).replace("{n}", applyN)}` : ""}`}>
        <SegmentedToggle fill value={v}
          onChange={(k) => onChange({ proof_kind: k })}
          options={[["screenshot", t("admin.ltasks.proofScreenshot")],
                    ["camera", t("admin.ltasks.proofCamera")]]} />
      </FormField>
    );
  };
  const nameFields = (names, setName, placeholderFor, markFor) =>
    LANGS.map((l) => (
      <FormField key={l} label={withMark(`${t("admin.ltasks.taskName")} (${LANG_LABELS[l]})`, markFor?.(l))}>
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
    // Same scoped-seed rule as the criteria: under a filter the modal writes
    // the visible rows, so it shows THEIR raw window, not the global one.
    const win0 = anyFilter
      ? (lead0
        ? { win_from: getOv(lead0.id, task.id)?.win_from || "", win_to: getOv(lead0.id, task.id)?.win_to || "" }
        : { win_from: getCell(rows[0]?.m.id, task.id).win_from || "", win_to: getCell(rows[0]?.m.id, task.id).win_to || "" })
      : { win_from: task.win_from || "", win_to: task.win_to || "" };
    const deadline0 = (anyFilter
      ? (lead0
        ? getOv(lead0.id, task.id)?.deadline
        : getCell(rows[0]?.m.id, task.id).deadline)
      : task.deadline) || "";
    // A boolean has no blank state, so under a filter these seed on the value in
    // FORCE for the visible rows (not their raw null) — and `dc0raw` keeps the
    // raw pair beside it, because "already stored here" is what decides whether
    // Save writes anything. Unfiltered, the level IS global: the two agree.
    const ov0 = lead0 ? getOv(lead0.id, task.id) : null;
    const cell0 = lead0 ? null : getCell(rows[0]?.m.id, task.id);
    const dcInh = anyFilter
      ? (lead0
        ? { date_check: supDc(lead0.manager_id, task.id),
            time_check: supTc(lead0.manager_id, task.id) }
        : { date_check: dcOf(task.id), time_check: tcOf(task.id) })
      : {};
    const dc0raw = anyFilter
      ? { date_check: (lead0 ? ov0?.date_check : cell0.date_check) ?? null,
          time_check: (lead0 ? ov0?.time_check : cell0.time_check) ?? null }
      : { date_check: task.date_check !== false, time_check: task.time_check !== false };
    // Seeded like the date rule: under a filter, what the visible rows collect
    // through, plus the RAW value so Save knows whether anything is stored at
    // this level. Unfiltered there is nothing to seed — the control is not
    // offered, because this modal would write the global level (see below).
    const pkInh = anyFilter
      ? (lead0 ? supPk(lead0.manager_id, task.id) : pkOf(task.id))
      : undefined;
    const pk0raw = anyFilter
      ? ((lead0 ? ov0?.proof_kind : cell0.proof_kind) || null)
      : null;
    setCol({
      proof_kind: pk0raw || pkInh || "screenshot", pk0raw, pkInh,
      tid: task.id, enabled: f.enabled, min_media: f.min_media, weight: f.weight,
      names: { ...names0 }, names0, criteria: criteria0, criteria0, when: "now",
      ...win0, win0, deadline: deadline0, deadline0,
      date_check: dc0raw.date_check ?? dcInh.date_check,
      time_check: dc0raw.time_check ?? dcInh.time_check,
      dc0raw, dcInh,
    });
  };
  // The filter that armed this modal may be a whole SHIFT, not one brigadir —
  // and this is the field that changes what a leader is asked to DO, in a
  // feature that has already reached people who were never meant to have it.
  // So a proof-kind change spanning more than one row states the count and
  // waits for a yes; everything else on the modal saves as it always did.
  const askSaveCol = () => {
    const before = col.pk0raw || col.pkInh || "screenshot";
    const after = col.proof_kind || "screenshot";
    if (!anyFilter || after === before || applyN <= 1) { saveCol(); return; }
    setConfirm({
      title: t("admin.ltasks.proofKind"),
      message: t(`admin.ltasks.proofConfirm.${applyScope.level === "leader" ? "leaders" : "units"}`)
        .replace("{n}", applyN)
        .replace("{mode}", t(`admin.ltasks.proofMode.${after}`)),
      tone: "warning",
      confirmLabel: t("admin.ltasks.save"),
      onConfirm: () => { setConfirm(null); saveCol(); },
    });
  };

  const saveCol = async () => {
    const ids = colScope();
    const target = { task_id: col.tid, ...ids };
    try {
      await saveCriteria(col.criteria, col.criteria0, target);
      await saveWindow(col, col.win0, target);
      await saveDeadline(col, { deadline: col.deadline0 }, target);
      if (!await saveDateRule(col, col.dc0raw, col.dcInh, target)) return;
      // Only under a filter: unfiltered, `target` carries no ids and the write
      // would land on the global level, which every unit inherits.
      if (anyFilter && !await saveProofKind(col, { proof_kind: col.pk0raw },
        col.pkInh, target)) return;
    } catch { return; }
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
  // What the open leader modal compares against: the brigadir's cell for the
  // numbers/status, the resolved chain for the texts (see leadInherit).
  const lBase = lcell && getCell(lcell.mid, lcell.tid);
  const lInh = lcell && leadInherit(lcell.mid, lcell.tid);

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
                                title={`${supTaskName(m.id, task)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · ${t("admin.ltasks.photos")} ${c.min_media} · ${c.weight}% · ${t(`admin.ltasks.proofMode.${supPk(m.id, task.id)}`)}`}
                                onClick={() => setCell({ mid: m.id, tid: task.id, ...c, criteria: c.criteria || "", win_from: c.win_from || "", win_to: c.win_to || "", date_check: supDc(m.id, task.id), time_check: supTc(m.id, task.id), proof_kind: supPk(m.id, task.id), when: "now" })}
                                className="relative w-full h-9 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold tabular-nums rounded"
                                style={cellStyle(c)}>
                                {c.weight}%
                                {c.min_media > 1 && <MediaDots n={c.min_media} />}
                                {supPk(m.id, task.id) === "camera" && <CamMark />}
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
                                  title={`${leadTaskName(p.id, m.id, task)} · ${c.enabled ? t("admin.ltasks.enabled") : t("admin.ltasks.disabled")} · ${t("admin.ltasks.photos")} ${c.min_media} · ${c.weight}% · ${t(`admin.ltasks.proofMode.${leadPk(p.id, m.id, task.id)}`)}${ov ? ` · ${t("admin.ltasks.overridden")}` : ""}`}
                                  onClick={() => openLeaderCell(p, m.id, task)}
                                  className="relative w-full h-8 transition-opacity hover:opacity-75 grid place-items-center text-[11px] font-bold tabular-nums rounded"
                                  style={{ ...cellStyle(c), boxShadow: ov ? OV_RING : undefined }}>
                                  {c.weight}%
                                  {c.min_media > 1 && <MediaDots n={c.min_media} />}
                                  {leadPk(p.id, m.id, task.id) === "camera" && <CamMark />}
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
            <Button loading={cellMut.isPending || critMut.isPending || winMut.isPending || dlMut.isPending || dcMut.isPending || tcMut.isPending || pkMut.isPending} onClick={saveCell}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.supNameHint")}</p>
          {nameFields(cell.names, (l, v) => setCell((c) => ({ ...c, names: { ...c.names, [l]: v } })), (l) => cellTask?.name?.[l] || "")}
          <FormField label={t("admin.ltasks.status")} required>{statusToggle(cell.enabled, (v) => setCell((c) => ({ ...c, enabled: v })))}</FormField>
          {numField(t("admin.ltasks.minMedia"), cell.min_media, (v) => setCell((c) => ({ ...c, min_media: v })), 20)}
          {proofKindField(cell, (v) => setCell((c) => ({ ...c, ...v })), null, "unit")}
          {numField(t("admin.ltasks.weight"), cell.weight, (v) => setCell((c) => ({ ...c, weight: v })), 100)}
          {criteriaField(cell.criteria, (v) => setCell((c) => ({ ...c, criteria: v })), critOf(cell.tid))}
          {windowField(cell, (v) => setCell((c) => ({ ...c, ...v })),
            supWinPh(cell.mid, cell.tid, "win_from"), supWinPh(cell.mid, cell.tid, "win_to"))}
          {dateRuleField(cell, (v) => setCell((c) => ({ ...c, ...v })))}
          {deadlineField(cell, (v) => setCell((c) => ({ ...c, ...v })), supDlPh(cell.mid, cell.tid))}
          <WhenBar when={cell.when} setWhen={(v) => setCell((c) => ({ ...c, when: v }))} nextDate={cellNext} t={t} />
        </Modal>
      )}

      {/* Leader cell modal */}
      {lcell && (
        <Modal title={t("admin.ltasks.leaderCellTitle")} subtitle={tl(leaders.find((p) => p.id === lcell.lid)?.name || "")} icon={<ListChecks size={14} />} onClose={() => setLcell(null)}
          footer={<>
            {lcell.hasOv && <Button variant="danger" className="mr-auto" icon={<RotateCcw size={14} />} onClick={askReset}>{t("admin.ltasks.reset")}</Button>}
            <Button variant="secondary" onClick={() => setLcell(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={leaderMut.isPending || critMut.isPending || winMut.isPending || dlMut.isPending || dcMut.isPending || tcMut.isPending || pkMut.isPending} onClick={saveLeaderCell}>{t("admin.ltasks.save")}</Button>
          </>}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.leaderHint")}</p>
          {/* Every field opens on the value in force and carries a «changed»
              mark the moment it differs from what the brigadir's row resolves
              to — the placeholders still name the inherited value for a field
              the admin empties, which is how a leader is sent back to inherit. */}
          {nameFields(lcell.names, (l, v) => setLcell((c) => ({ ...c, names: { ...c.names, [l]: v } })),
            (l) => lInh.names[l],
            (l) => changedPill(ownText(lcell.names?.[l], lInh.names[l]) !== ""))}
          <FormField label={withMark(t("admin.ltasks.status"), changedPill(lcell.enabled !== lBase.enabled))} required>
            {statusToggle(lcell.enabled, (v) => setLcell((c) => ({ ...c, enabled: v })))}
          </FormField>
          {numField(withMark(t("admin.ltasks.minMedia"), changedPill((Number(lcell.min_media) || 0) !== Number(lBase.min_media))),
            lcell.min_media, (v) => setLcell((c) => ({ ...c, min_media: v })), 20)}
          {numField(withMark(t("admin.ltasks.weight"), changedPill((Number(lcell.weight) || 0) !== Number(lBase.weight))),
            lcell.weight, (v) => setLcell((c) => ({ ...c, weight: v })), 100)}
          {criteriaField(lcell.criteria, (v) => setLcell((c) => ({ ...c, criteria: v })), lInh.criteria,
            changedPill(ownText(lcell.criteria, lInh.criteria) !== ""))}
          {windowField(lcell, (v) => setLcell((c) => ({ ...c, ...v })), lInh.win_from, lInh.win_to,
            changedPill(ownText(lcell.win_from, lInh.win_from) !== "" || ownText(lcell.win_to, lInh.win_to) !== ""))}
          {dateRuleField(lcell, (v) => setLcell((c) => ({ ...c, ...v })),
            changedPill(dcMode(lcell) !== dcMode(lInh)))}
          {proofKindField(lcell, (v) => setLcell((c) => ({ ...c, ...v })),
            changedPill((lcell.proof_kind || "screenshot") !== lInh.proof_kind), "leader")}
          {deadlineField(lcell, (v) => setLcell((c) => ({ ...c, ...v })), lInh.deadline,
            changedPill(ownText(lcell.deadline, lInh.deadline) !== ""))}
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
            <Button loading={taskMut.isPending || critMut.isPending || winMut.isPending || dlMut.isPending || dcMut.isPending || tcMut.isPending || pkMut.isPending}
              disabled={anyFilter && !applyN} onClick={askSaveCol}>{t("admin.ltasks.save")}</Button>
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
            {/* Unfiltered this writes the GLOBAL level, which both shifts
                inherit — so the placeholder names both shift defaults rather
                than picking one. Under a filter it writes the visible rows. */}
            {windowField(col, (v) => setCol((c) => ({ ...c, ...v })),
              anyFilter ? "" : globalWinPh("win_from"),
              anyFilter ? "" : globalWinPh("win_to"))}
            {dateRuleField(col, (v) => setCol((c) => ({ ...c, ...v })),
              changedPill(anyFilter && dcMode(col) !== dcMode(col.dcInh)))}
            {/* Proof kind appears here ONLY under a filter, where this modal
                writes the rows the matrix is showing. Unfiltered it writes the
                GLOBAL level — which every unit inherits — and that is exactly
                how one test unit's camera setting reached every leader on the
                platform (user, 2026-08-19). Rather than hide the control and
                leave the admin clicking thirteen cells one at a time, the
                control is present exactly when its scope is a named set, and
                the sentence in its place says how to get there. The backend
                refuses a global camera too (CAMERA_IS_PILOT), so this is not
                the only thing holding the line. */}
            {anyFilter ? (
              proofKindField(col, (v) => setCol((c) => ({ ...c, ...v })),
                changedPill((col.proof_kind || "screenshot") !== col.pkInh),
                applyScope.level === "leader" ? "leaders" : "units")
            ) : (
              <FormField label={t("admin.ltasks.proofKind")}>
                <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                  {t("admin.ltasks.proofNeedsFilter")}
                </p>
              </FormField>
            )}
            {deadlineField(col, (v) => setCol((c) => ({ ...c, ...v })), "")}
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
                // Chipped even though its neighbours on this row (criteria,
                // window, deadline) are not: it is the one override a leader can
                // hold ALONE, and without a chip that row lists nothing at all.
                // One chip for the pair: they are one rule, and two chips
                // reading «date: yes» + «time: no» is the four-combination
                // confusion the single control exists to avoid.
                if (r.ov.date_check != null || r.ov.time_check != null)
                  chips.push(excChip(`${t("admin.ltasks.dateCheck")}: ${t(`admin.ltasks.dateMode.${dcMode(r.ov)}`)}`));
                // Chipped for the same reason as the date rule, and with more
                // reason: this one changes where the leader ANSWERS, so a
                // leader singled out onto the camera must be findable here.
                if (r.ov.proof_kind)
                  chips.push(excChip(t(`admin.ltasks.proofMode.${r.ov.proof_kind}`)));
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
