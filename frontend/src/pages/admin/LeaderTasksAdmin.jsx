import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowDown, ArrowUp, Calendar,
  ChevronRight, Clock, Grid3x3, History, ImagePlus, ListChecks, ListOrdered,
  Plus, RotateCcw, Trash2, Type, UserCog, Users, X,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import { ProxyPhoto } from "../../components/leaders/ProofPhoto";
import { usePersistentState } from "../../hooks/usePersistentState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TimeField from "../../components/ui/TimeField";
import LangTextInput from "../../components/ui/LangTextInput";
import DateRangePicker from "../../components/ui/DateRangePicker";
import EmptyState from "../../components/ui/EmptyState";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import CriteriaTextsModal from "./CriteriaTextsModal";

const C_WARN = "#eab308", C_BAD = "#ef4444";
const LANGS = ["uz", "uz_cyrl", "ru", "en"];
// The date rule as ONE value in the UI and THREE booleans on the wire — the
// same four modes the backend resolves (leader_ai.resolve_date_check +
// resolve_day_check + resolve_time_check). Read `date_check` FIRST: False
// answers both halves too, so a row carrying either of them under an exempt
// date is not a mode, just a leftover, and must still read as «off».
//
// `day_check` is a THIRD column and not the free (date_check F, time_check T)
// corner of the old pair, because the two resolve down the chain
// INDEPENDENTLY: a unit that exempts the date while inheriting `time_check`
// True from the global level already sits in that corner and means «off».
// Twelve did on the day «faqat vaqt» shipped.
const dcMode = (v) => (v?.date_check === false ? "off"
  : v?.day_check === false ? "time"
  : v?.time_check === false ? "day" : "full");
// «off» leaves both halves at the strict answer: they are moot while the date
// question is not asked, and turning it back on should land where it always
// landed rather than on whichever half was last unticked.
const dcModeValues = (m) => ({
  date_check: m !== "off", day_check: m !== "time", time_check: m !== "day",
});

const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

// ── the vocabulary of a RULE ────────────────────────────────────────────────
// Every rule a task carries, and the payload field names it is MADE of. `own`
// (services/leader_tasks.own_fields) names those fields, so a rule that is a
// PAIR — the window's two ends, the date rule's three booleans — carries every
// half and reads as "own" when any of them is.
//
// This list is no longer a set of table COLUMNS: the page stopped painting a
// grid on 2026-09-08. It is what the exception register enumerates — one row
// per (scope, task, rule) that differs from its parent — and the order is the
// order those rules are read in.
const COLS = [
  { k: "enabled",  keys: ["enabled"] },
  { k: "weight",   keys: ["weight"] },
  { k: "photos",   keys: ["min_media"] },
  { k: "proof",    keys: ["proof_kind"] },
  { k: "window",   keys: ["win_from", "win_to"] },
  { k: "dateRule", keys: ["date_check", "time_check", "day_check"] },
  { k: "deadline", keys: ["deadline"] },
  { k: "desc",     keys: ["description"] },
  { k: "crit",     keys: ["criteria"] },
  { k: "ex",       keys: [] },
];
// Every field the chain resolves, in the payload's own spelling. Used to build
// the shift TEMPLATE — the value most of a shift's units carry — which is the
// one level in the strip the data model does not have a table for.
// What an OPEN row spells out. The two long texts (description, criteria) are
// printed in full underneath instead of squeezed into a grid cell.
const DETAIL_ROWS = COLS.filter((c) => !["desc", "crit"].includes(c.k));
// Every field the chain resolves, in the payload's own spelling. Used to build
const FIELD_KEYS = [
  "enabled", "weight", "min_media", "proof_kind", "win_from", "win_to",
  "date_check", "time_check", "day_check", "deadline", "description", "criteria",
  "names",
];
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clip = (s, n = 46) => {
  const v = String(s || "");
  return v.length > n ? `${v.slice(0, n)}…` : v;
};

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
// reviewer receives beside the written criteria, and what the leader is shown
// on «Vazifalar» as "a correct proof looks like this". Uploads apply at once,
// exactly like the criteria text; the ids come from the live config query, so
// the strip re-renders on invalidate.
//
// They sit at a LEVEL of the same global → supervisor → leader chain as the
// criteria beside them, so the strip must always answer two questions the
// admin cannot otherwise tell apart: is what I am looking at THIS row's own
// photo or the one it inherits, and where will the next upload land. An
// inherited photo is dimmed and carries NO delete button — deleting it would
// reach every other row inheriting the same one, which is exactly the accident
// this scoping exists to end.
const EXAMPLES_MAX = 3;
function TaskExamples({ ids, own, fromLabel, scopeNote, busy, disabled, onUpload, onAskDelete, t }) {
  const fileRef = useRef(null);
  const full = own && ids.length >= EXAMPLES_MAX;
  const T = { photoFailed: t("admin.ltasks.photoFailed"), retry: t("common.retry") };
  return (
    <FormField label={t("admin.ltasks.examples")} hint={scopeNote || t("admin.ltasks.examplesHint")}>
      <div className="space-y-2">
        {ids.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {ids.map((id) => (
              <div key={id} className="relative" style={own ? undefined : { opacity: 0.55 }}>
                <ProxyPhoto T={T} deps={[id]} className="h-20" maxHeight={80}
                  load={() => api.get(`/admin/leader-tasks/examples/${id}`, { responseType: "blob" })} />
                {own && (
                  <button type="button" aria-label={t("admin.ltasks.exampleDelTitle")}
                    onClick={() => onAskDelete(id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-md grid place-items-center"
                    style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Said under the photos, not over them: the reader has just seen a
            picture and the only thing left to establish is whose it is. */}
        {ids.length > 0 && !own && (
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.examplesInherited").replace("{from}", fromLabel || "")}
          </p>
        )}
        <input ref={fileRef} type="file" className="hidden"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
        <Button size="sm" tint icon={<ImagePlus size={13} />} loading={busy} disabled={full || disabled}
          onClick={() => fileRef.current?.click()}>
          {full ? t("admin.ltasks.examplesFull")
            : ids.length > 0 && !own ? t("admin.ltasks.exampleReplace")
              : t("admin.ltasks.exampleAdd")}
        </Button>
      </div>
    </FormField>
  );
}

// The leader-checklist CONFIGURATION as a READABLE LIST.
//
// Two grids died to get here. The 22×13 brigadir×task matrix painted 273 cells
// that all carried the same weight; the sheet that replaced it painted 130
// cells that nearly all read «STANDART». Both drew the SAMENESS — the one thing
// about this config that never varies — while the settings that actually differ
// (a window, a date rule, a photo count on one unit) were a 9px glyph, a dot,
// or nothing at all.
//
// So there is no grid. There are thirteen rows, one per task, and each one
// states its rule as a SENTENCE in which the defaults stay SILENT: a task that
// wants a camera, three photos and a 07:00–09:00 window says so, and a task
// that wants none of that says almost nothing. That is what makes the thirteen
// rows look different from one another.
//
// The scope (smena → brigadir → lider) is a FilterPanel, and the inheritance
// LEVEL is derived from those picks — there is no second control for it. What
// differs from the level above is not a separate register any more: it hangs
// under the task it belongs to, opened by pressing the row.
export default function LeaderTasksAdmin() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();

  const [chan, setChan] = useState("");
  const [chanErr, setChanErr] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTexts, setShowTexts] = useState(false);
  const [txtSave, setTxtSave] = useState(null);
  const [txtErr, setTxtErr] = useState("");
  // The open rule editor — { tid, lvl, …draft }. ONE modal serves every level;
  // `lvl` is a snapshot of the level it was opened at, so a strip press behind
  // it can never move where the open form writes.
  const [edit, setEdit] = useState(null);
  // The catalog surfaces: create, archive-from-a-date, reorder.
  const [addTask, setAddTask] = useState(null);
  const [arch, setArch] = useState(null);
  const [order, setOrder] = useState(null);
  // Per-unit settings (per-cell filing) — reached from the level bar while a
  // brigadir is selected, which is the only place a unit-wide switch can
  // honestly sit now that the rows are TASKS.
  const [unit, setUnit] = useState(null);

  // ── where the page is pointed ────────────────────────────────────────────
  // Stored as primitives, never as an object: `ltasks_f_shift` keeps its old
  // key and its old shape (0 = no shift, 1 / 2 = that one), so a browser that
  // has used this page before opens on the shift it was left on. The same is
  // true of the two picks.
  //
  // `ltasks_tab`, `ltasks_lvl` and the three `ltasks_reg_*` keys are gone with
  // the controls that wrote them — the two-tab split, the level strip and the
  // exception register's own filters. A stored value nothing reads is a value
  // that silently rots; the three keys that survive are the three the page
  // still steers by.
  const [fShift, setFShift] = usePersistentState("ltasks_f_shift", 0);
  const [pickU, setPickU] = usePersistentState("ltasks_pick_mgr", null);
  const [pickL, setPickL] = usePersistentState("ltasks_pick_lead", null);
  // Which task row is expanded. Deliberately NOT persisted: an expansion is a
  // reading position inside one visit, not a setting.
  const [openRow, setOpenRow] = useState(null);
  const rowRefs = useRef({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ltasks-config"],
    queryFn: () => api.get("/admin/leader-tasks/config").then((r) => r.data),
  });
  const { data: audit } = useQuery({
    queryKey: ["ltasks-audit"],
    queryFn: () => api.get("/admin/leader-tasks/audit").then((r) => r.data.audit),
    enabled: showHistory,
  });
  useEffect(() => { setChan(data?.channel?.chat_id ?? ""); }, [data]);

  const ping = () => toast.success(t("admin.ltasks.saved"));
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ltasks-config"] });
    qc.invalidateQueries({ queryKey: ["ltasks-audit"] });
  };
  // Telegram's Mini App WebView blocks window.alert on iOS, so on the primary
  // phone platform a failed save produced NOTHING — the modal stayed open, the
  // spinner stopped, and the admin had no idea whether the edit applied.
  const onErr = (e) => {
    const d = e?.response?.data?.detail;
    if (d === "camera_needs_a_unit") { toast.error(t("admin.ltasks.proofNeedsUnit")); return; }
    // A window a leader on that shift could never work — refused rather than
    // stored. The message NAMES the shift and its hours, because "outside the
    // shift" is unreadable without them: «08:00 — 10:00» looks like an ordinary
    // morning until you know the unit works 17:00 → 09:00.
    if (typeof d === "string" && d.startsWith("window_outside_shift")) {
      const [, sh, win, hours] = d.split("|");
      toast.error(t("admin.ltasks.winOutsideShift")
        .replace("{win}", win || "").replace("{shift}", sh || "?")
        .replace("{hours}", hours || ""));
      return;
    }
    toast.error(Array.isArray(d) ? d.map((x) => x?.msg || String(x)).join("; ")
      : (typeof d === "string" && d) || t("admin.ltasks.fail"));
  };
  // The catalog endpoints are newer than this page's oldest deployable
  // backend, so a 404/405 there means "the server has not been restarted yet",
  // not "your request was wrong" — and saying the wrong one of those sends an
  // admin looking for a mistake they did not make.
  const onCatalogErr = (e) => {
    const s = e?.response?.status;
    const d = e?.response?.data?.detail;
    if (s === 404 || s === 405) { toast.error(t("admin.ltasks.catalogUnavailable")); return; }
    if (d === "active_from_too_early" || d === "archived_from_too_early") {
      toast.error(t("admin.ltasks.archTooEarly")); return;
    }
    if (d === "no_name") { toast.error(t("admin.ltasks.addNameReq")); return; }
    onErr(e);
  };

  const cellMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/cell", b), onSuccess: () => { invalidate(); setEdit(null); ping(); }, onError: onErr });
  const leaderMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/leader-cell", b), onSuccess: () => { invalidate(); setEdit(null); setConfirm(null); ping(); }, onError: onErr });
  const taskMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/task", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  const applyMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/apply-all", b), onSuccess: () => { invalidate(); setEdit(null); setConfirm(null); ping(); }, onError: onErr });
  const cancelMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/pending/cancel", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const revertMut = useMutation({ mutationFn: (b) => api.post("/admin/leader-tasks/revert", b), onSuccess: () => { invalidate(); setConfirm(null); ping(); }, onError: onErr });
  const chanMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/channel", b), onSuccess: () => { setChanErr(""); invalidate(); ping(); }, onError: (e) => setChanErr(e?.response?.data?.detail || t("admin.ltasks.channelFail")) });
  // The AI definition-of-done rides its own endpoint: it changes nothing the
  // leader sees in the bot, so it applies at once and never joins the
  // "from next day" staging the other fields go through.
  const critMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/criteria", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // The leader-facing instruction — the OTHER half of what `criteria` used to
  // be (split 2026-09-06). Its own endpoint, and it lands on the SAME override
  // row as the criteria, so it is written in the same awaited chain and never
  // in parallel with it.
  const descMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/description", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // The proof-photo window rides the same instant path as the criteria — but
  // unlike them it also re-judges verdicts already written, from the clock each
  // one stored, so an edit fixes the existing queue and not just future reports.
  const winMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/window", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // The submission deadline: for a per-task unit this is the hour the task
  // CLOSES itself and goes to the reviewer, so it applies at once like the
  // window and has nothing to re-derive.
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
  // And the mirror mode: judge the HOUR, never the day — for a proof whose only
  // clock is a phone status bar, which by construction carries no date. Third
  // endpoint, same row, so it is written after the other two and never beside
  // them.
  const dayMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/day-check", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // WHERE the leader answers this task — the bot chat, or the mini-app camera.
  // Instant and never staged, unlike enabled/photos/weight: this is the one
  // field that changes what the leader is asked to DO, and a staged version
  // would leave the bot offering an upload for a task whose proofs are supposed
  // to be shot in the app for a whole shift.
  const pkMut = useMutation({ mutationFn: (b) => api.put("/admin/leader-tasks/proof-kind", b), onSuccess: () => { invalidate(); ping(); }, onError: onErr });
  // Per-cell filing has its OWN endpoint and takes a LIST, so this one row and
  // a future bulk press are one call and one transaction — two parallel single
  // writes would race the unit row's key.
  const cellFromMut = useMutation({
    mutationFn: (b) => api.put("/admin/leader-tasks/cell-from", b).then((r) => r.data),
    onError: onErr,
  });
  // Day-vs-task submission and the rehearsal window: ONE endpoint, because
  // they are ONE `LeaderUnitSetting` row and two requests to a unit that has
  // never been edited race its key. It carries no onSuccess — `saveUnit` runs
  // it and the per-cell write one AFTER the other and closes the modal at the
  // end of the chain, so a half-written unit never reports success.
  const unitMut = useMutation({
    mutationFn: (b) => api.put("/admin/leader-tasks/unit", b).then((r) => r.data),
    onError: onErr,
  });
  // ── the catalog ─────────────────────────────────────────────────────────
  const addMut = useMutation({
    mutationFn: (b) => api.post("/admin/leader-tasks/task", b).then((r) => r.data),
    onSuccess: (d) => {
      invalidate(); setAddTask(null); setConfirm(null);
      toast.success(t("admin.ltasks.addDone").replace("{n}", d?.task_id ?? "")
        .replace("{date}", d?.active_from || ""));
    },
    onError: onCatalogErr,
  });
  const archMut = useMutation({
    mutationFn: (b) => api.post("/admin/leader-tasks/task/archive", b),
    onSuccess: () => { invalidate(); setArch(null); setConfirm(null); ping(); },
    onError: (e) => {
      // A refusal has to stay on the dialog that caused it: a toast behind a
      // standing confirm is the message an admin never reads.
      const d = e?.response?.data?.detail;
      if (d === "archived_from_too_early") {
        setConfirm((c) => (c ? { ...c, error: t("admin.ltasks.archTooEarly") } : c));
        return;
      }
      onCatalogErr(e);
    },
  });
  const orderMut = useMutation({
    mutationFn: (b) => api.put("/admin/leader-tasks/task/order", b),
    onSuccess: () => { invalidate(); setOrder(null); ping(); },
    onError: onCatalogErr,
  });
  // Example proof photos live beside the criteria and are SCOPED like it: the
  // ids ride along so the photo lands on the same rows the text does. Sending
  // neither list writes the global level, which is what the Standart level
  // means. Instant, like the criteria.
  const exAddMut = useMutation({
    mutationFn: ({ taskId, file, manager_ids, leader_ids, level }) => {
      const fd = new FormData();
      fd.append("task_id", taskId);
      fd.append("file", file);
      (leader_ids || []).forEach((id) => fd.append("leader_ids", id));
      (manager_ids || []).forEach((id) => fd.append("manager_ids", id));
      // States the intent rather than leaving the backend to infer it from an
      // empty list — "the filter matched nobody" and "no filter at all" look
      // identical on the wire and mean opposite things.
      fd.append("level", level || (leader_ids?.length ? "leader"
        : manager_ids?.length ? "supervisor" : "global"));
      return api.post("/admin/leader-tasks/examples", fd);
    },
    onSuccess: () => { invalidate(); ping(); },
    onError: (e) => {
      const d = e?.response?.data?.detail;
      toast.error(d === "examples_full" ? t("admin.ltasks.examplesFull")
        : d === "examples_too_many_targets" ? t("admin.ltasks.examplesTooMany")
          : d === "no_targets" ? t("admin.ltasks.examplesNoTargets")
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

  const tasksRaw = data?.tasks ?? [];
  const managers = data?.managers ?? [];
  const settings = data?.settings ?? {};
  const leaders = data?.leaders ?? [];
  const leaderSettings = data?.leader_settings ?? {};
  // Sparse per-level example ids, "<row id>:<task id>". Absent key = this level
  // has none of its own and inherits the level above.
  const exSup = data?.example_sup ?? {};
  const exLead = data?.example_lead ?? {};
  const pending = data?.pending ?? [];
  const nextDates = data?.next_dates ?? {};
  const nextForShift = (shift) => nextDates[String(shift === 2 ? 2 : 1)] || "";
  // The day happening RIGHT NOW on each shift — `leader_tasks.effective_date`,
  // which is the ONE thing `is_active` compares a catalog floor against. Sent
  // rather than computed here, and NEVER `new Date()`: a night belongs to the
  // date its 17:00 boundary opened, and a browser-clock comparison is exactly
  // how 26 Aug closed shift-2 tasks before they had opened.
  const effDates = data?.effective_dates ?? null;
  // Which fields each level DECIDES, computed by the backend against the
  // parent's RESOLVED value — never re-derived here from row existence, which
  // is what would paint the whole sheet as overridden (the supervisor table is
  // dense: a side-field write materialises the whole row).
  const ownMap = data?.own ?? {};
  const ownLeadMap = data?.own_leader ?? {};
  // Windows that cannot be worked on the shift they land on. Judged by
  // `leader_ai.window_fits_shift` server-side; an older backend serves no key
  // at all, and then the page says nothing rather than guessing.
  const problems = Array.isArray(data?.problems) ? data.problems : null;
  // The earliest day a catalog change may take effect — the LATER of the two
  // shifts' next effective dates, exactly as `leader_tasks.catalog_floor`
  // composes it out of the same two published dates.
  const floor = useMemo(() => {
    const a = nextDates["1"] || "", b = nextDates["2"] || "";
    return a > b ? a : b;
  }, [nextDates]);

  // ── the two catalog floors are DATES, not flags ─────────────────────────
  // `active_from` and `archived_from` are hard floors compared against the
  // SHIFT's own effective date (`leader_tasks.is_active`), so an archive
  // SCHEDULED for next week must move nothing today: the backend still asks
  // the task, still scores it, and still expects the unit to add up to 100%.
  // Reading them as booleans took the weight out of the sum, the row out of
  // the tile count and greyed the row weeks before any of that was true — and
  // did the mirror thing for a task whose `active_from` has not arrived, which
  // it counted from the moment it was created.
  //
  // A blank date on either side means "no day to judge against", and the
  // answer is then the catalog as it stands — exactly `is_active`'s own
  // degradation, which always falls toward the behaviour the page already had.
  const effDay = (shift) => {
    const src = effDates || nextDates;
    const s = Number(shift);
    if (s === 1 || s === 2) return src[String(s)] || "";
    // Shift-agnostic — the Standart level and the catalog tiles. The LATER of
    // the two, the same composition `leader_tasks.catalog_floor` uses and for
    // the same reason: one string is compared against each shift's OWN day, so
    // the answer has to be the furthest the platform has actually got.
    const a = src["1"] || "", b = src["2"] || "";
    return a > b ? a : b;
  };
  const isArchived = (td, shift) => {
    const hi = (td?.archived_from || "").trim();
    const d = effDay(shift);
    return !!hi && !!d && d >= hi;
  };
  const isPending = (td, shift) => {
    const lo = (td?.active_from || "").trim();
    const d = effDay(shift);
    return !!lo && !!d && d < lo;
  };

  // Archived tasks stay in the sheet, MARKED — the catalog never drops them,
  // and a task archived from a date that has not arrived is still being asked
  // tonight. They sort last and leave the weight sum.
  const tasks = useMemo(() => [...tasksRaw].sort((a, b) =>
    (isArchived(a, null) ? 1 : 0) - (isArchived(b, null) ? 1 : 0)
    || (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id),
    [tasksRaw, effDates, nextDates]); // eslint-disable-line react-hooks/exhaustive-deps
  // What is ASKED right now, shift-agnostic: the tiles, the standard weight
  // sum and the reorder list. Neither an archived task nor one whose opening
  // day has not come is in it.
  const liveTasks = useMemo(() => tasks.filter(
    (x) => !isArchived(x, null) && !isPending(x, null)),
    [tasks, effDates, nextDates]); // eslint-disable-line react-hooks/exhaustive-deps
  const archivedTasks = useMemo(() => tasks.filter((x) => isArchived(x, null)),
    [tasks, effDates, nextDates]); // eslint-disable-line react-hooks/exhaustive-deps
  // The same set per SHIFT, because a weight sum is read per UNIT and a unit
  // has a shift: at 10:00 shift 1's day is today and shift 2's is yesterday,
  // so a floor landing between them is in force for one of them and not the
  // other, and one shared list would report the wrong 100% for half the plant.
  const liveByShift = useMemo(() => {
    const out = {};
    for (const s of [1, 2]) {
      out[s] = tasks.filter((x) => !isArchived(x, s) && !isPending(x, s));
    }
    return out;
  }, [tasks, effDates, nextDates]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveForShift = (shift) => liveByShift[Number(shift)] || liveTasks;

  const leadersByMgr = useMemo(() => {
    const out = {};
    for (const p of leaders) (out[p.manager_id] ||= []).push(p);
    return out;
  }, [leaders]);
  const mgrById = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);
  const leaderById = useMemo(() => new Map(leaders.map((p) => [p.id, p])), [leaders]);
  const unitsOf = (shift) => managers.filter((m) => Number(m.shift) === Number(shift));
  const shifts = useMemo(() => {
    const s = new Set(managers.map((m) => Number(m.shift)).filter((x) => x === 1 || x === 2));
    return [...s].sort();
  }, [managers]);

  // ── the level on screen ──────────────────────────────────────────────────
  // DERIVED from the three scope picks, narrowest first — there is no separate
  // control for it any more, because a level strip beside a scope filter is two
  // controls answering one question and they drifted apart constantly (a
  // brigadir picked while the strip still said «Smena 1»).
  //
  // RECONCILED against live data: a brigadir who has left the register degrades
  // to Standart rather than leaving the page pointed at nothing.
  const level = useMemo(() => {
    if (pickL && leaderById.has(pickL)) {
      const p = leaderById.get(pickL);
      return { kind: "leader", id: pickL, mid: p.manager_id, shift: Number(mgrById.get(p.manager_id)?.shift) || 1 };
    }
    if (pickU && mgrById.has(pickU)) {
      return { kind: "unit", id: pickU, mid: pickU, shift: Number(mgrById.get(pickU)?.shift) || 1 };
    }
    // `mid` stays NULL for a shift, exactly as it always has: every consumer
    // that needs a sample unit at this level resolves it itself
    // (`unitsOf(shift)[0]`), and putting one here would make «Brigada
    // sozlamalari» offer a brigadir nobody picked.
    if (fShift === 1 || fShift === 2) {
      return { kind: "shift", id: null, mid: null, shift: fShift };
    }
    return { kind: "std", id: null, mid: null, shift: null };
  }, [pickU, pickL, fShift, leaderById, mgrById]);

  // ── the chain, resolved ─────────────────────────────────────────────────
  const tname = (task) => task?.name?.[lang] || task?.name?.uz || `T${task?.id}`;
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const getCell = (mid, tid) => settings[String(mid)]?.[String(tid)] ?? { enabled: true, min_media: 1, weight: 0, names: {}, criteria: null, description: null, win_from: null, win_to: null, deadline: null, date_check: null, time_check: null, day_check: null, proof_kind: null };
  const getOv = (lid, tid) => leaderSettings[String(lid)]?.[String(tid)] ?? null;

  // The GLOBAL level — the definition's own values, which is what every unit
  // with no row of its own resolves to.
  const gv = (tid) => {
    const td = taskById.get(tid) || {};
    return {
      enabled: td.default_enabled !== false,
      weight: Number(td.default_weight) || 0,
      min_media: td.default_min_media ?? 1,
      proof_kind: td.proof_kind || "screenshot",
      win_from: td.win_from || "", win_to: td.win_to || "",
      date_check: td.date_check !== false, time_check: td.time_check !== false,
      day_check: td.day_check !== false,
      deadline: td.deadline || "",
      description: td.description || "",
      criteria: td.criteria || "",
      names: Object.fromEntries(LANGS.map((l) => [l, td.name?.[l] || ""])),
    };
  };
  // A unit resolves over the global, field by field: its own value where it has
  // one, the global otherwise. `?? ` and never `||` for the two date flags —
  // FALSE is a decision there, and `||` would read an inherited exemption as
  // unset every time.
  const uv = (mid, tid) => {
    const g = gv(tid), c = getCell(mid, tid);
    return {
      enabled: c.enabled, weight: Number(c.weight) || 0, min_media: Number(c.min_media) || 0,
      proof_kind: c.proof_kind || g.proof_kind,
      win_from: c.win_from || g.win_from, win_to: c.win_to || g.win_to,
      date_check: c.date_check ?? g.date_check, time_check: c.time_check ?? g.time_check,
      day_check: c.day_check ?? g.day_check,
      deadline: c.deadline || g.deadline,
      description: c.description || g.description,
      criteria: c.criteria || g.criteria,
      names: Object.fromEntries(LANGS.map((l) => [l, c.names?.[l] || g.names[l]])),
    };
  };
  // And a leader over their unit — the same walk one level down.
  const lv = (lid, mid, tid) => {
    const b = uv(mid, tid), o = getOv(lid, tid);
    if (!o) return b;
    return {
      enabled: o.enabled ?? b.enabled,
      weight: o.weight ?? b.weight,
      min_media: o.min_media ?? b.min_media,
      proof_kind: o.proof_kind || b.proof_kind,
      win_from: o.win_from || b.win_from, win_to: o.win_to || b.win_to,
      date_check: o.date_check ?? b.date_check, time_check: o.time_check ?? b.time_check,
      day_check: o.day_check ?? b.day_check,
      deadline: o.deadline || b.deadline,
      description: o.description || b.description,
      criteria: o.criteria || b.criteria,
      names: Object.fromEntries(LANGS.map((l) => [l, o.names?.[l] || b.names[l]])),
    };
  };

  // ── the SHIFT template ──────────────────────────────────────────────────
  // There is no shift level in the data model: a "shift rule" is the same value
  // copied onto every unit of that shift (the production copy carries 132 such
  // rows for the camera alone). So the template is DERIVED — the value most of
  // a shift's units resolve to, when it differs from the global one — and a
  // write at that level fans out to exactly those units. `carriers` is how many
  // of them actually hold it, which is what makes a half-applied template
  // visible instead of looking like a rule.
  const shiftTpl = useMemo(() => {
    const out = {};
    for (const s of shifts) {
      const units = unitsOf(s);
      if (!units.length) continue;
      const byTask = {};
      for (const td of tasks) {
        const g = gv(td.id);
        // Resolved ONCE per unit, not once per field: this loop is 2 shifts ×
        // 13 tasks × 12 fields × 22 units, and re-resolving inside it turned a
        // few thousand reads into a few tens of thousands of allocations.
        const res = units.map((m) => uv(m.id, td.id));
        const byKey = {};
        for (const k of FIELD_KEYS) {
          const counts = new Map();
          for (const r of res) {
            const key = JSON.stringify(r[k] ?? null);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          let best = null, bestN = 0;
          for (const [key, n] of counts) if (n > bestN) { best = key; bestN = n; }
          const v = best == null ? null : JSON.parse(best);
          if (eq(v, g[k])) continue;         // the shift agrees with the standard
          byKey[k] = { v, carriers: bestN, total: units.length };
        }
        byTask[td.id] = byKey;
      }
      out[s] = byTask;
    }
    return out;
  }, [shifts, managers, tasks, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const tplFor = (shift, tid, k) => shiftTpl[shift]?.[tid]?.[k] || null;

  // ── who DECIDED a value ─────────────────────────────────────────────────
  // The payload's `own` answers it for a unit and a leader; the shift's answer
  // is the template above; Standart decides everything it is asked about,
  // because it is the floor of the chain.
  const ownKeys = (lvl, tid) => {
    if (lvl.kind === "std") return new Set(FIELD_KEYS);
    if (lvl.kind === "shift") {
      return new Set(FIELD_KEYS.filter((k) => tplFor(lvl.shift, tid, k)));
    }
    if (lvl.kind === "unit") return new Set(ownMap[String(lvl.id)]?.[String(tid)] || []);
    return new Set(ownLeadMap[String(lvl.id)]?.[String(tid)] || []);
  };
  // The example photos in force for a row, walking the chain the backend walks
  // (services/leader_ai.example_ids_map): the NARROWEST level holding any wins
  // WHOLE, never a union. Returns the level too, because every modal has to say
  // whether what it is showing belongs to the row or is merely inherited.
  const exOf = (tid, mid, lid) => {
    const lead = lid ? exLead[`${lid}:${tid}`] : null;
    if (lead?.length) return { ids: lead, level: "leader" };
    const sup = mid ? exSup[`${mid}:${tid}`] : null;
    if (sup?.length) return { ids: sup, level: "supervisor" };
    return { ids: taskById.get(tid)?.examples || [], level: "global" };
  };
  // Where an inherited photo came from, in the admin's own words.
  const exFromLabel = (lv2) => (lv2 === "supervisor"
    ? t("admin.ltasks.examplesFromSup") : t("admin.ltasks.examplesFromGlobal"));

  // The name of a LEVEL, for «qiymat ← meros» on an exception row and for the
  // "what would this fall back to" line in the editor.
  const tagLabel = (o) => (o === "std" ? t("admin.ltasks.lvlStd")
    : o === "unit" ? t("admin.ltasks.supervisor")
      : o === "leader" ? t("admin.ltasks.leader")
        : t("admin.ltasks.lvlShift").replace("{n}", o.slice(1)));
  const levelKey = (lvl) => (lvl.kind === "std" ? "std"
    : lvl.kind === "shift" ? `s${lvl.shift}` : lvl.kind);
  // Whether the example photos in force at `lvl` belong to it or are inherited
  // — the same question `TaskExamples` asks, answered for a sheet cell. The
  // supervisor layer is what a SHIFT writes too, so a photo stored on this
  // shift's units reads as the shift's own.
  const exTag = (lvl, tid) => {
    const r = exOf(tid, lvl.kind === "shift" ? unitsOf(lvl.shift)[0]?.id : lvl.mid,
      lvl.kind === "leader" ? lvl.id : null);
    return r.level === "leader" ? "leader"
      : r.level === "supervisor" ? (lvl.kind === "shift" ? `s${lvl.shift}` : "unit") : "std";
  };
  const exIsOwn = (lvl, tid) => exTag(lvl, tid) === levelKey(lvl);

  // WHICH level decided a field, walking the chain outwards from `lvl`. The
  // expanded row prints this beside every inherited value, so «where did this
  // come from» is answered on the value itself rather than reconstructed.
  const fieldOrigin = (lvl, tid, keys) => {
    const has = (l) => keys.some((k) => ownKeys(l, tid).has(k));
    if (lvl.kind === "leader") {
      if (has(lvl)) return "leader";
      const u = { kind: "unit", id: lvl.mid, mid: lvl.mid, shift: lvl.shift };
      if (has(u)) return "unit";
    }
    if (lvl.kind === "unit" && has(lvl)) return "unit";
    const sh = lvl.shift;
    if (sh && keys.some((k) => tplFor(sh, tid, k))) return `s${sh}`;
    return "std";
  };

  // The resolved rule at the level on screen.
  const resolved = (lvl, tid) => (lvl.kind === "leader" ? lv(lvl.id, lvl.mid, tid)
    : lvl.kind === "unit" ? uv(lvl.id, tid)
      : lvl.kind === "shift" ? (() => {
        const g = gv(tid);
        const out = { ...g };
        for (const k of FIELD_KEYS) { const tp = tplFor(lvl.shift, tid, k); if (tp) out[k] = tp.v; }
        return out;
      })() : gv(tid));

  // ── the windows nobody can work ─────────────────────────────────────────
  // Read off the payload; the fit rule itself is never re-derived here (see
  // `leader_ai.window_fits_shift`, which is the one judge).
  //
  // The two lower levels are matched by IDENTITY — a problem is raised against
  // a row, so the row's id is the whole of the question. Standart and Smena
  // have no row, so a problem belongs to them when the unit it was raised on
  // resolves to the window THIS level resolves to, which keeps "a unit with
  // its own bad hours is not the shift template's problem" true.
  //
  // What it must NOT be is a comparison against `p.win`: the backend fills a
  // blank end with the shift default BEFORE testing the fit, so a half-blank
  // window («08:00 — », i.e. "from 8 until the shift ends") never matched the
  // level's own value and the ⚠ vanished from precisely the two levels that
  // own such a window.
  const problemsFor = (lvl, tid) => {
    if (!problems) return [];
    if (lvl.kind === "unit") return problems.filter((p) => p.level === "unit" && p.manager_id === lvl.id && p.task_id === tid);
    if (lvl.kind === "leader") return problems.filter((p) => p.level === "leader" && p.leader_id === lvl.id && p.task_id === tid);
    const r = resolved(lvl, tid);
    return problems.filter((p) => {
      if (p.level !== "unit" || p.task_id !== tid) return false;
      if (lvl.kind === "shift" && Number(p.shift) !== Number(lvl.shift)) return false;
      const u = uv(p.manager_id, tid);
      return (u.win_from || "") === (r.win_from || "")
        && (u.win_to || "") === (r.win_to || "");
    });
  };

  // ── how a value READS ───────────────────────────────────────────────────
  const showVal = (k, r, lvl, tid) => {
    switch (k) {
      case "enabled": return r.enabled ? t("admin.ltasks.vAsked") : t("admin.ltasks.vNotAsked");
      case "weight": return `${r.weight}%`;
      case "photos": return t("admin.ltasks.vCount").replace("{n}", r.min_media);
      case "proof": return t(r.proof_kind === "camera" ? "admin.ltasks.proofCamera" : "admin.ltasks.proofScreenshot");
      case "window": return (r.win_from || r.win_to)
        ? `${r.win_from || "…"}–${r.win_to || "…"}`
        : (lvl.kind === "std" ? t("admin.ltasks.empty") : t("admin.ltasks.vWholeShift"));
      case "dateRule": return t(`admin.ltasks.dateMode.${dcMode(r)}`);
      case "deadline": return r.deadline || t("admin.ltasks.vWinEnd");
      case "desc": return clip(r.description || r.criteria) || t("admin.ltasks.empty");
      case "crit": return clip(r.criteria) || t("admin.ltasks.empty");
      case "ex": return t("admin.ltasks.vCount")
        .replace("{n}", exOf(tid, lvl.mid, lvl.kind === "leader" ? lvl.id : null).ids.length);
      case "name": return r.names?.[lang] || r.names?.uz || t("admin.ltasks.empty");
      default: return "";
    }
  };
  // ── the exception register ──────────────────────────────────────────────
  // One row per (scope, task, rule) that differs from its parent, plus the
  // DRIFT rows: a unit that does not carry its own shift's template. Both are
  // exceptions; only one of them was decided on purpose, which is why they are
  // marked differently rather than merged.
  const regRows = useMemo(() => {
    const rows = [];
    // Which backend `problems` a row above has already NAMED. A window is
    // refused per ROW, so the identity is the row it was raised on.
    const covered = new Set();
    const pkey = (pb) => `${pb.level}:${pb.level === "leader" ? pb.leader_id : pb.manager_id}:${pb.task_id}`;
    const cover = (list) => { for (const pb of list) covered.add(pkey(pb)); };
    for (const s of shifts) {
      const units = unitsOf(s);
      if (!units.length) continue;
      for (const td of tasks) {
        const g = gv(td.id);
        const lvlS = { kind: "shift", shift: s, id: null, mid: units[0]?.id ?? null };
        const r = resolved(lvlS, td.id);
        for (const col of [...COLS, { k: "name", keys: ["names"] }]) {
          if (!col.keys.length) continue;
          const tp = col.keys.map((k) => tplFor(s, td.id, k)).find(Boolean);
          if (!tp) continue;
          const sProbs = col.k === "window" ? problemsFor(lvlS, td.id) : [];
          // The template itself is the bad window, so it is named ONCE here —
          // its `carriers` line already says how many units hold it — instead
          // of once per unit underneath.
          if (sProbs.length) cover(sProbs);
          rows.push({
            key: `s${s}-${td.id}-${col.k}`, lvl: "shift", shift: s, tid: td.id, f: col.k,
            who: t("admin.ltasks.lvlShift").replace("{n}", s),
            sub: t("admin.ltasks.reachMgrLead").replace("{m}", units.length)
              .replace("{l}", units.reduce((a, m) => a + (m.leaders_n || 0), 0)),
            v: showVal(col.k, r, lvlS, td.id),
            p: showVal(col.k, g, { kind: "std" }, td.id), pl: t("admin.ltasks.lvlStd"),
            carriers: tp.carriers, total: tp.total,
            bad: sProbs.length > 0, hours: sProbs[0]?.hours,
          });
        }
      }
    }
    for (const m of managers) {
      const s = Number(m.shift) || 0;
      const lvlU = { kind: "unit", id: m.id, mid: m.id, shift: s };
      for (const td of tasks) {
        const g = gv(td.id);
        const own = new Set(ownMap[String(m.id)]?.[String(td.id)] || []);
        const r = uv(m.id, td.id);
        // The shift's own answer, resolved once per (unit, task) rather than
        // once per column: this is the register's hottest loop (22 units × 13
        // tasks × 11 columns) and every parent lookup lands on the same value.
        const rShift = resolved({ kind: "shift", shift: s, id: null, mid: m.id }, td.id);
        const probs = problemsFor(lvlU, td.id);
        for (const col of [...COLS, { k: "name", keys: ["names"] }]) {
          if (!col.keys.length) continue;
          const mine = col.keys.some((k) => own.has(k));
          const tp = col.keys.map((k) => tplFor(s, td.id, k)).find(Boolean);
          const carriesTpl = mine && col.keys.every((k) => {
            const p2 = tplFor(s, td.id, k);
            return !own.has(k) || (p2 && eq(p2.v, r[k]));
          });
          const isWin = col.k === "window";
          if (mine && !carriesTpl) {
            if (isWin && probs.length) cover(probs);
            rows.push({
              key: `u${m.id}-${td.id}-${col.k}`, lvl: "unit", shift: s, mid: m.id, tid: td.id, f: col.k,
              who: tl(m.name),
              sub: t("admin.ltasks.reachLead").replace("{l}", m.leaders_n || 0),
              v: showVal(col.k, r, lvlU, td.id),
              p: tp ? showVal(col.k, rShift, lvlU, td.id)
                : showVal(col.k, g, { kind: "std" }, td.id),
              pl: tp ? t("admin.ltasks.lvlShift").replace("{n}", s) : t("admin.ltasks.lvlStd"),
              bad: isWin && probs.length > 0,
              hours: probs[0]?.hours,
            });
          } else if (!mine && tp) {
            // Drift: the shift has a template and this unit is not on it. Its
            // window is still a window somebody is judged by, so a refused one
            // is marked HERE too — a drift row that stayed unmarked was a row
            // «Faqat smena tashqarisidagilar» filtered straight back out.
            if (isWin && probs.length) cover(probs);
            rows.push({
              key: `d${m.id}-${td.id}-${col.k}`, lvl: "unit", shift: s, mid: m.id, tid: td.id, f: col.k,
              drift: true, who: tl(m.name),
              sub: t("admin.ltasks.reachLead").replace("{l}", m.leaders_n || 0),
              v: showVal(col.k, r, lvlU, td.id),
              p: showVal(col.k, rShift, lvlU, td.id),
              pl: t("admin.ltasks.lvlShift").replace("{n}", s),
              bad: isWin && probs.length > 0,
              hours: probs[0]?.hours,
            });
          }
        }
      }
    }
    for (const p of leaders) {
      const byTask = ownLeadMap[String(p.id)] || {};
      const m = mgrById.get(p.manager_id);
      const s = Number(m?.shift) || 0;
      for (const tidStr of Object.keys(byTask)) {
        const tid = Number(tidStr);
        if (!taskById.has(tid)) continue;
        const own = new Set(byTask[tidStr] || []);
        const lvlL = { kind: "leader", id: p.id, mid: p.manager_id, shift: s };
        const r = lv(p.id, p.manager_id, tid);
        const base = uv(p.manager_id, tid);
        const lProbs = problemsFor(lvlL, tid);
        for (const col of [...COLS, { k: "name", keys: ["names"] }]) {
          if (!col.keys.some((k) => own.has(k))) continue;
          if (col.k === "window" && lProbs.length) cover(lProbs);
          rows.push({
            key: `l${p.id}-${tid}-${col.k}`, lvl: "leader", shift: s, lid: p.id, mid: p.manager_id,
            tid, f: col.k, who: tl(p.name), sub: tl(m?.name || ""),
            v: showVal(col.k, r, lvlL, tid),
            p: showVal(col.k, base, { kind: "unit", id: p.manager_id, mid: p.manager_id, shift: s }, tid),
            pl: t("admin.ltasks.supervisor"),
            bad: col.k === "window" && lProbs.length > 0,
            hours: lProbs[0]?.hours,
          });
        }
      }
    }
    // ── the refused windows nothing above could name ──────────────────────
    // The register lists what DIFFERS from its parent, and a bad GLOBAL window
    // differs from nothing: it is the 26-Aug shape exactly — one wrong pair on
    // the task definition, inherited unchanged by every unit. So the banner
    // counted N of them, «Ko'rsatish» filtered the register to bad windows,
    // and the table came back empty. Each one gets a row of its own, filed
    // against the level it was RAISED on and naming the level it came DOWN
    // from, so «Ko'rsatish» always lands on the rows it promised.
    for (const pb of problems || []) {
      // Same test bannerRows makes: a window is only wrong for somebody who is
      // actually judged by it, so a task switched off here is not counted there
      // and must not be listed here either.
      if (pb.enabled === false) continue;
      if (covered.has(pkey(pb))) continue;
      const tid = pb.task_id;
      if (!taskById.has(tid)) continue;
      const s = Number(pb.shift) || 0;
      if (pb.level === "leader") {
        const pr = leaderById.get(pb.leader_id);
        if (!pr) continue;
        const lvlL = { kind: "leader", id: pb.leader_id, mid: pb.manager_id, shift: s };
        rows.push({
          key: `pl${pb.leader_id}-${tid}-window`, lvl: "leader", shift: s,
          lid: pb.leader_id, mid: pb.manager_id, tid, f: "window", probOnly: true,
          who: tl(pr.name), sub: tl(mgrById.get(pb.manager_id)?.name || ""),
          v: showVal("window", lv(pb.leader_id, pb.manager_id, tid), lvlL, tid),
          p: showVal("window", uv(pb.manager_id, tid),
            { kind: "unit", id: pb.manager_id, mid: pb.manager_id, shift: s }, tid),
          pl: t("admin.ltasks.supervisor"),
          bad: true, hours: pb.hours,
        });
        continue;
      }
      const m = mgrById.get(pb.manager_id);
      if (!m) continue;
      const lvlU = { kind: "unit", id: pb.manager_id, mid: pb.manager_id, shift: s };
      const tp = ["win_from", "win_to"].map((k) => tplFor(s, tid, k)).find(Boolean);
      rows.push({
        key: `pu${pb.manager_id}-${tid}-window`, lvl: "unit", shift: s,
        mid: pb.manager_id, tid, f: "window", probOnly: true,
        who: tl(m.name),
        sub: t("admin.ltasks.reachLead").replace("{l}", m.leaders_n || 0),
        v: showVal("window", uv(pb.manager_id, tid), lvlU, tid),
        p: tp ? showVal("window", resolved({ kind: "shift", shift: s, id: null, mid: pb.manager_id }, tid), lvlU, tid)
          : showVal("window", gv(tid), { kind: "std" }, tid),
        pl: tp ? t("admin.ltasks.lvlShift").replace("{n}", s) : t("admin.ltasks.lvlStd"),
        bad: true, hours: pb.hours,
      });
    }
    return rows;
  }, [tasks, managers, leaders, settings, leaderSettings, ownMap, ownLeadMap, shiftTpl, problems, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the exceptions IN SCOPE ─────────────────────────────────────────────
  // The register above is the whole platform; what hangs under a task row is
  // the part of it the three scope picks are pointed at. A leader shows only
  // their own rows, a brigadir shows the unit's own rows AND its leaders' (they
  // are all rules in force inside that unit), a shift shows everything on it,
  // and Standart shows the lot — which is the honest answer to «is anybody
  // doing this differently anywhere».
  //
  // A shift TEMPLATE row is deliberately not listed under a brigadir: it is a
  // statement about the shift, not about this unit, and it would repeat under
  // every unit of that shift.
  const scopedRows = useMemo(() => {
    if (level.kind === "leader") return regRows.filter((r) => r.lvl === "leader" && r.lid === level.id);
    if (level.kind === "unit") return regRows.filter((r) => r.mid === level.id);
    if (level.kind === "shift") return regRows.filter((r) => Number(r.shift) === Number(level.shift));
    return regRows;
  }, [regRows, level]);
  const rowsByTask = useMemo(() => {
    const out = {};
    for (const r of scopedRows) (out[r.tid] ||= []).push(r);
    return out;
  }, [scopedRows]);
  // An EXCEPTION is a value somebody set. A refused window is counted by the
  // red mark instead — including the `probOnly` rows, which exist only because
  // an INHERITED window was refused and are therefore nobody's exception at
  // all. Both marks partition the same list, so the two numbers on a row always
  // add up to the rows underneath it.
  const excN = useMemo(() => scopedRows.filter((r) => !r.bad).length, [scopedRows]);

  // ── THE rule sentence ───────────────────────────────────────────────────
  // The heart of this page. Each task states, in one line, what is actually
  // asked of it — and a DEFAULT is not worth a word, so it is simply not said.
  // That is the whole reason the thirteen rows now look different from one
  // another: two grids failed here by drawing what every row has in common.
  //
  // A fragment reads STRONG (`--text-1`, semibold) when somebody chose it —
  // either because the value is not the platform's default (a camera, three
  // photos, a window at all) or because THIS level decided it. Everything else
  // is ordinary `--text-3` prose. Colour is never the only signal: a refused
  // window carries the ⚠ glyph as well as the red.
  const shiftLvl = (s) => ({ kind: "shift", shift: s, id: null, mid: unitsOf(s)[0]?.id ?? null });
  const winText = (v) => ((v.win_from || v.win_to)
    ? `${v.win_from || "…"}–${v.win_to || "…"}`
    : t("admin.ltasks.vWholeShift"));
  const ruleParts = (tid) => {
    const r = resolved(level, tid);
    const own = ownKeys(level, tid);
    // At Standart every field is "own" by definition (it is the floor of the
    // chain), so ownership says nothing there and only noteworthiness counts.
    const mine = (k) => level.kind !== "std" && own.has(k);
    const out = [];

    // Proof kind and photo count get the SAME per-shift treatment as the
    // window below, and for the same reason. The global level is not what the
    // plant runs on: `CAMERA_IS_PILOT` forbids camera at Standart, so the six
    // camera tasks are stored as identical rows on every unit, and `min_media`
    // 3 likewise. Reading the global row here printed «Skrinshot · 1 ta rasm»
    // on all 13 rows — uniform, which is the failure this page was rebuilt to
    // end, and false, because every unit files those six in the app camera.
    // Resolve per shift instead: one fragment when the shifts agree, labelled
    // halves when they do not, so the sentence states what is actually asked.
    const perShift = (key, render) => {
      if (level.kind !== "std" || shifts.length < 2) {
        const v = r[key];
        return { text: render(v), strong: render.strongOf(v) || mine(key) };
      }
      const vals = shifts.map((s) => ({ sh: s, v: resolved(shiftLvl(s), tid)[key] }));
      const same = vals.every((x) => x.v === vals[0].v);
      if (same) return { text: render(vals[0].v), strong: render.strongOf(vals[0].v) };
      return { halves: vals.map((x) => ({ sh: x.sh, text: render(x.v), strong: render.strongOf(x.v) })) };
    };

    const proofText = (v) => t(v === "camera" ? "admin.ltasks.proofCamera" : "admin.ltasks.proofScreenshot");
    proofText.strongOf = (v) => v === "camera";
    out.push({ k: "proof", ...perShift("proof_kind", proofText) });

    const shotsText = (v) => t("admin.ltasks.ruleShots").replace("{n}", Number(v) || 0);
    shotsText.strongOf = (v) => (Number(v) || 0) > 1;
    out.push({ k: "photos", ...perShift("min_media", shotsText) });

    // A scope that names a shift has ONE window; Standart serves both, so it
    // prints both, labelled — showing shift 1's alone is exactly how a shift-2
    // unit came to inherit a morning window (26 Aug).
    if (level.kind === "std" && shifts.length > 1) {
      out.push({
        k: "window",
        halves: shifts.map((s) => {
          const rs = resolved(shiftLvl(s), tid);
          return {
            sh: s, text: winText(rs),
            strong: !!(rs.win_from || rs.win_to),
            bad: problemsFor(shiftLvl(s), tid).length > 0,
          };
        }),
      });
    } else {
      out.push({
        k: "window", text: winText(r),
        strong: !!(r.win_from || r.win_to) || mine("win_from") || mine("win_to"),
        bad: problemsFor(level, tid).length > 0,
      });
    }

    // Only a NON-default date rule is spoken. «Sana + vaqt» is what every task
    // does unless somebody said otherwise, and saying it thirteen times is the
    // wall of repeated words this design exists to remove.
    const dm = dcMode(r);
    if (dm !== "full") {
      out.push({
        k: "dateRule", strong: true,
        text: dm === "off" ? t("admin.ltasks.ruleNoDate") : t(`admin.ltasks.dateMode.${dm}`),
      });
    }
    // Same rule for the deadline: blank is the default (the window's end, then
    // the day's own filing deadline), so only an hour somebody typed is said.
    if (r.deadline) {
      out.push({
        k: "deadline", strong: true,
        text: t("admin.ltasks.ruleDeadline").replace("{t}", r.deadline),
      });
    }
    return out;
  };

  // ── weight sums ─────────────────────────────────────────────────────────
  // Each one adds up the tasks its own reader is actually asked TODAY, per
  // shift where the reader has one: a task archived from tomorrow still counts
  // tonight, and one opening next week does not count yet.
  const sums = useMemo(() => {
    const out = {};
    for (const m of managers) out[m.id] = liveForShift(m.shift).reduce((a, td) => {
      const c = uv(m.id, td.id); return a + (c.enabled ? Number(c.weight) || 0 : 0);
    }, 0);
    return out;
  }, [managers, liveByShift, liveTasks, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaderSums = useMemo(() => {
    const out = {};
    for (const p of leaders) {
      out[p.id] = liveForShift(mgrById.get(p.manager_id)?.shift).reduce((a, td) => {
        const c = lv(p.id, p.manager_id, td.id); return a + (c.enabled ? Number(c.weight) || 0 : 0);
      }, 0);
    }
    return out;
  }, [leaders, liveByShift, liveTasks, settings, leaderSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const stdSum = useMemo(() => liveTasks.reduce((a, td) => {
    const g = gv(td.id); return a + (g.enabled ? g.weight : 0);
  }, 0), [liveTasks, tasksRaw]); // eslint-disable-line react-hooks/exhaustive-deps
  const levelSum = useMemo(() => liveForShift(level.shift).reduce((a, td) => {
    const r = resolved(level, td.id); return a + (r.enabled ? Number(r.weight) || 0 : 0);
  }, 0), [liveByShift, liveTasks, level, settings, leaderSettings, shiftTpl]); // eslint-disable-line react-hooks/exhaustive-deps
  const offSums = useMemo(() => managers.filter((m) => sums[m.id] !== 100).length, [managers, sums]);
  // The status hue rides the CHIP — its fill and its border — and never the
  // label: #eab308 as 11px text is 1.92:1 on the light card, i.e. a number the
  // reader has to guess at. The glyph carries the state as well as the colour,
  // so it still reads in greyscale.
  const warnBadge = (sum) => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums"
      style={{
        color: "var(--text-1)",
        background: sum === 0 ? "rgba(239,68,68,0.14)" : "rgba(234,179,8,0.16)",
        border: `1px solid ${sum === 0 ? "rgba(239,68,68,0.40)" : "rgba(234,179,8,0.45)"}`,
      }}
      title={sum === 0 ? t("admin.ltasks.sumZero") : t("admin.ltasks.weightWarn").replace("{sum}", sum)}>
      <AlertTriangle size={13} color={sum === 0 ? C_BAD : C_WARN} />{sum}%
    </span>
  );

  // ── the scope a write reaches ───────────────────────────────────────────
  // The descendant of the old matrix's applyScope/colScope: the LEVEL is the
  // scope now, and the count it names is stated in the modal's banner, in its
  // per-field hints and again in the confirm — because this is the one control
  // on the page that can rewrite a whole shift.
  const applyScope = (lvl = level) => {
    if (lvl.kind === "leader") return { level: "leader", ids: [lvl.id] };
    if (lvl.kind === "unit") return { level: "supervisor", ids: [lvl.id] };
    if (lvl.kind === "shift") return { level: "supervisor", ids: unitsOf(lvl.shift).map((m) => m.id) };
    // The Standart level writes the definition itself, so it names nobody —
    // but it still REACHES every unit, which is what the scope banner says.
    return { level: "global", ids: managers.map((m) => m.id) };
  };
  // How a WRITE addresses this level. Standart is the global level and carries
  // no ids at all; a shift is the fan-out over its units; the two lower levels
  // address exactly one row.
  const colScope = (lvl = level) => {
    if (lvl.kind === "std") return {};
    const { ids } = applyScope(lvl);
    if (lvl.kind === "shift") return { manager_ids: ids };
    return lvl.kind === "unit" ? { manager_id: ids[0] } : { leader_id: ids[0] };
  };
  const leadersUnder = (lvl) => (
    lvl.kind === "leader" ? 1
      : lvl.kind === "unit" ? (mgrById.get(lvl.id)?.leaders_n || 0)
        : lvl.kind === "shift" ? unitsOf(lvl.shift).reduce((a, m) => a + (m.leaders_n || 0), 0)
          : leaders.length
  );
  const levelName = (lvl) => (lvl.kind === "std" ? t("admin.ltasks.lvlStd")
    : lvl.kind === "shift" ? t("admin.ltasks.lvlShift").replace("{n}", lvl.shift)
      : lvl.kind === "unit" ? tl(mgrById.get(lvl.id)?.name || "")
        : tl(leaderById.get(lvl.id)?.name || ""));
  const reachText = (lvl) => (lvl.kind === "leader"
    ? t("admin.ltasks.reachLead").replace("{l}", 1)
    : lvl.kind === "unit"
      ? t("admin.ltasks.reachLead").replace("{l}", leadersUnder(lvl))
      : t("admin.ltasks.reachMgrLead")
        .replace("{m}", lvl.kind === "shift" ? unitsOf(lvl.shift).length : managers.length)
        .replace("{l}", leadersUnder(lvl)));

  // ── the bulk criteria editor ────────────────────────────────────────────
  // Every definition-of-done actually STORED, flattened: the global level first
  // (what every uncustomised row inherits), then the overrides that carry their
  // own copy. The overrides have to be here — one left in capitals is invisible
  // from the sheet, and fixing only the global texts would leave those units
  // still shouting at their leaders.
  const criteriaItems = useMemo(() => {
    const out = [];
    const push = (key, task, scope, text, extra) =>
      out.push({ key, taskId: task.id, task: tname(task), scope, text, ...extra });
    for (const task of tasks) push(`g${task.id}`, task, t("admin.ltasks.textsGlobal"), task.criteria || "", {});
    for (const m of managers) for (const task of tasks) {
      const text = settings[String(m.id)]?.[String(task.id)]?.criteria;
      if (text) push(`m${m.id}-${task.id}`, task, tl(m.name), text, { managerId: m.id });
    }
    for (const p of leaders) for (const task of tasks) {
      const text = leaderSettings[String(p.id)]?.[String(task.id)]?.criteria;
      if (text) push(`l${p.id}-${task.id}`, task, tl(p.name), text, { leaderId: p.id });
    }
    return out;
  }, [tasks, managers, leaders, settings, leaderSettings, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Written one at a time, deliberately: these land on the SAME override rows
  // the editor writes, and two parallel inserts race the row's unique key (the
  // lesson the camera pilot paid for on its first day). A failure stops the run
  // and stays on the modal with the count that did land — the rest are still in
  // the boxes, so pressing Save again finishes the job.
  const saveTexts = async (list) => {
    setTxtErr("");
    setTxtSave({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      try {
        await api.put("/admin/leader-tasks/criteria", {
          task_id: it.taskId,
          ...(it.managerId ? { manager_id: it.managerId } : {}),
          ...(it.leaderId ? { leader_id: it.leaderId } : {}),
          criteria: it.text,
        });
      } catch (e) {
        const d = e?.response?.data?.detail;
        setTxtSave(null);
        invalidate();
        setTxtErr(t("admin.ltasks.textsErr").replace("{n}", i)
          .replace("{e}", (typeof d === "string" && d) || t("admin.ltasks.fail")));
        return;
      }
      setTxtSave({ done: i + 1, total: list.length });
    }
    setTxtSave(null);
    setShowTexts(false);
    invalidate();
    toast.success(t("admin.ltasks.textsDone").replace("{n}", list.length));
  };

  // ── the writers ─────────────────────────────────────────────────────────
  // Each one is skipped when nothing changed, and every one of them lands on
  // the SAME override row — so they run one AFTER another, awaited, never
  // fired together (2026-08-19: two parallel inserts raced the row's unique key
  // and the modal reported success for a value that was never stored).
  const saveCriteria = (draft, stored, ids) => {
    if ((draft || "") === (stored || "")) return undefined;
    return critMut.mutateAsync({ ...ids, criteria: draft || "" });
  };
  // Same shape, and skipped when unchanged for the same reason — but note what
  // is NOT true of it: this text reaches no scoring path, so unlike the window
  // or the criteria a write here can never re-judge a stored verdict.
  const saveDescription = (draft, stored, ids) => {
    if ((draft || "") === (stored || "")) return undefined;
    return descMut.mutateAsync({ ...ids, description: draft || "" });
  };
  // Skipped when unchanged like the criteria — and for a sharper reason here:
  // every window write re-derives that task's existing verdicts, so a no-op
  // save would churn the triage queue for a modal opened only to read.
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
  // The draft opens on the value IN FORCE, so a draft still equal to what this
  // level inherits goes out as null ("keep inheriting") and only a divergence
  // is stored. `inherited` is undefined at the STANDART level, which inherits
  // from nothing.
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
  // reason. `stored` is the level's RAW value, null when it holds no override,
  // which is what makes the no-op test correct in both directions: pinning True
  // where True was inherited is a real change.
  //
  // The three flags go out one AFTER the other, awaited, never fired together:
  // all three materialise the same override row when the level has none, and
  // concurrent inserts race its unique key. Returns whether every write landed
  // and NEVER rejects — a rejected promise nobody catches is a console error on
  // a failure the mutation's own onError has already toasted.
  const saveDateRule = async (draft, stored, inherited, ids) => {
    for (const [key, mut] of [["date_check", dcMut], ["time_check", tcMut],
                              ["day_check", dayMut]]) {
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
  // A text left EQUAL to what it inherits is not an override: it goes out as ""
  // (clear / inherit), and only a diverging value is stored.
  const ownText = (v, inherited) => {
    const s = (v || "").trim();
    return s === (inherited || "").trim() ? "" : s;
  };

  // What is RAW at a level — what "already stored here" means for the no-op
  // tests, and what the editor seeds its own-value fields from.
  const rawAt = (lvl, tid) => {
    if (lvl.kind === "std") {
      const g = gv(tid);
      return { criteria: g.criteria, description: g.description, win_from: g.win_from, win_to: g.win_to, deadline: g.deadline, date_check: g.date_check, time_check: g.time_check, day_check: g.day_check, proof_kind: g.proof_kind, names: g.names, enabled: g.enabled, min_media: g.min_media, weight: g.weight };
    }
    if (lvl.kind === "leader") return getOv(lvl.id, tid) || {};
    if (lvl.kind === "shift") {
      // A shift has no row in the data model, so its RAW value is the TEMPLATE
      // — the value the sheet cell in front of the reader actually prints.
      //
      // It used to be read off a SAMPLE unit (`unitsOf(shift)[0]`), and that is
      // wrong in both directions on exactly the cell an admin opens this modal
      // for: a MIXED cell («08:00–10:00 · 6/8»). The editor could seed from a
      // row the cell never showed, and — worse — every skip-when-unchanged
      // guard below compared the Save against that one unit, so an admin
      // making the shift uniform pressed Save, the guard found unit[0] already
      // holding that value, NOTHING was written and the modal reported success.
      const out = {};
      for (const k of FIELD_KEYS) {
        const tp = tplFor(lvl.shift, tid, k);
        // Absent from the template = this shift decides nothing about that
        // field, which is what a null raw value means one level down: inherit.
        // Never `undefined` — the date flags are tri-state and `?? null` is
        // what every guard tests them with.
        out[k] = tp ? tp.v : null;
      }
      return out;
    }
    return getCell(lvl.id, tid);
  };
  // The TRUE parent of a level — what clearing a value here would fall back to.
  // Deliberately NOT the shift template for a unit: the data model has no shift
  // level, so an emptied unit field lands on the GLOBAL value, and a form that
  // promised otherwise would silently move the value.
  const parentOf = (lvl, tid) => {
    if (lvl.kind === "std") return undefined;
    if (lvl.kind === "leader") return uv(lvl.mid, tid);
    return gv(tid);
  };

  // The editor's draft, built from the chain — pure, so opening the modal and
  // reasoning about what it will write are the same computation.
  const draftFor = (tid, lvl = level) => {
    const r = resolved(lvl, tid);
    const raw = rawAt(lvl, tid);
    const isStd = lvl.kind === "std";
    return {
      tid, lvl,
      when: "now",
      // The numbers and the status open on the value IN FORCE, as they always
      // have; the texts open on this level's OWN value, with what they inherit
      // as the placeholder, so a blank field reads as "inherited" rather than
      // as "empty".
      enabled: r.enabled, min_media: r.min_media, weight: r.weight,
      names: isStd ? { ...r.names } : Object.fromEntries(LANGS.map((l) => [l, raw.names?.[l] || ""])),
      note: Object.fromEntries(LANGS.map((l) => [l, taskById.get(tid)?.note?.[l] || ""])),
      criteria: isStd ? r.criteria : (raw.criteria || ""),
      description: isStd ? r.description : (raw.description || ""),
      win_from: isStd ? r.win_from : (raw.win_from || ""),
      win_to: isStd ? r.win_to : (raw.win_to || ""),
      deadline: isStd ? r.deadline : (raw.deadline || ""),
      date_check: r.date_check, time_check: r.time_check, day_check: r.day_check,
      proof_kind: r.proof_kind,
    };
  };
  const openEdit = (tid, lvl = level) => setEdit(draftFor(tid, lvl));

  // ONE save chain for every level. Instant fields first, in a fixed order,
  // each skipped when unchanged and each awaited; the STAGED half (names,
  // status, weight, photos — the only fields the "from next day" switch
  // governs) goes last, because it is the write that closes the modal.
  const saveRule = async () => {
    const { tid, lvl } = edit;
    // Every writer here is addressed by (task, level): the task id is always on
    // the body, the level supplies the ids that narrow it — or none at all at
    // the Standart level, which IS the global row.
    const ids = { task_id: tid, ...colScope(lvl) };
    const stored = rawAt(lvl, tid);
    const inh = parentOf(lvl, tid);
    const criteria = ownText(edit.criteria, inh?.criteria);
    const description = ownText(edit.description, inh?.description);
    const win_from = ownText(edit.win_from, inh?.win_from);
    const win_to = ownText(edit.win_to, inh?.win_to);
    const deadline = ownText(edit.deadline, inh?.deadline);
    try {
      await saveCriteria(criteria, stored.criteria, ids);
      await saveDescription(description, stored.description, ids);
      await saveWindow({ win_from, win_to }, stored, ids);
      await saveDeadline({ deadline }, stored, ids);
      if (!await saveDateRule(edit, stored, inh, ids)) return;
      // Never at the Standart level: the backend refuses a global camera
      // (CAMERA_IS_PILOT) and the control is not offered there either.
      if (lvl.kind !== "std"
        && !await saveProofKind(edit, stored, inh?.proof_kind, ids)) return;
    } catch { return; }

    const mm = Number(edit.min_media) || 0;
    const w = Number(edit.weight) || 0;
    const namesChanged = LANGS.some((l) => (edit.names?.[l] || "") !== (stored.names?.[l] || ""));
    const noteChanged = lvl.kind === "std"
      && LANGS.some((l) => (edit.note?.[l] || "") !== (taskById.get(tid)?.note?.[l] || ""));

    if (lvl.kind === "std") {
      const wChanged = w !== Number(gv(tid).weight);
      if (!namesChanged && !noteChanged && !wChanged) { setEdit(null); ping(); return; }
      taskMut.mutate({
        task_id: tid, when: edit.when,
        ...(namesChanged ? { names: edit.names } : {}),
        ...(noteChanged ? { note: edit.note } : {}),
        ...(wChanged ? { default_weight: w } : {}),
      });
      setEdit(null);
      return;
    }
    if (lvl.kind === "shift") {
      // Two writes, sequential: the rename lands as a per-row override on every
      // unit of the shift, the trio through the bulk push that already exists.
      const trioChanged = trioDiffers();
      try {
        if (namesChanged) await taskMut.mutateAsync({ task_id: tid, names: edit.names, when: edit.when, ...ids });
      } catch { return; }
      if (!trioChanged) { setEdit(null); ping(); return; }
      applyMut.mutate({ task_id: tid, enabled: edit.enabled, min_media: mm, weight: w, when: edit.when, ...ids });
      return;
    }
    if (lvl.kind === "unit") {
      const base = getCell(lvl.id, tid);
      // A name left EQUAL to what this unit inherits is not an override — it
      // goes out as "" (inherit), exactly as the leader branch below already
      // did. Written raw it stored a phantom copy of the global name, which
      // then showed up in the register as an exception nobody had made.
      const nextNames = Object.fromEntries(LANGS.map((l) => [l, ownText(edit.names?.[l], inh?.names?.[l])]));
      const namesDiffer = LANGS.some((l) => nextNames[l] !== (base.names?.[l] || ""));
      if (!namesDiffer && edit.enabled === base.enabled
        && mm === Number(base.min_media) && w === Number(base.weight)) { setEdit(null); ping(); return; }
      cellMut.mutate({
        task_id: tid, manager_id: lvl.id,
        enabled: edit.enabled, min_media: mm, weight: w,
        names: nextNames,
        when: edit.when,
      });
      return;
    }
    const base = uv(lvl.mid, tid);
    const ov = getOv(lvl.id, tid);
    const nextNames = Object.fromEntries(LANGS.map((l) => [l, ownText(edit.names?.[l], base.names[l])]));
    const changed = LANGS.some((l) => nextNames[l] !== (ov?.names?.[l] || ""))
      || edit.enabled !== base.enabled || mm !== Number(base.min_media) || w !== Number(base.weight);
    if (!changed) { setEdit(null); ping(); return; }
    leaderMut.mutate({
      task_id: tid, leader_id: lvl.id,
      enabled: edit.enabled === base.enabled ? null : edit.enabled,
      min_media: mm === Number(base.min_media) ? null : mm,
      weight: w === Number(base.weight) ? null : w,
      names: nextNames,
      when: edit.when,
    });
  };
  // Does the staged trio differ from what this level already resolves to?
  const trioDiffers = () => {
    if (!edit) return false;
    const r = resolved(edit.lvl, edit.tid);
    return edit.enabled !== r.enabled
      || (Number(edit.min_media) || 0) !== Number(r.min_media)
      || (Number(edit.weight) || 0) !== Number(r.weight);
  };

  // A write that fans out over a whole shift states its count and waits for a
  // yes — it is the one press on this page that can change what a hundred
  // people are asked to do, and the camera reached every leader on the platform
  // once already (2026-08-19) because nothing stood between the control and the
  // rows it wrote.
  const askSaveRule = () => {
    if (!edit) return;
    const lvl = edit.lvl;
    if (lvl.kind !== "shift") { saveRule(); return; }
    const n = applyScope(lvl).ids.length;
    const pkChanged = (edit.proof_kind || "screenshot") !== resolved(lvl, edit.tid).proof_kind;
    const trio = trioDiffers();
    if (!pkChanged && !trio) { saveRule(); return; }
    const parts = [];
    if (pkChanged) parts.push(t("admin.ltasks.proofConfirm.units").replace("{n}", n)
      .replace("{mode}", t(`admin.ltasks.proofMode.${edit.proof_kind || "screenshot"}`)));
    if (trio) parts.push(t("admin.ltasks.applyFiltHint").replace("{n}", n));
    setConfirm({
      title: t("admin.ltasks.lvlShift").replace("{n}", lvl.shift),
      message: parts.join(" "), tone: "warning",
      confirmLabel: t("admin.ltasks.applyToMgrs").replace("{n}", n),
      onConfirm: () => { setConfirm(null); saveRule(); },
    });
  };

  const askReset = () => setConfirm({
    title: t("admin.ltasks.reset"), message: t("admin.ltasks.removeOverrideMsg"), tone: "danger",
    confirmLabel: t("admin.ltasks.reset"),
    onConfirm: () => leaderMut.mutate({ leader_id: edit.lvl.id, task_id: edit.tid, reset: true, when: "now" }),
  });
  const askCancel = (pc) => setConfirm({
    title: t("admin.ltasks.cancelChange"), message: t("admin.ltasks.cancelChangeMsg"), tone: "danger",
    confirmLabel: t("admin.ltasks.cancelChange"), onConfirm: () => cancelMut.mutate({ pending_id: pc.id }),
  });
  const askRevert = (a) => setConfirm({
    title: t("admin.ltasks.revert"), message: t("admin.ltasks.revertMsg"), tone: "warning",
    confirmLabel: t("admin.ltasks.revert"), onConfirm: () => revertMut.mutate({ audit_id: a.id }),
  });
  const askDeleteExample = (id) => setConfirm({
    title: t("admin.ltasks.exampleDelTitle"), message: t("admin.ltasks.exampleDelMsg"),
    tone: "danger", confirmLabel: t("common.delete"),
    onConfirm: () => exDelMut.mutate(id),
  });
  // ONE uploader for every level. The scope rides in explicitly — never
  // inferred from which modal is open — so a photo can no more reach past the
  // level on screen than the criteria beside it can.
  const uploadExampleTo = (taskId, scope) => (file) => {
    if (file.size > 10 * 1024 * 1024) { toast.error(t("profile.photoTooLarge")); return; }
    exAddMut.mutate({ taskId, file, ...scope });
  };

  // ── one unit's own settings ─────────────────────────────────────────────
  // Three switches, TWO endpoints, and they go one AFTER the other, awaited.
  // `per_task_close` and `bot_from` ride together because they are literally
  // one `LeaderUnitSetting` row; `cell_from` is a second write onto that SAME
  // row, so it can never be fired beside them — two parallel inserts against a
  // unit that has never been edited race its unique key and one of them dies
  // while the panel reports success (2026-08-19).
  //
  // The unit write goes FIRST because it is the one that can be REFUSED — a
  // rehearsal window on shift 2 is a hard 400 — and a refusal must not leave
  // the per-cell floor already written behind it.
  const savingUnit = unitMut.isPending || cellFromMut.isPending;
  const saveUnit = async () => {
    if (!unit) return;
    const m = mgrById.get(unit.mid);
    const perTask = !!unit.per_task_close;
    const botFrom = (unit.bot_from || "").trim();
    const cellFrom = (unit.cell_from || "").trim();
    const unitChanged = perTask !== !!m?.per_task_close || botFrom !== (m?.bot_from || "");
    const cellChanged = cellFrom !== (m?.cell_from || "");
    if (!unitChanged && !cellChanged) { setUnit(null); ping(); return; }
    try {
      if (unitChanged) {
        const d = await unitMut.mutateAsync({
          manager_id: unit.mid, per_task_close: perTask, bot_from: botFrom,
        });
        // Queued AI work the rehearsal window just took back — the one visible
        // consequence of this save that neither field states.
        if (d?.dropped) toast.success(t("admin.ltasks.botFromDropped").replace("{n}", d.dropped));
      }
      if (cellChanged) {
        await cellFromMut.mutateAsync({ rows: [{ manager_id: unit.mid, cell_from: cellFrom }] });
      }
    } catch { return; }   // each mutation's own onError has already said why
    invalidate();
    setUnit(null);
    ping();
  };

  // ── the catalog presses ─────────────────────────────────────────────────
  const askArchive = () => {
    if (!arch) return;
    const td = taskById.get(arch.tid);
    const w = gv(arch.tid).weight;
    setConfirm({
      title: t("admin.ltasks.archTitle"), tone: "danger",
      message: t("admin.ltasks.archConfirm")
        .replace("{task}", tname(td)).replace("{date}", arch.from || "")
        .replace("{a}", stdSum).replace("{b}", Math.max(0, stdSum - w))
        .replace("{l}", leaders.length),
      confirmLabel: t("admin.ltasks.archDo"),
      onConfirm: () => archMut.mutate({ task_id: arch.tid, archived_from: arch.from || null }),
    });
  };
  const askRestore = (td) => setConfirm({
    title: t("admin.ltasks.archRestore"), tone: "warning",
    message: t("admin.ltasks.archRestoreMsg").replace("{task}", tname(td)).replace("{date}", floor),
    confirmLabel: t("admin.ltasks.archRestore"),
    onConfirm: () => archMut.mutate({ task_id: td.id, archived_from: null }),
  });
  const askAdd = () => {
    if (!addTask) return;
    const w = Number(addTask.weight) || 0;
    const day = addTask.active_from || floor;
    // A new task is asked of EVERY leader it reaches the day it opens, and the
    // score is divided by the new sum — two consequences an admin cannot see
    // from the form, so the confirm states both before anything is written.
    const reach = addTask.who === "all" ? leaders.length
      : addTask.who === "pick"
        ? addTask.mgrs.reduce((a, id) => a + (mgrById.get(id)?.leaders_n || 0), 0)
        : unitsOf(addTask.who === "shift1" ? 1 : 2).reduce((a, m) => a + (m.leaders_n || 0), 0);
    setConfirm({
      title: t("admin.ltasks.addTitle"), tone: "warning",
      message: `${t("admin.ltasks.addConfirm").replace("{date}", day).replace("{n}", reach)} `
        + t("admin.ltasks.addWeightWarn").replace("{a}", stdSum).replace("{b}", stdSum + w),
      confirmLabel: t("admin.ltasks.addCreate"),
      onConfirm: () => addMut.mutate({
        names: addTask.names,
        note: addTask.note,
        criteria: addTask.criteria || "",
        description: addTask.description || "",
        default_weight: w,
        default_min_media: Number(addTask.min_media) || 1,
        // Blank would land on the backend's own floor; the form shows that
        // date and lets it be pushed further out, so it is sent explicitly.
        active_from: day,
        ...(addTask.who === "shift1" ? { manager_ids: unitsOf(1).map((m) => m.id) }
          : addTask.who === "shift2" ? { manager_ids: unitsOf(2).map((m) => m.id) }
            : addTask.who === "pick" ? { manager_ids: addTask.mgrs } : {}),
      }),
    });
  };

  // ── filters ─────────────────────────────────────────────────────────────
  // The brigadir list is the whole register; the LIDER list is narrowed by the
  // brigadir above it and SAYS so, offers the way back out, and drops a pick
  // its own list no longer offers.
  const mgrLabel = (id) => tl(mgrById.get(id)?.name || "") || `#${id}`;
  const leadLabel = (id) => tl(leaderById.get(id)?.name || "") || `#${id}`;
  // A stored pick that no longer names anybody (a brigadir who left the
  // register between two visits) must not survive as a chip, a strip tab or a
  // filter label — `level` already degrades to Standart, and a control naming
  // a row the page cannot show is worse than a reset.
  const pickUv = pickU && mgrById.has(pickU) ? pickU : null;
  const pickLv = pickL && leaderById.has(pickL) ? pickL : null;
  // Each list is built UNDER the level above it.
  const mgrOpts = useMemo(() => (fShift === 1 || fShift === 2
    ? managers.filter((m) => Number(m.shift) === Number(fShift)) : managers),
    [managers, fShift]);
  const leaderOpts = useMemo(() => (pickUv
    ? (leadersByMgr[pickUv] || []) : leaders), [pickUv, leaders, leadersByMgr]);
  useEffect(() => {
    if (pickL && !leaderOpts.some((p) => p.id === pickL)) setPickL(null);
  }, [pickU, leaderOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  // The three picks persist INDEPENDENTLY, so a reload can restore a pair no
  // click can produce: `pickUnit` always fills the shift in, but localStorage
  // hands back a shift-2 brigadir beside a shift filter of 0. The chain then
  // derives «Smena 2» from that unit while the Smena control right above it
  // says no shift is picked — two statements about one thing, disagreeing on
  // the row they share, and the reader has no way to tell which is in force.
  // Reconcile the restored pair exactly as the click would have.
  useEffect(() => {
    if (!pickUv) return;
    const s = Number(mgrById.get(pickUv)?.shift) || 0;
    if (s && Number(fShift) !== s) setFShift(s);
  }, [pickUv, mgrById]); // eslint-disable-line react-hooks/exhaustive-deps

  // A parent pick FILLS ITS PARENTS IN (picking a leader names their brigadir
  // and their shift), and a parent change DROPS a child its list no longer
  // offers — a control naming a row the page cannot show is worse than a reset.
  const pickShift = (s) => {
    setFShift(s);
    if (s && pickU && Number(mgrById.get(pickU)?.shift) !== Number(s)) { setPickU(null); setPickL(null); }
  };
  const pickUnit = (id) => {
    setPickU(id);
    setPickL(null);
    if (id) setFShift(Number(mgrById.get(id)?.shift) || 0);
  };
  const pickLeader = (id) => {
    setPickL(id);
    if (id) {
      const p = leaderById.get(id);
      if (p) { setPickU(p.manager_id); setFShift(Number(mgrById.get(p.manager_id)?.shift) || 0); }
    }
  };

  // THE scope zone: one FilterPanel, three sections, cascading. Never three
  // standalone selects stacked over the list — same zone, same chips and same
  // bottom sheet on a phone as every other page on the platform.
  const scopeSections = [
    {
      key: "shift", icon: Clock, label: t("admin.ltasks.fShift"),
      active: fShift === 1 || fShift === 2,
      display: fShift ? t("admin.ltasks.lvlShift").replace("{n}", fShift) : "",
      // Clearing the shift keeps whatever brigadir is picked — the pick is the
      // narrower answer and it still names its own shift.
      onClear: () => setFShift(0),
      render: () => (
        <SegmentedToggle fill size="sm" value={fShift} onChange={pickShift}
          options={[[0, t("admin.ltasks.fAllShifts")],
          ...shifts.map((s) => [s, t("admin.ltasks.lvlShift").replace("{n}", s)])]} />
      ),
    },
    {
      key: "mgr", icon: UserCog, label: t("admin.ltasks.supervisor"),
      active: !!pickUv, display: pickUv ? mgrLabel(pickUv) : "",
      onClear: () => pickUnit(null),
      render: ({ close }) => (
        <PickFilter searchable close={close} value={pickUv ?? "-"}
          onChange={(v) => pickUnit(v === "-" ? null : v)}
          note={fShift ? t("admin.ltasks.narrowedBy")
            .replace("{name}", t("admin.ltasks.lvlShift").replace("{n}", fShift))
            .replace("{n}", mgrOpts.length) : null}
          empty={fShift ? (
            <div className="text-center py-2">
              <p className="text-xs mb-1.5" style={{ color: "var(--text-4)" }}>{t("admin.ltasks.fNone")}</p>
              <Button size="sm" variant="ghost" onClick={() => setFShift(0)}>{t("admin.ltasks.fClear")}</Button>
            </div>
          ) : null}
          // The «Barchasi» row is dropped when the narrowed list is empty:
          // PickFilter shows `empty` only for an EMPTY list, so a placeholder
          // here would keep the way back out permanently unreachable.
          opts={[...(mgrOpts.length ? [{ value: "-", label: t("admin.ltasks.pickNone") }] : []),
          ...mgrOpts.map((m) => ({ value: m.id, label: `${tl(m.name)} · S${m.shift ?? "?"}`, title: tl(m.name) }))]} />
      ),
    },
    {
      key: "lead", icon: Users, label: t("admin.ltasks.fLeader"),
      active: !!pickLv, display: pickLv ? leadLabel(pickLv) : "",
      onClear: () => pickLeader(null),
      render: ({ close }) => (
        <PickFilter searchable close={close} value={pickLv ?? "-"}
          onChange={(v) => pickLeader(v === "-" ? null : v)}
          note={pickUv ? t("admin.ltasks.narrowedBy").replace("{name}", mgrLabel(pickUv)).replace("{n}", leaderOpts.length) : null}
          empty={pickUv ? (
            <div className="text-center py-2">
              <p className="text-xs mb-1.5" style={{ color: "var(--text-4)" }}>{t("admin.ltasks.noLeaders")}</p>
              <Button size="sm" variant="ghost" onClick={() => pickUnit(null)}>{t("admin.ltasks.clearBrig")}</Button>
            </div>
          ) : null}
          // Same rule as the brigadir list above: no placeholder row when the
          // list is empty, or «this brigadir has no leaders» never renders and
          // the cascade has no way back out.
          opts={[...(leaderOpts.length ? [{ value: "-", label: t("admin.ltasks.pickNone") }] : []),
          ...leaderOpts.map((p) => ({ value: p.id, label: tl(p.name), title: tl(p.name) }))]} />
      ),
    },
  ];

  // Pressing an exception (or the red alert) POINTS THE PAGE AT IT and opens
  // the editor at that exact level — so what the reader was looking at and what
  // the form writes can never be two different scopes.
  const focusTask = (tid) => {
    setOpenRow(tid);
    // The row may be a screen away; let it render at its new height first.
    requestAnimationFrame(() => rowRefs.current[tid]?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const scopeTo = (r) => {
    if (r.lvl === "leader") pickLeader(r.lid);
    else if (r.lvl === "unit") pickUnit(r.mid);
    else { setPickU(null); setPickL(null); setFShift(r.shift); }
  };
  const openException = (r) => {
    scopeTo(r);
    const lvl = r.lvl === "leader"
      ? { kind: "leader", id: r.lid, mid: r.mid, shift: r.shift }
      : r.lvl === "unit" ? { kind: "unit", id: r.mid, mid: r.mid, shift: r.shift }
        : { kind: "shift", id: null, mid: unitsOf(r.shift)[0]?.id ?? null, shift: r.shift };
    openEdit(r.tid, lvl);
  };


  const descPending = (pc) => {
    if (pc.kind === "global_task") { const k = taskById.get(pc.task_id); return `${t("admin.ltasks.rename")}: ${k ? tname(k) : "T" + pc.task_id}`; }
    if (pc.kind === "leader") { const p = leaderById.get(pc.leader_id); const k = taskById.get(pc.task_id); return `${p ? tl(p.name) : "?"} · ${k ? tname(k) : "T" + pc.task_id}`; }
    const m = mgrById.get(pc.manager_id); return m ? tl(m.name) : `#${pc.manager_id}`;
  };

  // ── the editor's field helpers ──────────────────────────────────────────
  const editLvl = edit?.lvl || level;
  const editTask = edit ? taskById.get(edit.tid) : null;
  const editInh = edit ? parentOf(editLvl, edit.tid) : null;
  const editOwn = edit ? ownKeys(editLvl, edit.tid) : new Set();
  const isStd = editLvl.kind === "std";
  const ownPill = (k) => (editOwn.has(k) ? (
    <span className="ml-1.5 align-middle rounded px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal"
      style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
      {t("admin.ltasks.ownHere")}
    </span>
  ) : null);
  // The one field that has no level below Standart — said on the label, not
  // only in a hint, because the hint is what a reader skips.
  const stdPill = (
    <span className="ml-1.5 align-middle rounded px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal"
      style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
      {t("admin.ltasks.onlyStd")}
    </span>
  );
  const withMark = (label, mark) => (mark ? <>{label}{mark}</> : label);
  const inheritLine = (k, shown) => {
    if (isStd || !editInh) return null;
    const text = editOwn.has(k)
      ? t("admin.ltasks.inheritWouldBe").replace("{v}", shown).replace("{from}", tagLabel("std"))
      : t("admin.ltasks.inheritIs").replace("{v}", shown).replace("{from}", tagLabel("std"));
    return <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>{text}</div>;
  };

  const numField = (label, value, onChange, max, hint) => (
    <FormField label={label} hint={hint} required>
      <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle} />
    </FormField>
  );
  const readOnlyField = (label, value, hint) => (
    <FormField label={label} hint={hint}>
      <div className={inputCls} style={{ ...inputStyle, opacity: 0.7 }}>{value}</div>
    </FormField>
  );

  const cellExScope = () => (editLvl.kind === "std" ? { level: "global" }
    : editLvl.kind === "shift" ? { manager_ids: unitsOf(editLvl.shift).map((m) => m.id), level: "supervisor" }
      : editLvl.kind === "unit" ? { manager_ids: [editLvl.id], level: "supervisor" }
        : { leader_ids: [editLvl.id], level: "leader" });
  const editExR = edit ? exOf(edit.tid, editLvl.kind === "shift" ? unitsOf(editLvl.shift)[0]?.id : editLvl.mid,
    editLvl.kind === "leader" ? editLvl.id : null) : { ids: [], level: "global" };
  const editExOwn = edit ? exIsOwn(editLvl, edit.tid) : false;
  const editExNote = () => (editLvl.kind === "std" ? t("admin.ltasks.examplesScopeGlobal")
    : editLvl.kind === "shift" ? t("admin.ltasks.examplesScopeMgrs").replace("{n}", unitsOf(editLvl.shift).length)
      : editLvl.kind === "unit" ? t("admin.ltasks.examplesScopeUnit")
        : t("admin.ltasks.examplesScopeLeader"));

  const editNext = edit ? nextForShift(editLvl.shift || 1) : "";
  const editProblems = edit ? problemsFor(editLvl, edit.tid) : [];
  // ── what a BLANK window end actually falls back to ──────────────────────
  // The SHIFT default, served as `shift_windows` rather than restated here: a
  // placeholder that disagreed with the hours the reviewer measures against
  // would be worse than no placeholder at all. With no fallback shown, a
  // window left blank all the way up the chain rendered an empty box while the
  // AI went on judging every photo against 08:00–20:00.
  const shiftWins = data?.shift_windows ?? {};
  const winDefault = (shift, end) => (shiftWins[String(shift)] || [])[end] || "";
  // The Standart level serves BOTH shifts, so it cannot name one default — it
  // names both, labelled, instead of quietly showing shift 1's.
  const bothWinDefaults = (end) => Object.keys(shiftWins).sort()
    .map((s) => `${s}: ${winDefault(s, end)}`).join(" · ");
  const winPh = (end) => {
    const inh = end ? editInh?.win_to : editInh?.win_from;
    if (inh) return inh;
    return isStd ? bothWinDefaults(end) : winDefault(editLvl.shift, end);
  };
  const savingRule = cellMut.isPending || leaderMut.isPending || taskMut.isPending
    || applyMut.isPending || critMut.isPending || descMut.isPending || winMut.isPending
    || dlMut.isPending || dcMut.isPending || tcMut.isPending || dayMut.isPending
    || pkMut.isPending;

  // ── render ──────────────────────────────────────────────────────────────
  const bannerRows = problems ? problems.filter((p) => p.enabled !== false) : [];
  const bad0 = bannerRows[0] || null;

  // The chain, spelled out: every level in force, narrowest LAST and bold.
  const chain = [t("admin.ltasks.lvlStd")];
  if (level.shift) chain.push(t("admin.ltasks.lvlShift").replace("{n}", level.shift));
  if (pickUv) chain.push(mgrLabel(pickUv));
  if (pickLv) chain.push(leadLabel(pickLv));

  const sep = (
    <span aria-hidden="true" className="mx-1.5" style={{ color: "var(--text-4)" }}>·</span>
  );
  // One window fragment. A refused window carries the warning ICON as well as
  // the red, so it survives greyscale and a colourblind reader.
  // A refused window puts the red on a CHIP and keeps the label in --text-1:
  // #ef4444 as 12.5px text measures 3.76:1 on the light card and 4.47:1 on the
  // dark one, both under the AA floor for text this size. The hue on a tinted
  // ground carries the status, the ink stays legible, and the warning icon
  // means it survives greyscale and a colourblind reader either way.
  const winSpan = (f, key) => (
    <span key={key} className={f.strong || f.bad ? "font-semibold" : ""}
      style={f.bad ? {
        color: "var(--text-1)", background: "rgba(239,68,68,0.14)",
        border: "1px solid rgba(239,68,68,0.40)", borderRadius: 4, padding: "0 5px",
      } : { color: f.strong ? "var(--text-1)" : "inherit" }}>
      {f.text}
      {f.bad && <AlertTriangle size={11} className="inline-block ml-1 -mt-px" aria-hidden="true" />}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* ── page head: what this list is, and the ONE primary action ─────── */}
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-xs leading-relaxed flex-1 min-w-[240px]" style={{ color: "var(--text-3)" }}>
          {t("admin.ltasks.pageSub").replace("{n}", liveTasks.length)}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="lg" variant="ghost" icon={<History size={14} />} onClick={() => setShowHistory(true)}>
            {t("admin.ltasks.history")}
          </Button>
          <Button size="lg" icon={<Plus size={14} />} onClick={() => setAddTask({
            names: {}, note: {}, criteria: "", description: "", weight: 5, min_media: 1,
            who: "all", active_from: floor, mgrs: [],
          })}>
            {t("admin.ltasks.addTask")}
          </Button>
        </div>
      </div>

      {/* ── the one alert: windows nobody on that shift can work ──────────── */}
      {/* The 26-Aug incident class, named BEFORE it bites rather than
          discovered in a leader's score — and it names the PERSON, because
          «6 ta oyna» is a number nobody can act on while «Tursunboyev
          Abduqodir» is somebody you can go and fix. */}
      {bad0 && (
        <div className="rounded-2xl px-3.5 py-3 flex flex-wrap items-center gap-2.5"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" }}>
          <AlertTriangle size={16} className="flex-shrink-0" style={{ color: C_BAD }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
              {t("admin.ltasks.bannerTitle").replace("{n}", bannerRows.length)}
            </div>
            <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-2)" }}>
              {t("admin.ltasks.bannerBody")
                .replace("{who}", bad0.leader_id ? leadLabel(bad0.leader_id) : mgrLabel(bad0.manager_id))
                .replace("{win}", (bad0.win || []).join("–"))
                .replace("{shift}", bad0.shift ?? "?")
                .replace("{hours}", (bad0.hours || []).join("–"))}
            </div>
          </div>
          <Button size="lg" tint variant="danger" className="flex-shrink-0"
            onClick={() => {
              scopeTo({
                lvl: bad0.leader_id ? "leader" : "unit",
                lid: bad0.leader_id, mid: bad0.manager_id, shift: bad0.shift,
              });
              focusTask(bad0.task_id);
            }}>
            {t("admin.ltasks.bannerFix")}
          </Button>
        </div>
      )}

      {/* Scheduled changes — a config edit queued for tomorrow is invisible
          everywhere else, and it is what an admin will be surprised by. */}
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

      {/* ── the scope zone. FilterPanel must stay a DIRECT child of this flex
          row — its fit check measures the row's own children to decide inline
          vs grouped. ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPanel sections={scopeSections} />
        </div>
        {/* Which level the sentences below are resolved at, and how far it
            reaches — said once, above the list, instead of tagged onto every
            value the way the sheet used to. */}
        <div className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {t("admin.ltasks.chain")}{" "}
          {chain.map((c, i) => (
            <span key={i}>
              {i === chain.length - 1
                ? <b style={{ color: "var(--text-1)" }}>{c}</b>
                : <>{c}<span aria-hidden="true" className="mx-1.5" style={{ color: "var(--text-4)" }}>›</span></>}
            </span>
          ))}
          {sep}{reachText(level)}
          {/* A unit whose leaders do not all add up to 100%: invisible from a
              level above, and it is what makes a leader score against a
              denominator nobody meant. */}
          {level.kind === "unit"
            && (leadersByMgr[level.id] || []).some((p) => leaderSums[p.id] !== 100) && (
              <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded align-middle text-[11px] font-semibold"
                style={{
                  color: "var(--text-1)", background: "rgba(234,179,8,0.16)",
                  border: "1px solid rgba(234,179,8,0.45)",
                }}>
                <AlertTriangle size={12} color={C_WARN} />{t("admin.ltasks.childWarn")}
              </span>
            )}
        </div>
      </div>

      {/* ── THE LIST: one row per task, its rule written as a sentence ────── */}
      <div>
        <div className="rounded-t-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderBottom: 0 }}>
          {isLoading ? (
            <div aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-4 py-3.5" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-3.5 w-5" />
                    <SkeletonBlock className="h-4 flex-1 max-w-[280px]" />
                    <SkeletonBlock className="h-3.5 w-10 ml-auto" />
                  </div>
                  <SkeletonBlock className="h-3 w-64 mt-2 ml-8" />
                </div>
              ))}
            </div>
          ) : isError ? (
            /* A failed load must never fall through to the empty state: that
               invites an admin to create the platform's first task on a page
               that simply could not read the ones that exist. */
            <EmptyState icon={AlertTriangle} showUploadLink={false} height="h-56"
              title={t("admin.ltasks.loadFail")} message={t("admin.ltasks.loadFailHint")}
              action={(
                <Button size="lg" variant="secondary" onClick={() => refetch()}>
                  {t("common.retry")}
                </Button>
              )} />
          ) : tasks.length === 0 ? (
            <EmptyState icon={ListChecks} showUploadLink={false} height="h-56"
              title={t("admin.ltasks.listEmpty")} message={t("admin.ltasks.listEmptyHint")}
              action={(
                <Button size="lg" icon={<Plus size={14} />} onClick={() => setAddTask({
                  names: {}, note: {}, criteria: "", description: "", weight: 5, min_media: 1,
                  who: "all", active_from: floor, mgrs: [],
                })}>
                  {t("admin.ltasks.addTask")}
                </Button>
              )} />
          ) : tasks.map((td, i) => {
            const r = resolved(level, td.id);
            const isOpen = openRow === td.id;
            // IN FORCE, judged against the day the level on screen is actually
            // living in — never `new Date()`. A scheduled archive greys nothing
            // and takes no weight out until its day arrives.
            const archived = isArchived(td, level.shift);
            const archSet = !!td.archived_from;
            const pendingTask = isPending(td, level.shift);
            const rows = rowsByTask[td.id] || [];
            const nBad = rows.filter((x) => x.bad).length;
            const nExc = rows.length - nBad;
            const parts = ruleParts(td.id);
            return (
              <div key={td.id} ref={(el) => { rowRefs.current[td.id] = el; }}
                style={{ borderTop: i ? "1px solid var(--border)" : "none",
                  opacity: archived ? 0.6 : 1,
                  // One ground for the header AND the detail: the open state is
                  // a property of the ROW, and painting it on the button alone
                  // ended it at the button's edge, cutting an open row in half
                  // with a visible seam.
                  background: isOpen ? "var(--hover-bg)" : undefined }}>
                <button type="button" aria-expanded={isOpen} aria-controls={`ltask-body-${td.id}`}
                  onClick={() => setOpenRow(isOpen ? null : td.id)}
                  className={`block w-full text-left px-4 py-3.5 transition-colors${isOpen ? "" : " hover:bg-[var(--hover-bg)]"}`}>
                  <div className="flex items-baseline gap-3">
                    <span className="w-6 flex-shrink-0 text-right text-xs font-semibold tabular-nums"
                      style={{ color: "var(--text-4)" }}>{td.id}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                        {r.names?.[lang] || r.names?.uz || `T${td.id}`}
                      </span>
                      {/* An archive SET but not yet in force still gets its
                          chip — the date is the whole of what it says. */}
                      {archSet && (
                        <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded align-middle text-[10px] font-bold"
                          style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                          <Archive size={10} />{t("admin.ltasks.archChip").replace("{date}", td.archived_from)}
                        </span>
                      )}
                      {pendingTask && (
                        <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded align-middle text-[10px] font-bold"
                          style={{ background: "rgba(234,179,8,0.16)", color: "var(--text-1)", border: "1px solid rgba(234,179,8,0.45)" }}>
                          <Calendar size={10} color={C_WARN} />{t("admin.ltasks.activeChip").replace("{date}", td.active_from)}
                        </span>
                      )}
                    </span>
                    {/* A task this level does not ask carries no weight, so it
                        says THAT instead of printing a percentage nobody
                        earns. */}
                    {r.enabled ? (
                      <span className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>
                        {r.weight}%
                      </span>
                    ) : (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                        {t("admin.ltasks.vNotAsked")}
                      </span>
                    )}
                    <ChevronRight size={15} aria-hidden="true" className="flex-shrink-0 transition-transform"
                      style={{ color: "var(--text-4)", transform: isOpen ? "rotate(90deg)" : "none" }} />
                  </div>

                  {/* THE rule sentence. */}
                  <div className="mt-1 ml-9 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                    {parts.map((f, j) => (
                      <span key={f.k}>
                        {j > 0 && sep}
                        {f.halves
                          ? f.halves.map((h, k) => (
                            <span key={h.sh}>
                              {k > 0 && sep}
                              <span className="mr-1 px-1 rounded text-[10px] font-bold tracking-wide align-middle"
                                title={t("admin.ltasks.lvlShift").replace("{n}", h.sh)}
                                style={{ color: "var(--text-4)", border: "1px solid var(--border-md)" }}>
                                S{h.sh}
                              </span>
                              {winSpan(h, h.sh)}
                            </span>
                          ))
                          : f.k === "window" ? winSpan(f, f.k)
                            : (
                              <span className={f.strong ? "font-semibold" : ""}
                                style={f.strong ? { color: "var(--text-1)" } : undefined}>
                                {f.text}
                              </span>
                            )}
                      </span>
                    ))}
                  </div>

                  {/* Marks. Red counts the windows nobody can work, brand
                      counts what somebody chose, and the quiet one is only
                      honest at Standart — one level down «hamma bir xil» would
                      be a claim about a scope the reader is not looking at. */}
                  {(nBad > 0 || nExc > 0 || level.kind === "std") && (
                    <div className="mt-1.5 ml-9 flex flex-wrap gap-1.5">
                      {nBad > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[11px] font-semibold"
                          style={{ background: "rgba(239,68,68,0.12)", color: "var(--text-1)", border: "1px solid rgba(239,68,68,0.35)" }}>
                          <AlertTriangle size={11} color={C_BAD} />
                          {t("admin.ltasks.badWins").replace("{n}", nBad)}
                        </span>
                      )}
                      {nExc > 0 && (
                        <span className="inline-flex items-center px-2 h-[22px] rounded-full text-[11px] font-semibold"
                          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                          {t("admin.ltasks.excCount").replace("{n}", nExc)}
                        </span>
                      )}
                      {nBad === 0 && nExc === 0 && level.kind === "std" && (
                        <span className="inline-flex items-center px-2 h-[22px] rounded-full text-[11px] font-medium"
                          style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                          {t("admin.ltasks.allSame")}
                        </span>
                      )}
                    </div>
                  )}
                </button>

                {/* ── expanded: what the leader reads, then the exceptions ── */}
                {/* A sibling of the row button, never a child of it: an
                    exception carries its own «Ochish» and nested interactive
                    elements inside a <button> are unreachable by keyboard. */}
                {isOpen && (() => {
                  // What the leader-facing block resolves to: the description
                  // where one is written, else the AI's criteria — the same
                  // fallback `_resolve_description` applies on the server.
                  const shownDesc = r.description || r.criteria || "";
                  return (
                  <div id={`ltask-body-${td.id}`} className="px-4 pb-4 -mt-1">
                    <div className="ml-9 pl-3.5" style={{ borderLeft: "2px solid var(--border-md)" }}>
                      {/* Opening a row must SHOW the task, not restate the
                          summary it already carries. The collapsed line names
                          the few rules worth glancing at; expanded, every rule
                          is spelled out with the level that decided it, so the
                          whole answer can be read without opening the editor —
                          «details» that need a modal to be seen are not open. */}
                      <dl className="grid gap-x-6 gap-y-2 mb-3"
                        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
                        {DETAIL_ROWS.map((c) => {
                          const own = ownKeys(level, td.id);
                          const mine = level.kind !== "std" && c.keys.some((k) => own.has(k));
                          const orig = c.keys.length ? fieldOrigin(level, td.id, c.keys) : null;
                          return (
                            <div key={c.k} className="min-w-0">
                              <dt className="text-[10.5px] uppercase tracking-wider mb-0.5"
                                style={{ color: "var(--text-4)" }}>{t(`admin.ltasks.col.${c.k}`)}</dt>
                              <dd className="text-[12.5px] leading-snug m-0 break-words"
                                style={{ color: mine ? "var(--text-1)" : "var(--text-2)",
                                  fontWeight: mine ? 600 : 400 }}>
                                {showVal(c.k, r, level, td.id)}
                                {!mine && orig && orig !== levelKey(level) && (
                                  <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--text-4)" }}>
                                    · {tagLabel(orig)}
                                  </span>
                                )}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>

                      {/* The two texts a leader and the AI read, in full — the
                          one place on the page they are not clipped. */}
                      <p className="text-[12.5px] leading-relaxed mb-1.5" style={{ color: "var(--text-3)" }}>
                        <b style={{ color: "var(--text-2)" }}>{t("admin.ltasks.groupLeader")}:</b>{" "}
                        {shownDesc || t("admin.ltasks.empty")}
                        {/* Folding the two paragraphs into one when nothing is
                            written would otherwise present the AI's text as a
                            description somebody authored — the one fact an
                            admin opens this row to check before editing it. */}
                        {!r.description && r.criteria && (
                          <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
                            ({t("admin.ltasks.descFallback")})
                          </span>
                        )}
                      </p>
                      {/* Compared against what the block above actually SHOWED,
                          not against the raw description: with no description
                          written that block already prints the criteria, and
                          testing the empty field printed the same paragraph
                          twice under two different headings. */}
                      {r.criteria && r.criteria !== shownDesc && (
                        <p className="text-[12.5px] leading-relaxed mb-2" style={{ color: "var(--text-3)" }}>
                          <b style={{ color: "var(--text-2)" }}>{t("admin.ltasks.criteria")}:</b>{" "}
                          {r.criteria}
                        </p>
                      )}

                      {rows.length === 0 ? (
                        <p className="text-[12px] py-1" style={{ color: "var(--text-4)" }}>
                          {t("admin.ltasks.noExcHere")}
                        </p>
                      ) : rows.map((x, k) => (
                        <div key={x.key}
                          className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-1.5 text-[12.5px]"
                          style={{ borderTop: k ? "1px solid var(--border)" : "none" }}>
                          <span className="w-full sm:w-[200px] sm:flex-shrink-0 min-w-0">
                            <span className="font-medium" style={{ color: "var(--text-1)" }}>{x.who}</span>
                            <span className="block text-[11px]" style={{ color: "var(--text-4)" }}>{x.sub}</span>
                          </span>
                          <span className="w-[104px] flex-shrink-0" style={{ color: "var(--text-3)" }}>
                            {t(`admin.ltasks.col.${x.f}`)}
                          </span>
                          <span className="min-w-0">
                            {x.drift && (
                              <span className="mr-1.5 px-1.5 py-px rounded-full text-[10px] font-bold align-middle"
                                style={{ background: "rgba(234,179,8,0.16)", color: "var(--text-1)", border: "1px solid rgba(234,179,8,0.45)" }}>
                                {t("admin.ltasks.regDrift")}
                              </span>
                            )}
                            <span className="font-semibold px-1 rounded"
                              style={x.bad
                                ? { color: "var(--text-1)", background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.40)" }
                                : { color: "var(--text-1)" }}>
                              {x.v}
                              {x.bad && <AlertTriangle size={11} color={C_BAD} className="inline-block ml-1 -mt-px" aria-hidden="true" />}
                            </span>
                            <span className="ml-1.5 text-[11.5px]" style={{ color: "var(--text-4)" }}>
                              ← {x.pl}: {x.p}
                            </span>
                            {x.carriers != null && x.carriers < x.total && (
                              <span className="ml-1.5 px-1 rounded text-[11px] align-middle"
                                style={{ color: "var(--text-1)", background: "rgba(234,179,8,0.16)", border: "1px solid rgba(234,179,8,0.45)" }}>
                                {t("admin.ltasks.regCarriers").replace("{c}", x.carriers).replace("{n}", x.total)}
                              </span>
                            )}
                            {x.bad && x.hours && (
                              <span className="ml-1.5 px-1 rounded text-[11px] align-middle"
                                style={{ color: "var(--text-1)", background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.40)" }}>
                                {t("admin.ltasks.regBadHours").replace("{s}", x.shift).replace("{hours}", (x.hours || []).join("–"))}
                              </span>
                            )}
                          </span>
                          <Button size="sm" variant="ghost" className="ml-auto flex-shrink-0"
                            onClick={() => openException(x)}>{t("admin.ltasks.regOpen")}</Button>
                        </div>
                      ))}

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <Button size="md" tint onClick={() => openEdit(td.id)}>
                          {t("admin.ltasks.editRule")}
                        </Button>
                        {/* Keyed on whether a date is SET, not on whether it has
                            arrived: clearing it is how a scheduled archive is
                            called off. */}
                        {archSet ? (
                          <Button size="md" tint variant="secondary" icon={<ArchiveRestore size={13} />}
                            onClick={() => askRestore(td)}>{t("admin.ltasks.archRestore")}</Button>
                        ) : (
                          <Button size="md" tint variant="danger" icon={<Archive size={13} />}
                            onClick={() => setArch({ tid: td.id, from: floor })}>{t("admin.ltasks.archTitle")}</Button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ── footer strip: the two totals, and the two rare list actions ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-b-2xl text-xs"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
          <span className="inline-flex items-center gap-1.5">
            {t("admin.ltasks.sumRow")}{" "}
            {levelSum === 100
              ? <b className="tabular-nums" style={{ color: "var(--text-1)" }}>100%</b>
              : warnBadge(levelSum)}
          </span>
          <span>{excN ? t("admin.ltasks.excTotal").replace("{n}", excN) : t("admin.ltasks.excNone")}</span>
          {offSums > 0 && level.kind === "std" && (
            <span>{t("admin.ltasks.sumsOff").replace("{n}", offSums)}</span>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            {/* Every task that is not archived, a not-yet-open one INCLUDED:
                `reorder_tasks` pushes whatever the caller leaves out to the
                tail, so omitting a pending task would silently move it to the
                end of a checklist nobody had reordered. */}
            <Button size="md" variant="ghost" icon={<ListOrdered size={13} />}
              onClick={() => setOrder({ ids: tasks.filter((x) => !isArchived(x, 1) || !isArchived(x, 2)).map((x) => x.id) })}>
              {t("admin.ltasks.orderBtn")}
            </Button>
            <Button size="md" variant="ghost" icon={<Type size={13} />}
              onClick={() => { setTxtErr(""); setShowTexts(true); }}>
              {t("admin.ltasks.texts")}
            </Button>
          </span>
        </div>
      </div>

      {/* ── the rarely-needed half, folded away ───────────────────────────── */}
      {/* One-time setup, the archive and the per-unit switches: none of them is
          read on an ordinary visit, and all three used to sit above the work. */}
      <details className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <summary className="px-4 py-3 text-xs font-semibold cursor-pointer select-none" style={{ color: "var(--text-2)" }}>
          {t("admin.ltasks.rare")}
        </summary>
        <div className="px-4 pb-4 pt-3.5 space-y-4" style={{ borderTop: "1px solid var(--border)" }}>
          <FormField label={t("admin.ltasks.channel")} hint={t("admin.ltasks.channelHint")} error={chanErr || null}>
            <div className="flex items-center gap-2 max-w-md">
              <input value={chan} onChange={(e) => setChan(e.target.value)} placeholder="-100…" className={`${inputCls} flex-1`} style={inputStyle} />
              <Button size="lg" variant="secondary" loading={chanMut.isPending} onClick={() => chanMut.mutate({ chat_id: chan })}>{t("admin.ltasks.save")}</Button>
            </div>
          </FormField>

          <FormField label={t("admin.ltasks.archList").replace("{n}", archivedTasks.length)}
            hint={t("admin.ltasks.archListHint")}>
            {archivedTasks.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("admin.ltasks.archNone")}</p>
            ) : (
              <div className="space-y-1">
                {archivedTasks.map((td) => (
                  <div key={td.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{td.id}</span>
                    <span className="truncate">{tname(td)}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{td.archived_from}</span>
                    <Button size="sm" variant="ghost" className="ml-auto" icon={<ArchiveRestore size={13} />}
                      onClick={() => askRestore(td)}>{t("admin.ltasks.archRestore")}</Button>
                  </div>
                ))}
              </div>
            )}
          </FormField>

          {/* Per-unit filing. It belongs to a UNIT, so it opens for whichever
              brigadir the scope names — never a second brigadir dropdown of its
              own outside the filter panel. */}
          {/* Gated on the PICK, never on `level.mid`: a shift level carries the
              id of its first unit so the example-photo chain has somewhere to
              resolve against, and opening THAT unit's switches because somebody
              selected a shift would edit a brigadir nobody named. */}
          <FormField label={t("admin.ltasks.unitSettings")}
            hint={pickUv ? t("admin.ltasks.cellFromHint.off") : t("admin.ltasks.unitPickFirst")}>
            {pickUv ? (
              <Button size="lg" variant="secondary" icon={<Grid3x3 size={14} />}
                onClick={() => {
                  const m = mgrById.get(pickUv);
                  setUnit({
                    mid: pickUv, cell_from: m?.cell_from || "",
                    per_task_close: !!m?.per_task_close, bot_from: m?.bot_from || "",
                  });
                }}>
                {mgrLabel(pickUv)}
              </Button>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("admin.ltasks.pickNone")}</p>
            )}
          </FormField>
        </div>
      </details>
      {/* ── THE rule editor — one modal, every level ───────────────────── */}
      {edit && editTask && (
        <Modal title={`${edit.tid} · ${tname(editTask)}`}
          subtitle={t("admin.ltasks.editSub").replace("{level}", levelName(editLvl)).replace("{reach}", reachText(editLvl))}
          icon={<ListChecks size={14} />} maxWidth="max-w-2xl" onClose={() => setEdit(null)}
          footer={<>
            {editLvl.kind === "leader" && getOv(editLvl.id, edit.tid) && (
              <Button variant="danger" className="mr-auto" icon={<RotateCcw size={14} />} onClick={askReset}>
                {t("admin.ltasks.reset")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEdit(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={savingRule} onClick={askSaveRule}>{t("admin.ltasks.save")}</Button>
          </>}>
          {/* One scope statement for the whole modal — every field below it
              writes to the same rows, so it is said once, before anything is
              typed, and again on the confirm for the writes that fan out. */}
          <div className="rounded-xl px-3 py-2 mb-1 text-[11px] leading-snug"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            {t("admin.ltasks.editScope").replace("{level}", levelName(editLvl)).replace("{reach}", reachText(editLvl))}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider pt-1" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.groupLeader")}
          </p>
          <p className="text-[11.5px] -mt-1.5" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.groupLeaderHint")}
          </p>
          <FormField label={withMark(t("admin.ltasks.taskName"), ownPill("names"))}
            hint={isStd ? t("admin.ltasks.addNameHint") : t("admin.ltasks.supNameHint")}>
            <LangTextInput hint={false} value={edit.names}
              onChange={(l, v) => setEdit((c) => ({ ...c, names: { ...c.names, [l]: v } }))}
              placeholderFn={(l) => (editInh ? editInh.names?.[l] : "")} />
          </FormField>
          <FormField label={withMark(t("admin.ltasks.description"), ownPill("description"))}
            hint={t("admin.ltasks.descriptionHint")}>
            <textarea rows={3} value={edit.description || ""}
              onChange={(e) => setEdit((c) => ({ ...c, description: e.target.value }))}
              placeholder={editInh?.description || t("admin.ltasks.descriptionPh")}
              className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 68 }} />
            {inheritLine("description", clip(editInh?.description, 60) || t("admin.ltasks.empty"))}
          </FormField>

          <div style={{ borderTop: "1px solid var(--border)" }} className="my-2" />
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.groupDoing")}
          </p>
          {isStd ? (
            readOnlyField(t("admin.ltasks.status"),
              edit.enabled ? t("admin.ltasks.vAsked") : t("admin.ltasks.vNotAsked"),
              t("admin.ltasks.stdReadOnly"))
          ) : (
            <FormField label={withMark(t("admin.ltasks.status"), ownPill("enabled"))}
              hint={t("admin.ltasks.enabledHint")} required>
              <SegmentedToggle fill value={edit.enabled}
                onChange={(v) => setEdit((c) => ({ ...c, enabled: v }))}
                options={[[true, t("admin.ltasks.vAsked")], [false, t("admin.ltasks.vNotAsked")]]} />
            </FormField>
          )}
          {/* Isbot turi is the field that changes what the leader is asked to
              DO, so it leads this group full-width instead of sharing a row
              with two number boxes. */}
          {isStd ? (
            <FormField label={t("admin.ltasks.proofKind")}>
              <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                {t("admin.ltasks.proofStdOnly")}
              </p>
            </FormField>
          ) : (
            <FormField label={withMark(t("admin.ltasks.proofKind"), ownPill("proof_kind"))}
              hint={`${t(`admin.ltasks.proofHint.${edit.proof_kind === "camera" ? "camera" : "screenshot"}`)} ${
                editLvl.kind === "shift" ? t("admin.ltasks.proofScope.units").replace("{n}", unitsOf(editLvl.shift).length)
                  : editLvl.kind === "unit" ? t("admin.ltasks.proofScope.unit")
                    : t("admin.ltasks.proofScope.leader")}`}>
              <SegmentedToggle fill value={edit.proof_kind || "screenshot"}
                onChange={(k) => setEdit((c) => ({ ...c, proof_kind: k }))}
                options={[["screenshot", t("admin.ltasks.proofScreenshot")],
                ["camera", t("admin.ltasks.proofCamera")]]} />
            </FormField>
          )}
          <div className="flex flex-wrap gap-3">
            <div className="w-36">
              {isStd
                ? readOnlyField(t("admin.ltasks.minMedia"), edit.min_media, t("admin.ltasks.stdReadOnly"))
                : numField(withMark(t("admin.ltasks.minMedia"), ownPill("min_media")), edit.min_media,
                  (v) => setEdit((c) => ({ ...c, min_media: v })), 20)}
            </div>
            <div className="w-36">
              {numField(withMark(t("admin.ltasks.weight"), ownPill("weight")), edit.weight,
                (v) => setEdit((c) => ({ ...c, weight: v })), 100)}
            </div>
          </div>
          {/* The one thing about a weight an admin cannot see: the AI deduction
              and the day report read the GLOBAL weight, not this chain. */}
          <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
            {t("admin.ltasks.weightNote").replace("{w}", gv(edit.tid).weight)}
          </p>

          <FormField label={withMark(t("admin.ltasks.window"), ownPill("win_from") || ownPill("win_to"))}
            hint={t("admin.ltasks.windowHint")}
            error={editProblems.length ? t("admin.ltasks.winOutsideShift")
              .replace("{win}", (editProblems[0].win || []).join("–"))
              .replace("{shift}", editProblems[0].shift ?? "?")
              .replace("{hours}", (editProblems[0].hours || []).join("–")) : null}>
            <div className="flex items-center gap-2">
              <TimeField className="flex-1" value={edit.win_from} inherit={null}
                placeholder={winPh(0)}
                onChange={(v) => setEdit((c) => ({ ...c, win_from: v }))} />
              <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>—</span>
              <TimeField className="flex-1" value={edit.win_to} inherit={null}
                placeholder={winPh(1)}
                onChange={(v) => setEdit((c) => ({ ...c, win_to: v }))} />
            </div>
            {/* A time input renders "--:--" when empty, which reads as broken
                rather than as inherited, so the pair is spelled out under it —
                and where the chain is blank all the way up, the SHIFT default
                the reviewer actually judges against is what gets spelled out,
                never a dash. The Standart level serves both shifts, so it names
                both rather than showing shift 1's silently. */}
            {isStd ? (
              <div className="mt-1 text-[11px] space-y-0.5" style={{ color: "var(--text-3)" }}>
                {Object.keys(shiftWins).sort().map((s) => (
                  <div key={s}>
                    {t("admin.ltasks.lvlShift").replace("{n}", s)}{" · "}
                    {t("admin.ltasks.windowInherit")
                      .replace("{from}", winDefault(s, 0) || "—")
                      .replace("{to}", winDefault(s, 1) || "—")}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                {t("admin.ltasks.windowInherit")
                  .replace("{from}", editInh?.win_from || winDefault(editLvl.shift, 0) || "—")
                  .replace("{to}", editInh?.win_to || winDefault(editLvl.shift, 1) || "—")}
              </div>
            )}
          </FormField>

          <div style={{ borderTop: "1px solid var(--border)" }} className="my-2" />
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.groupAi")}
          </p>
          {/* The short SUBJECT of the photo. Global only: it answers "is this
              picture about this task at all", which is a property of the task
              and not of anybody's unit. */}
          {isStd ? (
            <FormField label={withMark(t("admin.ltasks.noteField"), stdPill)} hint={t("admin.ltasks.noteHint")}>
              <LangTextInput hint={false} value={edit.note}
                onChange={(l, v) => setEdit((c) => ({ ...c, note: { ...c.note, [l]: v } }))} />
            </FormField>
          ) : (
            readOnlyField(t("admin.ltasks.noteField"),
              editTask.note?.[lang] || editTask.note?.uz || t("admin.ltasks.empty"),
              t("admin.ltasks.noteStdOnly"))
          )}
          <FormField label={withMark(t("admin.ltasks.criteria"), ownPill("criteria"))}
            hint={t("admin.ltasks.criteriaHint")}>
            <textarea rows={4} value={edit.criteria || ""}
              onChange={(e) => setEdit((c) => ({ ...c, criteria: e.target.value }))}
              placeholder={editInh?.criteria || t("admin.ltasks.criteriaPh")}
              className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 84 }} />
            {inheritLine("criteria", clip(editInh?.criteria, 60) || t("admin.ltasks.empty"))}
          </FormField>
          <FormField label={withMark(t("admin.ltasks.dateCheck"),
            ownPill("date_check") || ownPill("time_check") || ownPill("day_check"))}
            hint={t(`admin.ltasks.dateHint.${dcMode(edit)}`)}>
            <SegmentedToggle fill value={dcMode(edit)}
              onChange={(m) => setEdit((c) => ({ ...c, ...dcModeValues(m) }))}
              options={[["full", t("admin.ltasks.dateFull")],
              ["day", t("admin.ltasks.dateDayOnly")],
              ["time", t("admin.ltasks.dateTimeOnly")],
              ["off", t("admin.ltasks.dateOff")]]} />
          </FormField>
          <FormField label={withMark(t("admin.ltasks.deadline"), ownPill("deadline"))}
            hint={t("admin.ltasks.deadlineEnforced")}>
            <TimeField value={edit.deadline} inherit={null} placeholder={editInh?.deadline || ""}
              onChange={(v) => setEdit((c) => ({ ...c, deadline: v }))} />
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {editInh?.deadline ? t("admin.ltasks.deadlineInherit").replace("{t}", editInh.deadline)
                : t("admin.ltasks.deadlineDay")}
            </div>
          </FormField>
          <TaskExamples ids={editExR.ids} own={editExOwn} fromLabel={exFromLabel(editExR.level)}
            scopeNote={editExNote()} busy={exAddMut.isPending}
            onUpload={uploadExampleTo(edit.tid, cellExScope())}
            onAskDelete={askDeleteExample} t={t} />

          <div style={{ borderTop: "1px solid var(--border)" }} className="my-2" />
          <WhenBar when={edit.when} setWhen={(v) => setEdit((c) => ({ ...c, when: v }))}
            nextDate={editNext} t={t} />
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.stagedOnly")}
          </p>
        </Modal>
      )}

      {/* ── a NEW task ─────────────────────────────────────────────────── */}
      {addTask && (
        <Modal title={t("admin.ltasks.addTitle")}
          subtitle={t("admin.ltasks.addSub").replace("{n}", (tasks.reduce((a, x) => Math.max(a, x.id), 0) + 1))}
          icon={<Plus size={14} />} maxWidth="max-w-2xl" onClose={() => setAddTask(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setAddTask(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={addMut.isPending}
              disabled={!LANGS.some((l) => (addTask.names?.[l] || "").trim())
                || (addTask.active_from || floor) < floor
                || (addTask.who === "pick" && !addTask.mgrs.length)}
              onClick={askAdd}>{t("admin.ltasks.addCreate")}</Button>
          </>}>
          <FormField label={t("admin.ltasks.taskName")} hint={t("admin.ltasks.addNameHint")} required>
            <LangTextInput hint={false} value={addTask.names}
              onChange={(l, v) => setAddTask((c) => ({ ...c, names: { ...c.names, [l]: v } }))} />
          </FormField>
          <FormField label={t("admin.ltasks.description")} hint={t("admin.ltasks.descriptionHint")}>
            <textarea rows={3} value={addTask.description}
              onChange={(e) => setAddTask((c) => ({ ...c, description: e.target.value }))}
              placeholder={t("admin.ltasks.descriptionPh")}
              className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 68 }} />
          </FormField>
          <FormField label={t("admin.ltasks.noteField")} hint={t("admin.ltasks.noteHint")}>
            <LangTextInput hint={false} value={addTask.note}
              onChange={(l, v) => setAddTask((c) => ({ ...c, note: { ...c.note, [l]: v } }))} />
          </FormField>
          <FormField label={t("admin.ltasks.criteria")} hint={t("admin.ltasks.criteriaHint")}>
            <textarea rows={3} value={addTask.criteria}
              onChange={(e) => setAddTask((c) => ({ ...c, criteria: e.target.value }))}
              placeholder={t("admin.ltasks.criteriaPh")}
              className={inputCls} style={{ ...inputStyle, resize: "vertical", minHeight: 68 }} />
          </FormField>
          <div className="flex flex-wrap gap-3">
            <div className="w-36">{numField(t("admin.ltasks.weight"), addTask.weight, (v) => setAddTask((c) => ({ ...c, weight: v })), 100)}</div>
            <div className="w-36">{numField(t("admin.ltasks.minMedia"), addTask.min_media, (v) => setAddTask((c) => ({ ...c, min_media: v })), 20)}</div>
          </div>
          <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5"
            style={{ background: "rgba(234,179,8,0.10)", color: "var(--text-2)", border: "1px solid rgba(234,179,8,0.30)" }}>
            {t("admin.ltasks.addWeightWarn").replace("{a}", stdSum).replace("{b}", stdSum + (Number(addTask.weight) || 0))}
          </p>
          <div style={{ borderTop: "1px solid var(--border)" }} className="my-2" />
          <FormField label={t("admin.ltasks.addWho")} hint={t("admin.ltasks.addWhoHint")}>
            <SegmentedToggle fill value={addTask.who}
              onChange={(v) => setAddTask((c) => ({ ...c, who: v, mgrs: v === "pick" ? c.mgrs : [] }))}
              options={[["all", t("admin.ltasks.addWhoAll")],
              ...shifts.map((s) => [`shift${s}`, t("admin.ltasks.lvlShift").replace("{n}", s)]),
              ["pick", t("admin.ltasks.addWhoPick")]]} />
          </FormField>
          {addTask.who === "pick" && (
            <FormField label={t("admin.ltasks.supervisor")}
              hint={t("admin.ltasks.addPickHint").replace("{n}", addTask.mgrs.length)}>
              {/* The platform's multi-select, not a hand-rolled list of
                  buttons: same rows, same search, same drag-select the filter
                  panel uses everywhere else. */}
              <div className="rounded-xl p-1.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <OptsFilter searchable opts={managers.map((m) => m.id)} sel={addTask.mgrs}
                  onChange={(ids) => setAddTask((c) => ({ ...c, mgrs: ids }))}
                  render={(id) => `${mgrLabel(id)} · S${mgrById.get(id)?.shift ?? "?"}`}
                  groupBy={(id) => t("admin.ltasks.lvlShift").replace("{n}", mgrById.get(id)?.shift ?? "?")} />
              </div>
            </FormField>
          )}
          {/* A task never appears in the middle of somebody's night: the
              earliest day it can open is the LATER of the two shifts' next
              boundaries, which is the same floor the backend enforces. */}
          <FormField label={t("admin.ltasks.addFrom")}
            hint={t("admin.ltasks.addFromHint").replace("{d1}", nextDates["1"] || "").replace("{d2}", nextDates["2"] || "")}
            error={addTask.active_from && addTask.active_from < floor ? t("admin.ltasks.archTooEarly") : null}>
            <DateRangePicker single dateFrom={addTask.active_from || floor} dateTo={addTask.active_from || floor}
              setDateFrom={(v) => setAddTask((c) => ({ ...c, active_from: v || floor }))}
              setDateTo={() => {}} triggerClassName="px-3 py-2 text-sm" />
          </FormField>
          <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5"
            style={{ background: "rgba(234,179,8,0.10)", color: "var(--text-2)", border: "1px solid rgba(234,179,8,0.30)" }}>
            {t("admin.ltasks.addFromWarn").replace("{date}", addTask.active_from || floor)
              .replace("{n}", addTask.who === "all" ? leaders.length
                : addTask.who === "pick"
                  ? addTask.mgrs.reduce((a, id) => a + (mgrById.get(id)?.leaders_n || 0), 0)
                  : unitsOf(addTask.who === "shift1" ? 1 : 2).reduce((a, m) => a + (m.leaders_n || 0), 0))}
          </p>
        </Modal>
      )}

      {/* ── archive a task, from a DAY ─────────────────────────────────── */}
      {arch && (
        <Modal title={t("admin.ltasks.archTitle")} subtitle={tname(taskById.get(arch.tid))}
          icon={<Archive size={14} />} onClose={() => setArch(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setArch(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button variant="danger" loading={archMut.isPending}
              disabled={!arch.from || arch.from < floor} onClick={askArchive}>
              {t("admin.ltasks.archDo")}
            </Button>
          </>}>
          <FormField label={t("admin.ltasks.archFrom")}
            hint={t("admin.ltasks.floorHint").replace("{date}", floor)}
            error={arch.from && arch.from < floor ? t("admin.ltasks.archTooEarly") : null}>
            <DateRangePicker single dateFrom={arch.from || ""} dateTo={arch.from || ""}
              setDateFrom={(v) => setArch((a) => ({ ...a, from: v || "" }))}
              setDateTo={() => {}} triggerClassName="px-3 py-2 text-sm" />
          </FormField>
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {t("admin.ltasks.archHint")}
          </p>
        </Modal>
      )}

      {/* ── the order the checklist reads in ───────────────────────────── */}
      {order && (
        <Modal title={t("admin.ltasks.orderTitle")} icon={<ListOrdered size={14} />}
          onClose={() => setOrder(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setOrder(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={orderMut.isPending} onClick={() => orderMut.mutate({ ids: order.ids })}>
              {t("admin.ltasks.save")}
            </Button>
          </>}>
          <p className="text-[11px] leading-snug mb-2" style={{ color: "var(--text-3)" }}>{t("admin.ltasks.orderHint")}</p>
          <div className="space-y-1">
            {order.ids.map((id, i) => (
              <div key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <span className="tabular-nums w-6" style={{ color: "var(--text-4)" }}>{i + 1}</span>
                <span className="truncate flex-1">{tname(taskById.get(id))}</span>
                <Button size="sm" variant="ghost" disabled={i === 0} aria-label={t("admin.ltasks.orderUp")}
                  icon={<ArrowUp size={13} />} onClick={() => setOrder((o) => {
                    const ids = [...o.ids]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; return { ids };
                  })} />
                <Button size="sm" variant="ghost" disabled={i === order.ids.length - 1} aria-label={t("admin.ltasks.orderDown")}
                  icon={<ArrowDown size={13} />} onClick={() => setOrder((o) => {
                    const ids = [...o.ids]; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; return { ids };
                  })} />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── one unit's own switches ────────────────────────────────────── */}
      {unit && (
        <Modal title={t("admin.ltasks.unitSettings")}
          subtitle={tl(mgrById.get(unit.mid)?.name || "")}
          icon={<Users size={14} />} onClose={() => setUnit(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setUnit(null)}>{t("admin.broadcast.cancel")}</Button>
            <Button loading={savingUnit} onClick={saveUnit}>{t("admin.ltasks.save")}</Button>
          </>}>
          <FormField label={t("admin.ltasks.cellFrom")}
            hint={unit.cell_from
              ? t("admin.ltasks.cellFromHint.on").replace("{date}", unit.cell_from)
                .replace("{n}", mgrById.get(unit.mid)?.cells_n ?? 0)
              : t("admin.ltasks.cellFromHint.off")}>
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangePicker single dateFrom={unit.cell_from || ""} dateTo={unit.cell_from || ""}
                setDateFrom={(v) => setUnit((u) => ({ ...u, cell_from: v || "" }))}
                setDateTo={() => {}} triggerClassName="px-3 py-2 text-sm" />
              {(() => {
                const next = nextForShift(mgrById.get(unit.mid)?.shift);
                return next && unit.cell_from !== next ? (
                  <Button size="md" variant="secondary"
                    onClick={() => setUnit((u) => ({ ...u, cell_from: next }))}>
                    {t("admin.ltasks.botFromNext")}
                  </Button>
                ) : null;
              })()}
              {unit.cell_from && (
                <Button size="md" variant="ghost"
                  onClick={() => setUnit((u) => ({ ...u, cell_from: "" }))}>
                  {t("admin.ltasks.botFromClear")}
                </Button>
              )}
            </div>
          </FormField>
          {(mgrById.get(unit.mid)?.cells_n ?? 0) === 0 && (
            <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5"
              style={{ background: "rgba(239,68,68,0.10)", color: "var(--text-2)", border: "1px solid rgba(239,68,68,0.30)" }}>
              {t("admin.ltasks.cellFromNoCells")}
            </p>
          )}

          {/* The two switches that are the same DB row as the one above.
              Folded away because they are constant today — every unit files
              task by task and no unit is rehearsing — and reachable because
              this platform has no shell: `bot_from` is what stops a unit's
              first, fumbling camera night from being its record, and the day
              nobody could set it (2026-08-21) a leader was scored at 10% for
              a practice run. Both are WRITTEN before the per-cell floor, in
              one awaited chain — see saveUnit. */}
          <details className="rounded-xl mt-1" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <summary className="px-3 py-2 text-[11px] font-semibold cursor-pointer select-none" style={{ color: "var(--text-2)" }}>
              {t("admin.ltasks.perTask")} · {t("admin.ltasks.botFrom")}
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              <FormField label={t("admin.ltasks.perTask")}
                hint={t(`admin.ltasks.perTaskHint.${unit.per_task_close ? "on" : "off"}`)}>
                <SegmentedToggle fill value={!!unit.per_task_close}
                  onChange={(v) => setUnit((u) => ({ ...u, per_task_close: v }))}
                  options={[[false, t("admin.ltasks.perTaskOff")],
                  [true, t("admin.ltasks.perTaskOn")]]} />
              </FormField>
              {/* Stated where the decision is made, not in a manual: it is the
                  one thing about this mode that cannot be taken back. */}
              {unit.per_task_close && (
                <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5"
                  style={{ background: "rgba(234,179,8,0.10)", color: "var(--text-2)", border: "1px solid rgba(234,179,8,0.30)" }}>
                  {t("admin.ltasks.perTaskWarn")}
                </p>
              )}
              {/* Not offered on shift 2: it files ONLY in the bot, so there is
                  no fill-out row underneath to fall back to and a rehearsal
                  window there would empty the register. Refused server-side
                  too — this only keeps the admin from asking. */}
              {Number(mgrById.get(unit.mid)?.shift) === 2 ? (
                <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                  {t("admin.ltasks.botFromShift2")}
                </p>
              ) : (
                <FormField label={t("admin.ltasks.botFrom")}
                  hint={unit.bot_from ? t("admin.ltasks.botFromHint.on").replace("{date}", unit.bot_from)
                    : t("admin.ltasks.botFromHint.off")}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DateRangePicker single dateFrom={unit.bot_from || ""} dateTo={unit.bot_from || ""}
                      setDateFrom={(v) => setUnit((u) => ({ ...u, bot_from: v || "" }))}
                      setDateTo={() => {}} triggerClassName="px-3 py-2 text-sm" />
                    {(() => {
                      const next = nextForShift(mgrById.get(unit.mid)?.shift);
                      return next && unit.bot_from !== next ? (
                        <Button size="md" variant="secondary"
                          onClick={() => setUnit((u) => ({ ...u, bot_from: next }))}>
                          {t("admin.ltasks.botFromNext")}
                        </Button>
                      ) : null;
                    })()}
                    {unit.bot_from && (
                      <Button size="md" variant="ghost"
                        onClick={() => setUnit((u) => ({ ...u, bot_from: "" }))}>
                        {t("admin.ltasks.botFromClear")}
                      </Button>
                    )}
                  </div>
                </FormField>
              )}
            </div>
          </details>
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

      {/* Every AI-requirement text at once — the answer to "all thirteen are
          wrong in the same way", which the per-level modal has no shape for. */}
      {showTexts && (
        <CriteriaTextsModal items={criteriaItems} saving={txtSave} error={txtErr}
          onSave={saveTexts} onClose={() => { setShowTexts(false); setTxtErr(""); }} />
      )}

      {confirm && (
        <ConfirmDialog open tone={confirm.tone} title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} cancelLabel={t("admin.broadcast.cancel")} error={confirm.error}
          loading={cancelMut.isPending || revertMut.isPending || leaderMut.isPending || applyMut.isPending
            || exDelMut.isPending || archMut.isPending || addMut.isPending}
          onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm} />
      )}

      {toast.node}
    </div>
  );
}
