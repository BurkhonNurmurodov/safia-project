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

const BUILD = "2026-10-05T06:51:17.387Z";
const PRECACHE = ["/","/assets/AdminPanel-BLLcq7h2.js","/assets/AnalysisBoard-DBr85IH7.js","/assets/Arc-EQeBQJmT.js","/assets/ArcLegacy-BuyesNzv.js","/assets/BrigadirProfile-D_IvMk7A.js","/assets/BroadcastReceivers-CFjsASpi.js","/assets/BroadcastRecord-tjIaCpH3.js","/assets/Button-SKWxCMJT.js","/assets/CatLockNotice-BCQ8o_gN.js","/assets/CategoryLegendModal-Rv06FDKt.js","/assets/CellConcerns-rVWf4vvW.js","/assets/CellDetails-DTooWpie.js","/assets/CellFormModal-DJqojKbH.js","/assets/CellIdent-Cg6Siy7d.js","/assets/CellLink-JS_i7OCD.js","/assets/Cells-BcViAQS9.js","/assets/ColumnFilter-krAe0ZGP.js","/assets/ColumnsPicker-_O9G5tqk.js","/assets/CommentsModal-DKiiONmI.js","/assets/ComparisonTable-Eu4Gf_1g.js","/assets/Concerns-zUhT1mUl.js","/assets/Daily-B5MjMm9H.js","/assets/DataTable-DeniYTQm.js","/assets/DateRangePicker-CUrIWrHR.js","/assets/DayReportView-S8ZRqNHG.js","/assets/DayStepper-BKOcn-0C.js","/assets/DifferenceBreakdown-BdDx61-H.js","/assets/Downtime-DFTGpZEm.js","/assets/Education-BSgVhv3r.js","/assets/EducationLesson-nIbBDQnc.js","/assets/EmptyState-BBCVQfRU.js","/assets/Exam-CRzoz-6-.js","/assets/FactorySelect-LyxW2QPG.js","/assets/Gamification-Bpjo9BU1.js","/assets/GroupBadge-Lb84Rbp_.js","/assets/HeatmapChart-BTrEUUx4.js","/assets/IdleCell-CdCvcRwn.js","/assets/KPICard-B--7-CkW.js","/assets/Kaizen-YmNrmTS-.js","/assets/Kelish-B08zeopi.js","/assets/KpiDeltaCard-C6rz6ACR.js","/assets/LangTextInput-CKbGvRPu.js","/assets/Layout-CpQ9CbUY.js","/assets/LeaderAppeal-9Xr5c_NL.js","/assets/LeaderDayReport-C30kLlVM.js","/assets/LeaderUnitReport-gQaj4iEF.js","/assets/Leaderboard-CTYCaK4W.js","/assets/Leaders-BHmJx_f-.js","/assets/Lightbox-BG9JoayR.js","/assets/LiveOverview-BeS9uVB0.js","/assets/Login-DcnQHuUt.js","/assets/NotFound--SlkAgRZ.js","/assets/Notifications-DDG8Xh6E.js","/assets/Overview-DMnT7RfX.js","/assets/Pagination-DP9lIEnX.js","/assets/PerenaladkaFactTable-BqIXmFTL.js","/assets/PersonCard-cdckE_Er.js","/assets/PlanFulfillment-s_-qZDU3.js","/assets/Production-Bn8Gk9uB.js","/assets/Profile-CWVgZLWR.js","/assets/ProofCamera-C3MuWvJV.js","/assets/ProofPhoto-DNswF1_1.js","/assets/Quality-B0LLFbG_.js","/assets/RawRows-DA7i9kFT.js","/assets/RequestStateChip-Dk3kPCMJ.js","/assets/RichTextEditor-B-JToyYm.js","/assets/SaveState-B9kNM0LI.js","/assets/SearchInput-R1wLpLhy.js","/assets/SeasonalityHeatmap-CRHnwmug.js","/assets/SegmentedToggle-DN0LI2V9.js","/assets/SetupTimes-DjoMqaKC.js","/assets/ShiftDaily-69NsV5Vr.js","/assets/Staff-CaaRUQlt.js","/assets/StaffLive-BWY0U990.js","/assets/StatusBadge-GnrWFnJE.js","/assets/TargetGoal-DsIgDN_0.js","/assets/Targets-4Y2FSMvp.js","/assets/Tasks-BAMUCKvY.js","/assets/TimeWheelPicker-Bhi484_H.js","/assets/Toast-5e0r6Kgo.js","/assets/Tooltip-BnP1HvYG.js","/assets/TrendChart-Dv77ugbN.js","/assets/TripleSpeedometer-bri6um4Z.js","/assets/Trudoyomkost-DGtN2tDL.js","/assets/Turnover-BChIk3iT.js","/assets/UploadDropzone-ByY5f7GX.js","/assets/UsersActivity-BU5PICmS.js","/assets/VerdictBlock-DOXxFIOC.js","/assets/VfxApiMap-B7AWV2VA.js","/assets/VfxDictionaries-DBLnPH9N.js","/assets/VfxEmployees-CWBVsPDs.js","/assets/VfxHrMoves-D2z93fZ6.js","/assets/VfxJobs-GISRzG6d.js","/assets/VfxPhoto-Dart5n46.js","/assets/VfxShifts-mlUshTWv.js","/assets/VfxState-Dpqj1l9K.js","/assets/VfxTimebooks-DxRekcKv.js","/assets/VfxTimesheet-BU2AXDlB.js","/assets/WatchProgress-TQCc7dy0.js","/assets/WebLogin-BjcqTO67.js","/assets/WorkerConcerns-ytA3tBAd.js","/assets/Workers-r6UQWAjJ.js","/assets/Zagruzka-DeZ-ATTx.js","/assets/ZagruzkaCell-C5_47zk5.js","/assets/api-DBZSlfJJ.js","/assets/archive-D0vIvGq7.js","/assets/archive-restore-67XSzWZm.js","/assets/arrow-down-XbVgtPI2.js","/assets/arrow-left-BxJ-P9EC.js","/assets/arrow-up-BGxgWREg.js","/assets/arrow-up-narrow-wide-BkJt4HVA.js","/assets/arrow-up-right-BoSDjekt.js","/assets/award-DCS8f5pk.js","/assets/ban-CGuzqwE5.js","/assets/book-open-DjsiBPdB.js","/assets/bot-D9F1Q5Ot.js","/assets/boxes-CZJCYTqC.js","/assets/braces-tW3TJnKf.js","/assets/brigadirFilters-CVLJVupb.js","/assets/broadcastTree-C_9SXgDP.js","/assets/building-2-DeyiPTFQ.js","/assets/calculator-Bi7yTXsy.js","/assets/calendar-DV5z1DMB.js","/assets/calendar-days-BI5yHHz5.js","/assets/camera-CCEeDP1m.js","/assets/categories-Bat5q6pd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_D4dHpw2.js","/assets/chart-line-DMkPbzr3.js","/assets/chart-pie-jJHbmzOZ.js","/assets/chartRange-mVT1QQvK.js","/assets/check-check-De_sYlky.js","/assets/chevron-left-COMDNAME.js","/assets/chevrons-up-down-ko8vYzDO.js","/assets/circle-alert-qWWlHYCP.js","/assets/circle-check-big-DLsuvkge.js","/assets/circle-dashed-BOK0WUKr.js","/assets/circle-minus-DogzZAeU.js","/assets/circle-question-mark-BUcc34YN.js","/assets/circle-slash-Cl3h00Ls.js","/assets/circle-user-round-C41I6uIb.js","/assets/circle-wuIcjkHf.js","/assets/clock-3-Cu9LDkn7.js","/assets/cloud-off-y9Ovl3tM.js","/assets/cloud-upload-C4Gmj5Q5.js","/assets/compass-8KNTn2BH.js","/assets/concernCategories-DRSLuair.js","/assets/copy-DU0D2ZLc.js","/assets/corner-down-right-Fq8mkegM.js","/assets/createLucideIcon-CtGfDnI0.js","/assets/es-CilyUS8N.js","/assets/exportXlsx-BZcJCBN9.js","/assets/external-link-DLz2XN-F.js","/assets/file-clock-1VO7xzlz.js","/assets/file-exclamation-point-DQ8u2d4H.js","/assets/file-spreadsheet-BjdKbX_M.js","/assets/file-text-BeDjYr0h.js","/assets/flag-DWyzlj3I.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CVaD7Flv.js","/assets/hash-CPp4Bv2g.js","/assets/history-YEXvgSPb.js","/assets/hourglass-SgYEe01m.js","/assets/image-B4rLpchw.js","/assets/image-off-CTRFHKXG.js","/assets/inbox-DwZzIzN-.js","/assets/index-BNcozFKG.js","/assets/index-BarTLmz_.css","/assets/key-round-B010A1iX.js","/assets/keyboard-Bbg7SfHT.js","/assets/languages-DwgI9aTQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-GoS57a5B.js","/assets/lightbulb-0qvc9xJd.js","/assets/link-2-dcFYkQH7.js","/assets/link-2-off-Crr2eQJl.js","/assets/list-ordered-C055FzMP.js","/assets/list-tree-BWmju24g.js","/assets/lock-open-DpmdjNta.js","/assets/log-in-DkMpGlAn.js","/assets/maximize-2--Q8X_dJJ.js","/assets/message-square-BCgRUgra.js","/assets/minimize-2-DvHVrH5M.js","/assets/package-check-DwclDF_j.js","/assets/paperclip-B4blvkNp.js","/assets/pencil-Dy6u_sUr.js","/assets/percent-Cl9oXMgn.js","/assets/pin-UXf-cgmZ.js","/assets/pin-off-Dh7z1hUJ.js","/assets/play-ch-epVr7.js","/assets/plug-zap-DEUyD144.js","/assets/presentation-D2i479Ov.js","/assets/prop-types-CMlDnEL7.js","/assets/radio-DWYTi9Tt.js","/assets/react-apexcharts.esm-BUHhkmSK.js","/assets/registers-jAEJSbT5.js","/assets/repeat-CWWeWvNg.js","/assets/rotate-ccw-a8Abqy2L.js","/assets/rotate-cw-b88ldwDJ.js","/assets/save-CzR2AXkV.js","/assets/scopeLinks-rtkh9oKz.js","/assets/scroll-text-BMSkUvAr.js","/assets/search-x-k0jWVS5r.js","/assets/segments-7_CtDRST.js","/assets/send-DNZXEeMG.js","/assets/settings-2-D7evokr6.js","/assets/shield-Bao64DJD.js","/assets/shield-alert-DNnlBx8u.js","/assets/shield-check-BJ3C5JKM.js","/assets/shield-question-mark-BePLhhh-.js","/assets/siren-DXt2AP4k.js","/assets/snowflake-rU5oDYXJ.js","/assets/split-BI3CZhmZ.js","/assets/square-Cq9NcK5V.js","/assets/square-check-big-Cf8ZH-XH.js","/assets/star-xuHGi4un.js","/assets/statusBands-CYTE-625.js","/assets/store-h6HZccTu.js","/assets/table-2-Bz6YTqnD.js","/assets/table-properties-BC7Oe-_E.js","/assets/tag-Cgn4oMf2.js","/assets/timer-off-D0R9KEyF.js","/assets/trending-down-BeKNTLm6.js","/assets/trending-up-BQjhKYGK.js","/assets/undo-2-bCwASif3.js","/assets/useChartTheme-B6Ban_Yq.js","/assets/useElementWidth-BekEJeTq.js","/assets/useIsMobile-h7qdhlad.js","/assets/useOpenParam-Mnpi4mLc.js","/assets/useStatusBands-C8kDuUdY.js","/assets/useUrlScope-mFJ2DVRo.js","/assets/user-BFLcR5Ws.js","/assets/user-cog-B3Lxagju.js","/assets/users-Bwq8ygpS.js","/assets/vfx-CDmZDINg.js","/assets/video-CO-hr58K.js","/assets/wallet-CAL7gLt-.js","/assets/warehouse-IXD9noJb.js","/assets/x-D9_x_8k-.js","/assets/zap-CqJgGNNa.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
