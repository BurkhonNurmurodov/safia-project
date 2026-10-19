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

const BUILD = "2026-10-19T13:34:44.398Z";
const PRECACHE = ["/","/assets/AdminPanel-D3yuvM3X.js","/assets/AnalysisBoard-Ciz5V6TY.js","/assets/Arc-DmJ4EZfs.js","/assets/Assistant-PSZcNep5.js","/assets/BrigadirProfile-B8l895se.js","/assets/BroadcastReceivers-B4sraavJ.js","/assets/BroadcastRecord-DgYVHQnC.js","/assets/Button-BHcQhTSn.js","/assets/CatLockNotice-Ds0ZdWTS.js","/assets/CategoryLegendModal-DdJmlJIb.js","/assets/CellConcerns-BRddwzBF.js","/assets/CellDetails-DeRh7q2O.js","/assets/CellFormModal-EG-60xlh.js","/assets/CellIdent-CWgCdOxp.js","/assets/CellLink-RDvs_FIK.js","/assets/Cells-CyrW6W69.js","/assets/ColumnFilter-Dh2I0ZiY.js","/assets/ColumnsPicker-7Mul2lkR.js","/assets/CommentsModal-CvQpgVK8.js","/assets/ComparisonTable-rsmbxAEq.js","/assets/Concerns-BNsN1-9-.js","/assets/CountStepper-BGoNUnjs.js","/assets/Daily-BZtv3cMR.js","/assets/DataTable-CL4pAwbJ.js","/assets/DateRangePicker-CV9joZk6.js","/assets/DayReportView-ClzNePT1.js","/assets/DayStepper-CAwyMRRf.js","/assets/DifferenceBreakdown-DXnrMQS7.js","/assets/Downtime-DXkHV0wq.js","/assets/Education-DhzCLEW8.js","/assets/EducationLesson-Xww8U_6z.js","/assets/EmptyState-Bv2jxgSk.js","/assets/Exam-CsaFHl-6.js","/assets/FactorySelect-BSZcMdwa.js","/assets/Gamification-BEZ_VdtU.js","/assets/GroupBadge-BkfHLD8g.js","/assets/HeatmapChart-1ANS_ney.js","/assets/IdleCell-DLzvCSaG.js","/assets/KPICard-DEj0t5OJ.js","/assets/Kaizen-CQsPtbq7.js","/assets/Kelish-BQsqSRls.js","/assets/KpiDeltaCard-2UA-L8rH.js","/assets/LangTextInput-53UfK9_3.js","/assets/Layout-DnNf3-y8.js","/assets/LeaderAppeal-C4GLnl_X.js","/assets/LeaderDayReport-jIiKM7CX.js","/assets/LeaderUnitReport-DHwvsIiY.js","/assets/Leaderboard-D59JWkm4.js","/assets/Leaders-BxJQU8e7.js","/assets/LeadersKpi-DPjACU_i.js","/assets/Lightbox-BuSpJq-2.js","/assets/LiveOverview-aP1HuzpR.js","/assets/Login-DBa7xajB.js","/assets/NotFound-DMqSpaWM.js","/assets/Notifications-DeO7CPyO.js","/assets/Overview-DQBLjWnF.js","/assets/Pagination-om8brfq9.js","/assets/PerenaladkaFactTable-0jV0eRkD.js","/assets/PersonCard-D0zMtOXp.js","/assets/PlanFulfillment-DzVup_Vl.js","/assets/Production-CB1PMhHH.js","/assets/Profile-BfhP7heS.js","/assets/ProofCamera-D1igQWFp.js","/assets/ProofPhoto-CEfya4RO.js","/assets/Quality-DkTbKbKU.js","/assets/RawRows-1XKXkDtN.js","/assets/RequestStateChip-DHNGmOJG.js","/assets/RichTextEditor-Ca8H9Ss1.js","/assets/SaveState-D9S9FUV5.js","/assets/SearchInput-BnDuwlFa.js","/assets/SeasonalityHeatmap-DYbZLPdC.js","/assets/SegmentedToggle-77-tJKTR.js","/assets/SetupTimes-deygGJ8p.js","/assets/ShiftDaily-CZC4G3LP.js","/assets/Staff-DgP2Nviy.js","/assets/StaffListAtCheck-BtFn1ueN.js","/assets/StatusBadge-GJLGFu9x.js","/assets/TargetGoal-CUTlzse9.js","/assets/Targets-EMLqrt1F.js","/assets/Tasks-l3bzBScq.js","/assets/TimeWheelPicker-BD70na5_.js","/assets/Toast-BP716b5e.js","/assets/Tooltip-BZJVTt0B.js","/assets/TrendChart-CHyMhBG8.js","/assets/TripleSpeedometer-DF2j0iZz.js","/assets/Trudoyomkost-DdWpGHOB.js","/assets/UploadDropzone-C1kQCYG0.js","/assets/UsersActivity-iJwCYlXN.js","/assets/VerdictBlock-CJefOHoD.js","/assets/VfxApiMap-ClrFVldH.js","/assets/VfxDictionaries-BstaCr4-.js","/assets/VfxEmployees-C6g9Y9Re.js","/assets/VfxHrMoves-DAhhUcK-.js","/assets/VfxJobs-SYv-6422.js","/assets/VfxPhoto-BJLbJpNh.js","/assets/VfxShifts-Chgm-UyX.js","/assets/VfxState-D9_7GLk7.js","/assets/VfxTimebooks-t5peuqf-.js","/assets/VfxTimesheet-9e9TAvX0.js","/assets/WatchProgress-CuTO9e2n.js","/assets/WebLogin-DzXOiAMn.js","/assets/Workers-maLuBcsN.js","/assets/Zagruzka-44w5-ze_.js","/assets/ZagruzkaCell-DgecjH8H.js","/assets/api-Cbis9fu4.js","/assets/archive-DEObrOIN.js","/assets/archive-restore-TXIoIl7a.js","/assets/arrow-down-DD7YWx8b.js","/assets/arrow-down-right-DVbhoy8q.js","/assets/arrow-down-wide-narrow-GDUbD0RS.js","/assets/arrow-up-narrow-wide-Cj3glwDg.js","/assets/ban-BwA0Rl83.js","/assets/boxes-CsqjXc1z.js","/assets/braces-D-zdrkw8.js","/assets/brigadirFilters-DDOOo7eN.js","/assets/broadcastTree-DARLlQ2n.js","/assets/building-2-BlsVx7V_.js","/assets/calendar-CVhrRHuT.js","/assets/calendar-days-CT84NMFt.js","/assets/camera-68kwx0SW.js","/assets/categories-DIhST4sL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BQvratvp.js","/assets/chart-line-BcPMp70z.js","/assets/chart-pie-BNfPGhNP.js","/assets/chartRange-BbY01SXX.js","/assets/check-check-DQ6IYHDG.js","/assets/chevron-left-DvzkNqJL.js","/assets/chevrons-up-down-CcHdbCTP.js","/assets/circle-MEo_swzg.js","/assets/circle-alert-tYDYQI-F.js","/assets/circle-check-big-CQ3SgGqm.js","/assets/circle-dashed-iwEdCVBn.js","/assets/circle-minus-BEwsBW38.js","/assets/circle-question-mark-BlARkiIW.js","/assets/circle-slash-CpsAsCU_.js","/assets/circle-user-round-C_SOEWpD.js","/assets/cloud-off-DGASR-fo.js","/assets/cloud-upload-BkXbxEq4.js","/assets/compass-bbYZCQVR.js","/assets/concernCategories-BsEVNuYB.js","/assets/corner-down-right-Bvo9f94W.js","/assets/createLucideIcon-sWRddheh.js","/assets/es-CUEzGa8G.js","/assets/external-link-R2XeisTN.js","/assets/file-clock-D-Z_O3he.js","/assets/file-exclamation-point-C7rE8CzT.js","/assets/flag-B7p0vis_.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BblOBoXZ.js","/assets/funnel-Dnyp6rj2.js","/assets/hash-DgFcAYbv.js","/assets/hourglass-CNhb2gzt.js","/assets/image-BbzV3q09.js","/assets/image-off-xhyOrxs4.js","/assets/inbox-Cd56Nyvl.js","/assets/index-B-bGhMav.css","/assets/index-c-BfJo3K.js","/assets/keyboard-Bam7A30L.js","/assets/languages-3pg9XsKf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-8q1PR3Nk.js","/assets/lightbulb-DeymQVOA.js","/assets/link-2-CdEzHv2C.js","/assets/link-2-off-BA-HKciZ.js","/assets/list-ordered-D8y7PboT.js","/assets/list-tree-BN9A8z7l.js","/assets/lock-open-CoesDVJK.js","/assets/log-in-Dz9QSVTP.js","/assets/marks-DaEpxmBH.js","/assets/minimize-2-CuzhdFFe.js","/assets/package-check-Dwlm4YTl.js","/assets/pencil-BfguzjLz.js","/assets/percent-CuTIDldm.js","/assets/pin-CoO1s904.js","/assets/pin-off-Bdud6M0G.js","/assets/play-jqRXkG7D.js","/assets/plug-zap-BWjLXGRH.js","/assets/prop-types-NUz1V3t_.js","/assets/radio-DtDsJwzp.js","/assets/react-apexcharts.esm-DKWZ5M45.js","/assets/registers-CZWZvIVl.js","/assets/repeat-DWpLdXAh.js","/assets/save-CUAAL8Bm.js","/assets/scopeLinks-E1D4HxZ-.js","/assets/scroll-text-BfFGmjhK.js","/assets/search-x-CNp_PUpD.js","/assets/segments-d1J8T7hp.js","/assets/send-Bw8duJhK.js","/assets/settings-2-lTOrV_rY.js","/assets/shield-DJYNvxYM.js","/assets/shield-alert-ZLm_MFZO.js","/assets/shield-question-mark-5DYx-UUb.js","/assets/siren-BDB6HTeP.js","/assets/snowflake-CDp4Yzo-.js","/assets/split-BKVjDl-W.js","/assets/square-check-big-Dxuhmf-N.js","/assets/star-_cAlKIbs.js","/assets/statusBands-Dyp7zgUq.js","/assets/store-COGLKMH5.js","/assets/table-2-aGBC2Hus.js","/assets/table-properties-Bp5Snj-8.js","/assets/tag-09Gm5Qk2.js","/assets/timer-off-B8Rl8TNR.js","/assets/trending-down-Dc_ZDn9f.js","/assets/trending-up-C4ctGEwO.js","/assets/undo-2-DSKrBOEc.js","/assets/useChartTheme-x6ZmQb08.js","/assets/useElementWidth-D5HKRJL1.js","/assets/useIsMobile-D4bemteZ.js","/assets/useOpenParam-CkTPENKT.js","/assets/useStatusBands-DNf0SRTk.js","/assets/useUrlScope-C8M1RetX.js","/assets/user-cog-DmEQGS5P.js","/assets/user-minus-CIqME810.js","/assets/user-v3FH01a-.js","/assets/users-CvGWeMEP.js","/assets/vfx-C5_46eZO.js","/assets/video-D99rl7BT.js","/assets/wallet-BqNluHuK.js","/assets/warehouse-CRfuIiGY.js","/assets/workflow-BSCA_lpt.js","/assets/x-HvTWrxo3.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
