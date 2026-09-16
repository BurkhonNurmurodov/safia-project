// Where green becomes yellow and yellow becomes red — the admin's own editor,
// opened from the «Smena hisoboti» header.
//
// It edits NUMBERS and never colours. The traffic light is the platform's
// status vocabulary (red / yellow / green, gold never a status), so a picker
// here would let one board disagree with every other surface about what a
// colour means. What nobody had ruled on is where the LINES sit — open
// concerns shipped at 0 / 1–2 / ≥3 and painted every unit red, because the
// register really holds 6 to 105 per unit — and that is exactly what this
// answers, without a deploy.
//
// The change is PLATFORM-WIDE and the modal says so: the same bands paint the
// «Zagruzka fayli» KPI cards, and a band that moved on one page and not the
// other would be the very thing `utils/statusBands.js` exists to prevent.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import { BAND_DEFAULTS, toneFill } from "../../utils/statusBands";
import api from "../../utils/api";

// `dir` is which way the figure reads, and it decides everything on the row:
// a percentage is better HIGH (green is a floor), a backlog better LOW (green
// is a ceiling). Both store the same two keys, so nothing downstream branches.
const FIGURES = [
  { key: "load", labelKey: "production.kpiAvgLoad", dir: "high", unit: "%" },
  { key: "compl", labelKey: "production.kpiVyp", dir: "high", unit: "%" },
  { key: "quality", labelKey: "overview.sr.colQuality", dir: "high", unit: "%" },
  { key: "concerns", labelKey: "overview.sr.colConcerns", dir: "low", unit: "" },
];

const clean = (v) => {
  const n = Number(String(v).replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// The three ranges as the table's legend prints them, so the preview in here
// and the legend out there can never describe two different boards.
const preview = (band, dir, unit) => (dir === "high"
  ? [`≥${band.ok}${unit}`, `${band.warn}–${band.ok - 1}${unit}`, `<${band.warn}${unit}`]
  : [`≤${band.ok}${unit}`, `${band.ok + 1}–${band.warn}${unit}`, `≥${band.warn + 1}${unit}`]);

// A row is wrong when its two edges cross or go negative — «green from 80,
// yellow from 90» is not a stricter rule, it is a rule with no yellow in it.
const rowError = (band, dir) => {
  const { ok, warn } = band;
  if (!Number.isFinite(ok) || !Number.isFinite(warn) || ok < 0 || warn < 0) return "num";
  return dir === "high" ? (ok > warn ? null : "high") : (warn > ok ? null : "low");
};

export default function StatusBandsModal({ open, onClose, bands }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState(bands);
  const [saving, setSaving] = useState(false);

  // Re-seed whenever it is opened: a modal closed on a half-typed number must
  // not offer that number back as though it had been saved.
  useEffect(() => { if (open) setDraft(bands); }, [open, bands]);

  const errors = useMemo(
    () => Object.fromEntries(FIGURES.map((f) => [f.key, rowError(draft[f.key] || {}, f.dir)])),
    [draft],
  );
  const invalid = Object.values(errors).some(Boolean);

  const set = (key, edge, value) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [edge]: clean(value) } }));

  async function save() {
    setSaving(true);
    try {
      await api.put("/admin/settings", { status_bands: JSON.stringify(draft) });
      // The query is what feeds `applyBands`, so invalidating it is what
      // repaints every board on the page.
      await qc.invalidateQueries({ queryKey: ["status-bands"] });
      toast.success(t("admin.saved"));
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("admin.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        icon={SlidersHorizontal}
        title={t("overview.sr.bands.title")}
        subtitle={t("overview.sr.bands.sub")}
        maxWidth="max-w-xl"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <Button variant="ghost" size="md" onClick={() => setDraft(BAND_DEFAULTS)}>
              {t("overview.sr.bands.reset")}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="md" onClick={onClose}>{t("common.cancel")}</Button>
              <Button size="md" onClick={save} loading={saving} disabled={invalid}>
                {t("admin.save")}
              </Button>
            </div>
          </div>
        }
      >
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {t("overview.sr.bands.scope")}
        </p>

        {FIGURES.map((f) => {
          const band = draft[f.key] || BAND_DEFAULTS[f.key];
          const err = errors[f.key];
          const ranges = err ? null : preview(band, f.dir, f.unit);
          return (
            <div
              key={f.key}
              className="rounded-xl p-3"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                  {t(f.labelKey)}
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--text-4)" }}>
                  {t(`overview.sr.bands.${f.dir}`)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {["ok", "warn"].map((edge) => (
                  <FormField
                    key={edge}
                    label={t(`overview.sr.bands.${f.dir}.${edge}`)}
                    error={edge === "warn" && err ? t(`overview.sr.bands.err.${err}`) : undefined}
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      value={band[edge] ?? ""}
                      onChange={(e) => set(f.key, edge, e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm tabular-nums"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                    />
                  </FormField>
                ))}
              </div>

              {/* The row's own three cells, painted exactly as the board paints
                  them — a threshold is only checkable against what it produces. */}
              {ranges && (
                <div className="flex items-center gap-1 mt-2.5">
                  {["ok", "warn", "bad"].map((tone, i) => (
                    <span
                      key={tone}
                      className="flex-1 text-center text-[11px] font-semibold tabular-nums py-1 rounded-sm"
                      style={toneFill(tone)}
                    >
                      {ranges[i]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Modal>
      {toast.node}
    </>
  );
}
