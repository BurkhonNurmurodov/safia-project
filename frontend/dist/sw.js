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

const BUILD = "2026-11-01T11:34:08.832Z";
const PRECACHE = ["/","/assets/AdminPanel-P-EAYMLu.js","/assets/AnalysisBoard-DpJwUDnp.js","/assets/Arc-BqTrGkbM.js","/assets/Assessment-hX0NZOlx.js","/assets/AssessmentGrade-CXFTSyjj.js","/assets/AssessmentList-LTFtwnpf.js","/assets/Assistant-COlgHQzy.js","/assets/BrigadirProfile-DpeJ_Cr8.js","/assets/BroadcastReceivers-CyNMgG0K.js","/assets/BroadcastRecord-CwusXc_C.js","/assets/Button-fDu7WTBG.js","/assets/CatLockNotice-DNfjynER.js","/assets/CategoryLegendModal-DjeWQp0n.js","/assets/CellConcerns-DT9oYzAE.js","/assets/CellDetails-CsDFnPKM.js","/assets/CellFormModal-DkR_RdKP.js","/assets/CellIdent-CMtVN8yu.js","/assets/CellLink-BDwlMiGS.js","/assets/Cells-P01ww_RN.js","/assets/ColumnFilter-BIsUnu4I.js","/assets/ColumnsPicker-CgnU5_U8.js","/assets/CommentsModal-CfP0ylek.js","/assets/ComparisonTable-DdKGtBId.js","/assets/Concerns-oOS0uK-5.js","/assets/ConcernsPieces-CM1R1W_u.js","/assets/CountStepper-CwWjwBEC.js","/assets/Daily-C9fk76L8.js","/assets/DataTable-BRIWysk2.js","/assets/DateRangePicker-zVRDaN8j.js","/assets/DayReportView-yXFETGcs.js","/assets/DayStepper-RZzwrgxK.js","/assets/DayStrip-BZp8YAW0.js","/assets/DifferenceBreakdown-B3lrtAML.js","/assets/Downtime-Bq-_3ReI.js","/assets/Education-DHfZHNeA.js","/assets/EducationLesson-BTsvGT8_.js","/assets/EmptyState-DhyKgr5Q.js","/assets/Exam-Bfgr_jkV.js","/assets/FactorySelect-YElZ8AGg.js","/assets/Gamification-Cg8eMQPc.js","/assets/HeatmapChart-45wTJF_o.js","/assets/IdleCell-CMLu9L9s.js","/assets/KPICard-BxDWHkjG.js","/assets/Kaizen-C2Pmr-eg.js","/assets/Kelish-BQUcdJsW.js","/assets/KpiDeltaCard-W4WuvU2m.js","/assets/LangTextInput-BGMghK5r.js","/assets/Layout-DKGTr5It.js","/assets/LeaderAppeal-BbdV0Ch2.js","/assets/LeaderDayReport-C8Yj1IoG.js","/assets/LeaderUnitReport-CkznfhRl.js","/assets/Leaderboard-g95_ErD1.js","/assets/Leaders-CLEJA0Z7.js","/assets/LeadersKpi-lb3j3XpY.js","/assets/Lightbox-DtE-C1ZX.js","/assets/LiveOverview-BPDhhMDY.js","/assets/Login-CtiQ4bRj.js","/assets/NotFound-Bpv070ac.js","/assets/Notifications-D3E1RTwY.js","/assets/Ontime-Ct5rkLxq.js","/assets/Overview-BTAhjDDJ.js","/assets/Pagination-B3eFy4z4.js","/assets/People-ONCYpQv4.js","/assets/PerenaladkaFactTable-BMpqKc5l.js","/assets/PersonCard-D7_IeNf0.js","/assets/PlanFulfillment-CVgcmuJM.js","/assets/Production-CrtM7OW5.js","/assets/Profile-DgF7Iff9.js","/assets/ProofCamera-BEX1meLK.js","/assets/ProofPhoto-DJvNzQ5U.js","/assets/Quality-RMetiKa3.js","/assets/RawRows-BLMg_nMV.js","/assets/Reports-BWrhDzh4.js","/assets/RequestStateChip-BcatQTJ7.js","/assets/RichTextEditor-CinGpCYp.js","/assets/SaveState-B-VTHfto.js","/assets/SearchInput-DrEF5UxW.js","/assets/SeasonalityHeatmap-C16DURJ_.js","/assets/SegmentedToggle-CCakquLm.js","/assets/SetupTimes-DB3pjaEi.js","/assets/ShiftDaily-C-pZRy7y.js","/assets/Staff-BX-IhRfa.js","/assets/StaffListAtCheck-2aLhNsre.js","/assets/StatusBadge-CDM3IVQK.js","/assets/StatusBandsModal-Boc9X6WF.js","/assets/TargetGoal-CyzcUf8K.js","/assets/Targets-Dgj8XqXe.js","/assets/Tasks-KBLB7e0W.js","/assets/TimeWheelPicker-nFbcgzQ-.js","/assets/Toast-CqifsWCk.js","/assets/Tooltip-BKkR5TlD.js","/assets/TrelloAnalytics-BDO37dfE.js","/assets/TrendChart-B_lRpC8N.js","/assets/TripleSpeedometer-CtsJ0nxS.js","/assets/Trudoyomkost-D9YYXXz3.js","/assets/UploadDropzone-Cz8S_Aje.js","/assets/UsersActivity-Dg2xDcXF.js","/assets/VerdictBlock-_gY8PyEm.js","/assets/VfxApiMap-BTL8-3nd.js","/assets/VfxDictionaries-CDegOGpk.js","/assets/VfxEmployees-B6Wj9VqT.js","/assets/VfxHrMoves-B32Fiwal.js","/assets/VfxJobs-CF9ki65D.js","/assets/VfxPhoto-CIjSnZaB.js","/assets/VfxShifts-YzP-F3fG.js","/assets/VfxState-CxjhqUMQ.js","/assets/VfxTimebooks-9YN53NJY.js","/assets/VfxTimesheet-RpWdS-Um.js","/assets/WatchProgress-DNK5WVc1.js","/assets/WebLogin-sOyt-x_1.js","/assets/Workers-CjMBSvQM.js","/assets/Zagruzka-BTId6Hsb.js","/assets/ZagruzkaCell-3SfCWIgB.js","/assets/api-BFm7MSgf.js","/assets/archive-CItEJGBa.js","/assets/archive-restore-DA5bpSbv.js","/assets/arrow-down-q9rwXSgD.js","/assets/arrow-down-right-D536ITlD.js","/assets/arrow-down-wide-narrow-BIg_wfDu.js","/assets/arrow-up-narrow-wide-Bfl3rIiF.js","/assets/ban-Dl1JKLzg.js","/assets/book-check-Bo4H0ESe.js","/assets/boxes-C3qYO_xg.js","/assets/braces-DQ4_iN0N.js","/assets/brigadirFilters-sE7BgLzT.js","/assets/broadcastTree-DXhROMHB.js","/assets/calendar-days-DAHDcdA8.js","/assets/calendar-rA-m7phW.js","/assets/camera-DIZrqqPH.js","/assets/categories-C7RFWsXN.js","/assets/cellMoveRefusal-CLdiEqsi.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CX8sRJFW.js","/assets/chart-line-ChTzPh5W.js","/assets/chart-pie-BUEsnzYo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-hIBVm14M.js","/assets/chevron-left-Big4I3am.js","/assets/chevrons-up-down-D3py-tn_.js","/assets/circle-DG1Fkkbq.js","/assets/circle-alert-eVTdwW_q.js","/assets/circle-check-big-C32ZNgEB.js","/assets/circle-dashed-Db2BT2hJ.js","/assets/circle-minus-BHUQN3-U.js","/assets/circle-question-mark-Dp7-Tvjg.js","/assets/circle-user-round-Dz-nRlrW.js","/assets/cloud-off-DwLDzvN9.js","/assets/cloud-upload-5gZThAhz.js","/assets/coins-BEwqwjNG.js","/assets/compass-Cn0OZ7lN.js","/assets/concernCategories-DihBHr2L.js","/assets/corner-down-right-MLaJjk3e.js","/assets/createLucideIcon-BZjQjip-.js","/assets/en-DZnTLtGz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Czvr-qKk.js","/assets/file-exclamation-point-Bf7vJ4TM.js","/assets/flag-DTsiRSPT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DX7FWQCb.js","/assets/funnel-DKYu6xvm.js","/assets/hard-hat-B4e5reQz.js","/assets/hash-BM2D33A3.js","/assets/hourglass-BFYsQ3QZ.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DD5SQNRn.js","/assets/image-off-DSXJpKJ3.js","/assets/inbox-BekXXcan.js","/assets/index-BJeFGYa7.js","/assets/index-D0hfKYZL.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DQdiI6c8.js","/assets/layers-D0aaL74e.js","/assets/leaderBoard-KKl2oL7O.js","/assets/lightbulb-DoDKEnCZ.js","/assets/link-2-D88yL8WD.js","/assets/link-2-off-DcUaqUe3.js","/assets/list-ordered-F9AsVAgW.js","/assets/list-tree-BYCeU_K_.js","/assets/lock-open-BPZqcMbP.js","/assets/log-in-BCmATd61.js","/assets/map-pin-CP8Hzkn7.js","/assets/marks-B3Q-1pn-.js","/assets/message-square-text-BcaNAQWy.js","/assets/minimize-2-BfX4q2Hd.js","/assets/package-3Xt7jLGK.js","/assets/package-check-6DxCWa8o.js","/assets/pencil-Cet-C2Qu.js","/assets/percent-Fy0mn7F_.js","/assets/pin-DFKrwuzH.js","/assets/pin-off-DAmEaWnE.js","/assets/play-BCG1kJZl.js","/assets/plug-zap-bTuAxfq1.js","/assets/prop-types-RD3fbola.js","/assets/radio-DY4NPahz.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-h6oMGlcf.js","/assets/repeat-COxDQb7z.js","/assets/ru-B6oWwPj2.js","/assets/save-Bs1yHci0.js","/assets/scopeLinks-BnYGl2w7.js","/assets/search-x-CrZjHXnI.js","/assets/segments-D5Uiedtv.js","/assets/send-BGia6JDS.js","/assets/shield-B1yuc9w3.js","/assets/shield-alert-Ch7-BgNy.js","/assets/sigma-Cs97stqJ.js","/assets/siren-Cp7wR4iB.js","/assets/snowflake-_QpfgH1H.js","/assets/split-D_jlgpUJ.js","/assets/square-check-big-CdfvDKiO.js","/assets/star-BcnUjfUU.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CAZZe7H_.js","/assets/table-2-DZBLgtNX.js","/assets/table-properties-QbOhDTwN.js","/assets/tag-DouggU6k.js","/assets/timer-off-DgT4kP2f.js","/assets/translations-C6LSEVli.js","/assets/trelloUtil-DLepWYHv.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-kw-9WoiJ.js","/assets/trending-up-B-ONnJ-s.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-CSAUlsq_.js","/assets/useChartTheme-Dg6aJW8y.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-EpnKi6aN.js","/assets/useStatusBands-pb0zt679.js","/assets/useUrlScope-DptXAeTq.js","/assets/user-Cis9jC43.js","/assets/user-cog-6feQH53r.js","/assets/uz-B1lHxImF.js","/assets/uz_cyrl-Dkzv6M_0.js","/assets/vfx-DmYl6GCo.js","/assets/video-BiGHUQM6.js","/assets/wallet-gIw_l9yA.js","/assets/warehouse-DB4l2kU2.js","/assets/workflow-CBCw7NNf.js","/assets/x-C_FP1NZM.js","/assets/zap-D5f9lwGW.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
