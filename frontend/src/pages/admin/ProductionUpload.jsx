import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, CheckCircle2, XCircle, Factory, Save, BookOpen, AlertTriangle, Users,
  Wand2, PencilLine,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import StyledSelect from "../../components/ui/StyledSelect";
import DateRangePicker from "../../components/ui/DateRangePicker";
import FormField from "../../components/ui/FormField";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import UploadDropzone, { FileStateList, useFileStates } from "../../components/ui/UploadDropzone";
import Modal from "../../components/ui/Modal";
import SegmentedToggle from "../../components/ui/SegmentedToggle";

/**
 * «Ishlab chiqarish» — the daily SAP production-plan upload, the per-brigadir
 * catalog import, and the штатка/capacity editor.
 *
 * This tab used to carry a comment claiming the admin panel was "RU-only" and
 * hardcoded every string in Russian. It never was RU-only: twelve sibling tabs
 * run through t() in four languages, and a capability grantee can hold exactly
 * this one tab. Everything here is translated now.
 */

// Timezone-safe (toISOString() drops a day east of UTC, e.g. Tashkent +5).
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CARD = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const inputCls = "rounded-lg px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

const fmtDay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  return d ? `${d}.${m}.${y}` : iso;
};

// Workshop name of a resolved cell — falls back across the four languages.
const wsName = (cell) => (cell ? cell.ru || cell.uz || cell.uz_cyrl || cell.en || "" : "");

// ── штатка / capacity editor ─────────────────────────────────────────────────
function WorkCenters({ managerId, managerName }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const { data = [], isLoading } = useQuery({
    queryKey: ["pp-wc", managerId],
    queryFn: () => api.get("/admin/production/work-centers", { params: { manager_id: managerId } }).then((r) => r.data),
    enabled: managerId != null,
  });

  const [draft, setDraft] = useState({});
  const [savingId, setSavingId] = useState(null);

  const save = useMutation({
    mutationFn: ({ id, body }) => api.put(`/admin/production/work-centers/${id}`, body),
    onMutate: ({ id }) => setSavingId(id),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["pp-wc", managerId] });
      // Clear the row's draft so the input goes back to reflecting the server.
      setDraft((p) => { const n = { ...p }; delete n[id]; return n; });
      toast.success(t("admin.prod.wcSaved"));
    },
    // A failed PUT used to leave the draft on screen looking exactly like a
    // saved value — the only confirmation the admin had was faith.
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.saveFailed")),
    onSettled: () => setSavingId(null),
  });

  const val = (w, f) => (draft[w.id]?.[f] ?? w[f] ?? "");
  const set = (id, f, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [f]: v === "" ? null : Number(v) } }));
  const isDirty = (w) => draft[w.id] != null;

  return (
    <>
      <TableCard
        icon={Factory}
        title={t("admin.prod.wcTitle")}
        // The card is scoped to one brigadir but never said which, so an admin
        // who scrolled past the picker could edit the wrong unit's штатка.
        right={managerName ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{managerName}</span> : null}
      >
        <thead>
          <tr>
            <Th label={t("admin.prod.wcTeam")} />
            <Th label={t("admin.prod.wcShtatka")} align="right" />
            <Th label={t("admin.prod.wcCapacity")} align="right" />
            <Th label="" align="right" />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <tr key={i}>
                <td colSpan={4} className="px-3 py-2"><SkeletonBlock className="h-6 rounded" /></td>
              </tr>
            ))
          ) : data.length === 0 ? (
            // Was pixel-identical to "still loading" — an admin couldn't tell
            // "no catalog yet" from "the query hasn't landed".
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
                {t("admin.prod.wcEmpty")}
              </td>
            </tr>
          ) : (
            data.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-1)" }}>
                  {w.code}
                  {wsName(w.cell) && (
                    <div className="text-[11px] font-normal" style={{ color: "var(--text-4)" }}>{wsName(w.cell)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={val(w, "shtatka")}
                    onChange={(e) => set(w.id, "shtatka", e.target.value)}
                    className={`${inputCls} w-20 text-right`}
                    style={inputStyle}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={val(w, "capacity")}
                    onChange={(e) => set(w.id, "capacity", e.target.value)}
                    className={`${inputCls} w-24 text-right`}
                    style={inputStyle}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="md"
                    variant="primary"
                    tint={!isDirty(w)}
                    icon={<Save size={11} />}
                    loading={savingId === w.id}
                    onClick={() => save.mutate({ id: w.id, body: { shtatka: val(w, "shtatka"), capacity: val(w, "capacity") } })}
                  >
                    {t("common.save")}
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
      <div className="text-[11px] mt-2 px-1" style={{ color: "var(--text-3)" }}>
        {t("admin.prod.wcFormula")}
      </div>
      {toast.node}
    </>
  );
}

// ── SAP auto-fill register ───────────────────────────────────────────────────
/**
 * Who an unattended SAP upload reaches. The фаза/заголовок export is ONE
 * plant-wide file and used to fan out to every configured brigadir — which in
 * «Reja + Fakt» deletes the date's rows and clears their manual overrides, so a
 * unit whose ПЛАН/ФАКТ is kept by hand had its figures wiped by somebody else's
 * upload.
 *
 * The switch is a STANDING default, not a lock: the upload's own target picker
 * can still name a manual unit for one file. Both surfaces read this one list,
 * so what the register says and what the picker offers can never disagree.
 */
function AutoFillRegister({ rows, isLoading, onSet, saving }) {
  const { t } = useLang();
  const on = rows.filter((r) => r.auto_fill).length;
  const allIds = rows.map((r) => r.manager_id);

  return (
    <TableCard
      icon={Wand2}
      title={t("admin.prod.afTitle")}
      right={
        rows.length > 0 ? (
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {t("admin.prod.afCount").replace("{n}", on).replace("{m}", rows.length)}
          </span>
        ) : null
      }
      toolbar={
        rows.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button size="md" variant="secondary" disabled={saving || on === rows.length}
                    onClick={() => onSet(allIds, true)}>
              {t("admin.prod.afAllOn")}
            </Button>
            <Button size="md" variant="secondary" disabled={saving || on === 0}
                    onClick={() => onSet(allIds, false)}>
              {t("admin.prod.afAllOff")}
            </Button>
          </div>
        ) : null
      }
    >
      <thead>
        <tr>
          <Th label={t("admin.prod.afBrigadir")} />
          <Th label={t("admin.prod.shift")} align="right" />
          <Th label={t("admin.prod.afMode")} align="right" />
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <tr key={i}><td colSpan={3} className="px-3 py-2"><SkeletonBlock className="h-6 rounded" /></td></tr>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
              {t("admin.prod.afEmpty")}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.manager_id}>
              <td className="px-3 py-2 font-semibold" style={{ color: "var(--text-1)" }}>{r.name}</td>
              <td className="px-3 py-2 text-right text-xs" style={{ color: "var(--text-3)" }}>
                {r.shift ? r.shift : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  {/* Two mutually-exclusive options ⇒ the platform's toggle
                      template, never a hand-rolled on/off chip. */}
                  <SegmentedToggle
                    size="sm"
                    value={r.auto_fill ? "auto" : "manual"}
                    onChange={(v) => onSet([r.manager_id], v === "auto")}
                    ariaLabel={r.name}
                    options={[
                      { value: "auto", label: t("admin.prod.afAuto") },
                      { value: "manual", label: t("admin.prod.afManual") },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}

// ── the upload's own target picker (per-file override of the register) ───────
function TargetsModal({ open, rows, value, onCancel, onApply }) {
  const { t } = useLang();
  const defaults = rows.filter((r) => r.auto_fill).map((r) => r.manager_id);
  const [sel, setSel] = useState(value ?? defaults);

  // Re-seed each time it opens: the register may have changed underneath, and a
  // stale tick list would name a unit the register no longer offers.
  useEffect(() => { if (open) setSel(value ?? defaults); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const sameAsDefault = sel.length === defaults.length && defaults.every((d) => sel.includes(d));

  return (
    <Modal
      open={open}
      onClose={onCancel}
      icon={<Users size={16} />}
      title={t("admin.prod.tgTitle")}
      subtitle={t("admin.prod.tgSub")}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
          {/* null = "follow the register", which is not the same as ticking the
              same names by hand: it keeps tracking the register if it changes. */}
          <Button onClick={() => onApply(sameAsDefault ? null : sel)}>{t("common.save")}</Button>
        </>
      }
    >
      <div className="flex items-center gap-2 pb-1">
        <Button size="sm" variant="ghost" onClick={() => setSel(rows.map((r) => r.manager_id))}>
          {t("admin.prod.tgAll")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSel([])}>{t("admin.prod.tgNone")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setSel(defaults)}>{t("admin.prod.tgDefault")}</Button>
      </div>

      <div className="max-h-[46vh] overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-3)" }}>
            {t("admin.prod.afEmpty")}
          </div>
        ) : rows.map((r) => (
          <label
            key={r.manager_id}
            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <input
              type="checkbox"
              checked={sel.includes(r.manager_id)}
              onChange={() => toggle(r.manager_id)}
              style={{ accentColor: "var(--brand)" }}
            />
            <span className="text-sm flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }}>
              {r.name}
              {r.shift ? <span className="text-[11px] ml-1.5" style={{ color: "var(--text-4)" }}>
                {t("admin.prod.shift")} {r.shift}
              </span> : null}
            </span>
            {/* A unit switched off is still pickable — that is the whole point of
                the override — but it must SAY it is being reached against its
                standing setting, or a stray tick reads like an ordinary target. */}
            {!r.auto_fill && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 flex-shrink-0"
                    style={{ background: "rgba(234,179,8,0.12)", color: "#a16207" }}>
                <PencilLine size={10} /> {t("admin.prod.afManual")}
              </span>
            )}
          </label>
        ))}
      </div>
    </Modal>
  );
}

// ── catalog import (Sheet1 …) ────────────────────────────────────────────────
function CatalogImport({ managerId, managerName }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState("Sheet1 Торт");
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ status: "idle" });
  const [confirm, setConfirm] = useState(false);

  async function doImport() {
    if (!file) return;
    setState({ status: "uploading" });
    const form = new FormData();
    form.append("file", file);
    form.append("manager_id", managerId);
    if (sheet.trim()) form.append("sheet_name", sheet.trim());
    try {
      const { data } = await api.post("/admin/production/catalog/import", form);
      setState({ status: "ok", data });
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["pp-wc", managerId] });
      // A first-ever catalog is what makes a unit "configured", i.e. what puts
      // it in the auto-fill register and in the upload's target picker.
      qc.invalidateQueries({ queryKey: ["pp-autofill"] });
    } catch (e) {
      setState({ status: "error", detail: e?.response?.data?.detail || t("admin.prod.catalogFailed") });
    }
  }

  return (
    <div className="rounded-2xl" style={CARD}>
      <SectionHead
        icon={BookOpen}
        title={t("admin.prod.catalogTitle")}
        right={managerName ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{managerName}</span> : null}
      />
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <FormField label={t("admin.prod.catalogSheet")}>
            <input
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="Sheet1 Торт"
              className={`${inputCls} w-full`}
              style={inputStyle}
            />
          </FormField>
          <FormField label={t("admin.prod.catalogFile")}>
            <input
              type="file"
              accept=".xlsx,.xlsb"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:text-white file:text-sm file:font-semibold"
              style={{ color: "var(--text-2)" }}
            />
          </FormField>
        </div>

        {/* The destructive consequence was an 11px --text-4 footnote the eye
            skips, above a button that fired immediately. It now leads the card
            in warning colour AND is restated inside a danger confirm. */}
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-3"
          style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "#a16207" }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{t("admin.prod.catalogHint")}</span>
        </div>

        <Button
          size="lg"
          icon={<BookOpen size={14} />}
          disabled={!file || managerId == null}
          loading={state.status === "uploading"}
          onClick={() => setConfirm(true)}
        >
          {t("admin.prod.catalogBtn")}
        </Button>

        {state.status === "ok" && (
          <div className="mt-3 flex items-start gap-2 text-sm" style={{ color: "#22c55e" }}>
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              {t("admin.prod.catalogOk")
                .replace("{sheet}", state.data.sheet)
                .replace("{p}", state.data.products)
                .replace("{a}", state.data.work_centers_added)
                .replace("{u}", state.data.work_centers_updated)}
              {state.data.backfilled_days > 0 &&
                t("admin.prod.catalogBackfill")
                  .replace("{d}", state.data.backfilled_days)
                  .replace("{r}", state.data.backfilled_rows)}
            </span>
          </div>
        )}
        {state.status === "ok" && state.data.backfill_skipped && (
          <div className="mt-2 flex items-start gap-2 text-xs" style={{ color: "#a16207" }}>
            <PencilLine size={13} className="flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{t("admin.prod.catalogNoBackfill")}</span>
          </div>
        )}
        {state.status === "error" && (
          <div className="mt-3 flex items-start gap-2 text-sm" style={{ color: "#ef4444" }}>
            <XCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span className="break-words">{state.detail}</span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={t("admin.prod.catalogConfirmTitle")}
        message={t("admin.prod.catalogConfirmMsg").replace("{name}", managerName || "")}
        confirmLabel={t("admin.prod.catalogBtn")}
        loading={state.status === "uploading"}
        error={state.status === "error" ? state.detail : null}
        onCancel={() => { setConfirm(false); setState({ status: "idle" }); }}
        onConfirm={doImport}
      />
    </div>
  );
}

// ── фаза upload ───────────────────────────────────────────────────────────────
export default function ProductionUpload() {
  const { t } = useLang();
  // All active brigadir units — an admin can configure/upload for any of them
  // (was hardcoded to the manager-5 pilot, so nobody else could be set up).
  const { data: brigadirs = [] } = useQuery({
    queryKey: ["managers-all"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
  });
  const [managerId, setManagerId] = usePersistentState("produpload_manager", null);
  useEffect(() => {
    if (brigadirs.length && (managerId == null || !brigadirs.some((b) => b.manager_id === managerId))) {
      setManagerId(brigadirs[0].manager_id);
    }
  }, [brigadirs]); // eslint-disable-line react-hooks/exhaustive-deps

  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("both");
  const [fileType, setFileType] = useState("auto");
  const [state, setState] = useState({ status: "idle" });
  const { states, begin, patch, addRejections, clear } = useFileStates();

  const managerName = brigadirs.find((b) => b.manager_id === managerId)?.name || "";

  // ── who this file reaches ────────────────────────────────────────────────
  // The standing register, and a per-upload override on top of it. `targets`
  // null = follow the register (the request then names nobody and the backend
  // resolves it), an array = this file goes to exactly these.
  const qc = useQueryClient();
  const toast = useToast();
  const { data: afData, isLoading: afLoading } = useQuery({
    queryKey: ["pp-autofill"],
    queryFn: () => api.get("/admin/production/autofill").then((r) => r.data.managers),
  });
  const afRows = afData ?? [];
  const [targets, setTargets] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);

  const setAutoFill = useMutation({
    mutationFn: ({ ids, on }) =>
      api.put("/admin/production/autofill", { manager_ids: ids, auto_fill: on }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pp-autofill"] });
      toast.success(t("admin.prod.afSaved"));
    },
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.saveFailed")),
  });

  // A hand-picked list may name a unit the register has since dropped (its
  // catalog was deleted) — such an id can only ever earn a 400, so drop it.
  const known = afRows.map((r) => r.manager_id);
  const resolved = targets === null
    ? afRows.filter((r) => r.auto_fill).map((r) => r.manager_id)
    : targets.filter((id) => known.includes(id));
  const manualPicked = resolved.filter((id) => afRows.some((r) => r.manager_id === id && !r.auto_fill));

  async function doUpload(picked) {
    const entries = begin(picked);
    setState({ status: "uploading" });
    const form = new FormData();
    picked.forEach((f) => form.append("files", f));
    // Naming nobody = "follow the register", so the backend stays the one place
    // that resolves the auto-fill set. An explicit list is the per-upload
    // override and reaches a switched-off unit too.
    if (targets !== null) resolved.forEach((id) => form.append("manager_ids", id));
    form.append("date", date);
    form.append("mode", mode);
    if (fileType !== "auto") form.append("file_type", fileType);
    entries.forEach(({ id }) => patch(id, { status: "uploading", progress: 0 }));
    try {
      const { data } = await api.post("/admin/production/upload", form, {
        // Both sibling tabs report progress; this one posted multi-MB SAP
        // exports over a phone connection with only a button spinner, which is
        // indistinguishable from a hang and invites re-taps.
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
          entries.forEach(({ id }) => patch(id, { progress: pct, status: pct >= 100 ? "processing" : "uploading" }));
        },
      });
      entries.forEach(({ id }) => patch(id, { status: "ok", progress: 100 }));
      setState({ status: "ok", data });
    } catch (e) {
      const detail = e?.response?.data?.detail || t("admin.prod.uploadFailed");
      entries.forEach(({ id }) => patch(id, { status: "error", progress: 100, detail }));
      setState({ status: "error", detail });
    }
  }

  const ok = state.status === "ok" ? state.data : null;
  // An unrecognized file used to render as an 11px footnote UNDER a green
  // success header: pick two фаза files and half the pipeline is missing while
  // the visual verdict still says success.
  const unrecognized = ok?.files?.filter((f) => !f.faza && !f.zaga) ?? [];
  const incomplete = !!ok && (unrecognized.length > 0 || !ok.zaga_orders || !ok.faza_operations);

  return (
    <div className="space-y-4">
      {/* ── Global: the SAP pair applies to every brigadir ── */}
      <div className="rounded-2xl" style={CARD}>
        <SectionHead
          icon={Upload}
          title={t("admin.prod.title")}
          right={
            <span
              className="text-[11px] px-2 py-0.5 rounded-md font-semibold"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
            >
              {t("admin.prod.globalFile")}
            </span>
          }
          subtitle={t("admin.prod.globalSub")}
        />
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {/* Only the date carries a hint, so without `alignTop` the growing
                label in the two hintless cells parks their selects a whole
                hint line below it. */}
            <FormField alignTop label={t("admin.prod.date")} hint={t("admin.prod.replaceWarn")}>
              <DateRangePicker
                single
                dateFrom={date} dateTo={date}
                setDateFrom={setDate} setDateTo={() => {}}
                triggerClassName="px-3 py-2 text-sm w-full"
              />
            </FormField>
            <FormField alignTop label={t("admin.prod.mode")}>
              <StyledSelect
                value={mode}
                onChange={setMode}
                options={[
                  { value: "both", label: t("admin.prod.modeBoth") },
                  { value: "plan", label: t("admin.prod.modePlan") },
                  { value: "actual", label: t("admin.prod.modeActual") },
                ]}
              />
            </FormField>
            <FormField
              alignTop
              label={t("admin.prod.fileType")}
              hint={fileType !== "auto" ? t("admin.prod.ftSingleOnly") : null}
            >
              <StyledSelect
                value={fileType}
                onChange={setFileType}
                options={[
                  { value: "auto", label: t("admin.prod.ftAuto") },
                  { value: "faza", label: t("admin.prod.ftFaza") },
                  { value: "zaga", label: t("admin.prod.ftZaga") },
                ]}
              />
            </FormField>
          </div>

          {/* ── who this file reaches ── */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 mb-4"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
          >
            <Users size={14} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
            <div className="text-xs min-w-0 flex-1" style={{ color: "var(--text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--text-1)" }}>
                {targets === null ? t("admin.prod.tgFollowReg") : t("admin.prod.tgPicked")}
              </span>{" "}
              <span style={{ color: "var(--text-3)" }}>
                {t("admin.prod.tgSummary")
                  .replace("{n}", resolved.length)
                  .replace("{m}", afRows.length)}
              </span>
              {resolved.length > 0 && (
                <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-4)" }}>
                  {afRows.filter((r) => resolved.includes(r.manager_id)).map((r) => r.name).join(" · ")}
                </div>
              )}
            </div>
            <Button size="md" variant="secondary" onClick={() => setPickOpen(true)}>
              {t("admin.prod.tgChange")}
            </Button>
            {targets !== null && (
              <Button size="md" variant="ghost" onClick={() => setTargets(null)}>
                {t("admin.prod.tgReset")}
              </Button>
            )}
          </div>

          {/* Nothing to write is a state the admin must see BEFORE sending a
              multi-MB file, not as a 400 after it. */}
          {!afLoading && resolved.length === 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-4"
              style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "#a16207" }}
            >
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{t("admin.prod.tgNobody")}</span>
            </div>
          )}
          {manualPicked.length > 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-4"
              style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.30)", color: "#a16207" }}
            >
              <PencilLine size={13} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">
                {t("admin.prod.tgManualWarn").replace("{n}", manualPicked.length)}
              </span>
            </div>
          )}

          <UploadDropzone
            disabled={resolved.length === 0}
            accept={{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }}
            // A manual type tags the WHOLE request, so picking one forces a
            // single file rather than silently mislabelling the other.
            multiple={fileType === "auto"}
            busy={state.status === "uploading"}
            onFiles={doUpload}
            onRejected={(r) => addRejections(r, t("admin.upload.onlyXlsx"))}
            hint={t("admin.prod.uploadHint")}
          />

          <FileStateList
            states={states}
            busy={state.status === "uploading"}
            onClear={() => { clear(); setState({ status: "idle" }); }}
            className="mt-4"
          />

          {ok && (
            <div
              className="mt-4 rounded-lg p-4 text-sm"
              style={{
                background: incomplete ? "rgba(234,179,8,0.10)" : "var(--bg-inner)",
                border: `1px solid ${incomplete ? "rgba(234,179,8,0.30)" : "var(--border)"}`,
              }}
            >
              <div
                className="flex items-center gap-2 font-semibold mb-2"
                style={{ color: incomplete ? "#a16207" : "#22c55e" }}
              >
                {incomplete ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                {/* The date is echoed back: a fat-fingered DateRangePicker used
                    to earn a green check with no chance to notice the wrong day
                    had just been replaced. */}
                {t("admin.prod.successHead")
                  .replace("{date}", fmtDay(date))
                  .replace("{b}", ok.brigadirs)
                  .replace("{r}", ok.rows_written)}
              </div>
              <div className="text-xs" style={{ color: "var(--text-2)" }}>
                {t("admin.prod.successOps")
                  .replace("{n}", ok.faza_operations)
                  .replace("{m}", ok.zaga_orders)}
              </div>
              {incomplete && (
                <div className="text-xs mt-2 leading-snug" style={{ color: "#a16207" }}>
                  {t("admin.prod.warnIncomplete")}
                </div>
              )}
              {ok.files?.map((f, i) => (
                <div key={i} className="text-xs mt-1 font-mono break-all" style={{ color: "var(--text-3)" }}>
                  {f.file}:{" "}
                  {f.faza ? t("admin.prod.fileFaza").replace("{n}", f.faza.operations)
                    : f.zaga ? t("admin.prod.fileZaga").replace("{n}", f.zaga.orders)
                    : t("admin.prod.fileUnknown")}
                </div>
              ))}
            </div>
          )}
          {state.status === "error" && (
            <div className="mt-4 flex items-start gap-2 text-sm" style={{ color: "#ef4444" }}>
              <XCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span className="break-words">{state.detail}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Who an unattended upload reaches — the standing register ── */}
      <AutoFillRegister
        rows={afRows}
        isLoading={afLoading}
        saving={setAutoFill.isPending}
        onSet={(ids, on) => setAutoFill.mutate({ ids, on })}
      />

      <TargetsModal
        open={pickOpen}
        rows={afRows}
        value={targets}
        onCancel={() => setPickOpen(false)}
        onApply={(v) => { setTargets(v); setPickOpen(false); }}
      />

      {/* ── Scope: everything below acts on ONE brigadir ── */}
      <div className="rounded-2xl p-4" style={CARD}>
        <FormField label={t("admin.prod.scope")} hint={t("admin.prod.scopeHint")}>
          <StyledSelect
            value={managerId != null ? String(managerId) : ""}
            onChange={(v) => setManagerId(Number(v))}
            searchable
            options={brigadirs.map((b) => ({
              value: String(b.manager_id),
              label: b.name + (b.shift ? ` · ${t("admin.prod.shift")} ${b.shift}` : ""),
            }))}
            placeholder={t("admin.prod.scopePlaceholder")}
          />
        </FormField>
      </div>

      <CatalogImport managerId={managerId} managerName={managerName} />
      <WorkCenters managerId={managerId} managerName={managerName} />

      <div className="flex items-center gap-1.5 text-[11px] px-1" style={{ color: "var(--text-4)" }}>
        <Users size={11} /> {t("admin.prod.scopeFooter").replace("{name}", managerName)}
      </div>
      {toast.node}
    </div>
  );
}
