import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, Pencil, Check, AlertTriangle, Trash2, LayoutGrid } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import SearchInput from "../components/ui/SearchInput";
import DayStepper from "../components/ui/DayStepper";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Field from "../components/ui/FormField";
import TableCard, { Th } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useLang } from "../context/LangContext";

// Ojidaniya categories — MUST mirror backend IDLE_CATEGORIES
// (services/sheets_reader.py SHIFT_CATEGORIES). `code` is the
// "downtime.cat.<code>.label" i18n suffix (reused from the Ojidaniya page);
// `name` is the JSONB key the backend stores. Cat H has no "not stopped" half —
// its real 2nd source column is a people-count — so `noNs`.
const CATS = [
  { code: "A",  name: "Cat A" },
  { code: "B",  name: "Cat B" },
  { code: "C",  name: "Cat C" },
  { code: "D",  name: "Cat D" },
  { code: "D2", name: "Cat D2" },
  { code: "D3", name: "Cat D3" },
  { code: "E",  name: "Cat E" },
  { code: "F",  name: "Cat F" },
  { code: "G",  name: "Cat G" },
  { code: "H",  name: "Cat H", noNs: true },
  { code: "I",  name: "Cat I" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
};
const fmtMin = (v) => {
  const n = Number(v) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};

// Cell workshop name in the active language, with graceful fallback.
function cellName(c, lang) {
  const byLang = { uz: c.name_uz, uz_cyrl: c.name_uz_cyrl, ru: c.name_ru, en: c.name_en }[lang];
  return byLang || c.name_ru || c.name_uz || c.name_en || c.name_uz_cyrl || "";
}

// Build the {name: minutes} map the backend expects from the {code: "string"}
// form state — drop blanks / non-positive, map code → "Cat <code>", and skip
// Cat H's not-stopped half.
function cleanMap(state, isNs = false) {
  const out = {};
  for (const cat of CATS) {
    if (isNs && cat.noNs) continue;
    const raw = state[cat.code];
    if (raw == null || raw === "") continue;
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[cat.name] = n;
  }
  return out;
}
const sumMap = (m) => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);

export default function IdleCell() {
  const { t, lang } = useLang();
  const qc = useQueryClient();

  const [date, setDate] = useState(localTodayIso());
  const [shift, setShift] = useState(1);
  const [search, setSearch] = useState("");

  // Modal state — the cell being filled in, its per-category minute inputs and
  // the required note.
  const [editCell, setEditCell] = useState(null);
  const [stopped, setStopped] = useState({});
  const [notStopped, setNotStopped] = useState({});
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmClear, setConfirmClear] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["idle-cell", date, shift],
    queryFn: () => api.get(`/api/idle-cell?date=${date}&shift=${shift}`).then((r) => r.data),
  });
  const cells = data?.cells ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cells;
    return cells.filter(
      (c) =>
        (c.verifix_code || "").toLowerCase().includes(q) ||
        (c.sap_code || "").toLowerCase().includes(q) ||
        cellName(c, lang).toLowerCase().includes(q),
    );
  }, [cells, search, lang]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["idle-cell"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      api
        .post("/api/idle-cell", {
          cell_id: editCell.cell_id,
          date,
          shift,
          by_category: cleanMap(stopped),
          by_category_ns: cleanMap(notStopped, true),
          note: note.trim(),
        })
        .then((r) => r.data),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (e) => setFormError(e?.response?.data?.detail || t("idleCell.saveError")),
  });

  const clearMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/idle-cell/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmClear(null);
      closeModal();
    },
  });

  function openEdit(c) {
    setEditCell(c);
    const s = {};
    const ns = {};
    const e = c.entry;
    if (e) {
      for (const cat of CATS) {
        const v = e.by_category?.[cat.name];
        if (v != null) s[cat.code] = String(v);
        const vn = e.by_category_ns?.[cat.name];
        if (vn != null) ns[cat.code] = String(vn);
      }
    }
    setStopped(s);
    setNotStopped(ns);
    setNote(e?.note || "");
    setFormError("");
  }
  function closeModal() {
    setEditCell(null);
    setStopped({});
    setNotStopped({});
    setNote("");
    setFormError("");
  }
  function submit() {
    if (!note.trim()) return setFormError(t("idleCell.noteRequired"));
    saveMutation.mutate();
  }

  const setStoppedVal = (code, v) => setStopped((s) => ({ ...s, [code]: v }));
  const setNsVal = (code, v) => setNotStopped((s) => ({ ...s, [code]: v }));
  const catLabel = (cat) => t(`downtime.cat.${cat.code}.label`);

  const totalStopped = sumMap(cleanMap(stopped));
  const totalNs = sumMap(cleanMap(notStopped, true));

  const inputCls = "w-full rounded-lg px-2 py-1 text-xs text-right outline-none";
  const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

  return (
    <Layout title={t("idleCell.title")}>
      <TableCard
        icon={Timer}
        title={t("idleCell.title")}
        subtitle={t("idleCell.testNote")}
        right={
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            {filtered.length} {t("idleCell.cellsWord")}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("idleCell.searchPlaceholder")}
              className="w-full sm:w-52"
            />
            <DayStepper value={date} onChange={setDate} />
            <div className="ml-auto">
              <SegmentedToggle
                value={shift}
                onChange={setShift}
                options={[
                  [1, t("idleCell.shift1")],
                  [2, t("idleCell.shift2")],
                ]}
              />
            </div>
          </>
        }
      >
        <thead>
          <tr>
            <Th icon={LayoutGrid} label={t("idleCell.colCell")} />
            <Th label={t("idleCell.colStatus")} align="center" />
            <Th label={t("idleCell.colStopped")} align="right" />
            <Th label={t("idleCell.colNotStopped")} align="right" />
            <Th label={t("idleCell.colNote")} />
            <Th label="" align="center" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="px-3 py-2.5">
                    <SkeletonBlock className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          {!isLoading && filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {t("idleCell.empty")}
              </td>
            </tr>
          )}
          {!isLoading &&
            filtered.map((c) => {
              const e = c.entry;
              return (
                <tr
                  key={c.cell_id}
                  className="align-top cursor-pointer"
                  onClick={() => openEdit(c)}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-semibold" style={{ color: "var(--text-1)" }}>{c.verifix_code}</div>
                    {(cellName(c, lang) || c.sap_code) && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                        {cellName(c, lang)}
                        {c.sap_code ? `${cellName(c, lang) ? " · " : ""}${c.sap_code}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {e ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}
                      >
                        <Check size={12} /> {t("idleCell.entered")}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("idleCell.notEntered")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--text-1)" }}>
                    {e ? fmtMin(e.total_minutes) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                    {e ? fmtMin(e.total_minutes_ns) : "—"}
                  </td>
                  <td className="px-3 py-2.5 max-w-xs" style={{ color: "var(--text-2)" }}>
                    <div className="line-clamp-1" title={e?.note || ""}>{e?.note || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(c)}>
                      {t("idleCell.edit")}
                    </Button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </TableCard>

      {/* Fill-in modal — the full category breakdown for one cell/date/shift + a
          required note. */}
      {editCell && (
        <Modal
          onClose={closeModal}
          icon={Timer}
          title={t("idleCell.modalTitle")}
          subtitle={`${editCell.verifix_code}${cellName(editCell, lang) ? " · " + cellName(editCell, lang) : ""}`}
          footer={
            <>
              {editCell.entry && (
                <Button
                  variant="danger"
                  className="mr-auto"
                  icon={<Trash2 size={14} />}
                  onClick={() => setConfirmClear(editCell.entry)}
                >
                  {t("idleCell.clear")}
                </Button>
              )}
              <Button variant="secondary" onClick={closeModal}>{t("idleCell.cancel")}</Button>
              <Button loading={saveMutation.isPending} onClick={submit}>{t("idleCell.save")}</Button>
            </>
          }
        >
          <div className="flex items-center gap-2 mb-3 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="px-2 py-1 rounded-lg" style={{ background: "var(--bg-inner)" }}>{fmtDay(date)}</span>
            <span className="px-2 py-1 rounded-lg" style={{ background: "var(--bg-inner)" }}>
              {shift === 1 ? t("idleCell.shift1") : t("idleCell.shift2")}
            </span>
          </div>

          <div className="rounded-xl overflow-hidden mb-3" style={{ border: "1px solid var(--border)" }}>
            <div
              className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
            >
              <div>{t("idleCell.category")}</div>
              <div className="text-right">{t("idleCell.stopped")}</div>
              <div className="text-right">{t("idleCell.notStopped")}</div>
            </div>
            {CATS.map((cat) => (
              <div
                key={cat.code}
                className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center px-3 py-1.5"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-1)" }}>
                  <span
                    className="font-mono text-[10px] px-1 rounded flex-shrink-0"
                    style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
                  >
                    {cat.code}
                  </span>
                  <span className="truncate" title={catLabel(cat)}>{catLabel(cat)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={stopped[cat.code] ?? ""}
                  onChange={(ev) => setStoppedVal(cat.code, ev.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
                {cat.noNs ? (
                  <div className="text-center text-xs" style={{ color: "var(--text-4)" }} title={t("idleCell.noNsHint")}>
                    —
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={notStopped[cat.code] ?? ""}
                    onChange={(ev) => setNsVal(cat.code, ev.target.value)}
                    className={inputCls}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
            <div
              className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-3 py-2 text-xs font-semibold"
              style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)", color: "var(--text-1)" }}
            >
              <div>{t("idleCell.total")}</div>
              <div className="text-right tabular-nums">{fmtMin(totalStopped)}</div>
              <div className="text-right tabular-nums">{fmtMin(totalNs)}</div>
            </div>
          </div>

          <Field label={t("idleCell.note")} required>
            <textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              rows={3}
              placeholder={t("idleCell.notePlaceholder")}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </Field>

          {formError && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 mt-2">
              <AlertTriangle size={13} /> {formError}
            </div>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmClear}
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => clearMutation.mutate(confirmClear.id)}
        title={t("idleCell.clearTitle")}
        message={t("idleCell.clearConfirm")}
        confirmLabel={t("idleCell.delete")}
        cancelLabel={t("idleCell.cancel")}
        tone="danger"
        loading={clearMutation.isPending}
      />
    </Layout>
  );
}
