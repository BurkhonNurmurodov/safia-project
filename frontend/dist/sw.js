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

const BUILD = "2026-10-03T10:57:52.157Z";
const PRECACHE = ["/","/assets/AdminPanel-0VWxDkF9.js","/assets/AnalysisBoard-CtXFNXFR.js","/assets/Arc-StRTG3Kv.js","/assets/ArcLegacy-CU0PUv57.js","/assets/BrigadirProfile-CjMhpi9w.js","/assets/BroadcastReceivers-D0CKMMB4.js","/assets/BroadcastRecord-D-NKcjWR.js","/assets/CatLockNotice-CthzkQ-e.js","/assets/CategoryLegendModal-N9oSdqfA.js","/assets/CellConcerns-DtCB3_7R.js","/assets/CellDetails-B9qu8a3F.js","/assets/CellFormModal-C4vRdotG.js","/assets/CellIdent-BVQjAh7l.js","/assets/CellLink-D3ivtCv_.js","/assets/Cells-DXvMQvWT.js","/assets/ColumnFilter-DXrk_bnc.js","/assets/ColumnsPicker-Dba4iHdx.js","/assets/CommentsModal-jcTUMGQz.js","/assets/ComparisonTable-BA9R8c2P.js","/assets/Concerns-B0pEpbj_.js","/assets/ConfirmDialog-DknD3ZRt.js","/assets/Daily-CQBsaDqO.js","/assets/DataTable-BZwpSMGc.js","/assets/DateRangePicker-DvkUWanJ.js","/assets/DayReportView-DnlK60Jk.js","/assets/DayStepper-BFrIE75Q.js","/assets/DifferenceBreakdown-TQECXGsr.js","/assets/Downtime-CHjjoto2.js","/assets/Education-C2VwMcGT.js","/assets/EducationLesson-CI_ei45H.js","/assets/EmptyState-CKTp7alW.js","/assets/Exam-CmZoHOWv.js","/assets/FactorySelect-kYmklvSJ.js","/assets/Gamification-CLXFlgRP.js","/assets/GroupBadge-B6Nz_keu.js","/assets/HeatmapChart-ITYkNvzJ.js","/assets/IdleCell-C6PMtmmx.js","/assets/KPICard-CdHXTL8j.js","/assets/Kaizen-vcvZM7N_.js","/assets/Kelish-CrzRCS4p.js","/assets/KpiDeltaCard-BN6m28ni.js","/assets/LangTextInput-CFJUaJ7d.js","/assets/Layout-DEJTxebU.js","/assets/LeaderAppeal-DMsbIaal.js","/assets/LeaderDayReport-DyDPu5pq.js","/assets/LeaderUnitReport-BnHx1ReO.js","/assets/Leaderboard-CKyRHquW.js","/assets/Leaders-DZ-tI5bu.js","/assets/Lightbox-BBzUPDAr.js","/assets/LiveOverview-B2_6EWOL.js","/assets/Login-Wrt_jNaE.js","/assets/NotFound-CExQbRdC.js","/assets/Notifications-CrjZlw1E.js","/assets/Overview-B_2Ed7FU.js","/assets/Pagination-BwAoqIOq.js","/assets/PerenaladkaFactTable-YSCyvExJ.js","/assets/PersonCard-qdQBGTHA.js","/assets/PlanFulfillment-DJuwgZe1.js","/assets/Production-Bu5Eo7o7.js","/assets/Profile-Cvy3whIy.js","/assets/ProofCamera-Cqr2S4zT.js","/assets/ProofPhoto-D6QzhGTY.js","/assets/Quality-DJdcqmWi.js","/assets/RawRows-C07xjAx-.js","/assets/RequestStateChip-BHIau4bR.js","/assets/RichTextEditor-rEEcxVGo.js","/assets/SaveState-Cf6Uqzn-.js","/assets/SearchInput-DqjG3diS.js","/assets/SeasonalityHeatmap-BKSHz6nM.js","/assets/SegmentedToggle-BrWt4bTS.js","/assets/SetupTimes-qRYUgwYJ.js","/assets/ShiftDaily-DGucbjA0.js","/assets/Staff-0NKQkpc8.js","/assets/StaffLive-B9UHcmtO.js","/assets/StatusBadge-CW8ZYRkp.js","/assets/TargetGoal-CPPthokr.js","/assets/Targets-CIRK_QcE.js","/assets/Tasks-CWUSYzG9.js","/assets/TimeWheelPicker-DGGqMEAm.js","/assets/Toast-COhBVVkD.js","/assets/Tooltip-BxeOh5Zo.js","/assets/TrendChart-BHPdOpvQ.js","/assets/TripleSpeedometer-D8FpVhEy.js","/assets/Trudoyomkost-BRZKap1h.js","/assets/UploadDropzone-mu_ea5lH.js","/assets/UsersActivity-JQUjQKS9.js","/assets/VerdictBlock-DOX9QXLs.js","/assets/VfxApiMap-BO88r3Sa.js","/assets/VfxEmployees-BBtSHUFl.js","/assets/VfxJobs-DAcQ0fIE.js","/assets/VfxMarks-BwRtFeCF.js","/assets/VfxOnSite-Bsjc_d9s.js","/assets/VfxPhoto-D7NVqHKs.js","/assets/VfxState-ByxrjFWE.js","/assets/VfxStructure-BYP8wWgI.js","/assets/VfxTable-uIWBjdne.js","/assets/VfxTimesheet-jw_me3o4.js","/assets/WatchProgress-BhSCHiU7.js","/assets/WebLogin-DJqbYibw.js","/assets/WorkerConcerns-CjRUmfWf.js","/assets/Workers-DabU9y3Y.js","/assets/Zagruzka-OMroBs5b.js","/assets/ZagruzkaCell-BE8Zcnbb.js","/assets/api-Bvt3yyrj.js","/assets/archive-DAmHVhyr.js","/assets/archive-restore-B_o3tFo5.js","/assets/arrow-down-BT4TbIpo.js","/assets/arrow-left-B-GIc7o2.js","/assets/arrow-right-left-DeaLEn8Y.js","/assets/arrow-up-BSZY40iQ.js","/assets/arrow-up-narrow-wide-lK93OAi7.js","/assets/arrow-up-right-BZiMLKL4.js","/assets/award--s4LFUaG.js","/assets/ban-HCL2rx7G.js","/assets/bot-BjT5dFHQ.js","/assets/boxes-RTUGnBgb.js","/assets/braces-BwyxRFhC.js","/assets/brigadirFilters-B4vygi1Y.js","/assets/broadcastTree-DNdbmuyX.js","/assets/building-2-C3CXE89b.js","/assets/calendar-DANoH7Zt.js","/assets/calendar-days-BMSmDBYn.js","/assets/camera-DdpGq2DN.js","/assets/categories-DTdbnd4b.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DJUx7YoT.js","/assets/chart-line-CpZRWuha.js","/assets/chart-pie-KLmFhcD1.js","/assets/chartRange-vLKwdvp3.js","/assets/chevron-left-BQ18Fmv9.js","/assets/chevrons-up-down-C-zEazX_.js","/assets/circle-CSFo7PuI.js","/assets/circle-alert-BgwcEj_3.js","/assets/circle-check-big-B3tmEvfD.js","/assets/circle-dashed-BKwsV1Hd.js","/assets/circle-minus-Bxu_3UY0.js","/assets/circle-question-mark-Bw7jIuOe.js","/assets/circle-slash-yJ7LJHQy.js","/assets/circle-user-round-Dq-vnZGO.js","/assets/clock-3-CWiSBP5J.js","/assets/cloud-off-ZoaRSbsc.js","/assets/cloud-upload-CH9rrKG4.js","/assets/compass-IJRsV44V.js","/assets/concernCategories-CEZd5_sv.js","/assets/copy-KzCgDaym.js","/assets/corner-down-right-CGwFr0AP.js","/assets/createLucideIcon-Cvfio92q.js","/assets/door-open-BNZrJt86.js","/assets/es-B4EthPVh.js","/assets/exportXlsx-Uevibzp4.js","/assets/external-link-C6kDc2n4.js","/assets/file-clock-Dr3h5jmV.js","/assets/file-exclamation-point-CO4n6y3K.js","/assets/file-spreadsheet-DPFcD3KO.js","/assets/file-text-DX_fPw-c.js","/assets/flag-Dw8vrQd7.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cq3-0tvU.js","/assets/hash-BgpJvsXn.js","/assets/history-BdmAU4En.js","/assets/hourglass-B7EaBwdJ.js","/assets/image-BBzruD9R.js","/assets/image-off-CjsrftD5.js","/assets/inbox-frpVs3uu.js","/assets/index-BC8icW8H.js","/assets/index-BdiHf17q.css","/assets/key-round-DuVGKbp5.js","/assets/keyboard-D9oh-DT8.js","/assets/languages-CMlsSS-9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BV0fQjuO.js","/assets/lightbulb-gTbBcAYk.js","/assets/link-2-34YJxZsn.js","/assets/link-2-off-DMm3EBZH.js","/assets/list-ordered-DD6YPOFB.js","/assets/list-tree-B7JcykoQ.js","/assets/lock-open-Huofw2hC.js","/assets/log-in-C4F_WDlh.js","/assets/maximize-2-BIiRhdmn.js","/assets/message-square-DPXVDXxG.js","/assets/minimize-2-BTHajeni.js","/assets/package-check-BkQ8i0X9.js","/assets/paperclip-QA2nalQb.js","/assets/pencil-C4hfoX6i.js","/assets/percent-D-H012z7.js","/assets/phone-CjUg5m9r.js","/assets/pin-CR8DYkWF.js","/assets/pin-off-CzE1gM4d.js","/assets/play-GY2LL5yN.js","/assets/plug-zap-DpzFRcJD.js","/assets/presentation-BIBsNKVw.js","/assets/prop-types-hGwBMStz.js","/assets/radio-xWrYVNM6.js","/assets/react-apexcharts.esm-Dn6_cg2b.js","/assets/repeat-DodPU80Y.js","/assets/rotate-ccw-B_g8BMH3.js","/assets/rotate-cw-CkHZ0gTk.js","/assets/save-Bk-d1Qt2.js","/assets/scopeLinks-DBF3FxjY.js","/assets/scroll-text-BEIIWkg8.js","/assets/search-x-BI-olrWi.js","/assets/segments-BjnnHdQs.js","/assets/send-CFQNbdl4.js","/assets/settings-2-w0ADhhAw.js","/assets/shield-Ck8zKb1B.js","/assets/shield-alert-DePXStyv.js","/assets/shield-check-Dc2E9aJR.js","/assets/shield-question-mark-C6UcSR2f.js","/assets/siren-BopBY7gJ.js","/assets/snowflake-C8AWjkLO.js","/assets/split-D60O1QtX.js","/assets/square-ClphkmjU.js","/assets/square-check-big-CAefexOt.js","/assets/star-Vmxo6T1C.js","/assets/statusBands-4r4S6UDM.js","/assets/store-BmRtpJmn.js","/assets/table-2-bDGLsaUz.js","/assets/table-properties-D9nFMTHQ.js","/assets/tag-DxJnxzJS.js","/assets/timer-off-DqKIyMH9.js","/assets/trending-down-DedjcmKO.js","/assets/trending-up-BGvoags0.js","/assets/undo-2-DpEcUKNJ.js","/assets/useChartTheme-Cp01v_3n.js","/assets/useElementWidth-DCFTQZW9.js","/assets/useIsMobile-Dap7HFxn.js","/assets/useOpenParam-BLFc9zy-.js","/assets/useStatusBands-ytQmenKa.js","/assets/useUrlScope-Cs1hJW3u.js","/assets/user-Bp3-dAtC.js","/assets/user-cog-FAxLJjAq.js","/assets/user-minus-DzSHXCap.js","/assets/users-BGePfcO0.js","/assets/video-C3vPWKUp.js","/assets/wallet-TJ2GnWxP.js","/assets/warehouse-BCjGIrW2.js","/assets/x-Cpfejd0a.js","/assets/zap-BuK8ePCL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
