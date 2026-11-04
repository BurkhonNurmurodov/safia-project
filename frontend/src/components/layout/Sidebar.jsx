import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
// Inlined base64 logo (one per theme) baked into the JS bundle — no network
// fetch, so it can never get stuck on a poisoned cache entry for the stable
// /logo.png URL. See assets/logoChrome.js for the full rationale.
import BrandLogo from "../ui/BrandLogo";
import { useQuery } from "@tanstack/react-query";
import {
  X, PanelLeftClose, PanelLeftOpen, Headset, ChevronDown,
} from "lucide-react";
import api from "../../utils/api";
import VersionBadge from "./VersionBadge";
import AppUpdateButton from "./AppUpdateButton";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { ALL_LINKS, NAV_GROUPS, APPS, ADMIN_PAGE_LINKS, adminPath } from "../../config/navLinks";
import { linksOfApp, openApp, rememberPage } from "../../utils/apps";
import { useLauncher } from "../../hooks/useLauncher";
import GlobalSearch from "./GlobalSearch";

// Grouped sidebar. ALL_LINKS (config/navLinks.js) stays THE register and
// order — `group` points each link at a section of NAV_GROUPS (same file).
// Sections only materialize when the viewer's visible link count passes GROUP_THRESHOLD (admins / top-managers);
// short lists keep today's flat sidebar untouched. A link with an unknown
// group id lands in the trailing headerless "system" bucket, so a typo shows
// up as an ungrouped link — visible, never silently dropped.
// Sections behave as an ACCORDION: exactly one is open — the one holding the
// current page — and every other one is closed. Nothing is remembered across
// navigations (a stale open section is just noise around the page you are
// actually on); a header click opens another section for as long as you stay
// on this page. Headerless sections (no labelKey) never collapse.
// Each labeled section carries its own icon — deliberately distinct from every
// page icon inside it — and that icon is all that remains of the header on the
// collapsed icon rail, where it still toggles its section.

const GROUP_THRESHOLD = 10;

// Layout (and this sidebar) remounts on every route change, which would reset
// the nav list's scroll to the top. Keep the last offset at module level and
// restore it on mount so the list stays where the user left it.
let savedNavScroll = 0;

export default function Sidebar({ open, onClose, pinned, onTogglePin }) {
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const { auth } = useAuth();
  const { t }    = useLang();
  const { access } = usePageAccess();
  // Personal capability grants unlock nav entries too — a granted approver
  // needs the /staff link to reach the queue they were given.
  const { capPages, capTabs, deniedPages } = useCapabilities();
  const isAdmin  = auth?.role === "admin";

  const BADGE_ROLES = ["admin", "shift-manager"];
  const showBadge = BADGE_ROLES.includes(auth?.role);

  const { data: pendingData } = useQuery({
    queryKey: ["staff-documents-pending-count"],
    queryFn: () => api.get("/api/staff/documents/pending-count").then(r => r.data),
    enabled: showBadge,
    refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.count ?? 0;

  // One map, so a link carries a badge by BEING in it — the old code tested
  // `to === "/staff"` in three places, which is why a second badge could not
  // exist without a fourth: a new badge is one line here and nothing anywhere
  // else — the row, the rail dot and the group header all read the map. (The
  // /staff badge counts both registers: the file days' documents and, from
  // `live_day.LIVE_FROM`, the live days'. The /idle-cell
  // badge lived here until 2026-08-22; a leader's ojidaniya now counts on
  // save, so there is no queue left to count.)
  const BADGES = {
    "/staff": showBadge ? pendingCount : 0,
  };
  const badgeFor = (to) => BADGES[to] || 0;

  const withSearch = (path) => `${path}${location.search}`;

  // «Ilovalar» (admins 2026-11-02, top-managers 2026-11-04): inside an app the
  // sidebar lists that app's pages — the ones this viewer may open — and
  // nothing else; the launcher at «/» is the way to the others. A page no app
  // lists keeps the app it was opened from (utils/apps.js); with none yet, or
  // an app holding nothing this viewer may open, the whole register shows,
  // grouped as before.
  const { on: launcher, may } = useLauncher();
  const appId = launcher ? openApp(location.pathname) : null;
  const appLinks = appId ? linksOfApp(appId, may) : [];
  const app = appLinks.length ? APPS.find(a => a.id === appId) : null;
  useEffect(() => { if (launcher) rememberPage(location.pathname); }, [launcher, location.pathname]);
  // The admin app's pages this viewer may open — every one for an admin, the
  // pages their grants name for anybody else (a grantee has no launcher, so
  // these rows ARE their way in; the footer's single «Admin» row is gone).
  const adminRows = ADMIN_PAGE_LINKS.filter(l => isAdmin || capTabs.includes(l.capKey ?? l.tab));
  const links = app
    ? appLinks
    : [
      ...ALL_LINKS
        .filter(l => (l.adminOnly ? isAdmin : canAccessPage(auth?.role, l.page, access, capPages, deniedPages)))
        // A launcher's «/» is the launcher, so its overview answers at /overview.
        .map(l => (launcher ? { ...l, to: adminPath(l.to) } : l)),
      ...adminRows,
    ];

  // Grouped mode only past the threshold — grouping helps a 20-row register,
  // it would just add chrome to a supervisor's 6 links. An app that names
  // `sections` (the admin app's four) is always grouped by them instead.
  const sections = app?.sections ?? null;
  const groupDefs = sections ?? NAV_GROUPS;
  const groupOf = (l) => (sections ? l.section : l.group);
  const fallbackGroup = sections ? sections[0].id : "system";
  const grouped = sections ? true : !app && links.length > GROUP_THRESHOLD;
  const byGroup = new Map(groupDefs.map(g => [g.id, []]));
  links.forEach(l => (byGroup.get(groupOf(l)) ?? byGroup.get(fallbackGroup)).push(l));

  // Segment-safe, exactly like NavLink's own matching: /zagruzka-cell is NOT
  // inside /zagruzka, so it can't light up (or open) the wrong section.
  const isLinkActive = (to) =>
    to === "/"
      ? location.pathname === "/"
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  // The section holding the current page. Longest match wins, so a nested
  // route resolves to its own link rather than to the parent it sits under.
  const activeHit = links
    .filter(l => isLinkActive(l.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const activeGroup = activeHit ? groupOf(activeHit) : undefined;

  // Accordion: the active section is open, everything else closed. Navigation
  // re-derives it (the effect re-fires only when the active section changes),
  // so a section the user opened by hand lives exactly as long as this page.
  const [openGroup, setOpenGroup] = useState(activeGroup);
  useEffect(() => { setOpenGroup(activeGroup); }, [activeGroup]);
  const toggleGroup = (id) => setOpenGroup(cur => (cur === id ? null : id));

  // Sidebar is expanded when: mobile drawer open, pinned, or hovered on desktop
  const expanded = open || pinned || hovered;

  // Sliding active-page indicator — measure the active NavLink and move one
  // shared pill to it (glides between items instead of the highlight cutting).
  const navRef = useRef(null);

  // Restore the pre-navigation scroll offset once the links have rendered.
  // links.length is a dep because page access can resolve after mount — the
  // list grows and the earlier restore would have been clamped to 0. Once the
  // user scrolls, onScroll keeps savedNavScroll current, so re-running this is
  // a no-op.
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = savedNavScroll;
  }, [links.length]);

  const [ind, setInd] = useState({ top: 0, height: 0, show: false, anim: false });
  const measureInd = useCallback(() => {
    const el = navRef.current?.querySelector('[aria-current="page"]');
    // A link inside a collapsed group has no on-screen position — hide the
    // pill instead of parking it on a 0-height row.
    if (!el || el.closest('[data-collapsed="true"]')) {
      setInd(p => (p.show ? { ...p, show: false } : p));
      return;
    }
    // anim: only glide when the pill was already showing (i.e. moving between
    // items). On first appearance it snaps into place with no slide.
    setInd(p => ({ top: el.offsetTop, height: el.offsetHeight, show: true, anim: p.show }));
  }, []);
  useLayoutEffect(measureInd, [measureInd, location.pathname, expanded, links.length, openGroup]);
  // Links below a toggled group only reach their final offset once the .2s
  // grid collapse finishes — re-measure after it settles.
  useEffect(() => {
    const id = setTimeout(measureInd, 230);
    return () => clearTimeout(id);
  }, [openGroup, measureInd]);

  // One renderer for both modes (flat / grouped). Rows are slightly denser on
  // desktop (md:py-2); the phone drawer keeps the full touch height.
  // `indent` steps a row under its folder header while expanded — as a margin
  // on the icon, not row padding, so the full-width active pill and hover wash
  // stay flush; on the icon rail it drops to 0 to keep icons centered.
  const renderLink = ({ to, key, icon: Icon, danger }, indent = false) => {
    const badgeCount = badgeFor(to);
    const badge = badgeCount > 0;
    return (
      <NavLink
        key={to}
        to={withSearch(to)}
        end={to === "/"}
        onClick={onClose}
        title={!expanded ? t(key) : undefined}
        className="nav-item flex items-center rounded-lg text-sm transition-colors px-2.5 py-2.5 md:py-2"
        style={({ isActive }) => ({
          gap: "12px",
          position: "relative",
          zIndex: 1,
          // Background now comes from the sliding indicator behind it;
          // the link only carries the active text color + weight.
          ...(isActive
            ? { color: "var(--brand-text)", fontWeight: 500 }
            : { color: "var(--text-3)" }),
          justifyContent: !expanded ? "center" : undefined,
        })}
      >
        {/* Icon + dot badge when collapsed */}
        <div
          className="relative flex-shrink-0 transition-all duration-200"
          style={{ marginLeft: indent && expanded ? 16 : 0 }}
        >
          {/* A page that can destroy data keeps a red icon (the admin app's
              «Xavfli» section), the same mark its folder carries. */}
          <Icon size={16} style={danger ? { color: "#ef4444" } : undefined} />
          {badge && !expanded && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>

        <span
          className="truncate whitespace-nowrap transition-all duration-200 flex-1"
          style={{
            opacity:  expanded ? 1 : 0,
            maxWidth: expanded ? 200 : 0,
            overflow: "hidden",
            display:  "block",
          }}
        >
          {t(key)}
        </span>

        {/* Count badge when expanded */}
        {badge && expanded && (
          <span className="ml-auto flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "#ef4444", color: "#fff", minWidth: 18, textAlign: "center" }}>
            {badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:  "var(--bg-card)",
          borderRight: "1px solid var(--border)",
          boxShadow:   (hovered && !pinned) ? "4px 0 24px rgba(0,0,0,0.25)" : "none",
        }}
        className={`
          fixed inset-y-0 left-0 flex flex-col flex-shrink-0
          transition-all duration-200 ease-in-out
          z-40
          w-64
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          ${expanded ? "md:w-64" : "md:w-[60px]"}
          ${!pinned && hovered ? "md:z-50" : pinned ? "md:z-20" : "md:z-20"}
        `}
      >
        {/* Header */}
        <div
          className="flex items-center flex-shrink-0 px-3 gap-2 overflow-hidden"
          style={{
            borderBottom: "1px solid var(--border)",
            minHeight: 60,
            paddingTop: "calc(var(--tg-safe-top, 0px) + 0.75rem)",
            paddingBottom: "0.75rem",
          }}
        >
          {/* Collapsed: logo icon (desktop only, not expanded) — home link */}
          {!expanded && (
            <Link
              to={withSearch("/")}
              onClick={onClose}
              title={t("nav.overview")}
              className="hidden md:flex w-full items-center justify-center transition-opacity hover:opacity-80"
            >
              <BrandLogo className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            </Link>
          )}

          {/* Expanded: logo + brand text (home link) + pin button */}
          {expanded && (
            <>
              <Link
                to={withSearch("/")}
                onClick={onClose}
                className="flex items-center gap-2 flex-1 min-w-0 rounded-lg transition-opacity hover:opacity-80"
              >
                <BrandLogo className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                <div className="min-w-0 overflow-hidden">
                  <div
                    className="text-xs font-semibold uppercase tracking-widest mb-0.5 whitespace-nowrap"
                    style={{ color: "var(--brand-text)" }}
                  >
                    Safia IMS
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: "var(--text-3)" }}
                    title={t("nav.appSubtitle")}
                  >
                    {t("nav.appSubtitle")}
                  </div>
                </div>
              </Link>

              {/* Desktop: pin toggle button */}
              <button
                onClick={onTogglePin}
                className="hidden md:flex p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-[var(--hover-bg)]"
                style={{ color: pinned ? "var(--brand-text)" : "var(--text-3)" }}
                title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              >
                {pinned ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>

              {/* Mobile: close button */}
              <button
                onClick={onClose}
                className="md:hidden p-1 rounded flex-shrink-0"
                style={{ color: "var(--text-3)" }}
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        {/* «Qidiruv» on a phone: the header there is the title, the bell and
            the avatar, so the search lives at the top of this drawer. Mounted
            only while the drawer is open — never a second, hidden copy beside
            the header's (md and up). */}
        {open && (
          <div className="md:hidden flex-shrink-0 px-3 pt-3">
            <GlobalSearch drawer onPick={onClose} />
          </div>
        )}

        {/* Nav */}
        <nav
          ref={navRef}
          onScroll={(e) => { savedNavScroll = e.currentTarget.scrollTop; }}
          className="relative flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden"
        >
          {/* The open app's name over its pages — same anatomy as a folder row,
              not a button. A one-page app skips it: the row below says it. */}
          {app && links.length > 1 && (
            <div
              className="app-label flex items-center rounded-lg text-[11px] font-semibold uppercase tracking-wider px-2.5 py-2.5 md:py-2"
              data-app-hue={app.hue}
              style={{ gap: "12px", color: "var(--text-3)", justifyContent: !expanded ? "center" : undefined }}
            >
              <app.icon size={16} className="flex-shrink-0" aria-hidden="true" />
              <span
                className="flex-1 min-w-0 truncate whitespace-nowrap leading-5 transition-all duration-200"
                style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden" }}
              >
                {t(app.labelKey)}
              </span>
            </div>
          )}
          {(grouped ? [] : links).map(l => renderLink(l))}

          {grouped && groupDefs.map((g) => {
            const items = byGroup.get(g.id);
            if (!items.length) return null;
            const collapsed = Boolean(g.labelKey) && openGroup !== g.id;
            const activeInside = items.some(l => isLinkActive(l.to));
            // Pending Verifix work (/staff) must stay visible
            // with «Люди» collapsed — the counts bubble up onto the group header.
            const groupBadge = collapsed
              ? items.reduce((n, l) => n + badgeFor(l.to), 0) : 0;
            const GroupIcon = g.icon;

            return (
              <div key={g.id}>
                {/* Folder row — same anatomy and height as a page link (leading
                    16px icon + 20px content line, same paddings), so both row
                    kinds share one vertical rhythm and one icon column. On the
                    icon rail it shrinks to its icon and stays clickable, so
                    every section remains reachable there. */}
                {g.labelKey && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={!collapsed}
                    aria-controls={`nav-grp-${g.id}`}
                    title={!expanded ? t(g.labelKey) : undefined}
                    className="nav-item w-full flex items-center rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors px-2.5 py-2.5 md:py-2"
                    style={{
                      gap: "12px",
                      marginTop: 8,
                      color: collapsed && activeInside ? "var(--brand-text)" : g.danger ? "#ef4444" : "var(--text-3)",
                      justifyContent: !expanded ? "center" : undefined,
                    }}
                  >
                    <span className="relative flex-shrink-0">
                      {GroupIcon && <GroupIcon size={16} />}
                      {/* Closed on the rail while /staff carries
                          pending work — keep the dot rather than hiding the queue. */}
                      {groupBadge > 0 && !expanded && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </span>
                    <span
                      className="flex-1 min-w-0 truncate whitespace-nowrap text-left leading-5 transition-all duration-200"
                      style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden" }}
                    >
                      {t(g.labelKey)}
                    </span>
                    {expanded && (
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {collapsed && activeInside && (
                          <span className="w-1.5 h-1.5 rounded-full"
                            style={{ background: "var(--brand)" }} />
                        )}
                        {groupBadge > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "#ef4444", color: "#fff", minWidth: 18, textAlign: "center" }}>
                            {groupBadge}
                          </span>
                        )}
                        <ChevronDown
                          size={14}
                          className="nav-grp-chev"
                          style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}
                        />
                      </span>
                    )}
                  </button>
                )}
                {/* Headerless section (Активность / catch-all): a thin divider
                    is its only landmark, at either width. */}
                {!g.labelKey && g.id !== "top" && (
                  <div className="mx-2 my-2" style={{ borderTop: "1px solid var(--border)" }} />
                )}
                {/* The rail collapses with the sidebar: same open section, same
                    hidden ones, so hovering it open never reshuffles the list. */}
                <div
                  id={`nav-grp-${g.id}`}
                  className="nav-grp-items"
                  data-collapsed={collapsed ? "true" : "false"}
                  style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
                >
                  {/* Only rows under a visible folder header indent — the
                      headerless Обзор / Активность sections stay flush. */}
                  <div className="space-y-0.5">
                    {items.map(l => renderLink(l, Boolean(g.labelKey)))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active-page indicator — one gold pill that glides between items.
              Rendered last so the first link stays the flow's first child;
              marginTop:0 cancels the space-y gap on this absolute element. */}
          <div
            aria-hidden
            className="sidebar-ind absolute left-2 right-2 rounded-lg pointer-events-none"
            style={{
              top: 0,
              height: ind.height,
              transform: `translateY(${ind.top}px)`,
              opacity: ind.show ? 1 : 0,
              marginTop: 0,
              background: "var(--brand-bg)",
              zIndex: 0,
              ...(ind.anim ? null : { transition: "none" }),
            }}
          />
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 space-y-1 overflow-hidden"
          style={{ borderTop: "1px solid var(--border)", paddingBottom: "calc(0.75rem + var(--tg-safe-bottom, 0px))" }}>
          {/* The admin app's pages are rows of the register above (an admin
              opens the app from its launcher tile; a grantee sees the pages
              their grants open, under «Admin»). */}

          {!isAdmin && (
            <a
              href="https://t.me/burkhon_n"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                const tg = window?.Telegram?.WebApp;
                const url = "https://t.me/burkhon_n";
                if (tg?.openTelegramLink || tg?.openLink) {
                  e.preventDefault();
                  try {
                    if (tg.platform === "macos") {
                      tg.openLink(url);
                    } else if (tg.openTelegramLink) {
                      tg.openTelegramLink(url);
                    } else {
                      tg.openLink(url);
                    }
                  } catch (err) {
                    window.open(url, "_blank");
                  }
                }
                // Delay onClose to prevent unmounting the <a> before the browser can process target="_blank"
                setTimeout(() => onClose?.(), 150);
              }}
              title={!expanded ? t("nav.support") : undefined}
              className="nav-item flex items-center rounded-lg text-sm transition-colors"
              style={{
                gap: "12px",
                padding: "10px",
                color: "var(--text-3)",
                justifyContent: !expanded ? "center" : undefined,
              }}
            >
              <Headset size={16} className="flex-shrink-0" />
              <span
                className="truncate whitespace-nowrap transition-all duration-200"
                style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden", display: "block" }}
              >
                {t("nav.support")}
              </span>
            </a>
          )}

          {/* The Android app's own update (check · download progress ·
              install), right above «Versiya» — renders nothing outside the app. */}
          <AppUpdateButton expanded={expanded} />

          {/* Which build this is — the last thing on the rail. The
              data-freshness line that used to sit above it is gone. */}
          <VersionBadge expanded={expanded} />
        </div>
      </aside>
    </>
  );
}
