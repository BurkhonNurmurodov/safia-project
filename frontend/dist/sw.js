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

const BUILD = "2026-09-30T06:22:57.172Z";
const PRECACHE = ["/","/assets/AdminPanel-3dEuRgpU.js","/assets/AnalysisBoard-hfcGHbr_.js","/assets/Arc-BoTUSxbN.js","/assets/ArcLegacy-KQWCgtrv.js","/assets/AttendanceModal-BWzjpfSx.js","/assets/BrigadirProfile-Da6JQBhx.js","/assets/BroadcastReceivers-DMrwE3IQ.js","/assets/BroadcastRecord-5gvumEaq.js","/assets/CatLockNotice-jf9kJlHr.js","/assets/CategoryLegendModal-xuPChhdc.js","/assets/CellConcerns-gXrGfAG9.js","/assets/CellDetails-DaNlDDAQ.js","/assets/CellFormModal-BcrQ04ww.js","/assets/CellLink-R8aWc36n.js","/assets/Cells-BHf2VSI3.js","/assets/ColumnFilter-CrPi1eNe.js","/assets/ColumnsPicker-MveBnfXt.js","/assets/CommentsModal-hJhCsVKV.js","/assets/ComparisonTable-DvsyLoYX.js","/assets/Concerns-CbESTox0.js","/assets/ConfirmDialog-qQq2t1sA.js","/assets/Daily-mcLLgNIP.js","/assets/DataTable-DAiRfW3E.js","/assets/DateRangePicker-BiJKgGFU.js","/assets/DayReportView-DtfXQ7JK.js","/assets/DayStepper-D7L6rMNU.js","/assets/DifferenceBreakdown-DgPaU_V6.js","/assets/Downtime-zJCTgVX0.js","/assets/Education-zG-a3NW2.js","/assets/EducationLesson-D4hzNs_9.js","/assets/EmptyState-DNeQqwZ8.js","/assets/Exam-C9SjpUq1.js","/assets/FactorySelect-Ctq_aIef.js","/assets/Gamification-CEMnsFF7.js","/assets/GroupBadge-W74YHDVF.js","/assets/HeatmapChart-SiI7wQzx.js","/assets/IdleCell-BFkFgAWZ.js","/assets/KPICard-BnVuYtYA.js","/assets/Kaizen-BbTViBdo.js","/assets/Kelish-M3Oq1JIh.js","/assets/KpiDeltaCard-B9_HM5-d.js","/assets/LangTextInput-RKJ3HJgM.js","/assets/Layout-C2Km21YP.js","/assets/LeaderAppeal-B5Vp7vMw.js","/assets/LeaderDayReport-Dlroh21C.js","/assets/LeaderUnitReport-_L4LD9d6.js","/assets/Leaderboard-ZW4zuaRW.js","/assets/Leaders-CRnzONxw.js","/assets/Lightbox-D8fslUYE.js","/assets/LiveOverview-DO-9FDst.js","/assets/Login-DK3_xogu.js","/assets/NotFound-CMxvBU8-.js","/assets/Overview-BO0bJJsV.js","/assets/Pagination-FLeoo1GC.js","/assets/PerenaladkaFactTable-DO4BgyfT.js","/assets/PlanFulfillment-C0n6p51S.js","/assets/Production-DqUNvT6R.js","/assets/Profile-CqseAN1m.js","/assets/ProofCamera-Cb5NEa-1.js","/assets/ProofPhoto-Cjb_qc0J.js","/assets/Quality-DCOVmQ9Y.js","/assets/RequestStateChip-Bi8TNTyb.js","/assets/RichTextEditor-V6glsQWI.js","/assets/SaveState-CgV6B8UR.js","/assets/SearchInput-DgJ7eFzb.js","/assets/SeasonalityHeatmap-CBZeVN1r.js","/assets/SegmentedToggle-BP5gDNGL.js","/assets/SetupTimes-CDrm57KP.js","/assets/ShiftDaily-CN3vswgi.js","/assets/Staff-YxWsrM0s.js","/assets/StatusBadge-DQdQkLjW.js","/assets/TargetGoal-BhHrdtnB.js","/assets/Targets-gIDyZSOf.js","/assets/Tasks-0BZYbbJN.js","/assets/TimeWheelPicker-DSu3vern.js","/assets/Tooltip-5IzjAcxi.js","/assets/TrendChart-CKyGfPla.js","/assets/TripleSpeedometer-Dn6ILW9p.js","/assets/Trudoyomkost-D5VyORtG.js","/assets/UploadDropzone-DwRL0Kv9.js","/assets/UsersActivity-OegKTve3.js","/assets/VerdictBlock-Dwf_1Zed.js","/assets/WatchProgress-CCWT6J3D.js","/assets/WebLogin-BaaE2SPW.js","/assets/WorkerConcerns-BuF8w4--.js","/assets/Workers-rcssjmON.js","/assets/Zagruzka-3rao4LTT.js","/assets/ZagruzkaCell-Dp8kXRd4.js","/assets/api-D0I90p_b.js","/assets/archive-BLCqiUGt.js","/assets/archive-restore-Dxbw0Obe.js","/assets/arrow-down-7be_p61A.js","/assets/arrow-left-_LAOj1hO.js","/assets/arrow-left-right-BzCxJ5K8.js","/assets/arrow-up-DiaPloYp.js","/assets/arrow-up-narrow-wide-BArS1E5V.js","/assets/arrow-up-right-BQEz4Qqi.js","/assets/award-BfrUdMLw.js","/assets/ban-DTgvUBDu.js","/assets/bot-DLJ3FeOU.js","/assets/boxes-DTmQ4zvu.js","/assets/brigadirFilters-Dtq86ciJ.js","/assets/broadcastTree-BojlgOS2.js","/assets/building-2-D5eTSMip.js","/assets/calendar-DQr3-_Xi.js","/assets/calendar-clock-DNsXswgS.js","/assets/calendar-days-DK3bnXdh.js","/assets/calendar-range-IPNkYEog.js","/assets/camera-DOFYp1KC.js","/assets/categories-DpwfMmg8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BNGqF_AM.js","/assets/chart-line-BfOP8gKG.js","/assets/chart-pie-LoW81wfS.js","/assets/chartRange-CpEjwtsJ.js","/assets/chevron-left-Dta8odZK.js","/assets/chevrons-up-down--S6LBavW.js","/assets/circle-C-J2ZlXV.js","/assets/circle-check-big-C2xJEOpu.js","/assets/circle-dot-BMlb8fCp.js","/assets/circle-minus-CJesG6TZ.js","/assets/circle-slash-CSUC1b97.js","/assets/circle-user-round-CKSURB5n.js","/assets/cloud-off-D7YZ1pEQ.js","/assets/cloud-upload-C9avwBxY.js","/assets/compass-C3ehyWgy.js","/assets/concernCategories-DYqx4TD_.js","/assets/copy-BgUBG_Th.js","/assets/corner-down-right-DgMCkvK7.js","/assets/createLucideIcon-BRkXwohc.js","/assets/es-BMtm3xCL.js","/assets/exportXlsx-A7Bz3rni.js","/assets/external-link-DW-ZOz5k.js","/assets/file-clock-CgMgtWjg.js","/assets/file-exclamation-point-BTfPboKV.js","/assets/file-spreadsheet-B3n4ggrp.js","/assets/file-text-CdKA3k-Q.js","/assets/flag-Br0ns1Wy.js","/assets/flame-D089BGMP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel--2c_yF92.js","/assets/hash-DkYSX-Hw.js","/assets/history-C7d9ZmSg.js","/assets/hourglass-CHA0S1Vl.js","/assets/image-BQYvgfKh.js","/assets/image-off-e-kq6yHa.js","/assets/index-CuVcQ-0U.css","/assets/index-DFzntLhH.js","/assets/key-round-2EUJHA6c.js","/assets/keyboard-CxJeTlO_.js","/assets/languages-C65c5Ode.js","/assets/layers-BIsOk2Fh.js","/assets/lightbulb-C61qlsX3.js","/assets/link-2-B9FLjZG8.js","/assets/link-2-off-CZYRHXLN.js","/assets/list-checks-CEVhXvTb.js","/assets/list-ordered-BQ1AZdwV.js","/assets/list-tree-CUmONjHu.js","/assets/lock-open-Dp-F2Oj2.js","/assets/log-in-DMHRQA7s.js","/assets/maximize-2-6XyCAA94.js","/assets/message-square-Dzmo7jEd.js","/assets/minimize-2-DLteFRVs.js","/assets/package-check-BXCsvay8.js","/assets/paperclip-B4K-Hj_j.js","/assets/pencil-CckEdCN3.js","/assets/percent-DCnlDECK.js","/assets/personName-CogOuS3K.js","/assets/pin-CWqlMdyC.js","/assets/pin-off-BWA8uV6y.js","/assets/play-BkLPOb2d.js","/assets/presentation-DH-xtsnV.js","/assets/prop-types-Dy8DpPiM.js","/assets/radio-B9Y9506f.js","/assets/react-apexcharts.esm-BdyvBfoo.js","/assets/repeat-CfOoqfyI.js","/assets/rotate-ccw-DShxlJct.js","/assets/rotate-cw-0EBmULj3.js","/assets/save-B2qL2_FR.js","/assets/scale-DYjAe3cW.js","/assets/scopeLinks-BR5pD439.js","/assets/scroll-text-B8eSu81B.js","/assets/search-x-BtS3pcVk.js","/assets/segments-CnQWOoDd.js","/assets/send-Crqi_Boo.js","/assets/settings-2-DVXTT1jp.js","/assets/shield-BXlwujXE.js","/assets/shield-alert-CYOY15wU.js","/assets/shield-check-BL-_6Hvq.js","/assets/shield-question-mark-DWvYPsXG.js","/assets/siren-O0pPNxJx.js","/assets/snowflake-CQ5lcMPI.js","/assets/square-CvBugyB0.js","/assets/square-check-big-BWAA7CPR.js","/assets/star-DACcUksa.js","/assets/statusBands-B1gybN3a.js","/assets/store-Os-cJbxs.js","/assets/table-2-BHJZx_nZ.js","/assets/table-properties-EISuHhQn.js","/assets/tag-uPW1ixtN.js","/assets/timer-off-BxGDiIyl.js","/assets/trending-down-UPXB3W7i.js","/assets/trending-up-B_kH1Wkg.js","/assets/undo-2-CLA3N9fU.js","/assets/useChartTheme-BCs0_V08.js","/assets/useElementWidth-CA64VlVM.js","/assets/useIsMobile-DmY-5CgE.js","/assets/useMutation-Gr-_EREk.js","/assets/useStatusBands-DNfxwFhu.js","/assets/useUrlScope-DxmmgZVO.js","/assets/user-DBNWwdzL.js","/assets/user-cog-DukFjyQ_.js","/assets/user-minus-BS3-SyEV.js","/assets/users-D3F0k7B6.js","/assets/video-zJKD7ei-.js","/assets/wallet-DoC09m4S.js","/assets/warehouse-CG8lRx9_.js","/assets/zap-JcJxbnZm.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
