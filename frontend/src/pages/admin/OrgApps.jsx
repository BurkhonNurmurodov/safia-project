import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ShieldCheck, UserRound } from "lucide-react";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { FilterPanel, PickFilter } from "../../components/ui/ColumnFilter";
import OrgCanvas from "../../components/orgchart/OrgCanvas";
import AppsDetails from "../../components/orgchart/AppsDetails";
import { NavFormModal, RemoveAppModal } from "../../components/orgchart/AppsDialogs";
import { pageKeys, profileOpens, screenKind, useAppNodeText } from "../../components/orgchart/appsNode";
import { useCanvasHeight } from "../../components/orgchart/useCanvasHeight";
import { useLang } from "../../context/LangContext";
import useIsMobile from "../../hooks/useIsMobile";
import { useGuardedNavigate } from "../../hooks/useLeaveGuard";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { APP_LINKS, navName } from "../../utils/navLayout";
import { removeTab } from "../../utils/navLayoutEdit";
import { APPS_STACK, appNodeId, buildAppsTree, nodesUnder, pathTo } from "../../utils/orgTree";
import { fill } from "./orgChartText";

/**
 * «Tashkiliy tuzilma», the «Ilovalar» view — the launcher's structure as the
 * same chart: the platform → its apps in a row → their menu tabs in a row →
 * the screens of each as one column. Here the operator ARRANGES it (the order of everything, a new
 * app or menu tab, a screen or a menu tab moved, an app or a tab taken away)
 * and decides who opens each screen — the roles and, one by one, the people.
 *
 * Everything is a draft (useAppsEditor.js, held by the page's shell) until
 * «Saqlash»; the panel on the left edits the node that is open. Two lenses
 * answer «who sees what» at a glance: a ROLE or one PERSON lights up the
 * screens they open, and an app folded shut says how many it holds.
 *
 * `?n=<node id>` is the open panel; the opened branches are remembered per
 * device. Nothing unfolds by itself except the way to a node the operator
 * just made or moved.
 */

const PANEL_W = 360;
const PAGE_CAP = "page.view.";

export default function OrgApps({ data, ed, P, A, head, corner, onShowPeople }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const wide = !useIsMobile(1024);
  const navigate = useGuardedNavigate();
  const { layout } = ed;
  const tree = useMemo(() => buildAppsTree(layout), [layout]);

  // ── what the access answers are read from ───────────────────────────────
  const roles = useMemo(() => Object.keys(data.role_pages || {}), [data]);
  const acc = useMemo(() => {
    const roleCount = {};
    for (const p of data.profiles) roleCount[p.role] = (roleCount[p.role] || 0) + 1;
    const byKey = new Map();
    for (const l of APP_LINKS) for (const k of pageKeys(l)) (byKey.get(k) || byKey.set(k, []).get(k)).push(l);
    const people = data.profiles
      .filter((p) => p.role !== "admin")
      .map((p) => ({ key: p.key, name: tl(p.name), role: t(ROLE_LABEL_KEYS[p.role] ?? "role.guest") }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => ({
        value: x.key, title: `${x.name} · ${x.role}`, short: x.name,
        label: (
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="truncate">{x.name}</span>
            <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>{x.role}</span>
          </span>
        ),
      }));
    return {
      roles, roleCount, people,
      caps: Object.fromEntries((data.capabilities || []).map((c) => [c.key, c])),
      // The other screens answering to the same page-access key.
      sharing: (key, to) => (byKey.get(key) || []).filter((l) => l.to !== to),
    };
  }, [data, roles, t, tl]);

  const { roleOpen } = ed;
  const rolesOpening = useCallback((link) => {
    const kind = screenKind(link);
    if (kind === "admin") return [];
    if (kind === "locked") return roles.filter((r) => link.roles?.includes(r));
    const keys = pageKeys(link);
    return roles.filter((r) => keys.some((k) => roleOpen(r, k)));
  }, [roles, roleOpen]);
  const accessLine = useCallback((link) => {
    if (screenKind(link) === "admin") return A.subAdminPage;
    const n = rolesOpening(link).length;
    return n === 0 ? A.subAdmins : n === roles.length ? A.subAllRoles : fill(A.subRoles, { n });
  }, [A, roles, rolesOpening]);
  const text = useAppNodeText(A, accessLine);

  // What a screen's card carries: admins only · a personal entry · unsaved.
  const { capDraft, roleDraft } = ed;
  const flags = useMemo(() => {
    const holders = new Map();   // page key → targets holding a personal entry
    const set = (target, cap, on) => {
      if (!cap.startsWith(PAGE_CAP)) return;
      const key = cap.slice(PAGE_CAP.length);
      const s = holders.get(key) || holders.set(key, new Set()).get(key);
      if (on) s.add(target); else s.delete(target);
    };
    for (const p of data.profiles) {
      if (p.role === "admin") continue;
      for (const k of [...Object.keys(p.grants), ...p.denies]) set(`p:${p.key}`, k, true);
      for (const a of p.accounts) for (const k of [...Object.keys(a.grants), ...a.denies]) set(`a:${a.telegram_id}`, k, true);
    }
    const changed = new Set(Object.keys(roleDraft));
    for (const [target, row] of Object.entries(capDraft)) {
      for (const [cap, state] of Object.entries(row)) {
        set(target, cap, state !== "inherit");
        if (cap.startsWith(PAGE_CAP)) changed.add(cap.slice(PAGE_CAP.length));
      }
    }
    const m = new Map();
    for (const n of tree.index.values()) {
      if (n.kind !== "screen") continue;
      const kind = screenKind(n.link);
      const keys = kind === "page" ? pageKeys(n.link) : [];
      const f = {
        locked: kind !== "page", lockedTip: kind === "admin" ? A.subAdminPage : A.subAdmins,
        personal: keys.some((k) => holders.get(k)?.size > 0), personalTip: A.personalTip,
        changed: keys.some((k) => changed.has(k)), changedTip: A.unsaved,
      };
      if (f.locked || f.personal || f.changed) m.set(n.id, f);
    }
    return m;
  }, [data, tree, capDraft, roleDraft, A]);

  // ── what is open ────────────────────────────────────────────────────────
  const [open, setOpen] = usePersistentState("orgchart.apps.open", null);
  const expanded = useMemo(() => new Set(open ?? ["root"]), [open]);
  const [command, setCommand] = useState(null);
  const seq = useRef(0);
  const ask = useCallback((type, id) => setCommand({ type, id, seq: ++seq.current }), []);

  const toggle = useCallback((id) => {
    setOpen((prev) => {
      const s = new Set(prev ?? ["root"]);
      if (s.has(id)) s.delete(id); else s.add(id);
      return [...s];
    });
  }, [setOpen]);
  const reveal = useCallback((id) => {
    setOpen((prev) => {
      const s = new Set(prev ?? ["root"]);
      for (const a of pathTo(tree.index, id).slice(0, -1)) s.add(a);
      return [...s];
    });
  }, [setOpen, tree]);
  const expandAll = useCallback(() => {
    setOpen([...tree.index.values()].filter((n) => n.children.length).map((n) => n.id));
    ask("fit");
  }, [tree, setOpen, ask]);
  const collapseAll = useCallback(() => { setOpen(["root"]); ask("fit"); }, [setOpen, ask]);

  // ── the open panel lives in the address ─────────────────────────────────
  const [sp, setSp] = useSearchParams();
  const selected = sp.get("n");
  const node = selected ? tree.index.get(selected) : null;
  const select = useCallback((id) => {
    setSp((prev) => {
      const q = new URLSearchParams(prev);
      if (id && q.get("n") !== id) q.set("n", id); else q.delete("n");
      return q;
    }, { replace: true });
  }, [setSp]);
  const close = useCallback(() => select(null), [select]);

  // A node to show once the tree that holds it is drawn: one the operator
  // just made or moved (its place is new), or one picked from a list.
  const [follow, setFollow] = useState(null);
  const go = useCallback((id) => { if (id) setFollow({ id, pick: true }); }, []);
  useEffect(() => {
    if (!follow) return;
    setFollow(null);
    if (!tree.index.has(follow.id)) return;
    reveal(follow.id);
    if (follow.pick) setSp((prev) => { const q = new URLSearchParams(prev); q.set("n", follow.id); return q; }, { replace: true });
    ask("focus", follow.id);
  }, [follow, tree, reveal, setSp, ask]);

  // Arriving with ?n= (a link, or «back»): show that node.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (selected && tree.index.has(selected)) setFollow({ id: selected });
  }, [selected, tree]);

  // ── the two lenses: a role, or one person ───────────────────────────────
  const [role, setRole] = useState(null);
  const [person, setPerson] = useState(null);
  const profile = useMemo(
    () => (person ? data.profiles.find((p) => p.key === person) : null),
    [data, person],
  );
  const lensOn = Boolean(role || profile);
  const { marks, hits, found } = useMemo(() => {
    if (!lensOn) return { marks: null, hits: null, found: [] };
    const m = new Map();
    for (const n of tree.index.values()) {
      if (n.kind !== "screen") continue;
      const on = profile ? profileOpens(profile, n.link) : rolesOpening(n.link).includes(role);
      if (on) m.set(n.id, "on");
    }
    const h = new Map();
    (function count(n) {
      let k = m.has(n.id) ? 1 : 0;
      for (const c of n.children) k += count(c);
      h.set(n.id, k);
      return k;
    })(tree.root);
    return { marks: m, hits: h, found: nodesUnder(tree.root, "screen").map((n) => n.id).filter((id) => m.has(id)) };
  }, [tree, lensOn, role, profile, rolesOpening]);
  const total = found.length;
  const at = selected ? found.indexOf(selected) : -1;
  const step = (d) => {
    if (total) go(found[at < 0 ? (d > 0 ? 0 : total - 1) : (at + d + total) % total]);
  };

  const sections = [
    {
      key: "role", icon: ShieldCheck, label: A.fRole,
      active: Boolean(role), display: role ? t(ROLE_LABEL_KEYS[role]) : "",
      onClear: () => setRole(null),
      render: ({ close: shut } = {}) => (
        <PickFilter
          close={shut} value={role ?? "all"}
          opts={[{ value: "all", label: A.lensAll }, ...roles.map((r) => ({ value: r, label: t(ROLE_LABEL_KEYS[r]) }))]}
          onChange={(v) => { setRole(v === "all" ? null : v); setPerson(null); }}
        />
      ),
    },
    {
      key: "person", icon: UserRound, label: A.fPerson,
      active: Boolean(profile), display: profile ? tl(profile.name) : "",
      onClear: () => setPerson(null),
      render: ({ close: shut } = {}) => (
        <PickFilter
          searchable close={shut} value={person}
          opts={acc.people}
          onChange={(v) => { setPerson(v === person ? null : v); setRole(null); }}
        />
      ),
    },
  ];

  // ── the dialogs the panel opens ─────────────────────────────────────────
  const [dialog, setDialog] = useState(null);
  const ui = useMemo(() => ({
    form: (spec) => setDialog({ type: "form", spec }),
    removeApp: (app) => setDialog({ type: "removeApp", app }),
    removeTab: (tab, app) => setDialog({ type: "removeTab", tab, app }),
    reset: () => setDialog({ type: "reset" }),
    moved: (id) => setFollow({ id }),
    go: (path) => navigate(path),
    showPeople: onShowPeople,
  }), [navigate, onShowPeople]);
  const shut = () => setDialog(null);

  const [boxRef, height] = useCanvasHeight();
  const nodeText = node ? text(node) : null;
  const panel = node && (
    <AppsDetails
      bare={!wide} node={node} tree={tree} ed={ed} data={data} acc={acc} A={A} P={P}
      ui={ui} text={text} onSelect={go} onClose={close}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {head}
        <FilterPanel sections={sections} chipsWrap />
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {fill(A.summary, { a: layout.apps.length, s: tree.root.people })}
        </span>
      </div>

      <div ref={boxRef}>
        <OrgCanvas
          stack={APPS_STACK} sceneKey="apps" homeMin={0.65}
          tree={tree} expanded={expanded} selected={node ? selected : null}
          marks={marks} hits={hits} lensOn={lensOn} P={P} command={command}
          text={text} flags={flags}
          insetLeft={wide && node ? PANEL_W + 24 : 0}
          onSelect={select} onToggle={toggle} onExpandAll={expandAll} onCollapseAll={collapseAll}
          height={height}
        >
          <div className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] flex flex-col items-end gap-2 pointer-events-none">
            {corner}
            {lensOn && (
              <div
                data-org-nopan
                className="pointer-events-auto max-w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)", cursor: "default", boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}
                role="status"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: total ? "#22c55e" : "#94a3b8" }} />
                <span className="truncate">
                  {profile
                    ? fill(A.lensPerson, { name: tl(profile.name), n: total })
                    : fill(A.lensRole, { role: t(ROLE_LABEL_KEYS[role]), n: total })}
                  {profile && ed.dirty ? ` · ${A.lensSaved}` : ""}
                </span>
                {total > 0 && (
                  <span className="flex items-center flex-shrink-0 -my-1 -mr-1.5">
                    <Button variant="ghost" size="sm" className="!px-1.5" icon={<ChevronLeft size={15} />} onClick={() => step(-1)} title={P.prev} aria-label={P.prev} />
                    <span className="min-w-[3ch] text-center tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>
                      {at >= 0 ? at + 1 : "–"}
                    </span>
                    <Button variant="ghost" size="sm" className="!px-1.5" icon={<ChevronRight size={15} />} onClick={() => step(1)} title={P.next} aria-label={P.next} />
                  </span>
                )}
              </div>
            )}
          </div>
          {wide && node && (
            <aside
              data-org-nopan
              className="absolute left-3 top-3 overflow-y-auto rounded-2xl"
              style={{
                width: PANEL_W, maxHeight: "calc(100% - 4.75rem)", cursor: "default",
                background: "var(--bg-card)", border: "1px solid var(--border-md)",
                boxShadow: "0 10px 30px rgba(0,0,0,.14)", userSelect: "text",
              }}
            >
              {panel}
            </aside>
          )}
        </OrgCanvas>
      </div>

      {!wide && node && (
        // Not a form: every change is already in the page's draft, so closing
        // it never asks.
        <Modal open onClose={close} title={nodeText.title} subtitle={nodeText.sub} dirty={false} bodyClassName="px-5 py-4">
          {panel}
        </Modal>
      )}

      {dialog?.type === "form" && (
        <NavFormModal spec={dialog.spec} ed={ed} A={A} onClose={shut} onDone={(id) => { shut(); if (id) go(id); }} />
      )}
      {dialog?.type === "removeApp" && (
        <RemoveAppModal app={dialog.app} ed={ed} A={A} onClose={shut} onDone={(id) => { shut(); go(id); }} />
      )}
      <ConfirmDialog
        open={dialog?.type === "removeTab"} tone="danger"
        title={dialog?.type === "removeTab" ? fill(A.removeTabTitle, { name: navName(dialog.tab, t, lang) }) : ""}
        message={dialog?.type === "removeTab" ? `${fill(A.removeTabMsg, { n: dialog.tab.links.length })} ${A.draftNote}` : ""}
        confirmLabel={A.remove} cancelLabel={A.cancel}
        onCancel={shut}
        onConfirm={() => {
          const { tab, app } = dialog;
          ed.apply(removeTab(ed.cur, tab.id));
          shut();
          go(appNodeId(app.id));
        }}
      />
      <ConfirmDialog
        open={dialog?.type === "reset"}
        title={A.resetTitle} message={`${A.resetMsg} ${A.draftNote}`}
        confirmLabel={A.resetYes} cancelLabel={A.cancel}
        onCancel={shut}
        onConfirm={() => { ed.reset(); shut(); close(); }}
      />
    </div>
  );
}
