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

const BUILD = "2026-10-04T19:20:32.431Z";
const PRECACHE = ["/","/assets/AdminPanel-BX21iwVX.js","/assets/AnalysisBoard-BYAtUG4p.js","/assets/Arc-B1___Dn5.js","/assets/ArcLegacy-tiLBDXQx.js","/assets/BrigadirProfile-CIq8qVhY.js","/assets/BroadcastReceivers-DVhwXRCy.js","/assets/BroadcastRecord-CZ_MNScF.js","/assets/CatLockNotice-lI9_s6-N.js","/assets/CategoryLegendModal--9v4NzMz.js","/assets/CellConcerns-C89dAHOH.js","/assets/CellDetails-C1Xj-x8X.js","/assets/CellFormModal-CthgF7i4.js","/assets/CellIdent-B-i2IaWH.js","/assets/CellLink-BrrDrxPM.js","/assets/Cells-DXmoN-DL.js","/assets/ColumnFilter-mZU_gdMM.js","/assets/ColumnsPicker-BlL_n8ki.js","/assets/CommentsModal-BQajePmZ.js","/assets/ComparisonTable-F1VHPdM4.js","/assets/Concerns-CKrhfraG.js","/assets/ConfirmDialog-BU8_Tpdb.js","/assets/Daily-BonZyNCC.js","/assets/DataTable-s7ghnPsL.js","/assets/DateRangePicker-MokcBrfA.js","/assets/DayReportView-BUDyla6G.js","/assets/DayStepper-Brdo2QXf.js","/assets/DifferenceBreakdown-C1d269qk.js","/assets/Downtime-fcYxEmsq.js","/assets/Education-DAlLVNqi.js","/assets/EducationLesson-BPzKsYE2.js","/assets/EmptyState-CQ-xdEXC.js","/assets/Exam-CEmGMyNu.js","/assets/FactorySelect-DP3ZPL8C.js","/assets/Gamification-DKxfpGQe.js","/assets/GroupBadge-CfxzGx1h.js","/assets/HeatmapChart-CU9OrlGg.js","/assets/IdleCell-C9CrFTLB.js","/assets/KPICard-CXCi1qT5.js","/assets/Kaizen-D_g6iWIV.js","/assets/Kelish-B8L-GLrF.js","/assets/KpiDeltaCard-TWYIXQfo.js","/assets/LangTextInput-C6A_XS1v.js","/assets/Layout-Cz88w4WZ.js","/assets/LeaderAppeal-DCRVoUHr.js","/assets/LeaderDayReport-90SiypU_.js","/assets/LeaderUnitReport-jqocYmdP.js","/assets/Leaderboard-FMw-x9XF.js","/assets/Leaders-BqKM2Puj.js","/assets/Lightbox-bCwTb79s.js","/assets/LiveOverview-DkvtIhXu.js","/assets/Login-DJQ9_2ur.js","/assets/NotFound-C0DqVqWt.js","/assets/Notifications-Dn48d_Y9.js","/assets/Overview-CP30b0Qi.js","/assets/Pagination-BMdzvPk0.js","/assets/PerenaladkaFactTable-CwDBifTG.js","/assets/PersonCard-DDAm83MS.js","/assets/PlanFulfillment-BQ47Mzel.js","/assets/Production-D-S4F6MO.js","/assets/Profile-SnfpqdKW.js","/assets/ProofCamera-CZAb31XO.js","/assets/ProofPhoto-BFbQUeCV.js","/assets/Quality-Bs6r3sbp.js","/assets/RawRows-Ql565SIt.js","/assets/RequestStateChip-sQSKiT2g.js","/assets/RichTextEditor-BfxM9-Ms.js","/assets/SaveState-CHBQqc-t.js","/assets/SearchInput-ChLA0mZR.js","/assets/SeasonalityHeatmap-BGe_A8Yf.js","/assets/SegmentedToggle-qusQ7q9t.js","/assets/SetupTimes-TeOFnGzn.js","/assets/ShiftDaily-Bd1Q9hmu.js","/assets/Staff-BR9j1UDy.js","/assets/StaffLive-BEws_HGi.js","/assets/StatusBadge-bs079i7O.js","/assets/TargetGoal-CwrB7RNB.js","/assets/Targets-bFjGksPW.js","/assets/Tasks-D_8f-q_C.js","/assets/TimeWheelPicker-C4vBx11d.js","/assets/Toast-gIOd4tRr.js","/assets/Tooltip-DENXzfgU.js","/assets/TrendChart-MuUrHEDd.js","/assets/TripleSpeedometer-DgdFCv3A.js","/assets/Trudoyomkost-B42Hw2Rl.js","/assets/Turnover-DCwuJ-SS.js","/assets/UploadDropzone-CaFaI51c.js","/assets/UsersActivity-CQK0FIrx.js","/assets/VerdictBlock-C-3bmjqN.js","/assets/VfxApiMap-DqjgWnfY.js","/assets/VfxDictionaries-CQowpuHM.js","/assets/VfxEmployees-PiP4eJfx.js","/assets/VfxHrMoves-DiCCUFhh.js","/assets/VfxJobs-BVOCOsON.js","/assets/VfxPhoto-CDP1Z9Tq.js","/assets/VfxShifts-D5pqqvOF.js","/assets/VfxState-0jD424lw.js","/assets/VfxTimebooks-C1O2X0NK.js","/assets/VfxTimesheet-B02vrS_H.js","/assets/WatchProgress-B357Cijp.js","/assets/WebLogin-BlMJ0CBk.js","/assets/WorkerConcerns-BQhdz-bm.js","/assets/Workers-MFKxvlYs.js","/assets/Zagruzka-Dq59Acy0.js","/assets/ZagruzkaCell-Cgi3oyrZ.js","/assets/api-CJJbNN4S.js","/assets/archive-CksUQjeN.js","/assets/archive-restore-BOcQHdiS.js","/assets/arrow-down-k9nGKkcu.js","/assets/arrow-left-CxiNz0UP.js","/assets/arrow-up-BEmkghyk.js","/assets/arrow-up-narrow-wide-Cb_Yg8K6.js","/assets/arrow-up-right-BahTItRz.js","/assets/award-D5-3KDVu.js","/assets/ban-DNphwp-r.js","/assets/book-open-DuXqtTT4.js","/assets/bot-C2TzLD-V.js","/assets/boxes-DONjZuU8.js","/assets/braces-DYMKj5BI.js","/assets/brigadirFilters-D1IYSJVk.js","/assets/broadcastTree-DVoyHHq6.js","/assets/building-2-CtMGaxWu.js","/assets/calculator-DdCkYGRy.js","/assets/calendar-VpYKN4Vw.js","/assets/calendar-days-CQVwKpW2.js","/assets/camera-Butp_-I3.js","/assets/categories-COBsjney.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D6p3bdXQ.js","/assets/chart-line-CTzselxF.js","/assets/chart-pie-DIYFEyGy.js","/assets/chartRange-BvAbHlXb.js","/assets/check-check-CE5eJzih.js","/assets/chevron-left-B_qIsOHV.js","/assets/chevrons-up-down-DNvWf0mK.js","/assets/circle-alert-BNwcbU7L.js","/assets/circle-check-big-CaRh2MBY.js","/assets/circle-dashed-D9HmVnrl.js","/assets/circle-minus-DEHZHUYh.js","/assets/circle-question-mark-CAKq6umL.js","/assets/circle-slash-Cf68HQOg.js","/assets/circle-tkGszorc.js","/assets/circle-user-round-BQDPvfh0.js","/assets/clock-3-CGGvSZq3.js","/assets/cloud-off-DgKDMEZq.js","/assets/cloud-upload-q9PVCsXb.js","/assets/compass-dImzzHDR.js","/assets/concernCategories-G-k1sq1f.js","/assets/copy-C_uaKCOB.js","/assets/corner-down-right-boLN7TlG.js","/assets/createLucideIcon-qwxWIa0x.js","/assets/es-C1Td2wMM.js","/assets/exportXlsx-DV30zceT.js","/assets/external-link-C7-x28Cw.js","/assets/file-clock-BuSZpsn_.js","/assets/file-exclamation-point-Ckm8ua0I.js","/assets/file-spreadsheet-ZVHwUdyS.js","/assets/file-text-DiTkhjpn.js","/assets/flag-DxemUqVz.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-dgtNmv2B.js","/assets/hash-CI7gWihY.js","/assets/history-CfFrjrJA.js","/assets/hourglass-BGkVZHbu.js","/assets/image-ja84gAwC.js","/assets/image-off-xETrA-ag.js","/assets/inbox-BfhcrJxI.js","/assets/index-BLeGEgdE.css","/assets/index-pq9TJrcg.js","/assets/key-round-BTB1OV0A.js","/assets/keyboard-Cf3FfIFR.js","/assets/languages-4S4MbQk_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-uKTTGJZ_.js","/assets/lightbulb-BSqfnCEp.js","/assets/link-2-off-BCuTOVl_.js","/assets/link-2-yvcW3jTl.js","/assets/list-ordered-B8B3pp6C.js","/assets/list-tree-BGnkBtjx.js","/assets/lock-open-n0uh2A-a.js","/assets/log-in-DH9pKiQN.js","/assets/maximize-2-f3siMKXf.js","/assets/message-square-k4b8Fe5J.js","/assets/minimize-2-CtGofQUX.js","/assets/package-check-1gbuCM0C.js","/assets/paperclip-CzMgnf81.js","/assets/pencil-BwYSPhk3.js","/assets/percent-CrQUZKMr.js","/assets/pin-CEzNoYMG.js","/assets/pin-off-B9O1yeOu.js","/assets/play-D79ynGIT.js","/assets/plug-zap-SpL_nRBN.js","/assets/presentation-DWuyiywD.js","/assets/prop-types-LysEmn-o.js","/assets/radio-XFA7z5C1.js","/assets/react-apexcharts.esm-Cq_qNKHq.js","/assets/registers-CPLI2vE7.js","/assets/repeat-Bg9j-N51.js","/assets/rotate-ccw-z_gmA6b-.js","/assets/rotate-cw-CLTWg6DF.js","/assets/save-CYBdJ7IG.js","/assets/scopeLinks-CpgM-uih.js","/assets/scroll-text-vll-XyUb.js","/assets/search-x-DqmB599U.js","/assets/segments-r__TYUTf.js","/assets/send-CT80IpNS.js","/assets/settings-2-B7OBEpAu.js","/assets/shield-alert-C3eHRGe6.js","/assets/shield-check-prFFJPnl.js","/assets/shield-mWutdynX.js","/assets/shield-question-mark-DIZhvh-z.js","/assets/siren-Bpm706kU.js","/assets/snowflake-COubcP9k.js","/assets/split-DY9gQw_f.js","/assets/square-D52nzw_V.js","/assets/square-check-big-BbCWmrwi.js","/assets/star-BQuyvJ1N.js","/assets/statusBands-_nBKtcX1.js","/assets/store-C03SYcvS.js","/assets/table-2-Bwj6OYW0.js","/assets/table-properties-Cimbva--.js","/assets/tag-Dy6rDkyi.js","/assets/timer-off-K_qBgceY.js","/assets/trending-down-DvknHVW7.js","/assets/trending-up-BQi_yW0m.js","/assets/undo-2-HWzKDNLr.js","/assets/useChartTheme-BKdUFz9Q.js","/assets/useElementWidth-1oINM7SL.js","/assets/useIsMobile-kQg6ikNM.js","/assets/useOpenParam-Dt6zrF_1.js","/assets/useStatusBands-DiWFxzKx.js","/assets/useUrlScope-BDE_DV_A.js","/assets/user-DijqxsY0.js","/assets/user-cog-DuiYLGx-.js","/assets/users-M2eAGEIR.js","/assets/vfx-B04Kh3ZJ.js","/assets/video-D-Okpn-f.js","/assets/wallet-CwS815Zm.js","/assets/warehouse-BTcF7TaW.js","/assets/x-CFD5-486.js","/assets/zap-Z9Kh-o85.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
