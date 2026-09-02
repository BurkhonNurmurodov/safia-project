import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";

const APP_NAME = "Safia Dashboard";
const SEP = " · "; // U+00B7 — the same separator the nav labels already use

// App language → the BCP-47 tag <html lang> takes. The document ships as
// lang="en" (index.html has to declare something before the bundle runs) while
// the UI is almost always Uzbek or Russian, and that mismatch is exactly what
// makes a browser offer to translate the page — a translation rewrites text
// nodes in place, desynchronises React's DOM and kills the page on the next
// commit. `translate="no"` refuses the offer; this removes the reason for it.
const HTML_LANG = { uz: "uz", uz_cyrl: "uz-Cyrl", ru: "ru", en: "en" };

// Route → the i18n key that NAMES it. Deliberately the very keys the sidebar
// renders, so renaming a page (or translating it) renames the browser tab too
// and the two can never drift. Routes the sidebar does not list name themselves
// from the key their own page already shows as its heading.
//
// Lookup is exact first, then by first path segment — that is what covers
// "/brigadir/:id" and every "/admin/*" destination with one entry each.
const TITLE_KEYS = {
  "/":                 "nav.overview",
  "/zagruzka":         "nav.zagruzka",
  "/leaderboard":      "nav.leaderboard",
  "/gamification":     "nav.gamification",
  "/workers":          "nav.workers",
  "/plan":             "nav.planFulfillment",
  "/downtime":         "nav.idleTime",
  "/staff":            "nav.staff",
  "/daily":            "nav.daily",
  "/production":       "nav.production",
  "/trudoyomkost":     "nav.trudoyomkost",
  "/leaders":          "nav.leaders",
  "/cells":            "nav.cells",
  "/kaizen":           "nav.kaizen",
  "/quality":          "nav.quality",
  "/concerns":         "nav.concerns",
  "/tasks":            "nav.tasks",
  "/activity":         "nav.activity",
  "/setup-times":      "nav.setupTimes",
  "/idle-cell":        "nav.idleCell",
  "/zagruzka-cell":    "nav.zagruzkaCell",
  "/arc":              "nav.arc",
  "/login":            "login.title",
  "/broadcast-receivers": "admin.tabBroadcast",
  // Segment roots — "/brigadir/12", "/admin/upload" and friends land here.
  // The admin panel deliberately stops at "Admin": its destination list lives
  // in ADMIN_NAV and must stay the single source of truth, and importing it
  // here would pull the lazy admin bundle into the initial chunk.
  "/brigadir":         "profile.title",
  "/admin":            "nav.admin",
};

function keyForPath(pathname) {
  if (TITLE_KEYS[pathname]) return TITLE_KEYS[pathname];
  return TITLE_KEYS[`/${pathname.split("/")[1]}`] || null;
}

// Keeps <title> in step with the route and the language. Mounted once inside
// the router; renders nothing.
export default function DocumentTitle() {
  const { pathname } = useLocation();
  const { t, lang } = useLang();
  const { auth, loading } = useAuth();

  // The browser password screen renders in place of whatever route is in the
  // address bar, so naming that route would label the tab with a page the
  // visitor cannot see yet.
  const gated = loading || auth?.status === "web_login";

  useEffect(() => {
    const key = gated ? null : keyForPath(pathname);
    // t() echoes an unknown key back — never put that in the tab.
    const page = key ? t(key) : "";
    document.title = page && page !== key ? APP_NAME + SEP + page : APP_NAME;
    document.documentElement.lang = HTML_LANG[lang] || "uz";
    // `t` re-identifies when the language changes AND when the DB translation
    // overrides land, so both reach the tab without a navigation.
  }, [pathname, t, lang, gated]);

  return null;
}
