import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Check, KeyRound, ArrowRight } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { PAGES, TOGGLEABLE_ROLES, ROLE_LABEL_KEYS } from "../../config/pages";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { useAdminDirty } from "./AdminPanel";

/**
 * «Sahifalar (rol bo'yicha)» — which ROLE may open which page.
 *
 * The sibling «Shaxsiy vakolatlar» tab grants a page to ONE account; this one
 * opens it for every holder of a role. The two were named «Ruxsatlar» and
 * «Vakolatlar» — near-synonyms in Uzbek — so an admin whose actual task was
 * "let this person see page X" had no way to tell which tab to use, and the
 * wrong choice has a very different blast radius. Both are renamed after the
 * axis they control, and each now points at the other.
 */
export default function PageAccess() {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-page-access"],
    queryFn: () => api.get("/admin/page-access").then((r) => r.data),
  });

  const [matrix, setMatrix] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const server = useMemo(() => {
    const m = {};
    for (const p of PAGES) m[p.key] = [...(data?.pages?.[p.key] || [])];
    return m;
  }, [data]);

  const changes = useMemo(() => {
    if (!matrix || !data?.pages) return [];
    const out = [];
    for (const p of PAGES) {
      const before = new Set(server[p.key]);
      const after = new Set(matrix[p.key] || []);
      for (const r of after) if (!before.has(r)) out.push({ page: p, role: r, added: true });
      for (const r of before) if (!after.has(r)) out.push({ page: p, role: r, added: false });
    }
    return out;
  }, [matrix, server, data]);

  const dirty = changes.length > 0;
  const removals = changes.filter((c) => !c.added);
  // Tab switches unmount this component; the shell asks before discarding.
  useAdminDirty(dirty);

  useEffect(() => {
    if (!data?.pages) return;
    // Only re-seed when clean. A background refetch (another admin session, or
    // the same person on desktop + phone) used to re-run this and silently wipe
    // edits mid-session.
    if (dirty) return;
    const clone = {};
    for (const p of PAGES) clone[p.key] = [...(data.pages[p.key] || [])];
    setMatrix(clone);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(pageKey, role) {
    setMatrix((prev) => {
      const current = prev[pageKey] || [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return { ...prev, [pageKey]: next };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.put("/admin/page-access", { pages: matrix });
      qc.invalidateQueries({ queryKey: ["admin-page-access"] });
      qc.invalidateQueries({ queryKey: ["page-access"] }); // refresh live nav/guards
      setConfirm(false);
      toast.success(t("admin.saved"));
    } catch (e) {
      // The catch used to swallow the response and paint a generic word into
      // the Save button — which also destroyed the Save affordance for 3s.
      toast.error(e?.response?.data?.detail || t("admin.access.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Admin is always-on and the hint says so; a 21-row always-checked column was
  // the most expensive possible way to restate a constant in a grid that
  // already can't fit a phone.
  const COLUMNS = TOGGLEABLE_ROLES;
  const stickyCol = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--bg-card)",
    boxShadow: "1px 0 0 var(--border)",
  };

  return (
    <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={ShieldCheck}
        title={t("admin.access.title")}
        right={
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>
                {t("admin.access.pending").replace("{n}", changes.length)}
              </span>
            )}
            <Button
              size="lg"
              onClick={() => (removals.length ? setConfirm(true) : save())}
              loading={saving}
              disabled={!dirty}
            >
              {t("admin.save")}
            </Button>
          </div>
        }
      />

      <div className="px-4 pt-3">
        <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{t("admin.access.hint")}</p>
        <Link
          to="/admin/upload?tab=permissions"
          className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold hover:underline"
          style={{ color: "var(--brand-text)" }}
        >
          <KeyRound size={11} /> {t("admin.access.crossLink")} <ArrowRight size={11} />
        </Link>
      </div>

      <div className="p-4">
        {isLoading || !matrix ? (
          <div className="space-y-1.5">
            {[...Array(8)].map((_, i) => <SkeletonBlock key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {/* Sticky both ways: the page name used to scroll out of sight
                      the moment you reached the right-hand roles, leaving the
                      admin ticking anonymous boxes in a 21-row grid. */}
                  <th
                    className="text-left py-2 px-3 text-[11px] font-semibold uppercase tracking-wider sticky top-0"
                    style={{ ...stickyCol, zIndex: 3, background: "var(--bg-inner)", color: "var(--text-3)" }}
                  >
                    {t("admin.access.colPage")}
                  </th>
                  {COLUMNS.map((role) => (
                    <th
                      key={role}
                      className="py-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-center sticky top-0"
                      style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
                    >
                      {t(ROLE_LABEL_KEYS[role])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGES.map((p) => (
                  <tr key={p.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td
                      className="py-1.5 px-3 font-medium whitespace-nowrap"
                      style={{ ...stickyCol, color: "var(--text-1)" }}
                    >
                      {t(p.labelKey)}
                      {p.tier === "test" && (
                        <span
                          className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-semibold align-middle"
                          style={{ background: "rgba(234,179,8,0.15)", color: "#a16207" }}
                        >
                          TEST
                        </span>
                      )}
                    </td>
                    {COLUMNS.map((role) => {
                      const checked = (matrix[p.key] || []).includes(role);
                      return (
                        <td key={role} className="py-1.5 px-3 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggle(p.key, role)}
                            aria-label={`${t(p.labelKey)} — ${t(ROLE_LABEL_KEYS[role])}`}
                            // Was a 24px box: precise-tap roulette on a phone,
                            // where a mis-tick ships to everyone on save.
                            className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-lg transition-colors"
                          >
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors"
                              style={checked
                                ? { background: "var(--brand)", borderColor: "transparent" }
                                : { background: "transparent", borderColor: "var(--border-md)" }}
                            >
                              {checked && <Check size={13} color="#fff" />}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Removing access pulls a page off dozens of phones at once. Additions
          need no ceremony; takeaways get read back before they ship. */}
      <ConfirmDialog
        open={confirm}
        title={t("admin.access.confirmTitle")}
        message={
          <>
            <p className="mb-2">{t("admin.access.confirmMsg").replace("{n}", removals.length)}</p>
            <ul className="space-y-0.5">
              {removals.slice(0, 8).map((c, i) => (
                <li key={i} style={{ color: "#ef4444" }}>
                  − {t(c.page.labelKey)} · {t(ROLE_LABEL_KEYS[c.role])}
                </li>
              ))}
              {removals.length > 8 && <li>… +{removals.length - 8}</li>}
            </ul>
          </>
        }
        confirmLabel={t("admin.save")}
        loading={saving}
        onCancel={() => setConfirm(false)}
        onConfirm={save}
      />

      {toast.node}
    </div>
  );
}
