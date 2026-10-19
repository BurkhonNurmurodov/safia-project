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

const BUILD = "2026-10-19T06:35:53.560Z";
const PRECACHE = ["/","/assets/AdminPanel-DLnRjQ-r.js","/assets/AnalysisBoard-Bp8IFd1C.js","/assets/Arc-CKB4mJMN.js","/assets/Assistant-BImfLOcC.js","/assets/BrigadirProfile-CbaCoU31.js","/assets/BroadcastReceivers-B4mjyjL5.js","/assets/BroadcastRecord-CszOlr22.js","/assets/Button-jmf79Rl2.js","/assets/CatLockNotice-DjL_4poy.js","/assets/CategoryLegendModal-0PkQGjMX.js","/assets/CellConcerns-BnEWvthI.js","/assets/CellDetails-CVAYuU4X.js","/assets/CellFormModal-DXbmKC_s.js","/assets/CellIdent-CZvxB2Cs.js","/assets/CellLink-Jg_UgD2i.js","/assets/Cells-CkjPG_oP.js","/assets/ColumnFilter-DF-AmZiH.js","/assets/ColumnsPicker-CykMLhb-.js","/assets/CommentsModal-CX2wj_0q.js","/assets/ComparisonTable-Bdp79MCz.js","/assets/Concerns-DSjf6u9J.js","/assets/CountStepper-BRj7S_LO.js","/assets/Daily-Dn-_RbgC.js","/assets/DataTable-DOLj-Zk0.js","/assets/DateRangePicker-CQfNf2W2.js","/assets/DayReportView-1d8OG337.js","/assets/DayStepper-CSYeLqSr.js","/assets/DifferenceBreakdown-DSaoAmPr.js","/assets/Downtime-B5xnzHpE.js","/assets/Education-erDenKQU.js","/assets/EducationLesson-nVHCarHh.js","/assets/EmptyState-YieWYTmp.js","/assets/Exam-CvoJ2NCE.js","/assets/FactorySelect-Bmh3OzhT.js","/assets/Gamification-D2kPLAH5.js","/assets/GroupBadge-D2ttHHqK.js","/assets/HeatmapChart-D6zjflYu.js","/assets/IdleCell-Ez3gk17-.js","/assets/KPICard-BRhj-wDX.js","/assets/Kaizen-BXO1upUc.js","/assets/Kelish-DjCgQs4U.js","/assets/KpiDeltaCard-oyRJVy5r.js","/assets/LangTextInput-CJMXNU_-.js","/assets/Layout-CKHsR5Wx.js","/assets/LeaderAppeal-DbAjssQj.js","/assets/LeaderDayReport-DEpm00fz.js","/assets/LeaderUnitReport-BfdCNs-B.js","/assets/Leaderboard-DEHyPJZK.js","/assets/Leaders-BwWLNd37.js","/assets/LeadersKpi-Gks_3hoK.js","/assets/Lightbox-B7RX94xg.js","/assets/LiveOverview-CWFLhzl2.js","/assets/Login-DQfYXKJ3.js","/assets/NotFound-CnAsFhnj.js","/assets/Notifications-eaEa7toW.js","/assets/Overview-DSWsixkj.js","/assets/Pagination-DNGAD20N.js","/assets/PerenaladkaFactTable-BFBYTwfG.js","/assets/PersonCard-C0KG2Lg5.js","/assets/PlanFulfillment-CB5rhE8M.js","/assets/Production-CMHrwk8P.js","/assets/Profile-C58TN_Ks.js","/assets/ProofCamera-4DZJ-5Ih.js","/assets/ProofPhoto-B7X28pNa.js","/assets/Quality-Cv40oMo0.js","/assets/RawRows-DDZJx5gh.js","/assets/RequestStateChip-CpjEwHsK.js","/assets/RichTextEditor-CsFe6MDE.js","/assets/SaveState-WfeRIsUI.js","/assets/SearchInput-B8wlFScT.js","/assets/SeasonalityHeatmap-DnS58HfF.js","/assets/SegmentedToggle-om8oiV0I.js","/assets/SetupTimes-GweO7Hfq.js","/assets/ShiftDaily-CrE2CKxB.js","/assets/Staff-CWIvnQGk.js","/assets/StaffListAtCheck-WfoHHq5B.js","/assets/StatusBadge-Bp4DBHk2.js","/assets/TargetGoal-DDnfd4V2.js","/assets/Targets-1JUrfElX.js","/assets/Tasks-lMzXskX1.js","/assets/TimeWheelPicker-PhfjD2yd.js","/assets/Toast-BeUj5beS.js","/assets/Tooltip-YNfQ6XsC.js","/assets/TrendChart-BGqhKDZR.js","/assets/TripleSpeedometer-KoUmqLiS.js","/assets/Trudoyomkost-P4iV_WqE.js","/assets/UploadDropzone-Bjc0ELjn.js","/assets/UsersActivity-DzSSvg1D.js","/assets/VerdictBlock-BzCA1Pwc.js","/assets/VfxApiMap-B0uvf8xP.js","/assets/VfxDictionaries-WA3q4TSY.js","/assets/VfxEmployees-pVVqzuDr.js","/assets/VfxHrMoves-B8MrMdMz.js","/assets/VfxJobs-BLjaigsB.js","/assets/VfxPhoto-D33F9s2Y.js","/assets/VfxShifts-DGK_FDAV.js","/assets/VfxState-K8emoIbw.js","/assets/VfxTimebooks-BIXqe6Rc.js","/assets/VfxTimesheet-cF1kQLlr.js","/assets/WatchProgress-CfKIpr2l.js","/assets/WebLogin-BSIRVSYb.js","/assets/Workers-BHzXLHVO.js","/assets/Zagruzka-Dgs0WQq8.js","/assets/ZagruzkaCell-HS4zdKiZ.js","/assets/api-joHIGpJn.js","/assets/archive-C12gptTO.js","/assets/archive-restore-BNFQ9WMx.js","/assets/arrow-down-Bqjm9zu1.js","/assets/arrow-down-wide-narrow-CSAkKfgF.js","/assets/arrow-up-narrow-wide-Hgi-EMk0.js","/assets/ban-Si6s5mB3.js","/assets/boxes-C1mst0OT.js","/assets/braces-DaPmMudl.js","/assets/brigadirFilters-CZyYUwK9.js","/assets/broadcastTree--x26jVLP.js","/assets/building-2-DqIrkH2R.js","/assets/calculator-3xTf5WSr.js","/assets/calendar-DqSrwL1D.js","/assets/calendar-days-CXXADOMp.js","/assets/camera-tek41ups.js","/assets/categories-D-zU07TO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DUU4AJ29.js","/assets/chart-line-Dp4LJ6tH.js","/assets/chart-pie-ouIT7GS6.js","/assets/chartRange-CifxwHlC.js","/assets/check-check-CztXANrq.js","/assets/chevron-left-DRtYQSNZ.js","/assets/chevrons-up-down-DjZIHmOq.js","/assets/circle-DuxE9ff4.js","/assets/circle-alert-D9x6pY3X.js","/assets/circle-check-big-C-zOHTIN.js","/assets/circle-dashed-nMqFxuDw.js","/assets/circle-minus-DJwuToNa.js","/assets/circle-question-mark-D5KBHOoa.js","/assets/circle-slash-BlhYL5R8.js","/assets/circle-user-round-DEHbyaYD.js","/assets/cloud-off-Bi1bWxVU.js","/assets/cloud-upload-7gCrODO7.js","/assets/compass-DBr7CcNi.js","/assets/concernCategories-DuS8qMYD.js","/assets/corner-down-right-D_jRvWGz.js","/assets/createLucideIcon-DaXCVk9-.js","/assets/es-M7I83xok.js","/assets/external-link-DRxsFz9n.js","/assets/file-clock-DelydEDn.js","/assets/file-exclamation-point-CnTo1YXQ.js","/assets/flag-Bdx1XzaK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BCvtL-oa.js","/assets/hash-BfepMxuX.js","/assets/hourglass-Hzg6Nyud.js","/assets/image-6lJKjez5.js","/assets/image-off-CzC8Toqh.js","/assets/inbox-CrCJ09qx.js","/assets/index-BuL9sQ4S.js","/assets/index-L1D4X663.css","/assets/keyboard-C6ArlR8u.js","/assets/languages-CAUjq9Yu.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-v85YzCoC.js","/assets/lightbulb-DTsEaDLM.js","/assets/link-2-DcCyyUcx.js","/assets/link-2-off-DDUONmMg.js","/assets/list-ordered-D7OQToE2.js","/assets/list-tree-DTKytQvG.js","/assets/lock-open-DkywDlXN.js","/assets/log-in-BmPPrF8o.js","/assets/marks-BePyKxxL.js","/assets/minimize-2-DySfEF5w.js","/assets/package-check-DDMfRuj-.js","/assets/pencil-BX1ofRXa.js","/assets/percent--f6wSAD7.js","/assets/pin-BuywqBnw.js","/assets/pin-off-C-1HwKk6.js","/assets/play-sxWVoB56.js","/assets/plug-zap-7ee8X95-.js","/assets/prop-types-ThMUuAUy.js","/assets/radio-CCHpsqGd.js","/assets/react-apexcharts.esm-DofdfOKe.js","/assets/registers-ClrG-xOh.js","/assets/repeat-DA-Zo75a.js","/assets/save-DyHep5Op.js","/assets/scopeLinks-C9-M3Xej.js","/assets/scroll-text-rc3DuGnT.js","/assets/search-x-BXDo0uir.js","/assets/segments-DP6aecGp.js","/assets/send-CYpAYZvG.js","/assets/settings-2-BBqVjtk5.js","/assets/shield-LNV9eF-b.js","/assets/shield-alert-CjxVAxh5.js","/assets/shield-question-mark-BtFLyMwt.js","/assets/siren-DsI3Wf-l.js","/assets/snowflake-4h46lnkC.js","/assets/split-C5PXwt2c.js","/assets/square-check-big-DxYVnm9g.js","/assets/star-zj9cbVUR.js","/assets/statusBands-FLubw9NQ.js","/assets/store-Bp8QpA_t.js","/assets/table-2-Q3i58eWo.js","/assets/table-properties-Bnh-AkXS.js","/assets/tag-Dcuy5k2n.js","/assets/timer-off-B6ZX2TkB.js","/assets/trending-down-QGfigf6J.js","/assets/trending-up-ynoe3zi5.js","/assets/undo-2-BetudYrc.js","/assets/useChartTheme-D4mkglD7.js","/assets/useElementWidth-BT1Dhof5.js","/assets/useIsMobile-DEKPHAjb.js","/assets/useOpenParam-BqLdZtQz.js","/assets/useStatusBands-BoJWuxzC.js","/assets/useUrlScope-D5Z7f2aQ.js","/assets/user-IbNLpmFg.js","/assets/user-cog-BzotLCOy.js","/assets/user-minus-5Yrkq62l.js","/assets/users-DEAMENWZ.js","/assets/vfx-B-uvxGMz.js","/assets/video-DjeoKiwn.js","/assets/wallet-DlAMIWiW.js","/assets/warehouse-C2Cvf8Mb.js","/assets/workflow-CpDABfzm.js","/assets/x-mSOQTe5d.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
