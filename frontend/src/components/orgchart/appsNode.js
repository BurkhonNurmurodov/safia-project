// «Tashkiliy tuzilma», the «Ilovalar» view — what a node of the launcher's
// tree is CALLED and what kind of screen a link is, shared by the canvas's
// cards, the details panel and the dialogs.
import { useCallback } from "react";
import { useLang } from "../../context/LangContext";
import { navName } from "../../utils/navLayout";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { fill } from "../../pages/admin/orgChartText";

// What KIND of thing a card is, as a colour (2026-11-15, the operator: «apps,
// menu tabs and screens should be visible different from one another in terms
// of colour»): the card's wash and border, and a menu tab's or a screen's
// glyph. An app's glyph keeps its own tile colour — that is the app. Blue,
// orange and teal: the three that stay apart for a colour-blind reader, and
// none is a status (red / yellow / green) or the brand gold a selected card
// wears. The two placeholders — «in no app», an app's «no menu tab» row — are
// neither, and stay uncoloured.
export const KIND_HUE = { app: CATEGORY_COLORS[2], tab: CATEGORY_COLORS[4], screen: CATEGORY_COLORS[6] };
export const kindHue = (node) => (
  node.kind === "app" ? (node.loose ? null : KIND_HUE.app)
    : node.kind === "tab" ? (node.tab.top ? null : KIND_HUE.tab)
      : node.kind === "screen" ? KIND_HUE.screen : null);

// A page-access key's capability — one entry per person opens or closes it.
export const pageCap = (key) => `page.view.${key}`;
export const profileTarget = (key) => `p:${key}`;
export const accountTarget = (tid) => `a:${tid}`;

/** The page-access keys a screen answers to (any one of them opens it). */
export const pageKeys = (link) => (link?.page == null ? [] : [].concat(link.page));

/**
 * How a screen's access is decided:
 *   "page"   — the Access matrix (role × page) and personal entries; changed here;
 *   "locked" — admins only, by the code (`adminOnly`, plus the roles it names);
 *   "admin"  — an admin-app page: admins, and whoever holds a capability naming it.
 */
export const screenKind = (link) => (link.tab ? "admin" : link.adminOnly || !pageKeys(link).length ? "locked" : "page");

/** Does this PROFILE (GET /admin/org-chart) open this screen — the sidebar's own rule. */
export function profileOpens(p, link) {
  if (p.access.all) return true;
  const kind = screenKind(link);
  if (kind === "admin") return p.access.tabs.includes(link.capKey ?? link.tab);
  if (kind === "locked") return Boolean(link.roles?.includes(p.role));
  const keys = pageKeys(link);
  return p.access.pages.some((r) => keys.includes(r.page));
}

/** What a card is called. `accessLine(link)` is the screen's one-line access answer. */
export function useAppNodeText(A, accessLine) {
  const { t, lang } = useLang();
  return useCallback((node) => {
    const screens = fill(A.nScreens, { n: node.people });
    if (node.kind === "root") return { title: A.platform, sub: `${fill(A.nApps, { n: node.appCount })} · ${screens}` };
    if (node.kind === "app") {
      if (node.loose) return { title: A.loose, sub: screens };
      const title = navName(node.app, t, lang);
      if (!node.people) return { title, sub: A.emptyApp };
      return { title, sub: node.tabs ? `${screens} · ${fill(A.nTabs, { n: node.tabs })}` : screens };
    }
    if (node.kind === "tab") {
      return { title: node.tab.top ? A.noTab : navName(node.tab, t, lang), sub: node.people ? screens : A.emptyTab };
    }
    return { title: t(node.link.key), sub: accessLine ? accessLine(node.link) : "" };
  }, [t, lang, A, accessLine]);
}
