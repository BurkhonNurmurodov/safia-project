import { useMemo, useState } from "react";
import { Copy, Ban, Check, AlertTriangle } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { isProfileTarget, profileKeyOf } from "../../utils/broadcastTree";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import CheckboxTree from "../../components/ui/CheckboxTree";

/**
 * «Copy privileges» — take everything ONE person (or position) holds and give
 * the same set to as many others as you tick.
 *
 * Equipping a second supervisor used to mean reading the first one's rows off
 * the panel and re-ticking each by hand, which is how a page gets missed. The
 * source is whoever is selected on the tab; the destinations are picked from the
 * same nested tree the tab itself uses, so nothing new has to be learned.
 *
 * Three things this surface has to say out loud, because one press writes:
 *
 *  · it MIRRORS. A destination ends up holding exactly the source's entries;
 *    anything it held beyond them is removed. The alternative — adding only —
 *    would leave two people the tab presents as identical actually differing,
 *    with nothing on screen admitting it.
 *  · an EMPTY source is therefore a wipe, not a no-op. That is a legitimate
 *    "reset these people" errand, so it stays possible, but it turns the warning
 *    and the confirm button red rather than reading as a harmless copy.
 *  · unsaved edits on the source are NOT part of it. The copy reads the saved
 *    state server-side (a tab open since morning must not decide what a save
 *    means), so a pending draft is named and excluded instead of silently
 *    travelling — or silently not.
 *
 * The source itself is locked in the tree rather than hidden: it stays where the
 * eye expects it, marked, and `CheckboxTree` leaves disabled rows out of every
 * parent's select-all, so ticking a whole role can never mirror the source onto
 * itself.
 */

// Mark the source row untickable wherever the tree repeats it — one Telegram
// account can hold several profiles, so the same leaf key appears more than once.
function lockSource(nodes, key, hint) {
  return (nodes || []).map((n) => (
    Array.isArray(n.children)
      ? { ...n, children: lockSource(n.children, key, hint) }
      : n.key === key ? { ...n, disabled: true, hint } : n
  ));
}

export default function CopyPermsModal({
  source,        // the byKey entry being copied FROM ({ key, kind, name, caps, denies })
  tree,          // CheckboxTree groups, straight off the tab
  capLabel,      // (capability) => human label, owned by the tab
  dirtyCount = 0,
  onClose,
  onDone,        // (response) => void — the tab toasts and refetches
}) {
  const { t } = useLang();
  const [sel, setSel]       = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  const groups = useMemo(
    () => lockSource(tree, source?.key, t("admin.perms.copy.sourceChip")),
    [tree, source?.key, t],
  );

  const grants  = Object.entries(source?.caps || {});
  const denies  = source?.denies || [];
  const entries = grants.length + denies.length;
  const tone    = entries ? "#eab308" : "#ef4444";

  async function submit() {
    if (!sel.length || saving) return;
    setSaving(true);
    setErr("");
    try {
      const { data } = await api.post("/admin/capabilities/copy", {
        source_key:     source.kind === "user" ? Number(source.key) : null,
        source_profile: source.kind === "profile" ? profileKeyOf(source.key) : null,
        keys:     sel.filter((k) => !isProfileTarget(k)).map(Number),
        profiles: sel.filter(isProfileTarget).map(profileKeyOf),
      });
      onDone(data);
    } catch (e) {
      // Stays on the dialog with the reason on it: a permissions write that
      // failed must not close the surface that could retry it.
      setErr(e?.response?.data?.detail || t("admin.perms.copy.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      dismissable={!saving}
      icon={<Copy size={16} />}
      title={t("admin.perms.copy.title")}
      subtitle={t("admin.perms.copy.subtitle").replace("{name}", source?.name || "")}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={entries ? "primary" : "danger"}
            icon={Copy}
            loading={saving}
            disabled={!sel.length}
            onClick={submit}
          >
            {t("admin.perms.copy.confirm").replace("{n}", sel.length)}
          </Button>
        </>
      }
    >
      {/* What travels — named, not counted. "5 privileges" tells an admin
          nothing about whether the right five are in there. */}
      <div
        className="rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "var(--text-3)" }}
        >
          {t("admin.perms.copy.whatTitle")}
        </div>
        {!entries ? (
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {t("admin.perms.copy.nothing")}
          </p>
        ) : (
          <ul className="space-y-1 text-xs overflow-y-auto" style={{ maxHeight: 132 }}>
            {grants.map(([k, scope]) => (
              <li key={k} className="flex items-center gap-2">
                <Check size={12} strokeWidth={3} className="flex-shrink-0" style={{ color: "#22c55e" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-2)" }}>
                  {capLabel(k)}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-4)" }}>
                  {t(`admin.perms.scope.${scope}`)}
                </span>
              </li>
            ))}
            {denies.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <Ban size={12} className="flex-shrink-0" style={{ color: "#ef4444" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: "#ef4444" }}>
                  {capLabel(k)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The half nobody asks for by name: an exact copy also TAKES. */}
      <div
        className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
        style={{ background: `${tone}14`, border: `1px solid ${tone}33` }}
      >
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: tone }} />
        <div className="min-w-0">
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            {t(entries ? "admin.perms.copy.mirrorWarn" : "admin.perms.copy.emptyWarn")
              .replace("{name}", source?.name || "")}
          </p>
          {dirtyCount > 0 && (
            <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: "var(--text-3)" }}>
              {t("admin.perms.copy.dirtyWarn").replace("{n}", dirtyCount)}
            </p>
          )}
        </div>
      </div>

      {err && (
        <div
          className="rounded-xl px-3 py-2 text-[11px]"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}
        >
          {err}
        </div>
      )}

      {/* Destinations — the same nested list as the tab, minus the source. */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            {t("admin.perms.copy.pickTitle")}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{sel.length}</span>
            <Button variant="ghost" size="sm" disabled={!sel.length} onClick={() => setSel([])}>
              {t("admin.broadcast.clearAll")}
            </Button>
          </div>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("admin.perms.searchPlaceholder")}
        />
        <div
          className="mt-2 px-2 py-2 rounded-xl overflow-y-auto"
          style={{ maxHeight: 260, background: "var(--bg-inner)", border: "1px solid var(--border)" }}
        >
          <CheckboxTree
            groups={groups}
            selected={sel}
            onChange={setSel}
            filter={search}
            emptyText={t("admin.perms.noPeople")}
          />
        </div>
      </div>
    </Modal>
  );
}
