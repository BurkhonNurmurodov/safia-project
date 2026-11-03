import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../components/layout/Layout";
import { useLang } from "../context/LangContext";
import { APPS } from "../config/navLinks";
import { appEntry } from "../utils/apps";
import api from "../utils/api";

/**
 * «Ilovalar» — what «/» shows an admin (2026-11-02, admins only for now): one
 * tile per app, the way Odoo opens. A tile opens the page its app was left on
 * (utils/apps.js), and the sidebar inside then lists that app's pages only.
 *
 * Deliberately light: no chart, no table, one request — the /staff queue count
 * the sidebar already polls under the same key, so the People tile carries the
 * same red count the sidebar's row does. The overview's eight requests and its
 * chart library now load only when the Overview tile is opened.
 *
 * The look (2026-11-03, the operator's pick): a glass tile on a coloured cloud
 * by day, a dark glass tile with a neon glyph and glow by night, over the
 * Safia site's warm cream with drifting gold light and gold dust. Every moving
 * part is CSS (index.css, «Ilovalar»), slow on purpose, and still under
 * prefers-reduced-motion.
 */

// Gold dust: where each mote starts (% of the backdrop), its size (px), how
// long one rise takes (s) and where in that rise it begins. Fixed rather than
// random, so the screen looks the same every time it opens.
const MOTES = [
  [8, 78, 3, 19, 0], [17, 34, 2, 23, 6], [26, 88, 4, 21, 11], [34, 52, 2, 26, 3],
  [43, 18, 3, 24, 15], [51, 72, 2, 20, 8], [59, 40, 4, 25, 1], [67, 90, 2, 22, 13],
  [74, 24, 3, 27, 5], [82, 64, 2, 21, 17], [90, 38, 3, 24, 9], [95, 84, 2, 23, 4],
  [13, 12, 2, 28, 19], [87, 10, 3, 26, 12],
];

function LauncherBackdrop() {
  return (
    <div className="apps-backdrop" aria-hidden="true">
      <span className="apps-light apps-light--a" />
      <span className="apps-light apps-light--b" />
      <span className="apps-light apps-light--c" />
      {MOTES.map(([x, y, s, d, at], i) => (
        <i
          key={i}
          className="apps-mote"
          style={{ left: `${x}%`, top: `${y}%`, width: s, height: s,
                   animationDuration: `${d}s`, animationDelay: `-${at}s` }}
        />
      ))}
    </div>
  );
}

export default function AppLauncher() {
  const { t } = useLang();

  const { data: pending } = useQuery({
    queryKey: ["staff-documents-pending-count"],
    queryFn: () => api.get("/api/staff/documents/pending-count").then((r) => r.data),
    refetchInterval: 30_000,
  });
  const badges = { people: pending?.count ?? 0 };

  return (
    <Layout title={t("apps.title")} bare backdrop={<LauncherBackdrop />}>
      <nav aria-label={t("apps.title")} className="apps-wrap">
        <ul className="apps-grid">
          {APPS.map(({ id, labelKey, icon: Icon, hue }, i) => {
            const name = t(labelKey);
            const count = badges[id] || 0;
            return (
              <li key={id} style={{ "--i": i }}>
                <Link
                  to={appEntry(id)}
                  className="app-tile"
                  data-app-hue={hue}
                  aria-label={count > 0 ? `${name} (${count})` : undefined}
                >
                  <span className="app-icon">
                    <span className="app-aura" aria-hidden="true" />
                    <span className="app-glass">
                      <span className="app-sheen" aria-hidden="true" />
                      <Icon strokeWidth={1.75} aria-hidden="true" />
                      {count > 0 && <span className="app-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
                    </span>
                  </span>
                  <span className="app-name">{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Layout>
  );
}
