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

const BUILD = "2026-10-04T12:09:59.270Z";
const PRECACHE = ["/","/assets/AdminPanel-YxMWJ3et.js","/assets/AnalysisBoard-Cs1DUeN7.js","/assets/Arc-CH0vqsfK.js","/assets/ArcLegacy-Beyy2lR-.js","/assets/BrigadirProfile-DLTUfqk_.js","/assets/BroadcastReceivers-DSF3i2OP.js","/assets/BroadcastRecord-B9Wjrh6f.js","/assets/CatLockNotice-BS_CDz-I.js","/assets/CategoryLegendModal-LPfA-6tL.js","/assets/CellConcerns-DzhbtJDO.js","/assets/CellDetails-C5zaK1pX.js","/assets/CellFormModal-DO8zqzgw.js","/assets/CellIdent-BHcxzzrk.js","/assets/CellLink-DKmsH27Z.js","/assets/Cells-B3xxhPR1.js","/assets/ColumnFilter-BSdwdCgo.js","/assets/ColumnsPicker-BcHZyEee.js","/assets/CommentsModal-C-8iV2Ua.js","/assets/ComparisonTable-BjlvuKGT.js","/assets/Concerns-5LjtWB19.js","/assets/ConfirmDialog-DNvRS5Da.js","/assets/Daily-ZscW7gq2.js","/assets/DataTable-dj7qAJGh.js","/assets/DateRangePicker-CMWmYj3S.js","/assets/DayReportView-Vbuu7ORY.js","/assets/DayStepper-BOxerLVO.js","/assets/DifferenceBreakdown-CfbUAFY-.js","/assets/Downtime-DDPmefPg.js","/assets/Education-C8swkKn9.js","/assets/EducationLesson-BbZ7TrYh.js","/assets/EmptyState-Cmantyyu.js","/assets/Exam-ZgmQ83wh.js","/assets/FactorySelect-ClHG5Lry.js","/assets/Gamification-D6uCMhmp.js","/assets/GroupBadge-BqDvugz_.js","/assets/HeatmapChart-CemviQiI.js","/assets/IdleCell-BMJ0DN1q.js","/assets/KPICard-Bg22X_jZ.js","/assets/Kaizen-xmm5zaHM.js","/assets/Kelish-BKG7yIj5.js","/assets/KpiDeltaCard-BpV_PNA9.js","/assets/LangTextInput-Dx2ujnLm.js","/assets/Layout-C-cOeFYC.js","/assets/LeaderAppeal-D0pVPMrT.js","/assets/LeaderDayReport-CAcM8njU.js","/assets/LeaderUnitReport-CE_p86PT.js","/assets/Leaderboard-C9bz2125.js","/assets/Leaders-BeHYWr8S.js","/assets/Lightbox-DDix3fQc.js","/assets/LiveOverview-DFNh5hsG.js","/assets/Login-CH64IVb8.js","/assets/NotFound-gjULXIU9.js","/assets/Notifications-BJo5trer.js","/assets/Overview-FDYvOMic.js","/assets/Pagination-Cx_1jMK5.js","/assets/PerenaladkaFactTable-2GSRYuap.js","/assets/PersonCard-BBpyY0X6.js","/assets/PlanFulfillment-B2v7XfG-.js","/assets/Production-BmtkLxba.js","/assets/Profile-CMBbE-ft.js","/assets/ProofCamera-r0cZ1Eo4.js","/assets/ProofPhoto-lOKYFuFf.js","/assets/Quality-Bk3XXqda.js","/assets/RawRows-DzlEV1ww.js","/assets/RequestStateChip-BNSfMChu.js","/assets/RichTextEditor-D04iroI3.js","/assets/SaveState-b9lFy2sz.js","/assets/SearchInput-PmVKyj4i.js","/assets/SeasonalityHeatmap-D5T8zJgq.js","/assets/SegmentedToggle-BpDloRr4.js","/assets/SetupTimes-DrW-ddU5.js","/assets/ShiftDaily-DMeY0egE.js","/assets/Staff-4qfSNJea.js","/assets/StaffLive-BVowZKs8.js","/assets/StatusBadge-DYKY0xlO.js","/assets/TargetGoal-CWrETCKl.js","/assets/Targets-zTHDjz3b.js","/assets/Tasks-0NvihkGS.js","/assets/TimeWheelPicker-C_-gcMWS.js","/assets/Toast-Dj6L5y7h.js","/assets/Tooltip-CQXoGeDI.js","/assets/TrendChart-BCGuA0pF.js","/assets/TripleSpeedometer-CI9M-IgM.js","/assets/Trudoyomkost-N9nlhqqK.js","/assets/UploadDropzone-DpMbpJH4.js","/assets/UsersActivity-CTSbnZEc.js","/assets/VerdictBlock-D_Okn86I.js","/assets/VfxApiMap-C_4jNkF-.js","/assets/VfxDictionaries-DrC3TJGT.js","/assets/VfxEmployees-BSUQxW6D.js","/assets/VfxHrMoves-BqZfwP1D.js","/assets/VfxJobs-BVM5tVUZ.js","/assets/VfxPhoto-BS5fdRmr.js","/assets/VfxShifts-36cV7nOl.js","/assets/VfxState-DxuG5m0n.js","/assets/VfxTimebooks-B_MwbqNU.js","/assets/VfxTimesheet-DEm_Hsti.js","/assets/WatchProgress-BGZhf5Fv.js","/assets/WebLogin-mPgDonhv.js","/assets/WorkerConcerns-DVOynafg.js","/assets/Workers-HAxEgunw.js","/assets/Zagruzka-CeHoGyNk.js","/assets/ZagruzkaCell-BzY9uZBX.js","/assets/api-DHVbyx0K.js","/assets/archive-B8FaGFEz.js","/assets/archive-restore-j1TEDY3Q.js","/assets/arrow-down-D-re3n-t.js","/assets/arrow-left-BMmuEQln.js","/assets/arrow-up-Cev3UpiW.js","/assets/arrow-up-narrow-wide-AtRNSLSt.js","/assets/arrow-up-right-QHyap5vt.js","/assets/award-DFI6LATe.js","/assets/ban-DVODbJmp.js","/assets/bot-CsxRz7IH.js","/assets/boxes-DiTc2Cwl.js","/assets/braces-ANFaCMdG.js","/assets/brigadirFilters-CLmPaCbk.js","/assets/broadcastTree-Dm4L6hzW.js","/assets/building-2-DSrXE6qu.js","/assets/calendar-CAer5t1o.js","/assets/calendar-days-U8bUJzIZ.js","/assets/camera-DUmSDokU.js","/assets/categories-ZBnUPve9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BXF8nNyW.js","/assets/chart-line-BavuMjLb.js","/assets/chart-pie-D6PLfVel.js","/assets/chartRange-CAdZX7SZ.js","/assets/check-check-Cjo9LkpW.js","/assets/chevron-left-CgB6qIsz.js","/assets/chevrons-up-down-Dw9ev_lD.js","/assets/circle-OltpYuaT.js","/assets/circle-alert-CP4POXAK.js","/assets/circle-check-big-DXQ7W2rB.js","/assets/circle-dashed-DLJV0dTp.js","/assets/circle-minus-DM2E6Keg.js","/assets/circle-question-mark-zuatmmIF.js","/assets/circle-slash-By8OKoXv.js","/assets/circle-user-round-C4BGWP8d.js","/assets/clock-3-C92rFjfD.js","/assets/cloud-off-RAP75gcu.js","/assets/cloud-upload-eR_ZPbrX.js","/assets/compass-CN_q2Qgf.js","/assets/concernCategories-CLDxiMlh.js","/assets/copy-DV0vak6P.js","/assets/corner-down-right-D4uJp8a2.js","/assets/createLucideIcon-By8eXoIJ.js","/assets/es-BTZKmHSB.js","/assets/exportXlsx-_gaQbuUu.js","/assets/external-link-DNOT1-Pn.js","/assets/file-clock-nKwBJ7Zl.js","/assets/file-exclamation-point-P-ugwLGZ.js","/assets/file-spreadsheet-BUKrdkvG.js","/assets/file-text-C8nE2KFe.js","/assets/flag-DBDES5Oo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BkSaWxzV.js","/assets/hash-D-i2o2Hm.js","/assets/history-QIKu-trv.js","/assets/hourglass-BU3D3FA_.js","/assets/image-0Dtou9WU.js","/assets/image-off-Bsog1gN7.js","/assets/inbox-CF-LsZSN.js","/assets/index-Cpmz-01N.css","/assets/index-NgQd5Iq2.js","/assets/key-round-DP19yEX9.js","/assets/keyboard-DCRU-AQI.js","/assets/languages-B89R9WcU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-F6Y7SFYM.js","/assets/lightbulb-BFUmwr-q.js","/assets/link-2-B960NGwH.js","/assets/link-2-off-CDM-eEF2.js","/assets/list-ordered-Dj8a9QBB.js","/assets/list-tree-DgbfKeT3.js","/assets/lock-open-DcQpXv6i.js","/assets/log-in-Ck4hnIXN.js","/assets/maximize-2-BZkQgpZd.js","/assets/message-square-r7y-pbba.js","/assets/minimize-2-B7157A3W.js","/assets/package-check-Cp-6INaO.js","/assets/paperclip-BfkrmGkq.js","/assets/pencil-gEnRqaxd.js","/assets/percent-DANtr0OK.js","/assets/pin-D2v0q5-W.js","/assets/pin-off-4_a8IsGR.js","/assets/play-Dg5Eqi0o.js","/assets/plug-zap-GE4Psk15.js","/assets/presentation-DtKipDK-.js","/assets/prop-types-DjONdSTC.js","/assets/radio-DApIskMP.js","/assets/react-apexcharts.esm-Dk4wcbqT.js","/assets/registers-Dq4pSAu9.js","/assets/repeat-DiIWn2UH.js","/assets/rotate-ccw-OjFsTczc.js","/assets/rotate-cw-C2wMeCiU.js","/assets/save-CWDvTsLi.js","/assets/scopeLinks-DXh5MMJO.js","/assets/scroll-text-C6BYo0Ll.js","/assets/search-x-DIKy0J5M.js","/assets/segments-D-H2jpBJ.js","/assets/send-BqC8vApI.js","/assets/settings-2-CwYH7kcf.js","/assets/shield-BFfuCSm5.js","/assets/shield-alert-YTo98rIQ.js","/assets/shield-check-VKICtX7P.js","/assets/shield-question-mark-TzyXkAEF.js","/assets/siren-CwcX9fOL.js","/assets/snowflake-DBzz4l4K.js","/assets/split-BohK7Adc.js","/assets/square-WPupa9Nd.js","/assets/square-check-big-C_zG2Idk.js","/assets/star-BUo2xe7Q.js","/assets/statusBands-DD5If3mF.js","/assets/store-f7Deo8Dv.js","/assets/table-2-DTmX1jB4.js","/assets/table-properties-BqKHRpwa.js","/assets/tag-CuikVf_A.js","/assets/timer-off-DlAA8gNq.js","/assets/trending-down-CDb0Rd-U.js","/assets/trending-up-CkTfJYFn.js","/assets/undo-2-Bni22D_z.js","/assets/useChartTheme-0O0a4GHM.js","/assets/useElementWidth-6P-_fby9.js","/assets/useIsMobile-Cm2AlA7b.js","/assets/useOpenParam-CiCvi0eu.js","/assets/useStatusBands-Z5Y39NTl.js","/assets/useUrlScope-DwJdhuLF.js","/assets/user-Dv7ZWVdK.js","/assets/user-cog-rTdyOIWa.js","/assets/user-minus-DrdEi6--.js","/assets/users-BjNJV8vg.js","/assets/video-CORBdJUP.js","/assets/wallet-BsLgeeu9.js","/assets/warehouse-DkpNvrA4.js","/assets/x-CEy6FLmo.js","/assets/zap-AjgC1FRE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
