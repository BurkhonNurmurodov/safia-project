import { useMemo, useState } from "react";
import {
  Ban, Check, ExternalLink, FolderPlus, KeyRound, List, Lock, Minus, PackageOpen, Pencil,
  Plus, RotateCcw, Shield, ShieldCheck, Trash2, UserRound, Users, X,
} from "lucide-react";
import Button from "../ui/Button";
import BrandLogo from "../ui/BrandLogo";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import SortableList from "../ui/SortableList";
import StyledSelect from "../ui/StyledSelect";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { PAGES, ROLE_LABEL_KEYS } from "../../config/pages";
import { adminPage } from "../../config/adminNav";
import { TOP, navName } from "../../utils/navLayout";
import { moveTab, movePage, orderApps, orderPages, orderTabs } from "../../utils/navLayoutEdit";
import { appNodeId, screenNodeId, tabNodeId } from "../../utils/orgTree";
import { fill } from "../../pages/admin/orgChartText";
import { ROLE_ICON, roleHue } from "./orgNode";
import { KIND_HUE, accountTarget, kindHue, pageCap, pageKeys, profileTarget, screenKind } from "./appsNode";
import { Fact, Muted, Section, Tag } from "./OrgDetails";

/**
 * «Tashkiliy tuzilma», the «Ilovalar» view — what the chart says about ONE
 * node of the launcher, and everything that can be changed about it:
 *
 *   the platform — the apps' order, a new app, back to the code's own layout;
 *   an app       — its name / icon / colour, its menu tabs and screens in
 *                  order, a new menu tab, removing it (its screens move);
 *   a menu tab   — the same, and the app it sits in;
 *   a screen     — the app and menu tab it sits in, which ROLES open it and
 *                  which PEOPLE it was opened for or closed to.
 *
 * Every change lands in the page's draft (pages/admin/useAppsEditor.js) and is
 * sent only by «Saqlash». The same body sits in the canvas's side panel on a
 * wide screen and in a dialog on a phone (`bare` leaves the header to it).
 */

const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.key, p.labelKey]));
const BLUE = "#3b82f6", RED = "#ef4444";

// The Access matrix's own tick box («Sahifa ruxsatlari»), with a third state
// for «some of them».
function Box({ state }) {
  const on = state === true, mixed = state === "mixed";
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-md border flex-shrink-0 transition-colors"
      style={on || mixed
        ? { background: "var(--brand)", borderColor: "transparent" }
        : { background: "transparent", borderColor: "var(--border-md)" }}
    >
      {on && <Check size={12} color="#fff" aria-hidden="true" />}
      {mixed && <Minus size={12} color="#fff" aria-hidden="true" />}
    </span>
  );
}

const Unsaved = ({ title }) => (
  <span title={title} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--brand)" }} />
);

// One row of a list of apps / menu tabs / screens: pressing it opens that node.
function Row({ lead, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-2 min-w-0 text-left py-1.5">
      {lead}
      <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: "var(--text-1)" }}>{title}</span>
      {sub != null && <span className="flex-shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{sub}</span>}
    </button>
  );
}

// A row's glyph: an app's in its own tile colour (`hue`), a menu tab's or a
// screen's in its kind's (`ink`, appsNode.js KIND_HUE) — red where it can
// destroy data.
const Glyph = ({ icon: Icon, danger, hue, ink }) => (
  <span
    data-app-hue={hue}
    className={`grid place-items-center w-5 flex-shrink-0 ${!hue && (danger || ink) ? "chat-ink" : ""}`}
    style={hue ? { color: "rgb(var(--hue))" } : danger || ink ? { "--ink": danger ? RED : ink } : { color: "var(--text-3)" }}
  >
    <Icon size={14} aria-hidden="true" />
  </span>
);

/** A list of screens in the order they are drawn — dragged into a new one. */
function ScreenList({ links, appId, tabId, ed, A, onSelect }) {
  const { t } = useLang();
  if (!links.length) return <Muted>{A.noScreens}</Muted>;
  return (
    <SortableList
      items={links.map((l) => ({
        key: l.to,
        render: () => (
          <Row
            lead={<Glyph icon={l.icon} danger={l.danger} ink={KIND_HUE.screen} />} title={t(l.key)}
            onClick={() => onSelect(screenNodeId(l.to))}
          />
        ),
      }))}
      onChange={(tos) => ed.apply(orderPages(ed.cur, appId, tabId, tos))}
      label={(to) => `${A.move}: ${t(links.find((l) => l.to === to)?.key ?? "")}`}
    />
  );
}

/** Which ROLES open one page — the Access matrix's row for it, as ticks. */
function RoleRows({ page, ed, acc, A }) {
  const { t } = useLang();
  return (
    <ul>
      <li className="flex items-center gap-2 px-1.5 min-h-[34px] text-xs">
        <Shield size={13} className="chat-ink flex-shrink-0" style={{ "--ink": roleHue("admin") }} aria-hidden="true" />
        <span className="flex-1" style={{ color: "var(--text-1)" }}>{t(ROLE_LABEL_KEYS.admin)}</span>
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{A.always}</span>
      </li>
      {acc.roles.map((role) => {
        const on = ed.roleOpen(role, page);
        const Icon = ROLE_ICON[role] ?? UserRound;
        return (
          <li key={role}>
            <button
              type="button" role="checkbox" aria-checked={on}
              onClick={() => ed.setRole(page, role, !on)}
              className="w-full flex items-center gap-2 px-1.5 min-h-[38px] rounded-lg text-xs text-left hover:bg-[var(--hover-bg)]"
            >
              <Icon size={13} className="chat-ink flex-shrink-0" style={{ "--ink": roleHue(role) }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }}>{t(ROLE_LABEL_KEYS[role])}</span>
              {ed.roleChanged(role, page) && <Unsaved title={A.unsaved} />}
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{acc.roleCount[role] ?? 0}</span>
              <Box state={on} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The PEOPLE a page was opened for, or closed to, one by one. */
function PeopleRows({ page, ed, data, acc, A, P }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const cap = pageCap(page);
  const scoped = Boolean(acc.caps[cap]?.scoped);
  const [pick, setPick] = useState("");
  const [scope, setScope] = useState("own");

  const { open, shut } = useMemo(() => {
    const o = [], s = [];
    const add = (target, name, sub) => {
      const state = ed.capState(target, cap);
      if (state === "inherit") return;
      (state === "deny" ? s : o).push({ target, name, sub, state, changed: ed.capChanged(target, cap) });
    };
    for (const p of data.profiles) {
      if (p.role === "admin") continue;
      add(profileTarget(p.key), tl(p.name), t(ROLE_LABEL_KEYS[p.role] ?? "role.guest"));
      for (const a of p.accounts) {
        add(accountTarget(a.telegram_id), a.name || `#${a.telegram_id}`, `${A.login} · ${tl(p.name)}`);
      }
    }
    return { open: o, shut: s };
  }, [data, ed, cap, t, tl, A]);

  const row = (r, closed) => (
    <li key={r.target} className="flex items-center gap-1.5 min-h-[30px] text-xs">
      {closed
        ? <Ban size={12} className="chat-ink flex-shrink-0" style={{ "--ink": RED }} aria-hidden="true" />
        : <KeyRound size={12} className="chat-ink flex-shrink-0" style={{ "--ink": BLUE }} aria-hidden="true" />}
      <span className={`min-w-0 truncate font-medium ${closed ? "line-through" : ""}`} style={{ color: "var(--text-1)" }}>{r.name}</span>
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--text-3)" }}>{r.sub}</span>
      {!closed && scoped && (
        <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>{t(`admin.perms.scope.${r.state}`)}</span>
      )}
      {r.changed && <Unsaved title={A.unsaved} />}
      <button
        type="button" onClick={() => ed.setCap(r.target, cap, "inherit")}
        aria-label={`${A.remove}: ${r.name}`} title={A.remove}
        className="grid place-items-center w-7 h-7 -mr-1 rounded-lg flex-shrink-0 hover:bg-[var(--hover-bg)]"
        style={{ color: "var(--text-3)" }}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <div>
      {open.length + shut.length === 0
        ? <Muted>{A.peopleNone}</Muted>
        : <ul>{open.map((r) => row(r, false))}{shut.map((r) => row(r, true))}</ul>}
      <div className="mt-2 space-y-1.5">
        <StyledSelect
          searchable searchPlaceholder={P.findSearch} placeholder={A.addPerson} ariaLabel={A.addPerson}
          triggerClassName="px-2.5 py-1.5 text-xs"
          value={pick} options={acc.people} onChange={(v) => setPick(v || "")}
        />
        {pick && (
          <div className="flex flex-wrap items-center gap-1.5">
            {scoped && (
              <SegmentedToggle
                size="sm" value={scope} onChange={setScope}
                options={[["own", t("admin.perms.scope.own")], ["all", t("admin.perms.scope.all")]]}
              />
            )}
            <Button
              variant="primary" size="md" icon={<KeyRound size={13} />}
              onClick={() => { ed.setCap(profileTarget(pick), cap, scoped ? scope : "all"); setPick(""); }}
            >
              {A.openFor}
            </Button>
            <Button
              variant="secondary" size="md" icon={<Ban size={13} />}
              onClick={() => { ed.setCap(profileTarget(pick), cap, "deny"); setPick(""); }}
            >
              {A.closeFor}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Who sees a whole app or menu tab — and one tick opens or closes all of it for a role. */
function BulkRoles({ links, ed, acc, A }) {
  const { t } = useLang();
  const keys = useMemo(
    () => [...new Set(links.filter((l) => screenKind(l) === "page").flatMap(pageKeys))],
    [links],
  );
  const fixed = links.filter((l) => screenKind(l) !== "page").length;
  if (!links.length) return null;
  return (
    <Section title={A.whoSees}>
      {keys.length > 0 && (
        <ul>
          {acc.roles.map((role) => {
            const n = keys.filter((k) => ed.roleOpen(role, k)).length;
            const state = n === 0 ? false : n === keys.length ? true : "mixed";
            const Icon = ROLE_ICON[role] ?? UserRound;
            return (
              <li key={role}>
                <button
                  type="button" role="checkbox" aria-checked={state === "mixed" ? "mixed" : state}
                  title={state === true ? A.bulkClose : A.bulkOpen}
                  onClick={() => keys.forEach((k) => ed.setRole(k, role, state !== true))}
                  className="w-full flex items-center gap-2 px-1.5 min-h-[38px] rounded-lg text-xs text-left hover:bg-[var(--hover-bg)]"
                >
                  <Icon size={13} className="chat-ink flex-shrink-0" style={{ "--ink": roleHue(role) }} aria-hidden="true" />
                  <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-1)" }}>{t(ROLE_LABEL_KEYS[role])}</span>
                  {keys.some((k) => ed.roleChanged(role, k)) && <Unsaved title={A.unsaved} />}
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{n} / {keys.length}</span>
                  <Box state={state} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 space-y-1">
        <Muted>{keys.length ? A.bulkNote : A.bulkNone}</Muted>
        {fixed > 0 && keys.length > 0 && <Muted>{fill(A.bulkFixed, { n: fixed })}</Muted>}
      </div>
    </Section>
  );
}

function RootBody({ ed, A, ui, onSelect }) {
  const { t, lang } = useLang();
  const apps = ed.layout.apps;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => ui.form({ kind: "app" })}>{A.addApp}</Button>
        {!ed.isDefault && (
          <Button variant="secondary" size="md" icon={<RotateCcw size={14} />} onClick={ui.reset}>{A.reset}</Button>
        )}
      </div>
      <Section title={A.apps} count={apps.length}>
        <SortableList
          items={apps.map((a) => ({
            key: a.id,
            render: () => (
              <Row
                lead={<Glyph icon={a.icon} hue={a.hue} />} title={navName(a, t, lang)} sub={a.links.length}
                onClick={() => onSelect(appNodeId(a.id))}
              />
            ),
          }))}
          onChange={(ids) => ed.apply(orderApps(ed.cur, ids))}
          label={(id) => `${A.move}: ${navName(ed.layout.byId.get(id), t, lang)}`}
        />
      </Section>
      <Muted>{A.rootNote}</Muted>
    </div>
  );
}

function AppBody({ node, ed, acc, A, ui, onSelect }) {
  const { t, lang } = useLang();
  if (node.loose) {
    return (
      <div className="space-y-4">
        <Muted>{A.looseNote}</Muted>
        <Section title={A.screens} count={ed.layout.loose.length}>
          <ul className="space-y-0.5">
            {ed.layout.loose.map((l) => (
              <li key={l.to}>
                <Row lead={<Glyph icon={l.icon} danger={l.danger} ink={KIND_HUE.screen} />} title={t(l.key)} onClick={() => onSelect(screenNodeId(l.to))} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    );
  }
  const app = node.app;
  const [top, ...folders] = app.tabs;
  const keep = app.id === "admin";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="md" icon={<Pencil size={14} />} onClick={() => ui.form({ kind: "app", app })}>{A.edit}</Button>
        <Button variant="secondary" size="md" icon={<FolderPlus size={14} />} onClick={() => ui.form({ kind: "tab", appId: app.id })}>{A.addTab}</Button>
        <Button
          variant="danger" tint size="md" icon={<Trash2 size={14} />}
          disabled={keep} title={keep ? A.keepAdmin : undefined}
          onClick={() => ui.removeApp(app)}
        >
          {A.remove}
        </Button>
      </div>
      {folders.length > 0 && (
        <Section title={A.tabs} count={folders.length}>
          <SortableList
            items={folders.map((tab) => ({
              key: tab.id,
              render: () => (
                <Row
                  lead={<Glyph icon={tab.icon} danger={tab.danger} ink={KIND_HUE.tab} />} title={navName(tab, t, lang)} sub={tab.links.length}
                  onClick={() => onSelect(tabNodeId(app.id, tab))}
                />
              ),
            }))}
            onChange={(ids) => ed.apply(orderTabs(ed.cur, app.id, ids))}
            label={(id) => `${A.move}: ${navName(folders.find((x) => x.id === id), t, lang)}`}
          />
        </Section>
      )}
      <Section title={folders.length ? A.screensTop : A.screens} count={top.links.length}>
        <ScreenList links={top.links} appId={app.id} tabId={TOP} ed={ed} A={A} onSelect={onSelect} />
      </Section>
      <BulkRoles links={app.links} ed={ed} acc={acc} A={A} />
    </div>
  );
}

function TabBody({ node, ed, acc, A, ui, onSelect }) {
  const { t, lang } = useLang();
  const { tab, app } = node;
  return (
    <div className="space-y-4">
      {tab.top ? <Muted>{A.topNote}</Muted> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="md" icon={<Pencil size={14} />} onClick={() => ui.form({ kind: "tab", tab })}>{A.edit}</Button>
            <Button variant="danger" tint size="md" icon={<Trash2 size={14} />} onClick={() => ui.removeTab(tab, app)}>{A.remove}</Button>
          </div>
          <FormField label={A.inApp}>
            <StyledSelect
              searchable ariaLabel={A.inApp} value={app.id}
              options={ed.layout.apps.map((a) => ({ value: a.id, label: navName(a, t, lang) }))}
              onChange={(v) => { if (v && v !== app.id) ed.apply(moveTab(ed.cur, tab.id, v)); }}
            />
          </FormField>
        </>
      )}
      <Section title={A.screens} count={tab.links.length}>
        <ScreenList links={tab.links} appId={app.id} tabId={tab.id} ed={ed} A={A} onSelect={onSelect} />
      </Section>
      <BulkRoles links={tab.links} ed={ed} acc={acc} A={A} />
    </div>
  );
}

function ScreenBody({ node, ed, data, acc, A, P, ui, onSelect }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { link, app, tab } = node;
  const kind = screenKind(link);
  const keys = pageKeys(link);
  const folders = app ? app.tabs.slice(1) : [];
  const siblings = node.parent.children;
  const pageName = (k) => t(PAGE_LABEL[k] ?? `nav.${k}`);

  const move = (appId, tabId) => {
    ed.apply(movePage(ed.cur, link.to, appId || null, tabId));
    ui.moved(node.id);
  };

  // An admin-app page: the capabilities that open it, and who holds one.
  const tabKey = link.capKey ?? link.tab;
  const tabCaps = kind === "admin" ? (data.capabilities || []).filter((c) => c.tabs.includes(tabKey)) : [];
  const holders = kind === "admin"
    ? data.profiles.filter((p) => !p.access.all && p.access.tabs.includes(tabKey))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="md" icon={<ExternalLink size={14} />} onClick={() => ui.go(link.to)}>{A.openScreen}</Button>
        {kind === "page" && (
          <Button variant="secondary" size="md" icon={<Users size={14} />} onClick={() => ui.showPeople(keys[0])}>{A.showPeople}</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label={A.inApp}>
          <StyledSelect
            searchable ariaLabel={A.inApp} value={app?.id ?? ""}
            options={[
              ...ed.layout.apps.map((a) => ({ value: a.id, label: navName(a, t, lang) })),
              { value: "", label: A.loose },
            ]}
            onChange={(v) => { if ((v || "") !== (app?.id ?? "")) move(v, TOP); }}
          />
        </FormField>
        <FormField label={A.inTab}>
          <StyledSelect
            ariaLabel={A.inTab} value={tab?.id ?? TOP} disabled={!folders.length}
            options={[
              { value: TOP, label: A.noTab },
              ...folders.map((x) => ({ value: x.id, label: navName(x, t, lang) })),
            ]}
            onChange={(v) => { if (app && v && v !== tab.id) move(app.id, v); }}
          />
        </FormField>
      </div>
      {app && siblings.length > 1 && (
        <Fact label={A.order}>
          <button type="button" className="cell-link text-left" onClick={() => onSelect(node.parent.id)}>
            {fill(A.orderOf, { i: siblings.indexOf(node) + 1, n: siblings.length })}
          </button>
        </Fact>
      )}

      {kind === "page" && keys.map((k) => {
        const shared = acc.sharing(k, link.to);
        return (
          <div key={k} className="space-y-4">
            <Section title={keys.length > 1 ? `${A.roles} — ${pageName(k)}` : A.roles}>
              <RoleRows page={k} ed={ed} acc={acc} A={A} />
              {shared.length > 0 && (
                <div className="mt-2"><Muted>{fill(A.shared, { pages: shared.map((l) => `«${t(l.key)}»`).join(", ") })}</Muted></div>
              )}
            </Section>
            {acc.caps[pageCap(k)] && (
              <Section title={keys.length > 1 ? `${A.people} — ${pageName(k)}` : A.people}>
                <PeopleRows page={k} ed={ed} data={data} acc={acc} A={A} P={P} />
              </Section>
            )}
          </div>
        );
      })}
      {kind === "page" && <Muted>{A.accessNote}</Muted>}

      {kind === "locked" && (
        <Section title={A.roles}>
          <div className="flex items-start gap-1.5">
            <Lock size={12} className="flex-shrink-0 mt-[2px]" style={{ color: "var(--text-3)" }} aria-hidden="true" />
            <Muted>{A.lockedNote}</Muted>
          </div>
          {link.roles?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {link.roles.map((r) => <Tag key={r}>{t(ROLE_LABEL_KEYS[r] ?? "role.guest")}</Tag>)}
            </div>
          )}
        </Section>
      )}

      {kind === "admin" && (
        <Section title={A.roles}>
          <Muted>{A.adminNote}</Muted>
          {tabCaps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tabCaps.map((c) => <Tag key={c.key} tone="grant" icon={ShieldCheck}>{c.page ? pageName(c.page) : t(`caps.${c.key}.label`)}</Tag>)}
            </div>
          )}
          {holders.length > 0 && (
            <ul className="mt-2 space-y-1">
              {holders.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5 text-xs">
                  <KeyRound size={12} className="chat-ink flex-shrink-0" style={{ "--ink": BLUE }} aria-hidden="true" />
                  <span className="min-w-0 truncate font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--text-3)" }}>{t(ROLE_LABEL_KEYS[p.role] ?? "role.guest")}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <Button variant="secondary" size="md" icon={<KeyRound size={14} />} onClick={() => ui.go(adminPage("permissions"))}>
              {P.openPerms}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

/** The node's glyph, at the details header's size. */
export function AppNodeLead({ node, size = 44 }) {
  if (node.kind === "root") return <BrandLogo className="rounded-xl flex-shrink-0" style={{ width: size, height: size }} />;
  const hue = node.kind === "app" && !node.loose ? node.app.hue : null;
  const Icon = node.kind === "app" ? (node.loose ? PackageOpen : node.app.icon)
    : node.kind === "tab" ? (node.tab.top ? List : node.tab.icon) : node.link.icon;
  const danger = node.kind === "tab" ? node.tab.danger : node.kind === "screen" ? node.link.danger : false;
  // A menu tab's and a screen's glyph in their kind's colour, as on the card.
  const ink = hue ? null : danger ? RED : kindHue(node);
  return (
    <span
      data-app-hue={hue ?? undefined}
      className={`grid place-items-center rounded-xl flex-shrink-0 ${ink ? "chat-ink" : ""}`}
      style={{ width: size, height: size, ...(hue
        ? { color: "rgb(var(--hue))", background: "rgba(var(--hue), .14)" }
        : ink ? { "--ink": ink, background: `${ink}1f` }
          : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }) }}
    >
      <Icon size={Math.round(size * 0.45)} aria-hidden="true" />
    </span>
  );
}

export default function AppsDetails({ node, tree, ed, data, acc, A, P, ui, text, onSelect, onClose, bare = false }) {
  const { title, sub } = text(node);
  const shared = { node, tree, ed, data, acc, A, P, ui, onSelect };
  const body = node.kind === "root" ? <RootBody {...shared} />
    : node.kind === "app" ? <AppBody {...shared} />
    : node.kind === "tab" ? <TabBody {...shared} />
    : <ScreenBody {...shared} />;
  if (bare) return body;
  return (
    <>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <AppNodeLead node={node} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>{title}</div>
          <div className="mt-0.5 text-xs break-words" style={{ color: "var(--text-3)" }}>{sub}</div>
        </div>
        <button
          type="button" onClick={onClose} aria-label={P.close} title={P.close}
          className="grid place-items-center w-7 h-7 -mr-1 rounded-lg flex-shrink-0"
          style={{ color: "var(--text-3)" }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 py-4">{body}</div>
    </>
  );
}
