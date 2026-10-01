/*
 * Safia service worker — the SOURCE. The build writes dist/sw.js from it
 * (emitServiceWorker in vite.config.js) with the two placeholders below filled
 * in: the build stamp, and the same-origin paths to precache. It is registered
 * by utils/pwa.js in a BROWSER only — never inside Telegram (see bootPwa) —
 * and served no-store by serve_spa in backend/app/main.py.
 *
 * What it does, in the order the fetch handler decides:
 *   - non-GET and cross-origin requests are not touched at all (a font
 *     re-fetched from in here would be refused by the worker's own CSP
 *     connect-src, which is same-origin);
 *   - /api, /bot, /health, /docs, the backend's /admin routes, /build.json and
 *     /sw.js are never cached and never answered from cache;
 *   - a navigation to an SPA route is NETWORK FIRST with a timeout, then the
 *     cached shell — for offline, a slow origin AND an origin 5xx (nginx during
 *     the backend restart every deploy performs); a 4xx is never masked — then
 *     a plain offline page. So a reload still fetches the deployed index.html
 *     and UpdatePrompt's «reload» keeps its meaning;
 *   - a navigation whose path names a FILE (an export opened in a new tab) is
 *     left to the browser: the shell fallback must never answer a slow .xlsx;
 *   - /assets/* is CACHE FIRST — content-hashed and served immutable, so a
 *     cached copy can never be the wrong one;
 *   - everything else same-origin (icons, the manifest, the Telegram SDK copy)
 *     is network first with the cache as the fallback.
 *
 * ONE cache per build, named by the stamp: activating a new build's worker
 * drops every other build's cache, and skipWaiting + clients.claim make that
 * immediate. A tab still on the old build then 404s on its next lazy chunk
 * and lazyWithReload reloads it — exactly what happens today without a worker.
 */

const BUILD = "2026-10-01T13:30:37.547Z";
const PRECACHE = ["/","/assets/AdminPanel-C9htng5v.js","/assets/AnalysisBoard-9boyPjln.js","/assets/Arc-5rcqPT71.js","/assets/ArcLegacy-w4cTCgPx.js","/assets/BrigadirProfile-BVtioPg_.js","/assets/BroadcastReceivers-DITtRANV.js","/assets/BroadcastRecord-DTFgopZD.js","/assets/CatLockNotice-BKyYEx0g.js","/assets/CategoryLegendModal-XPH9igmC.js","/assets/CellConcerns-BfG8ZxAs.js","/assets/CellDetails-D3DuC8pD.js","/assets/CellFormModal-Dmvuz6Sn.js","/assets/CellIdent-Bt43TebN.js","/assets/CellLink-DTZkN97x.js","/assets/Cells-CSZoRyuH.js","/assets/ColumnFilter-C7DEB0kK.js","/assets/ColumnsPicker-5UYBnHyl.js","/assets/CommentsModal-BMqoxuMH.js","/assets/ComparisonTable-CGz1onpD.js","/assets/Concerns-DEffcQN5.js","/assets/ConfirmDialog-BDGKomai.js","/assets/Daily-u44ytgUZ.js","/assets/DataTable-CKEg4L3c.js","/assets/DateRangePicker-0YwsvugZ.js","/assets/DayReportView-z19KE5Ts.js","/assets/DayStepper-Im2zr6re.js","/assets/DifferenceBreakdown-0dFhUcEJ.js","/assets/Downtime-CXxrWCnr.js","/assets/Education-DU0Es7Ic.js","/assets/EducationLesson-D9-EMtx9.js","/assets/EmptyState-CKejik_n.js","/assets/Exam-DJPoj0oa.js","/assets/FactorySelect-Bkt-qD4f.js","/assets/Gamification-C6qlQMBh.js","/assets/GroupBadge-D6V8U6oW.js","/assets/HeatmapChart-CBM7BolR.js","/assets/IdleCell-D3Vzrlng.js","/assets/KPICard-X1FpnR34.js","/assets/Kaizen-COvuzuIn.js","/assets/Kelish-ZOo1C9iD.js","/assets/KpiDeltaCard-BC9J5Tnt.js","/assets/LangTextInput-fQAHS0HS.js","/assets/Layout-s8Pc1D78.js","/assets/LeaderAppeal-1yR0nCi1.js","/assets/LeaderDayReport-ztsdSZ64.js","/assets/LeaderUnitReport-8_xf-xXd.js","/assets/Leaderboard-DilLuvQ8.js","/assets/Leaders-Cj2EnvS_.js","/assets/Lightbox-MATEEnO0.js","/assets/LiveOverview-CwuJjhE2.js","/assets/Login-BcnHSm80.js","/assets/NotFound-9aezeb7y.js","/assets/Notifications-BNJW7h_R.js","/assets/Overview-Dy7SIGcb.js","/assets/Pagination-BB0o5GLx.js","/assets/PerenaladkaFactTable-CKT8FGIC.js","/assets/PlanFulfillment-myvVAgY4.js","/assets/Production-DltbWO1m.js","/assets/Profile-DBfHViDV.js","/assets/ProofCamera-D70vw0UU.js","/assets/ProofPhoto-CNBErFY4.js","/assets/Quality-CZPT8MkW.js","/assets/RequestStateChip-TcrWlBZ8.js","/assets/RichTextEditor-DRjOdCpY.js","/assets/SaveState-ClL8kgcg.js","/assets/SearchInput-3e9nfj6W.js","/assets/SeasonalityHeatmap-DYw4I7px.js","/assets/SegmentedToggle-CGwTHTEi.js","/assets/SetupTimes-QpMPmeh8.js","/assets/ShiftDaily-tQPRS2Po.js","/assets/Staff-BVnMo8eZ.js","/assets/StaffLive-TXI42PAK.js","/assets/StatusBadge-QY58_KQN.js","/assets/TargetGoal-BfQVq8On.js","/assets/Targets-C0oWi6Qi.js","/assets/Tasks-CWKEX8sA.js","/assets/TimeWheelPicker-Bbqz3_HY.js","/assets/Toast-CZhZYfGb.js","/assets/Tooltip-r41lLo-m.js","/assets/TrendChart-CK4hdU_u.js","/assets/TripleSpeedometer-Bt7LfyDv.js","/assets/Trudoyomkost-BY4nY8PV.js","/assets/UploadDropzone-C4DUuHGN.js","/assets/UsersActivity-BgH3SYNc.js","/assets/VerdictBlock-DKlhFUS5.js","/assets/WatchProgress-CTGmc-Fd.js","/assets/WebLogin-BBywCyPa.js","/assets/WorkerConcerns-CtXinhh3.js","/assets/Workers-BcgcYiEq.js","/assets/Zagruzka-S_t26Ma3.js","/assets/ZagruzkaCell-DhyKJhJj.js","/assets/api-BsT2CSjx.js","/assets/archive-ByIfjnx-.js","/assets/archive-restore-Y_CBVVio.js","/assets/arrow-down-D-CBXzQw.js","/assets/arrow-left-lRy95RYE.js","/assets/arrow-right-left-BGA-h9Gn.js","/assets/arrow-up-DAY_c8Yh.js","/assets/arrow-up-narrow-wide-C_Ai3db7.js","/assets/arrow-up-right-QePGX_1P.js","/assets/award-M4ccXMmX.js","/assets/ban-DGBdKRgU.js","/assets/bot-DlMS1qqI.js","/assets/boxes-CRSBuaQ_.js","/assets/brigadirFilters-D8HEzuaX.js","/assets/broadcastTree-D3BlPDaf.js","/assets/building-2-Dq_cf6XI.js","/assets/calendar-BszSOo6t.js","/assets/calendar-days-DC1YIEFh.js","/assets/calendar-range-OL3ZeeNI.js","/assets/camera-CjV9NRS2.js","/assets/categories-aBabCQMs.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dp9NEdEs.js","/assets/chart-line-6iG5p3Qb.js","/assets/chart-pie-BSbhGNh2.js","/assets/chartRange-u9yhheSk.js","/assets/chevron-left-BqREct55.js","/assets/chevrons-up-down-CabH0tb5.js","/assets/circle-B7C_H0tH.js","/assets/circle-alert-CQkeFAO5.js","/assets/circle-check-big-CeLBBoy9.js","/assets/circle-minus-C92j8hJX.js","/assets/circle-slash-CjtAROaQ.js","/assets/circle-user-round-CnpTdNur.js","/assets/cloud-off-B4yqd77n.js","/assets/cloud-upload-DPYs5HKk.js","/assets/compass-CRUYlzAJ.js","/assets/concernCategories-CR8V9zs2.js","/assets/copy-C0oOcTdj.js","/assets/corner-down-right-ibS0XCxt.js","/assets/createLucideIcon-B7Ltjia5.js","/assets/es-Xf0sIU_H.js","/assets/exportXlsx-DP4ayx8f.js","/assets/external-link-DPsdgkEQ.js","/assets/file-clock-BROm1oTf.js","/assets/file-exclamation-point-Bnol33QA.js","/assets/file-spreadsheet-BCsmibsd.js","/assets/file-text-CgBkOtkh.js","/assets/flag-BA8Vgden.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CIo6LLeM.js","/assets/hash-cVKdRIxp.js","/assets/history-Vo0fnpv6.js","/assets/hourglass-Bk1E6Dfx.js","/assets/id-card-C1Z_4UmH.js","/assets/image-BrjDxUad.js","/assets/image-off-Buj50xWp.js","/assets/inbox-BwM2m6Bq.js","/assets/index-BoSISG-s.js","/assets/index-C5C7uERa.css","/assets/key-round-Baulv3fF.js","/assets/keyboard-EX2hbns0.js","/assets/languages-CFapbLKV.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-OGg225DY.js","/assets/lightbulb-CF0lMg9C.js","/assets/link-2-C9VdSh5k.js","/assets/link-2-off-DZUf9iHN.js","/assets/list-ordered-B_mQ2aYJ.js","/assets/list-tree-DHLEdhLp.js","/assets/lock-open-BDrnZF8x.js","/assets/log-in-Cqanw3DZ.js","/assets/maximize-2-DVW38r1q.js","/assets/message-square-C2s-jOS1.js","/assets/minimize-2-8tB-Dv2-.js","/assets/package-check-DW-yTzJS.js","/assets/paperclip-fxTP2P2r.js","/assets/pencil-Che5u0HB.js","/assets/percent-BoD0Acls.js","/assets/pin-B7H-flOE.js","/assets/pin-off-aP6gGA_A.js","/assets/play-C1n9Tict.js","/assets/plug-zap-BvR-YTKo.js","/assets/presentation-BjNqkvMS.js","/assets/prop-types-BzkEOrbC.js","/assets/radio-BQ2U5iZ5.js","/assets/react-apexcharts.esm-DM6m3E-w.js","/assets/repeat-DnIKvorG.js","/assets/rotate-ccw-BsCR4oPJ.js","/assets/rotate-cw-ByYp95hH.js","/assets/save-nls4sUmN.js","/assets/scopeLinks-CRNTxAm8.js","/assets/scroll-text-FudOEQUp.js","/assets/search-x-DpaEI7gR.js","/assets/segments-BNkY91rX.js","/assets/send-nEYbTe9i.js","/assets/settings-2-DD6HYgWo.js","/assets/shield-ClDusPEg.js","/assets/shield-alert-iXozFa5R.js","/assets/shield-check-B924Hwk5.js","/assets/shield-question-mark-Bwj0iqvd.js","/assets/siren-D4oWC3YZ.js","/assets/snowflake-BUPcS2ig.js","/assets/split-CXcDBqEb.js","/assets/square-BRGN4NhA.js","/assets/square-check-big-Bii0aHbX.js","/assets/star-O6vvOkgt.js","/assets/statusBands-CPOWvTU3.js","/assets/store-B3QI2yIb.js","/assets/table-2-BcAg8__q.js","/assets/table-properties-BhJaVtwW.js","/assets/tag-BIW9vWkz.js","/assets/timer-off-DHaQFMYt.js","/assets/trending-down-CWM9e7co.js","/assets/trending-up-D5QEkBHG.js","/assets/undo-2-B2wphKVu.js","/assets/useChartTheme-DGAiQcO8.js","/assets/useElementWidth-7qwcUHYV.js","/assets/useIsMobile-CQrINNqG.js","/assets/useOpenParam-f7JSU7Cw.js","/assets/useStatusBands-De-JcJxH.js","/assets/useUrlScope-Dx6MaZIk.js","/assets/user-DYZMC8g4.js","/assets/user-cog-D2CN1uVY.js","/assets/user-minus-CQPDMIho.js","/assets/users-whgKbrlf.js","/assets/video-j121lqMB.js","/assets/wallet-C5rzOdQc.js","/assets/warehouse-DbTxvUYy.js","/assets/x-D-3MJ8pa.js","/assets/zap-puSYibP6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
const CACHE = "safia-" + BUILD;
const SHELL = "/";
const NAV_TIMEOUT_MS = 5000;

// Backend prefixes: never cached, never served from cache, never given the shell.
const NEVER_CACHE = ["/api/", "/bot/", "/health", "/docs", "/redoc", "/openapi.json"];
// The SPA's own /admin paths. Every other /admin/* is a backend route.
const SPA_ADMIN = new Set(["/admin", "/admin/", "/admin/upload", "/admin/upload/"]);

function passThrough(path) {
  if (NEVER_CACHE.some((p) => path.startsWith(p))) return true;
  if (path.startsWith("/admin") && !SPA_ADMIN.has(path)) return true;
  return path === "/build.json" || path === "/sw.js";
}

function namesFile(path) {
  return path.slice(path.lastIndexOf("/") + 1).includes(".");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never atomic: a file that is missing must not keep the whole build out of
    // the cache. Eight at a time, not two hundred at once — a phone on a slow
    // link should not have every chunk of the app competing with the page it
    // is showing. An unchanged hashed asset comes out of the browser's own HTTP
    // cache (served immutable) — but chunk hashes cascade with the import
    // graph, so most deploys rename most chunks and re-download most of the
    // graph; CLAUDE.md records that cost as accepted and names the knob.
    const BATCH = 8;
    for (let i = 0; i < PRECACHE.length; i += BATCH) {
      await Promise.allSettled(PRECACHE.slice(i, i + BATCH).map((path) => cache.add(path)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("safia-") && n !== CACHE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (req.mode === "navigate") {
    if (!passThrough(path) && !namesFile(path) && !path.startsWith("/assets/")) {
      event.respondWith(shell(req));
    }
    return;
  }
  if (passThrough(path)) return;
  event.respondWith(path.startsWith("/assets/") ? cacheFirst(req) : networkFirst(req));
});

// Every cache lookup ignores Vary. The server's CORS layer stamps
// `Vary: Origin` on assets, and the Cache API honours it by default: a module
// script request carries an Origin header where a plain fetch() of the same URL
// does not, so the entry chunk fetch() found was a MISS for the module loader,
// and an offline start died on it (found in local testing, 2026-09-18). Assets
// are content-hashed — identical for every origin — so Vary says nothing here.
const MATCH = { ignoreVary: true };

// The Cache API can refuse — storage evicted or "in a broken state" mid-session,
// a quota error while the origin's data is being cleared, a private window that
// registered the worker earlier. A refusal inside respondWith() is a FAILED
// request for a server that is perfectly reachable, so every cache call on the
// fetch path goes through these three, and a failing cache degrades to plain
// network — never to an error page or a dead module.
async function safeOpen() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}
async function safeMatch(key) {
  try {
    return (await caches.match(key, MATCH)) || null;
  } catch {
    return null;
  }
}
function safePut(cache, key, res) {
  if (!cache) return;
  try {
    cache.put(key, res.clone()).catch(() => {});
  } catch {
    /* body already used, or storage refused */
  }
}
// Only a body of the kind the URL names is stored: serve_spa answers ANY
// unknown same-origin path with index.html/200, so without this a renamed
// icon or a stale <img src> would park the shell under a static's URL. The
// shell itself is stored by shell(), under SHELL and nowhere else.
function storable(res) {
  return res.status === 200 && !(res.headers.get("content-type") || "").includes("text/html");
}

async function shell(req) {
  const cache = await safeOpen();
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      safePut(cache, SHELL, res);
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  let res = null;
  try {
    res = await Promise.race([fresh, late]);
  } catch {
    // offline — fall through to the cached shell
  }
  // A 5xx is the origin saying it is not there right now — nginx during the
  // backend restart every deploy performs, a Cloudflare 52x — and that is the
  // one moment the cached shell exists for: the app then shows its own
  // offline/error state instead of the proxy's page. A 4xx is never masked.
  if (res && res.status < 500) return res;
  const cached = await safeMatch(SHELL);
  if (cached) return cached;
  if (res) return res;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await safeMatch(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

async function networkFirst(req) {
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const hit = await safeMatch(req);
    if (hit) return hit;
    throw err;
  }
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

// Shown only when the app has never been cached on this device and there is no
// network — a cold first open offline. Three languages on one line each; the
// full four-language boot copy lives in index.html, which is what this is
// standing in for.
function offlinePage() {
  const html =
    '<!doctype html><html lang="uz"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Safia</title>' +
    "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
    "background:#0f1117;color:#f3f4f6;font-family:system-ui,sans-serif;text-align:center;padding:24px}" +
    "h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}</style></head>" +
    "<body><div><h1>Internet aloqasi yo‘q</h1><p>Aloqa tiklangach sahifani yangilang.<br>" +
    "Нет подключения — обновите страницу, когда связь появится.<br>" +
    "No connection — reload once you are back online.</p></div></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
