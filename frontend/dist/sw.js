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

const BUILD = "2026-09-28T14:08:29.982Z";
const PRECACHE = ["/","/assets/AdminPanel-BC7bHjYs.js","/assets/AnalysisBoard-yzkPFnTw.js","/assets/Arc-CIdUJQ-0.js","/assets/ArcLegacy-DTx2CND6.js","/assets/AttendanceModal-uINCVltX.js","/assets/BrigadirProfile-S13J0CJY.js","/assets/BroadcastReceivers-DaWZvlqd.js","/assets/BroadcastRecord-mylp1ND2.js","/assets/CatLockNotice-BxO7zai3.js","/assets/CategoryLegendModal--KKx62f1.js","/assets/CellConcerns-9cKSLk82.js","/assets/CellDetails-vdRniHC5.js","/assets/CellFormModal-BiRZijv-.js","/assets/CellLink-CQ8xlF41.js","/assets/Cells-4Lq9x6JZ.js","/assets/ColumnFilter-Ch7i7t0j.js","/assets/ColumnsPicker-BQ5__bok.js","/assets/CommentsModal-77xQkrPT.js","/assets/ComparisonTable-wBW4YQq5.js","/assets/Concerns-CvI_AFYK.js","/assets/ConfirmDialog-C4sUSS_Q.js","/assets/Daily-5sT3koSi.js","/assets/DataTable-CvZOLovb.js","/assets/DateRangePicker-DWPifDxE.js","/assets/DayReportView-BQyBxD5f.js","/assets/DayStepper-BUSh0cw4.js","/assets/DifferenceBreakdown-CnCdva3R.js","/assets/Downtime-C9SHESwK.js","/assets/Education-DfM1Creq.js","/assets/EducationLesson-Her8DAlU.js","/assets/EmptyState-CQhAU_9w.js","/assets/Exam-Ct5aJQmQ.js","/assets/FactorySelect-B4cD4KSE.js","/assets/Gamification-DDLsOQL-.js","/assets/GroupBadge-D2wBNHyP.js","/assets/HeatmapChart-Dii81zkg.js","/assets/IdleCell-CDF96k3N.js","/assets/KPICard-DvpxDdp3.js","/assets/Kaizen-CTwsI2gs.js","/assets/KpiDeltaCard-BtlouoOz.js","/assets/LangTextInput-C_SL6jLT.js","/assets/Layout-BxANbyXI.js","/assets/LeaderAppeal-VpIpbCLu.js","/assets/LeaderDayReport-BTRpIA1n.js","/assets/LeaderUnitReport-EXkFAgGO.js","/assets/Leaderboard-ZvRt0_iq.js","/assets/Leaders-2XzHQFw0.js","/assets/Lightbox-xmsnXuv2.js","/assets/LiveOverview-CjLsS9ME.js","/assets/Login-DWIqo46S.js","/assets/NotFound-B9434rKp.js","/assets/Overview-C_14sUO-.js","/assets/Pagination-ET7uzllY.js","/assets/PerenaladkaFactTable-ClsD12IU.js","/assets/PlanFulfillment-5KfMVmRs.js","/assets/Production--6OqhTDm.js","/assets/Profile-CiDBi7JP.js","/assets/ProofCamera-Dz8F46lv.js","/assets/ProofPhoto-aMOh53cv.js","/assets/Quality-C1aSFwd0.js","/assets/RequestStateChip-Dn0vg927.js","/assets/RichTextEditor-91zGqtNg.js","/assets/SaveState-D3oDdude.js","/assets/SearchInput-Ce1OCMTY.js","/assets/SeasonalityHeatmap-B5GP2cGc.js","/assets/SegmentedToggle-CQNFj3NT.js","/assets/SetupTimes-Dso2-EQ7.js","/assets/ShiftDaily-CebZSuGx.js","/assets/Staff-Bi2zV7Rc.js","/assets/StatusBadge-B2Omlaor.js","/assets/TargetGoal-CtT1V6-e.js","/assets/Targets-gFYlXXmJ.js","/assets/Tasks-4F0ivaCv.js","/assets/TimeWheelPicker-CEmbMCRu.js","/assets/Tooltip-KGImZpka.js","/assets/TrendChart-Cixw_ppw.js","/assets/TripleSpeedometer-BqlPnWAT.js","/assets/Trudoyomkost-BPfWQHJ2.js","/assets/UsersActivity-D-PLecpi.js","/assets/WatchProgress-BFMTZOIe.js","/assets/WebLogin-rAfmc2o_.js","/assets/WorkerConcerns-Bl-_dV4J.js","/assets/Workers-MclCnSSx.js","/assets/Zagruzka-YtD8LIJ2.js","/assets/ZagruzkaCell-BeLEeKcT.js","/assets/alarm-clock-0V7LUuji.js","/assets/api-Da0sMIcH.js","/assets/archive-DGZcovMM.js","/assets/archive-restore-qxqGM0Js.js","/assets/arrow-down-CdspLj83.js","/assets/arrow-left-B0IG1v7Y.js","/assets/arrow-left-right-1CEaNyM3.js","/assets/arrow-up-oo6B7m8J.js","/assets/arrow-up-right-BIj29Dls.js","/assets/award-S4_EA_Zz.js","/assets/ban-DPIBOikh.js","/assets/bot-DmV1I4uJ.js","/assets/boxes-7oWDstQH.js","/assets/brigadirFilters-DX4Mt-h_.js","/assets/broadcastTree-VBK3YhVG.js","/assets/building-2-CVlFV9qK.js","/assets/calendar-DxydWn5A.js","/assets/calendar-clock-QZ_Fed0o.js","/assets/calendar-days-nDNtpNb1.js","/assets/calendar-range-U_Bbvj4h.js","/assets/camera-Dhhyrkv3.js","/assets/categories-BHVINOpB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Be38r5Hg.js","/assets/chart-line-9RBL0upY.js","/assets/chart-pie-dss92bPB.js","/assets/chartRange-BaEHx2yW.js","/assets/chevron-left-Ck300RbJ.js","/assets/chevrons-up-down-x7DgTHSY.js","/assets/circle-check-big-DrqvyVMS.js","/assets/circle-dot-DYPJy94c.js","/assets/circle-minus-DLD4TwVi.js","/assets/circle-slash-LrblOBec.js","/assets/circle-user-round-IGcODzy2.js","/assets/cloud-off-CD6Kz-w8.js","/assets/cloud-upload-CUHDs9sa.js","/assets/compass-DhMBZffS.js","/assets/concernCategories-DireDFeX.js","/assets/copy-BwlYT4kK.js","/assets/corner-down-right-D70U0sJU.js","/assets/createLucideIcon-o0FZT6vD.js","/assets/es-CkscihNC.js","/assets/exportXlsx-BmkFeOuG.js","/assets/external-link-4IYsaKbW.js","/assets/file-clock-DQO52jqU.js","/assets/file-exclamation-point-DWwzANVJ.js","/assets/file-spreadsheet-DCRzGm7m.js","/assets/file-text-BxbvEFmX.js","/assets/flag-DwSFwbBq.js","/assets/flame-CLtcTFcN.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CG-HP9zZ.js","/assets/hash-CxOOqSg8.js","/assets/history-CwlxndCi.js","/assets/hourglass-PCHUMKDu.js","/assets/image-CQ2hfGWb.js","/assets/image-off-Bn0eFzo0.js","/assets/index-Cie8aUNi.js","/assets/index-TBzEnSGJ.css","/assets/key-round-D3N8Onct.js","/assets/keyboard-3PtJ1Xdf.js","/assets/languages-D-Y9NPmj.js","/assets/layers-B_vUok0V.js","/assets/leaderReason-51T9PVwt.js","/assets/lightbulb-NETLFjbG.js","/assets/link-2-DeFN2O3f.js","/assets/list-checks-B7d17BrS.js","/assets/list-ordered-DkUZOphW.js","/assets/list-tree-C8yuxjJE.js","/assets/lock-open-cVvOIyWI.js","/assets/log-in-R9WXB1DA.js","/assets/message-square-BnMrkB7x.js","/assets/minimize-2-Cti_FEqO.js","/assets/package-check-Dh0RjB9_.js","/assets/paperclip-CRgMZrf5.js","/assets/pencil-CqR8c1U-.js","/assets/personName-B4KId4zS.js","/assets/pin-DQI4kPsg.js","/assets/pin-off-CUSqkvBi.js","/assets/play-Bv2Wt2rC.js","/assets/presentation-DV2dpBUF.js","/assets/prop-types-DKZB-l_8.js","/assets/radio-Dt7POcw6.js","/assets/react-apexcharts.esm-CH0kDBDC.js","/assets/repeat-CtLMocrX.js","/assets/rotate-ccw-C-nxkGsT.js","/assets/rotate-cw-CCOfEn03.js","/assets/save-BIgYmvCe.js","/assets/scale-Bsp8eUFs.js","/assets/scroll-text-CP0M-6Nr.js","/assets/search-x-U7dPW_GD.js","/assets/segments-B3jIg719.js","/assets/send-QLbi96ML.js","/assets/settings-2-C1hpw_7Q.js","/assets/shield-DKV7qDsV.js","/assets/shield-alert-BGLi_81A.js","/assets/shield-check-DVmBvsyp.js","/assets/shield-question-mark-S3zaacMZ.js","/assets/siren-BRmWzEIf.js","/assets/smartphone-B4S9ZV3O.js","/assets/snowflake-CSj1W54S.js","/assets/square-DLjpnzZK.js","/assets/square-check-big-mP1iXrYd.js","/assets/star-C5gVbKQ9.js","/assets/statusBands-DFQTOdIq.js","/assets/store-rDP6Ic5n.js","/assets/table-2-D-ZBjNiE.js","/assets/tag-giYUK8K1.js","/assets/trending-down-CalgcWTg.js","/assets/trending-up-BdsLpiBg.js","/assets/undo-2-BBtHACt_.js","/assets/useChartTheme-DJVj5AHd.js","/assets/useElementWidth-DP9-Owis.js","/assets/useIsMobile-CR6JZ7lD.js","/assets/useMutation-K2Otro9G.js","/assets/useStatusBands-CZTFv6Gg.js","/assets/user-GCW39yAv.js","/assets/user-check-TQ4D32XU.js","/assets/user-cog-BZDlEtKR.js","/assets/user-minus-Dn6QTyOE.js","/assets/users-CKD3YLFu.js","/assets/verifyState-OxLqJEbT.js","/assets/video-CKtg3Rv4.js","/assets/wallet-CdJ4rYMJ.js","/assets/warehouse-TgI7bHTI.js","/assets/zap-B_hSpU-j.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
