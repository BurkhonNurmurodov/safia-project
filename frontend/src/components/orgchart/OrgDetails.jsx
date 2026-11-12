import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ban, Building2, Clock3, Factory, Globe, IdCard, KeyRound, Send, ShieldCheck,
  UserRound, X,
} from "lucide-react";
import Button from "../ui/Button";
import BrandLogo from "../ui/BrandLogo";
import CellLink from "../ui/CellLink";
import GroupBadge from "../ui/GroupBadge";
import ProfileAvatar from "../ui/ProfileAvatar";
import { useLang } from "../../context/LangContext";
import { factoryName } from "../../context/FactoryContext";
import { useTranslit } from "../../utils/transliterate";
import { PAGES, ROLE_LABEL_KEYS } from "../../config/pages";
import { ADMIN_NAV, adminPage } from "../../config/adminNav";
import { fmtDate, useCanOpenPeople } from "../people/peopleUtil";
import { ROLE_ICON, roleHue, useNodeText } from "./orgNode";
import { fill } from "../../pages/admin/orgChartText";

/**
 * «Tashkiliy tuzilma» — what the chart says about ONE node: a person's place,
 * logins, pages and personal grants, with the ways out (their «Xodim kartasi»,
 * their profile page, the permission pages); a tier's, a plant's or a shift's
 * make-up. Read-only — the same body sits in the canvas's side panel on a wide
 * screen and in a dialog on a phone (`bare` leaves the header to the dialog).
 */

const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.key, p.labelKey]));
const TAB_LABEL = Object.fromEntries(ADMIN_NAV.map((n) => [n.id, n.labelKey]));
const BLUE = "#3b82f6", RED = "#ef4444";
// Staff of the plant: a card exists for them even where no Verifix id is tied
// yet (the name search answers). A guest or an admin is opened by id only.
const PLANT_ROLES = new Set(["top-manager", "shift-manager", "supervisor", "leader", "idle-owner"]);

function Section({ title, count, children }) {
  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>
        {title}
        {count != null && <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{count}</span>}
      </h4>
      {children}
    </section>
  );
}

function Tag({ tone, icon: Icon, title, strike = false, children }) {
  const hue = tone === "grant" ? BLUE : tone === "deny" ? RED : null;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 max-w-full rounded-md px-1.5 py-[3px] text-[11px] font-medium leading-tight ${hue ? "chat-ink" : ""}`}
      style={hue
        ? { "--ink": hue, background: `${hue}1a`, border: `1px solid ${hue}40` }
        : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {Icon && <Icon size={11} className="flex-shrink-0" aria-hidden="true" />}
      <span className={`truncate ${strike ? "line-through" : ""}`}>{children}</span>
    </span>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <span className="w-20 flex-shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="min-w-0 flex-1 font-medium" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

const Muted = ({ children }) => (
  <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{children}</p>
);

/** The words for one access answer — pages, closed pages, grants, admin pages. */
function useAccessWords(data, P) {
  const { t } = useLang();
  return useMemo(() => {
    const caps = Object.fromEntries((data?.capabilities || []).map((c) => [c.key, c]));
    const pageName = (p) => t(PAGE_LABEL[p] ?? `nav.${p}`);
    const scopeOf = (key, scope) => (caps[key]?.scoped && scope ? t(`admin.perms.scope.${scope}`) : null);
    const pageScoped = (p) => caps[`page.view.${p}`]?.scoped;
    return {
      caps, pageName,
      capName: (k) => t(`caps.${k}.label`),
      scopeOf,
      // One page row → its chip.
      pageTag: (row) => {
        const personal = row.grant || (!row.role && row.caps.length > 0);
        const scope = row.grant && pageScoped(row.page) ? t(`admin.perms.scope.${row.grant}`) : null;
        const why = personal
          ? [P.byGrant, ...row.caps.map((k) => t(`caps.${k}.label`))].join(" · ")
          : P.byRole;
        return (
          <Tag key={row.page} tone={personal ? "grant" : undefined} icon={personal ? KeyRound : undefined} title={why}>
            {pageName(row.page)}{scope ? ` · ${scope}` : ""}
          </Tag>
        );
      },
      actionCaps: (held) => Object.entries(held || {}).filter(([k]) => caps[k] && !caps[k].page),
      tabName: (id) => t(TAB_LABEL[id] ?? id),
    };
  }, [data, t, P]);
}

// The pages are the position's own answer (every login's, a browser login's
// too). A blue chip is a page — or a scope — the role does not give by itself;
// the legend under the chips says so only where there is one to explain. The
// actions section exists only when something was granted: «none» right under
// three granted pages read as a contradiction.
function AccessBlock({ access, W, P }) {
  if (access.all) return <Section title={P.pages}><Muted>{P.pagesAdmin}</Muted></Section>;
  const actions = W.actionCaps(access.caps);
  const personal = access.pages.some((r) => r.grant || (!r.role && r.caps.length > 0));
  return (
    <>
      <Section title={P.pages} count={access.pages.length}>
        {access.pages.length === 0 && access.denied.length === 0
          ? <Muted>{P.pagesNone}</Muted>
          : (
            <div className="flex flex-wrap gap-1">
              {access.pages.map(W.pageTag)}
              {access.denied.map((p) => (
                <Tag key={`x${p}`} tone="deny" icon={Ban} title={P.closed} strike>{W.pageName(p)}</Tag>
              ))}
            </div>
          )}
        {(personal || access.denied.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            {personal && (
              <span className="inline-flex items-center gap-1">
                <KeyRound size={11} className="chat-ink" style={{ "--ink": BLUE }} aria-hidden="true" />{P.byGrant}
              </span>
            )}
            {access.denied.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Ban size={11} className="chat-ink" style={{ "--ink": RED }} aria-hidden="true" />{P.closed}
              </span>
            )}
          </div>
        )}
      </Section>
      {(actions.length > 0 || access.tabs.length > 0) && (
        <Section title={P.grants} count={actions.length || null}>
          <div className="space-y-2">
            {actions.length > 0 && (
              <ul className="space-y-1">
                {actions.map(([k, scope]) => (
                  <li key={k} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--text-1)" }}>
                    <KeyRound size={12} className="chat-ink flex-shrink-0 mt-[2px]" style={{ "--ink": BLUE }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">{W.capName(k)}</span>
                    {W.scopeOf(k, scope) && (
                      <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>{W.scopeOf(k, scope)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {access.tabs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] mr-0.5" style={{ color: "var(--text-3)" }}>{P.adminPages}:</span>
                {access.tabs.map((id) => <Tag key={id} tone="grant" icon={ShieldCheck}>{W.tabName(id)}</Tag>)}
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/** What ONE login holds beyond (or short of) its position. */
function LoginDiff({ base, own, W, P }) {
  const had = new Map(base.pages.map((r) => [r.page, r]));
  const has = new Map(own.pages.map((r) => [r.page, r]));
  const plus = own.pages.filter((r) => !had.has(r.page) || had.get(r.page).grant !== r.grant);
  const minus = base.pages.filter((r) => !has.has(r.page));
  const baseCaps = base.caps || {};
  const caps = W.actionCaps(own.caps).filter(([k, s]) => baseCaps[k] !== s);
  if (!plus.length && !minus.length && !caps.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {plus.map(W.pageTag)}
      {minus.map((r) => <Tag key={`x${r.page}`} tone="deny" icon={Ban} title={P.closed} strike>{W.pageName(r.page)}</Tag>)}
      {caps.map(([k, s]) => (
        <Tag key={k} tone="grant" icon={KeyRound}>{W.capName(k)}{W.scopeOf(k, s) ? ` · ${W.scopeOf(k, s)}` : ""}</Tag>
      ))}
    </div>
  );
}

function PersonBody({ node, data, tree, P, onSelect }) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const { tl } = useTranslit();
  const canPeople = useCanOpenPeople();
  const W = useAccessWords(data, P);
  const p = node.profile;

  const cardTo = p.employee_id
    ? `/people/${encodeURIComponent(p.employee_id)}`
    : PLANT_ROLES.has(p.role) ? `/people?${new URLSearchParams({ find: p.name }).toString()}` : null;

  // Where they stand: a brigadir's plant and shift are their unit's own, a
  // leader's their brigadir's.
  const unitNode = p.role === "leader" && p.unit_id != null ? tree.index.get(`supervisor:${p.unit_id}`) : null;
  const unit = p.role === "supervisor" ? p : unitNode?.profile;
  const plant = unit ? (data.factories || []).find((f) => f.id === unit.factory_id) : null;
  const reachesAll = p.role === "top-manager" || p.role === "shift-manager";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {canPeople && cardTo && (
          <Button variant="primary" size="md" icon={<IdCard size={14} />} onClick={() => navigate(cardTo)}>
            {P.openCard}
          </Button>
        )}
        <Button variant="secondary" size="md" icon={<UserRound size={14} />} onClick={() => navigate(`/profile/${p.role}/${p.id}`)}>
          {P.openProfile}
        </Button>
        {p.role !== "admin" && (
          <Button variant="secondary" size="md" icon={<KeyRound size={14} />} onClick={() => navigate(adminPage("permissions"))}>
            {P.openPerms}
          </Button>
        )}
      </div>

      {(unit || reachesAll || p.cells?.length > 0) && (
        <div className="space-y-1.5">
          {reachesAll && <Fact label={P.plant}>{P.allUnits}</Fact>}
          {unit && (
            <>
              <Fact label={P.plant}>{plant ? (factoryName(plant, lang) || plant.code) : P.noPlant}</Fact>
              <Fact label={P.shift}>{unit.shift ? fill(P.shiftN, { n: unit.shift }) : P.shiftNone}</Fact>
            </>
          )}
          {unitNode && (
            <Fact label={P.unit}>
              <button type="button" className="cell-link text-left" onClick={() => onSelect(unitNode.id)}>
                {tl(unitNode.profile.name)}
              </button>
            </Fact>
          )}
          {p.kind === "acting" && <Fact label="">{P.acting}</Fact>}
          {p.cells?.length > 0 && (
            <Fact label={P.cells}>
              <span className="flex flex-wrap gap-x-2.5 gap-y-1">
                {p.cells.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 tabular-nums">
                    <CellLink id={c.id}>{c.code}</CellLink>
                    <GroupBadge group={c.group} />
                  </span>
                ))}
              </span>
            </Fact>
          )}
        </div>
      )}

      <Section title={P.logins} count={p.accounts.length || null}>
        {p.accounts.length === 0 && <Muted>{P.loginsNone}</Muted>}
        <ul className="space-y-2">
          {p.accounts.map((a) => (
            <li key={a.telegram_id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <Send size={12} className="flex-shrink-0" style={{ color: "var(--text-3)" }} aria-hidden="true" />
                <button
                  type="button" className="cell-link text-left min-w-0 truncate font-medium"
                  style={{ color: "var(--text-1)" }}
                  onClick={() => navigate(`/tg-user/${a.telegram_id}`)}
                >
                  {a.name || `#${a.telegram_id}`}
                </button>
                {a.username && <span className="truncate" style={{ color: "var(--text-3)" }}>@{a.username}</span>}
                {a.access && <Tag tone="grant" icon={KeyRound}>{P.own}</Tag>}
              </div>
              <div className="pl-[18px] text-[11px]" style={{ color: "var(--text-3)" }}>
                {a.last_seen ? fill(P.seen, { d: fmtDate(a.last_seen) }) : P.never}
              </div>
              {a.access && <div className="pl-[18px]"><LoginDiff base={p.access} own={a.access} W={W} P={P} /></div>}
            </li>
          ))}
          {p.web && (
            <li className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
              <Globe size={12} className="flex-shrink-0" style={{ color: "var(--text-3)" }} aria-hidden="true" />
              {P.web}
            </li>
          )}
        </ul>
      </Section>

      <AccessBlock access={p.access} W={W} P={P} />
    </div>
  );
}

function StructureBody({ node, data, P }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const W = useAccessWords(data, P);
  const roles = (data.roles || []).filter((r) => node.roles[r]);

  if (node.kind === "group") {
    const pages = data.role_pages?.[node.role];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="md" icon={<ShieldCheck size={14} />} onClick={() => navigate(adminPage("access"))}>
            {P.openAccess}
          </Button>
          <Button variant="secondary" size="md" icon={<KeyRound size={14} />} onClick={() => navigate(adminPage("permissions"))}>
            {P.openPerms}
          </Button>
        </div>
        <Section title={P.rolePages} count={pages?.length ?? null}>
          {node.role === "admin" ? <Muted>{P.pagesAdmin}</Muted>
            : !pages?.length ? <Muted>{P.pagesNone}</Muted>
            : <div className="flex flex-wrap gap-1">{pages.map((p) => <Tag key={p}>{W.pageName(p)}</Tag>)}</div>}
          {node.role !== "admin" && <div className="mt-2"><Muted>{P.roleNote}</Muted></div>}
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(node.kind === "factory" || node.kind === "root") && (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="md" icon={<Building2 size={14} />} onClick={() => navigate(adminPage("factories"))}>
            {P.openFactories}
          </Button>
          {node.kind === "root" && (
            <Button variant="secondary" size="md" icon={<ShieldCheck size={14} />} onClick={() => navigate(adminPage("access"))}>
              {P.openAccess}
            </Button>
          )}
        </div>
      )}
      <Section title={P.inside}>
        <div className="space-y-1.5">
          {roles.map((r) => {
            const Icon = ROLE_ICON[r] ?? UserRound;
            return (
              <div key={r} className="flex items-center gap-2 text-xs">
                <Icon size={13} className="chat-ink flex-shrink-0" style={{ "--ink": roleHue(r) }} aria-hidden="true" />
                <span className="flex-1" style={{ color: "var(--text-2)" }}>{t(ROLE_LABEL_KEYS[r])}</span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{node.roles[r]}</span>
              </div>
            );
          })}
          {node.cells > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-[13px]" />
              <span className="flex-1" style={{ color: "var(--text-2)" }}>{P.cells}</span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{node.cells}</span>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

/** The node's avatar or glyph, at the details header's size. */
export function NodeLead({ node, title, size = 44 }) {
  if (node.kind === "person") {
    const p = node.profile;
    return <ProfileAvatar name={title} colorKey={p.name} profileKey={p.key} photoVer={p.photo_ver} size={size} />;
  }
  if (node.kind === "root") return <BrandLogo className="rounded-xl flex-shrink-0" style={{ width: size, height: size }} />;
  const Icon = node.kind === "group" ? (ROLE_ICON[node.role] ?? UserRound) : node.kind === "factory" ? Factory : Clock3;
  const hue = node.kind === "group" ? roleHue(node.role) : null;
  return (
    <span
      className="chat-ink grid place-items-center rounded-xl flex-shrink-0"
      style={{ width: size, height: size, ...(hue
        ? { "--ink": hue, background: `${hue}1f` }
        : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }) }}
    >
      <Icon size={Math.round(size * 0.45)} aria-hidden="true" />
    </span>
  );
}

export default function OrgDetails({ node, data, tree, P, onSelect, onClose, bare = false }) {
  const text = useNodeText(P);
  const { title, sub } = text(node, tree.root);
  const body = node.kind === "person"
    ? <PersonBody node={node} data={data} tree={tree} P={P} onSelect={onSelect} />
    : <StructureBody node={node} data={data} P={P} />;
  if (bare) return body;
  return (
    <>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <NodeLead node={node} title={title} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-1)" }}>{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
            {node.kind === "person" && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: roleHue(node.role) }} />
            )}
            <span className="min-w-0 break-words">{sub}</span>
          </div>
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
