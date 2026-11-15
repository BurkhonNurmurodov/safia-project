// «Tashkiliy tuzilma», the «Ilovalar» view — the DRAFT behind it.
//
// Three registers are edited from one place and saved together:
//   - the launcher's layout (apps, menu tabs, where each screen sits) —
//     `PUT /admin/nav-layout`, the whole layout (services/nav_layout.py);
//   - the Access matrix (which ROLE opens a page) — `PUT /admin/page-access`,
//     the matrix read fresh at save with only the ticks changed here applied,
//     so a save never undoes what somebody ticked on «Sahifa ruxsatlari»;
//   - personal entries (a page opened for, or closed to, ONE profile or login)
//     — `PUT /admin/capabilities`, one diff per target.
//
// Nothing is sent until «Saqlash». A draft entry is kept only while it differs
// from what the server holds, so undoing a tick by hand leaves no change.
// The hook lives in the page's shell, so the draft survives a switch to the
// people chart and back.
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../../utils/api";
import { usePageAccess } from "../../hooks/usePageAccess";
import { DEFAULT_LAYOUT, isDefaultLayout, resolveLayout, sameLayout, serialize } from "../../utils/navLayout";
import { accountTarget, profileTarget } from "../../components/orgchart/appsNode";

const INHERIT = "inherit";
const size = (draft) => Object.values(draft).reduce((n, row) => n + Object.keys(row).length, 0);
// One entry of a two-level draft: kept while it differs from `was`.
const put = (draft, a, b, value, was) => {
  const row = { ...(draft[a] || {}) };
  if (value === was) delete row[b]; else row[b] = value;
  const next = { ...draft };
  if (Object.keys(row).length) next[a] = row; else delete next[a];
  return next;
};

export function useAppsEditor(data) {
  const qc = useQueryClient();
  const { nav } = usePageAccess();

  // ── the layout ──────────────────────────────────────────────────────────
  // Always the stored shape with every screen placed, so an edit is a plain
  // list operation (utils/navLayoutEdit.js).
  const base = useMemo(() => serialize(resolveLayout(nav)), [nav]);
  const [draft, setDraft] = useState(null);
  const cur = draft ?? base;
  const layout = useMemo(() => resolveLayout(cur), [cur]);
  const layoutDirty = useMemo(() => draft != null && !sameLayout(draft, base), [draft, base]);
  const isDefault = useMemo(() => isDefaultLayout(cur), [cur]);
  const reset = useCallback(() => setDraft(serialize(DEFAULT_LAYOUT)), []);

  // ── roles ───────────────────────────────────────────────────────────────
  const [roleDraft, setRoleDraft] = useState({});   // { page: { role: bool } }
  const roleWas = useCallback(
    (role, page) => Boolean(data?.role_pages?.[role]?.includes(page)),
    [data],
  );
  const roleOpen = useCallback(
    (role, page) => roleDraft[page]?.[role] ?? roleWas(role, page),
    [roleDraft, roleWas],
  );
  const setRole = useCallback((page, role, on) => {
    setRoleDraft((d) => put(d, page, role, Boolean(on), roleWas(role, page)));
  }, [roleWas]);
  const roleChanged = useCallback((role, page) => roleDraft[page]?.[role] !== undefined, [roleDraft]);

  // ── personal entries ────────────────────────────────────────────────────
  // target → { capability: "own" | "all" | "deny" } as the server holds them.
  const capBase = useMemo(() => {
    const m = new Map();
    const add = (target, grants, denies) => {
      const row = { ...(grants || {}) };
      for (const k of denies || []) row[k] = "deny";
      if (Object.keys(row).length) m.set(target, row);
    };
    for (const p of data?.profiles || []) {
      add(profileTarget(p.key), p.grants, p.denies);
      for (const a of p.accounts) add(accountTarget(a.telegram_id), a.grants, a.denies);
    }
    return m;
  }, [data]);
  const [capDraft, setCapDraft] = useState({});     // { target: { capability: state } }
  const capWas = useCallback((target, cap) => capBase.get(target)?.[cap] ?? INHERIT, [capBase]);
  const capState = useCallback(
    (target, cap) => capDraft[target]?.[cap] ?? capWas(target, cap),
    [capDraft, capWas],
  );
  const setCap = useCallback((target, cap, state) => {
    setCapDraft((d) => put(d, target, cap, state, capWas(target, cap)));
  }, [capWas]);
  const capChanged = useCallback((target, cap) => capDraft[target]?.[cap] !== undefined, [capDraft]);

  const changes = (layoutDirty ? 1 : 0) + size(roleDraft) + size(capDraft);

  const discard = useCallback(() => { setDraft(null); setRoleDraft({}); setCapDraft({}); }, []);

  // ── save ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const save = useCallback(async () => {
    setSaving(true);
    const done = { layout: false, roles: false, caps: [] };
    let failure = null;
    try {
      if (layoutDirty) {
        const r = await api.put("/admin/nav-layout", { layout: isDefaultLayout(draft) ? null : draft });
        // The sidebar and the launcher read it from the page-access answer.
        qc.setQueryData(["page-access"], (old) => (old ? { ...old, nav: r.data?.nav ?? null } : old));
        done.layout = true;
      }
      if (size(roleDraft)) {
        const fresh = (await api.get("/admin/page-access")).data;
        const pages = { ...fresh.pages };
        for (const [page, row] of Object.entries(roleDraft)) {
          const roles = new Set(pages[page] || []);
          for (const [role, on] of Object.entries(row)) { if (on) roles.add(role); else roles.delete(role); }
          pages[page] = [...roles];
        }
        await api.put("/admin/page-access", { pages });
        done.roles = true;
      }
      for (const [target, row] of Object.entries(capDraft)) {
        const grants = {}, denies = [], revokes = [];
        for (const [cap, state] of Object.entries(row)) {
          if (state === "deny") denies.push(cap);
          else if (state === INHERIT) revokes.push(cap);
          else grants[cap] = state;
        }
        const who = target.startsWith("p:") ? { profiles: [target.slice(2)] } : { keys: [Number(target.slice(2))] };
        await api.put("/admin/capabilities", { ...who, grants, denies, revokes });
        done.caps.push(target);
      }
    } catch (e) {
      failure = e;
    }
    // What the drafts are read against first — then drop what was saved, so
    // nothing on screen flips back for the moment in between.
    await Promise.allSettled([
      qc.refetchQueries({ queryKey: ["admin-org-chart"] }),
      done.roles ? qc.invalidateQueries({ queryKey: ["page-access"] }) : null,
    ]);
    for (const key of ["admin-page-access", "admin-capabilities", "admin-capabilities-audit", "my-capabilities"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
    if (done.layout) setDraft(null);
    if (done.roles) setRoleDraft({});
    if (done.caps.length) {
      setCapDraft((d) => Object.fromEntries(Object.entries(d).filter(([t]) => !done.caps.includes(t))));
    }
    setSaving(false);
    if (failure) throw failure;
  }, [layoutDirty, draft, roleDraft, capDraft, qc]);

  return {
    // layout
    cur, layout, layoutDirty, isDefault, apply: setDraft, reset,
    // roles
    roleOpen, setRole, roleChanged, roleDraft,
    // people
    capState, setCap, capChanged, capDraft,
    // the draft as a whole
    changes, dirty: changes > 0, discard, save, saving,
  };
}
