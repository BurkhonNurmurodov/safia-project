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

const BUILD = "2026-10-14T16:03:46.836Z";
const PRECACHE = ["/","/assets/AdminPanel-_jARy1fI.js","/assets/AnalysisBoard-ByrJQCU4.js","/assets/Arc-DnAYjE-L.js","/assets/Assistant-Cykv4bUX.js","/assets/BrigadirProfile-DdQlx_3i.js","/assets/BroadcastReceivers-DyTUaZPy.js","/assets/BroadcastRecord-BiotYLHK.js","/assets/Button-BgMZ_7NT.js","/assets/CatLockNotice-Rg1hqb2-.js","/assets/CategoryLegendModal-Bn7fpSHk.js","/assets/CellConcerns-DIZXuGOz.js","/assets/CellDetails-DNFidwYV.js","/assets/CellFormModal-C_jopkYu.js","/assets/CellIdent-B210u-_m.js","/assets/CellLink-BH7Oll-P.js","/assets/Cells-BVB0VrtL.js","/assets/ColumnFilter-tu3U7kNu.js","/assets/ColumnsPicker-CoApfsp0.js","/assets/CommentsModal-BiXsOeFD.js","/assets/ComparisonTable-C-Q1F86H.js","/assets/Concerns-Ck20pCGX.js","/assets/CountStepper-D1ZyxpN6.js","/assets/Daily-8z5ZIKQU.js","/assets/DataTable-A6dsZROI.js","/assets/DateRangePicker-DrnU8l8p.js","/assets/DayReportView-Wyq4q-se.js","/assets/DayStepper-BoJVV_B_.js","/assets/DifferenceBreakdown-DHTNwrU0.js","/assets/Downtime-CAYei2pr.js","/assets/Education-z8oOOa7p.js","/assets/EducationLesson-DAo6lHni.js","/assets/EmptyState-DiOD3UZl.js","/assets/Exam-DrAzf0EN.js","/assets/FactorySelect-C_0_zHg4.js","/assets/Gamification-DI0lYi08.js","/assets/GroupBadge-gXVIjrhY.js","/assets/HeatmapChart-DSMd7Dd5.js","/assets/IdleCell-CJiWO_wO.js","/assets/KPICard-Dgk7omyZ.js","/assets/Kaizen-DVUM2f74.js","/assets/Kelish-DlXtkkbX.js","/assets/KpiDeltaCard-1xsRoNXR.js","/assets/LangTextInput-DGGpQcLy.js","/assets/Layout-Bsi59mkm.js","/assets/LeaderAppeal-8mrP-QXH.js","/assets/LeaderDayReport-DFgeqvvF.js","/assets/LeaderUnitReport-BRZ4wP5I.js","/assets/Leaderboard-D4FnZWtu.js","/assets/Leaders-CpoGaBa3.js","/assets/Lightbox-wSHCgiLe.js","/assets/LiveOverview-BreFlBd_.js","/assets/Login-DG9Eap8D.js","/assets/NotFound-DCiN1w53.js","/assets/Notifications-D6UflIuj.js","/assets/Overview-Bb8HNrHY.js","/assets/Pagination-Vmqw9CpZ.js","/assets/PerenaladkaFactTable-Dy1_9C4F.js","/assets/PersonCard-CEZK6Q9Z.js","/assets/PlanFulfillment-nKVN-gAC.js","/assets/Production-BnYam8re.js","/assets/Profile-DjIh2-RP.js","/assets/ProofCamera-2jKNEjHr.js","/assets/Quality-7mVKEKrO.js","/assets/RawRows-CSRjTshb.js","/assets/RequestStateChip-Bqn_1JXL.js","/assets/RichTextEditor-CwSj36Tp.js","/assets/SaveState-CIrysoSr.js","/assets/SearchInput-BVxnH9AJ.js","/assets/SeasonalityHeatmap-D2V-4lTK.js","/assets/SegmentedToggle-ymfwhusY.js","/assets/SetupTimes-xifufsjH.js","/assets/ShiftDaily-SmQVSLre.js","/assets/Staff-BeQEtC7N.js","/assets/StaffListAtCheck-1mga_dCr.js","/assets/StatusBadge-CmghLOgA.js","/assets/TargetGoal-BjdSTJ2h.js","/assets/Targets-BBzs-qCf.js","/assets/Tasks-Yk9DPyps.js","/assets/TimeWheelPicker-BJh7lTzX.js","/assets/Toast-BHHakM40.js","/assets/Tooltip-DuVNVO4e.js","/assets/TrendChart-n8DkJJ5_.js","/assets/TripleSpeedometer-BhpnzbE0.js","/assets/Trudoyomkost-CkNycHo1.js","/assets/Turnover-DVg_TiwX.js","/assets/UploadDropzone-BMfgs3Pt.js","/assets/UsersActivity-gaot1Rx5.js","/assets/VerdictBlock-D1HVM19d.js","/assets/VfxApiMap-BB29jyWd.js","/assets/VfxDictionaries-C8e1KdBh.js","/assets/VfxEmployees-B9Nucrfn.js","/assets/VfxHrMoves-DQm-DLnU.js","/assets/VfxJobs-Di7ezWF3.js","/assets/VfxPhoto-D2fkugdb.js","/assets/VfxShifts-DRpbey3F.js","/assets/VfxState-DDhQhv6R.js","/assets/VfxTimebooks-CA-4UfyB.js","/assets/VfxTimesheet-CX7gy8EN.js","/assets/WatchProgress-DXKHMpdq.js","/assets/WebLogin-Ca2M6b4H.js","/assets/WorkerConcerns-B4h6B5VG.js","/assets/Workers-D3egzH2a.js","/assets/Zagruzka-BxOmyV7h.js","/assets/ZagruzkaCell-CMD6Z5xA.js","/assets/api-COtsEQVl.js","/assets/archive-VkedVFuq.js","/assets/archive-restore-Br-uI_Uq.js","/assets/arrow-down-Bee-muvK.js","/assets/arrow-down-wide-narrow-B-DYd-dR.js","/assets/arrow-up-narrow-wide-C7db281h.js","/assets/award-Cn9q5Hrf.js","/assets/ban-BT_vtJD2.js","/assets/boxes-Bf66nIX-.js","/assets/braces-CZpPwO0Y.js","/assets/brigadirFilters-dV85vWdP.js","/assets/broadcastTree-hbWHpCfz.js","/assets/building-2-BbjyDKrd.js","/assets/calculator-5JRl_C4b.js","/assets/calendar-Cw2-nLGl.js","/assets/calendar-days-DhP5Hnu_.js","/assets/camera-CNf6LL9g.js","/assets/categories-oLJuD6yY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CIkTgGgQ.js","/assets/chart-line-DcsO5uqi.js","/assets/chart-pie-DZ2ycclR.js","/assets/chartRange-B88gB77B.js","/assets/check-check-jCJVBhZi.js","/assets/chevron-left-BybBuNZz.js","/assets/chevrons-up-down-CaPdP3Qg.js","/assets/circle-CW3MHq3H.js","/assets/circle-alert-B_bcw-kX.js","/assets/circle-check-big-vLbSxY_I.js","/assets/circle-dashed-paqf3IzW.js","/assets/circle-minus-DH7p2gHu.js","/assets/circle-question-mark-CjNMGMHW.js","/assets/circle-slash-COJsHD4Z.js","/assets/circle-user-round-DuwxzAK4.js","/assets/clock-3-WK0Yrcnh.js","/assets/cloud-off-DH1kMix2.js","/assets/cloud-upload-DNkd0G5w.js","/assets/compass-BNeKWSMP.js","/assets/concernCategories-CyJMwP4J.js","/assets/copy-CTwrsBuA.js","/assets/corner-down-right-0cjQoS5Z.js","/assets/createLucideIcon-D7M3XDym.js","/assets/es-BrRZbe80.js","/assets/external-link-CDuaVvsm.js","/assets/file-clock-dFpbWmeT.js","/assets/file-exclamation-point-BXuwh1hO.js","/assets/flag-BC8V_NFa.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CfCmbjJ7.js","/assets/hash-BF-Cfs3f.js","/assets/hourglass-BecxCkLL.js","/assets/image-off-CfzE7qoe.js","/assets/image-pqUSTO3L.js","/assets/inbox-B9W0E2Td.js","/assets/index-DWCq5gUB.css","/assets/index-Dpohyy7T.js","/assets/keyboard-CXAutVxW.js","/assets/languages-ozokpVCT.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BxmxRFy9.js","/assets/lightbulb-B1XLRmjo.js","/assets/link-2-CGll27p0.js","/assets/link-2-off-DlmBKK5i.js","/assets/list-ordered-DE3KtEb1.js","/assets/list-tree-yz-Q069h.js","/assets/lock-open-PC8vOIBr.js","/assets/log-in-CNnwp9Cn.js","/assets/marks-BPCU5TZI.js","/assets/minimize-2-DvTOJ8RF.js","/assets/package-check-tG6-bxiv.js","/assets/pencil-CSSH9Qi5.js","/assets/percent-CU023bLn.js","/assets/pin-DcH6omwM.js","/assets/pin-off-CRQJWESL.js","/assets/play-CUpWW4g3.js","/assets/plug-zap-vfLBceSV.js","/assets/prop-types-CxsyXFpK.js","/assets/radio-D5jIJS3O.js","/assets/react-apexcharts.esm-8L9KH6mi.js","/assets/registers-DEfCrB71.js","/assets/repeat-_NIqp9u3.js","/assets/save-CZN7GOyJ.js","/assets/scopeLinks-BLRbrEBy.js","/assets/scroll-text-8i8kU0j-.js","/assets/search-x-8tw9jXf3.js","/assets/segments-AOosFc0h.js","/assets/send-BzEokrXC.js","/assets/settings-2-CnXpvlJO.js","/assets/shield-CPOhHwEC.js","/assets/shield-alert-DR-Do_Y7.js","/assets/shield-question-mark-DI1ZhS2J.js","/assets/siren-BOxVULU2.js","/assets/snowflake-CF5nsXwX.js","/assets/split-C7UDk30q.js","/assets/square-check-big-Ckf3xrPO.js","/assets/star-P0o8-Yhb.js","/assets/statusBands-D3PwC_Ko.js","/assets/store-BnhnyDDp.js","/assets/table-2-ErTl9V5Q.js","/assets/table-properties-BTEJDmVW.js","/assets/tag-DFZJUvOS.js","/assets/timer-off-gkg183lf.js","/assets/trending-down-uSafNuvO.js","/assets/trending-up-B6H1RPaS.js","/assets/undo-2-CGiU-mPe.js","/assets/useChartTheme-BM1khy_s.js","/assets/useElementWidth-BUwVLtsl.js","/assets/useIsMobile-CoQnZn6R.js","/assets/useOpenParam-Du7bwjfw.js","/assets/useStatusBands-Cux9IX9I.js","/assets/useUrlScope-ZghgpQKQ.js","/assets/user-CLb0kDHG.js","/assets/user-cog-SHBTwVe7.js","/assets/users-DeMYa58q.js","/assets/vfx-Big0awGW.js","/assets/video-DsoOdLAl.js","/assets/wallet-nV1HWEq7.js","/assets/warehouse-CTWczGOE.js","/assets/workflow-CDxuwzmk.js","/assets/x-Bv-crU8C.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
