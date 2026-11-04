import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../components/layout/Layout";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { appEntry } from "../utils/apps";
import { useLauncher } from "../hooks/useLauncher";
import api from "../utils/api";
import LauncherBackdrop from "../components/launcher/LauncherBackdrop";
import PageLoader from "../components/ui/PageLoader";

/**
 * «Ilovalar» — what «/» shows an admin (2026-11-02) and a top-manager
 * (2026-11-04): one tile per app, the way Odoo opens. A tile opens the page
 * its app was left on (utils/apps.js), and the sidebar inside then lists that
 * app's pages only. A top-manager is shown only the apps holding a page they
 * may open (hooks/useLauncher.js) — the grid is the same at any count.
 *
 * Deliberately light: no chart, no table, one request — the /staff queue count
 * the sidebar already polls under the same key, so the People tile carries the
 * same red count the sidebar's row does. The overview's eight requests and its
 * chart library now load only when the Overview tile is opened.
 *
 * The look (2026-11-03, the operator's second pick that day): Liquid Glass —
 * one clear tinted pane for both themes, the glyph in the app's hue — over a
 * warm golden backdrop with Safia's treats floating in it
 * (components/launcher/LauncherBackdrop.jsx). Every moving part is CSS
 * (index.css, «Ilovalar»), slow on purpose, and still under
 * prefers-reduced-motion.
 *
 * Above the tiles, «Xush kelibsiz, {name}!» (2026-11-03, the operator) — the
 * signed-in profile's name as the header prints it, the name set a shade
 * heavier. It is TYPED, ending as the last tile settles: each letter appears
 * at once on its own beat (`--d`), a caret standing after the newest one
 * (`--s` = how long until the next), blinking a few times after the last
 * before it goes; a screen reader is handed the whole sentence once.
 */

// A typist's beat — never metronomic: an uneven key rhythm, a breath after
// punctuation. Deterministic (by the letter's place), so a re-render never
// changes the rhythm. Only the SHAPE comes from here: the whole beat is
// stretched or squeezed so the last letter lands as the last tile settles.
const beat = (ch, i) => 55 + ((i * 37) % 31) + (/[,.!?:;]/.test(ch) ? 220 : 0);

// The tiles' arrival, as index.css spells it (`.apps-grid > li`: delay
// i × 55ms + 60ms, .9s) — keep the two in step. The typing ends as the LAST
// tile settles, so it follows how many tiles this viewer has.
const TILE_STEP = 55, TILE_DELAY = 60, TILE_IN = 900;
const TYPE_START = 120;
const typeEnd = (tiles) => Math.max(tiles - 1, 0) * TILE_STEP + TILE_DELAY + TILE_IN;

// The letters, in order, with the moment each is typed and how long it is the
// newest. Spaces take a beat but have no span of their own.
function typingPlan(text, end) {
  const plan = [];
  let t = 0;
  Array.from(text).forEach((ch, i) => {
    if (!/\s/.test(ch)) plan.push({ d: t });
    t += beat(ch, i);
  });
  const last = plan[plan.length - 1]?.d || 0;
  const k = last > 0 ? (end - TYPE_START) / last : 0;
  plan.forEach((p) => { p.d = Math.round(TYPE_START + p.d * k); });
  plan.forEach((p, i) => { p.s = (plan[i + 1]?.d ?? p.d) - p.d; });
  return plan;
}

// Words stay unbroken (`.apps-hello-word`), each letter its own span so it can
// be typed on its own beat. `n.i` walks the plan across the whole greeting.
function lettered(text, n) {
  return text.split(/(\s+)/).filter(Boolean).map((part, i) =>
    /^\s+$/.test(part) ? " " : (
      <span key={i} className="apps-hello-word">
        {Array.from(part).map((ch, j) => {
          const k = n.i++;
          const { d, s } = n.plan[k] || { d: 0, s: 0 };
          return (
            <span key={j} className={`apps-hello-ch${k === n.plan.length - 1 ? " is-last" : ""}`}
              style={{ "--d": `${d}ms`, "--s": `${s}ms` }}>{ch}</span>
          );
        })}
      </span>
    ));
}

export default function AppLauncher() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const { apps, may, loading } = useLauncher();
  const who = tl(auth?.full_name || "").trim();
  const [before, after = ""] = t("apps.hello").split("{name}");
  const plain = who ? `${before}${who}${after}` : `${before.replace(/[,\s]+$/, "")}${after}`;
  const n = { i: 0, plan: typingPlan(plain, typeEnd(apps.length)) };

  // The /staff queue — what waits on an ADMIN (the sidebar's own badge rule:
  // a top-manager approves nothing there, so their People tile carries none).
  const { data: pending } = useQuery({
    queryKey: ["staff-documents-pending-count"],
    queryFn: () => api.get("/api/staff/documents/pending-count").then((r) => r.data),
    enabled: auth?.role === "admin",
    refetchInterval: 30_000,
  });
  const badges = { people: pending?.count ?? 0 };

  // A top-manager's tiles wait for their page access (an admin's never do).
  // With no app at all — every page closed to them — the overview's own gate
  // answers: it sends them to the one page they may open, or says «no access».
  if (loading) return <PageLoader where="access" />;
  if (apps.length === 0) return <Navigate to="/overview" replace />;

  return (
    <Layout title={t("apps.title")} bare backdrop={<LauncherBackdrop />}>
      <div className="apps-wrap">
        <h2 className="apps-hello">
          <span className="sr-only">{plain}</span>
          <span aria-hidden="true">
            {who
              ? <>{lettered(before, n)}<span className="apps-hello-who"><span className="apps-hello-name">{lettered(who, n)}</span>{lettered(after, n)}</span></>
              : lettered(plain, n)}
          </span>
        </h2>
        <nav aria-label={t("apps.title")}>
          <ul className="apps-grid">
            {apps.map(({ id, labelKey, icon: Icon, hue }, i) => {
              const name = t(labelKey);
              const count = badges[id] || 0;
              return (
                <li key={id} style={{ "--i": i }}>
                  <Link
                    to={appEntry(id, may)}
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
      </div>
    </Layout>
  );
}
