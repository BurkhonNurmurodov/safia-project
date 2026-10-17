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

const BUILD = "2026-10-17T13:26:06.274Z";
const PRECACHE = ["/","/assets/AdminPanel-Bp_iJgwN.js","/assets/AnalysisBoard-BLQZbRN2.js","/assets/Arc-XPHPCZn1.js","/assets/Assistant-CxmXW7Kl.js","/assets/BrigadirProfile-D9yvxYUO.js","/assets/BroadcastReceivers-DrBvNNFt.js","/assets/BroadcastRecord-CyisoYnr.js","/assets/Button-D0zfkJCT.js","/assets/CatLockNotice-DPfOLuHU.js","/assets/CategoryLegendModal-DqOp-8FL.js","/assets/CellConcerns-B3jG23cD.js","/assets/CellDetails-CpzED6jB.js","/assets/CellFormModal-CrmMDL_J.js","/assets/CellIdent-BCHvOSai.js","/assets/CellLink-COJW8ng6.js","/assets/Cells-lka8Fue3.js","/assets/ColumnFilter-Ci6Gcwxr.js","/assets/ColumnsPicker-Bd-5Pa7D.js","/assets/CommentsModal-CxmuqHga.js","/assets/ComparisonTable-DDIlG154.js","/assets/Concerns-BdDWcJjO.js","/assets/CountStepper-B5xwgVOO.js","/assets/Daily-CmWe0TWY.js","/assets/DataTable-BFJGx8nn.js","/assets/DateRangePicker-Cha6egnf.js","/assets/DayReportView-Df4jkQSv.js","/assets/DayStepper-Cdp0BCGD.js","/assets/DifferenceBreakdown-C5Yd9_iu.js","/assets/Downtime-BtkxRXKX.js","/assets/Education-BUMIGdN5.js","/assets/EducationLesson-B-lij4W6.js","/assets/EmptyState-COg37hZe.js","/assets/Exam-CJfzFK4Q.js","/assets/FactorySelect-CPqmaGmn.js","/assets/ForeignObjects-Ck9Kgu4a.js","/assets/Gamification-C5jX8Y5o.js","/assets/GroupBadge-DvtpDQYn.js","/assets/HeatmapChart-B6u90k5_.js","/assets/IdleCell-CieQAfwt.js","/assets/KPICard-Bwn4CVMV.js","/assets/Kaizen-CkzMB7Zm.js","/assets/Kelish-BZnonGPB.js","/assets/KpiDeltaCard-DLaEppkI.js","/assets/LangTextInput-D7E5puF5.js","/assets/Layout-BszI896Y.js","/assets/LeaderAppeal-D4m-qkwH.js","/assets/LeaderDayReport-BwTuC5mY.js","/assets/LeaderUnitReport-DaEFhju1.js","/assets/Leaderboard-C-jet_0z.js","/assets/Leaders-CPztAQFi.js","/assets/Lightbox-CtzyGw3I.js","/assets/LiveOverview-BqI9kp6u.js","/assets/Login-BiILQHx-.js","/assets/NotFound-b9MsfvdE.js","/assets/Notifications-BksXhAND.js","/assets/Overview-qJbMfrOX.js","/assets/Pagination-CzIFN4je.js","/assets/PerenaladkaFactTable-CZ4zIyOa.js","/assets/PersonCard-DpopC36X.js","/assets/PlanFulfillment-rLxn-ZVV.js","/assets/Production-CA9JYeyU.js","/assets/Profile-f_2kg_rp.js","/assets/ProofCamera-DxAp50zs.js","/assets/ProofPhoto-BSdOYf9R.js","/assets/Quality-iE1LBiQs.js","/assets/RawRows-8BwQjoqe.js","/assets/RequestStateChip-ZKcZBgSv.js","/assets/RichTextEditor-C-KJfjz_.js","/assets/SaveState-C0lBhlUm.js","/assets/SearchInput-BMzsE7ht.js","/assets/SeasonalityHeatmap-CH56pCcy.js","/assets/SegmentedToggle-BpCQ7nA5.js","/assets/SetupTimes-wCWE2sFs.js","/assets/ShiftDaily-CGRjKIWw.js","/assets/Staff-DbY2Nb5w.js","/assets/StaffListAtCheck-DSCSW77S.js","/assets/StatusBadge-CG8m8g-L.js","/assets/TargetGoal-DTtAQ6AS.js","/assets/Targets-0If5PgJK.js","/assets/Tasks-jfnwXIf5.js","/assets/TimeWheelPicker-VNe6BGWe.js","/assets/Toast-BtLFM_Z6.js","/assets/Tooltip-DbCNpp-u.js","/assets/TrendChart-CmLmR2y9.js","/assets/TripleSpeedometer-B_w0BkUJ.js","/assets/Trudoyomkost-DiebqE5b.js","/assets/Turnover-BwYvH5qQ.js","/assets/TurnoverBits-BwU1iCuX.js","/assets/UploadDropzone-C4RhxO92.js","/assets/UsersActivity-C45RGFwh.js","/assets/VerdictBlock-GoqBTcm4.js","/assets/VfxApiMap-qTGWSgI2.js","/assets/VfxDictionaries-DYH1Hanu.js","/assets/VfxEmployees-DOI8uGNS.js","/assets/VfxHrMoves-BgL8wzho.js","/assets/VfxJobs-gyv17WTG.js","/assets/VfxPhoto-C1jsxjiz.js","/assets/VfxShifts-CcG7hT7v.js","/assets/VfxState-Y0KAXZp4.js","/assets/VfxTimebooks-_qRo23RA.js","/assets/VfxTimesheet-Bw_mBgT6.js","/assets/WatchProgress-sMf12Zxh.js","/assets/WebLogin-DxKxyWko.js","/assets/WorkerConcerns-BapJ1jf-.js","/assets/Workers-CYT_KIBw.js","/assets/Zagruzka-B1w2mmXc.js","/assets/ZagruzkaCell-B-UnOFwa.js","/assets/api-DVX23F_R.js","/assets/archive-DSNVfhS9.js","/assets/archive-restore-C_60gpDY.js","/assets/arrow-down-B6vvOg8O.js","/assets/arrow-down-wide-narrow-VoJXt9t4.js","/assets/arrow-up-narrow-wide-9Yv9A6IA.js","/assets/award-rpaingwl.js","/assets/ban-CTVe5z7e.js","/assets/boxes-CngtK62a.js","/assets/braces-htrFm8Zg.js","/assets/brigadirFilters-CgTrnJjW.js","/assets/broadcastTree-C3ZiexRu.js","/assets/building-2-DZ6INbz-.js","/assets/calculator-C17-tB3Z.js","/assets/calendar-CT_gtp19.js","/assets/calendar-days-DQBWaVwK.js","/assets/camera-DAOjajy7.js","/assets/categories-BUNTARHa.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DpKI6n9U.js","/assets/chart-line-B3tO4DbS.js","/assets/chart-pie-BmRcn8vA.js","/assets/chartRange-B7dnII1a.js","/assets/check-check-SbliDYNf.js","/assets/chevron-left-j4bVwiG0.js","/assets/chevrons-up-down-BZzWUZjb.js","/assets/circle-ByHHtkVb.js","/assets/circle-alert-jav8-2v7.js","/assets/circle-check-big-Z72wchHI.js","/assets/circle-dashed-DDuPSpgw.js","/assets/circle-minus-BwVlkOw6.js","/assets/circle-question-mark-1JS-03k7.js","/assets/circle-slash-CJiJ1ros.js","/assets/circle-user-round-tOrzQYlQ.js","/assets/cloud-off-wiO9Q2g_.js","/assets/cloud-upload-hcgVvUv0.js","/assets/compass-DD2BLVYK.js","/assets/concernCategories-DmXR4g4i.js","/assets/corner-down-right-BqlpuEfd.js","/assets/createLucideIcon-BVx4tWpP.js","/assets/es-BSCHdv9y.js","/assets/external-link-BM4uOM-O.js","/assets/file-clock-CtXdXfBh.js","/assets/file-exclamation-point-DHdTM84Z.js","/assets/flag-DsRX_YmD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C0XyNKCv.js","/assets/hash-BbrsSIBU.js","/assets/hourglass-BLaV_wIq.js","/assets/image-BxcHEFGv.js","/assets/image-off-psqLTQqs.js","/assets/inbox-B5mHtp3O.js","/assets/index-ByhNoNK_.css","/assets/index-D_LjpTLT.js","/assets/keyboard-Cw10fgeI.js","/assets/languages-CWK5_3wb.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CM2P1xS1.js","/assets/lightbulb-BdiR0dwM.js","/assets/link-2-nlv1L8Ad.js","/assets/link-2-off-B478jLdq.js","/assets/list-ordered-DsVj9gN-.js","/assets/list-tree-CCzpiKbj.js","/assets/lock-open-CXfSRx0n.js","/assets/log-in-D7QedG_O.js","/assets/marks-BeLJVQg2.js","/assets/minimize-2-BoWYfd85.js","/assets/package-check-CgyOYPzf.js","/assets/pencil-BjEoJdvR.js","/assets/percent-6xcdUobr.js","/assets/pin-Be1YPrzq.js","/assets/pin-off-Bd0WFQcW.js","/assets/play-Dt_J-C_j.js","/assets/plug-zap-CYehFIhR.js","/assets/prop-types-BHT_46JW.js","/assets/radio-3UgJf5ja.js","/assets/react-apexcharts.esm-CHk8wbNs.js","/assets/registers-BNjJSamp.js","/assets/repeat-C4AJm2m9.js","/assets/save-BKiSWAg4.js","/assets/scopeLinks-BGx1UwEW.js","/assets/scroll-text-C42-l0BX.js","/assets/search-x-BI0jmDCC.js","/assets/segments-BA5k9c4M.js","/assets/send-CxkAkghf.js","/assets/settings-2-B0EFYRbw.js","/assets/shield-DZcdzGYn.js","/assets/shield-alert-DQ5hbzHb.js","/assets/shield-question-mark-CSmtM7S5.js","/assets/siren-C-jYk_eU.js","/assets/snowflake-CzGf5w83.js","/assets/split-C4HkUZPo.js","/assets/square-check-big-BASQXfIM.js","/assets/star-BWdGhhGn.js","/assets/statusBands-BZjCAz8e.js","/assets/store-BFwyKUX6.js","/assets/table-2-Ch8yoA9-.js","/assets/table-properties-DFP678jU.js","/assets/tag-uKS-g4lh.js","/assets/timer-off-Cjp3OsE3.js","/assets/trending-down-BdH4JcY9.js","/assets/trending-up-BwpJl-L8.js","/assets/undo-2-CFtjxRGM.js","/assets/useChartTheme-BWRxCkRR.js","/assets/useElementWidth-Bzb-BI30.js","/assets/useIsMobile-B_PoxsTY.js","/assets/useOpenParam-B-xPJ0lz.js","/assets/useStatusBands-BwaRdpoE.js","/assets/useUrlScope-Do2DE-f7.js","/assets/user-BmE3HD07.js","/assets/user-cog-OoVthUzg.js","/assets/users-CgpYNO52.js","/assets/vfx-BQ8oYBLH.js","/assets/video-LJ-b-vek.js","/assets/wallet-vHLG3mMb.js","/assets/warehouse-4nIWW7w3.js","/assets/workflow-BdB04bQu.js","/assets/x-CilCcNQw.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
