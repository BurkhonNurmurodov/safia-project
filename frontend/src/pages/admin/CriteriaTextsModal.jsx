import { useMemo, useState } from "react";
import { RotateCcw, Type, Wand2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { fixCaps, isShouty } from "../../utils/textCase";
import { useLang } from "../../context/LangContext";

const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

/**
 * Every AI-requirement text on the platform, on ONE screen, editable together.
 *
 * The matrix already lets an admin edit any one of these — in the column modal
 * for the global level, in a cell for a unit, in a leader's cell for one
 * leader. What it had no answer for was the case that actually arises: the
 * same thing wrong with ALL of them (they were typed in capitals, and leaders
 * now read them as the task description). Thirteen modals, each a separate
 * open-edit-save, is the kind of chore that simply does not get done.
 *
 * Two rules, both bought by the surrounding code:
 *  - «Fix all» only DRAFTS. Nothing is written until Save, and every box stays
 *    editable in between, because the fixer is a case transform and not a
 *    judgement about what a rule should say.
 *  - Only CHANGED rows are sent, one write at a time (see the page's saveTexts
 *    — these all materialise the same override rows, and parallel writes race
 *    the unique key, which is how the camera pilot's first unit lost a save).
 */
export default function CriteriaTextsModal({ items, saving, error, onSave, onClose }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(items.map((i) => [i.key, i.text])));
  const [scope, setScope] = useState("caps");

  const shouty = useMemo(
    () => items.filter((i) => isShouty(draft[i.key] ?? i.text) || (draft[i.key] ?? i.text) !== i.text),
    // Recomputed as drafts change so a row does not vanish the moment it is
    // fixed — a list that empties itself under the cursor reads as data loss.
    [items, draft],
  );
  const shown = scope === "caps" ? shouty : items;
  const changed = useMemo(
    () => items.filter((i) => (draft[i.key] ?? "") !== (i.text ?? "")),
    [items, draft]);

  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const fixAll = () => setDraft((d) => {
    const next = { ...d };
    for (const i of shown) if (isShouty(next[i.key])) next[i.key] = fixCaps(next[i.key]);
    return next;
  });
  const busy = !!saving;

  return (
    <Modal
      title={t("admin.ltasks.texts")}
      subtitle={t("admin.ltasks.textsSub").replace("{n}", items.length)}
      icon={<Type size={14} />}
      maxWidth="max-w-3xl"
      dismissable={!busy}
      onClose={busy ? undefined : onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={!changed.length}
          onClick={() => onSave(changed.map((i) => ({ ...i, text: draft[i.key] ?? "" })))}>
          {busy
            ? t("admin.ltasks.textsSaving").replace("{i}", saving.done).replace("{n}", saving.total)
            : t("admin.ltasks.textsSave").replace("{n}", changed.length)}
        </Button>
      </>}
    >
      <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>
        {t("admin.ltasks.textsDesc")}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedToggle size="sm" value={scope} onChange={setScope} options={[
          ["caps", t("admin.ltasks.textsOnlyCaps").replace("{n}", shouty.length)],
          ["all", t("admin.ltasks.textsAll").replace("{n}", items.length)],
        ]} />
        <Button className="ml-auto" size="md" variant="secondary" icon={<Wand2 size={14} />}
          disabled={busy || !shown.some((i) => isShouty(draft[i.key]))} onClick={fixAll}>
          {t("admin.ltasks.textsFixAll")}
        </Button>
      </div>

      {/* A failure keeps the modal standing with the reason on it — and says how
          far it got, because a partial save leaves the rest still to write. */}
      {error && (
        <div className="rounded-xl px-3 py-2 text-[11px] leading-snug"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {!shown.length ? (
        <p className="py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>
          {scope === "caps" ? t("admin.ltasks.textsNoCaps") : t("admin.ltasks.textsNone")}
        </p>
      ) : shown.map((i) => {
        const value = draft[i.key] ?? "";
        const dirty = value !== (i.text ?? "");
        return (
          <div key={i.key} className="rounded-xl p-3"
            style={{ background: "var(--bg-inner)", border: `1px solid ${dirty ? "rgba(200,151,63,0.45)" : "var(--border)"}` }}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>
                {i.task}
              </span>
              <span className="rounded px-1.5 py-px text-[10px] font-semibold"
                style={i.leaderId || i.managerId
                  ? { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-3)" }
                  : { background: "rgba(200,151,63,0.12)", border: "1px solid rgba(200,151,63,0.35)", color: "var(--brand)" }}>
                {i.scope}
              </span>
              <span className="ml-auto flex items-center gap-1">
                {dirty && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} disabled={busy}
                    onClick={() => set(i.key, i.text)}>{t("admin.ltasks.textsUndo")}</Button>
                )}
                <Button size="sm" variant="ghost" icon={<Wand2 size={12} />} disabled={busy || !isShouty(value)}
                  onClick={() => set(i.key, fixCaps(value))}>{t("admin.ltasks.textsFixOne")}</Button>
              </span>
            </div>
            <textarea rows={4} value={value} disabled={busy}
              onChange={(e) => set(i.key, e.target.value)}
              placeholder={t("admin.ltasks.criteriaPh")}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ ...inputStyle, resize: "vertical", minHeight: 84 }} />
          </div>
        );
      })}
    </Modal>
  );
}
