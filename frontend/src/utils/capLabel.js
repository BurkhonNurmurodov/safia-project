// THE name of a capability, wherever one is printed (the Permissions tab, its
// copy dialog, the org chart). Hand-listed actions carry caps.<key>.label /
// .hint strings; the three GENERATED families (backend capabilities.py) are
// named from what they open, so a new page or admin page is labelled the day
// it ships with no new translation keys:
//   page.view.<page>   → the page's nav label
//   admin.tab.<id>     → the admin page's label (hint: its ADMIN_NAV description)
//   page.admin.<page>  → «<page> — admin»
import { PAGES } from "../config/pages";
import { ADMIN_NAV } from "../config/adminNav";

const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.key, p.labelKey]));
// Not a page key (its route opens per role), but its admin view is grantable.
PAGE_LABEL["idle-solutions"] = "nav.idleSolutions";
const TAB = Object.fromEntries(ADMIN_NAV.map((n) => [n.id, n]));

export const pageLabelKey = (page) => PAGE_LABEL[page] ?? `nav.${page}`;

export function capName(t, key) {
  if (key.startsWith("page.view.")) return t(pageLabelKey(key.slice(10)));
  if (key.startsWith("admin.tab.")) {
    const n = TAB[key.slice(10)];
    return n ? t(n.labelKey) : key;
  }
  if (key.startsWith("page.admin.")) {
    return t("admin.perms.pageAdminLabel").replace("{page}", t(pageLabelKey(key.slice(11))));
  }
  return t(`caps.${key}.label`);
}

export function capHint(t, key) {
  if (key.startsWith("admin.tab.")) {
    const n = TAB[key.slice(10)];
    return n?.descKey ? t(n.descKey) : "";
  }
  if (key.startsWith("page.admin.")) return t("admin.perms.pageAdminHint");
  return t(`caps.${key}.hint`);
}
