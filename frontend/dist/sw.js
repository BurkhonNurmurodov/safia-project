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

const BUILD = "2026-11-02T06:12:45.853Z";
const PRECACHE = ["/","/assets/AdminPanel-DmlaQx1g.js","/assets/AnalysisBoard-S8ufrzIM.js","/assets/Arc-CI0V6pJe.js","/assets/Assessment-DBbHRyJh.js","/assets/AssessmentGrade-fveYXblm.js","/assets/AssessmentList-OQbupLhx.js","/assets/Assistant-V5Ouy4fc.js","/assets/BrigadirProfile-BPnYqfFc.js","/assets/BroadcastReceivers-D-ehz9gK.js","/assets/BroadcastRecord-CFxeQNa9.js","/assets/Button-fDu7WTBG.js","/assets/CatLockNotice-CdYHROJJ.js","/assets/CategoryLegendModal-D6aSvQ4-.js","/assets/CellConcerns-BbUsAoOA.js","/assets/CellDetails-D084naNL.js","/assets/CellFormModal-BIbfLfkB.js","/assets/CellIdent-CMtVN8yu.js","/assets/CellLink-CcED_NdJ.js","/assets/Cells-Bko52xiB.js","/assets/ColumnFilter--vdwI4tg.js","/assets/ColumnsPicker-VG8XvHOZ.js","/assets/CommentsModal-DULoulqG.js","/assets/ComparisonTable-B25ruXBB.js","/assets/Concerns-Yi9vZyjS.js","/assets/ConcernsPieces-DC6-PM8P.js","/assets/CountStepper-BwGKEHZH.js","/assets/Daily-B-LoPv94.js","/assets/DataTable-BncarWii.js","/assets/DateRangePicker-c9o8YyKa.js","/assets/DayReportView-DceiFGAk.js","/assets/DayStepper-CDvSe2n8.js","/assets/DayStrip-J9A8MXYc.js","/assets/DifferenceBreakdown-DWEVyI6B.js","/assets/Downtime-CDEBSX0m.js","/assets/Education-DtT78dkH.js","/assets/EducationLesson-CuVtnjo3.js","/assets/EmptyState-DX27bdT-.js","/assets/Exam-ccmBGGD7.js","/assets/FactorySelect-DGJH3VjM.js","/assets/Gamification-BmWzAQJ4.js","/assets/HeatmapChart-DI8zGjpI.js","/assets/IdleCell-D0AGvhcK.js","/assets/KPICard-BxDWHkjG.js","/assets/Kaizen-COgGi5VC.js","/assets/Kelish-B67IW7E5.js","/assets/KpiDeltaCard-C35pNPIg.js","/assets/LangTextInput-BGMghK5r.js","/assets/Layout-fNs11HBY.js","/assets/LeaderAppeal--iTQoIh7.js","/assets/LeaderDayReport-CSd1HbxJ.js","/assets/LeaderUnitReport-DdAbuifH.js","/assets/Leaderboard-9LAO4ZWI.js","/assets/Leaders-COSlXjJl.js","/assets/LeadersKpi-CkSvG-KF.js","/assets/Lightbox-DtE-C1ZX.js","/assets/LiveOverview-COPh2Zqf.js","/assets/Login-jtF_xARf.js","/assets/NotFound-Cp2pjmoO.js","/assets/Notifications-z6zhIaeT.js","/assets/Ontime-UmmDo5l4.js","/assets/Overview-CVr6PsMU.js","/assets/Pagination-Cxr08vLe.js","/assets/People-CjXnuMJi.js","/assets/PerenaladkaFactTable-0VhRspG3.js","/assets/PersonCard-DW75B4Vj.js","/assets/PlanFulfillment-CwtrddR8.js","/assets/Production-BNAKhxWJ.js","/assets/Profile-BVB0MlU0.js","/assets/ProofCamera-bH-YAnKN.js","/assets/ProofPhoto-Bhy1vD7l.js","/assets/Quality-DHuWYpWY.js","/assets/RawRows-CtMw5KOc.js","/assets/Reports-ir60WdV0.js","/assets/RequestStateChip-CqgTgag3.js","/assets/RichTextEditor-CW-kirdv.js","/assets/SaveState-DozLA580.js","/assets/SearchInput-C_-wVYr5.js","/assets/SeasonalityHeatmap-C16DURJ_.js","/assets/SegmentedToggle-CCakquLm.js","/assets/SetupTimes-BKtVvpuS.js","/assets/ShiftDaily-DiKXnhVA.js","/assets/Staff-tgbaUy5w.js","/assets/StaffListAtCheck-DIna4VYY.js","/assets/StatusBadge-90S1dlxC.js","/assets/StatusBandsModal-Du-c_ZZu.js","/assets/TargetGoal-DSC2OPeo.js","/assets/Targets-BWplfryC.js","/assets/Tasks-ChyYKkgj.js","/assets/TimeWheelPicker-nFbcgzQ-.js","/assets/Toast-CqifsWCk.js","/assets/Tooltip-BKkR5TlD.js","/assets/TrelloAnalytics-f4rKRgBU.js","/assets/TrendChart-3F50_qR5.js","/assets/TripleSpeedometer-9f2DrdWk.js","/assets/Trudoyomkost-Bccz67_r.js","/assets/UploadDropzone-Cz8S_Aje.js","/assets/UsersActivity-BD_Td08o.js","/assets/VerdictBlock-CqvuLEHd.js","/assets/VfxApiMap-CC5C7Ght.js","/assets/VfxDictionaries-Dy-vn16J.js","/assets/VfxEmployees-GK0ietTq.js","/assets/VfxHrMoves-DE4QZ3V9.js","/assets/VfxJobs-CEkXJoio.js","/assets/VfxPhoto-CIjSnZaB.js","/assets/VfxShifts-YSHHI4kE.js","/assets/VfxState-D1GAq6Yl.js","/assets/VfxTimebooks-CaR22NUm.js","/assets/VfxTimesheet-Cuw4Eb8E.js","/assets/WatchProgress-BIhlQY-L.js","/assets/WebLogin-DpAYkz6a.js","/assets/Workers-Dia0Gw6D.js","/assets/Zagruzka-BTTq2m7y.js","/assets/ZagruzkaCell-BSKzQCtc.js","/assets/api-BFm7MSgf.js","/assets/archive-CItEJGBa.js","/assets/archive-restore-DA5bpSbv.js","/assets/arrow-down-q9rwXSgD.js","/assets/arrow-down-right-D536ITlD.js","/assets/arrow-down-wide-narrow-BIg_wfDu.js","/assets/arrow-up-narrow-wide-Bfl3rIiF.js","/assets/ban-Dl1JKLzg.js","/assets/book-check-Bo4H0ESe.js","/assets/boxes-C3qYO_xg.js","/assets/braces-DQ4_iN0N.js","/assets/brigadirFilters-XqsD7GkE.js","/assets/broadcastTree-Ci0_WI6A.js","/assets/calendar-days-DAHDcdA8.js","/assets/calendar-rA-m7phW.js","/assets/camera-DIZrqqPH.js","/assets/categories-Ci7rXssW.js","/assets/cellMoveRefusal-CA87J59k.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CX8sRJFW.js","/assets/chart-line-ChTzPh5W.js","/assets/chart-pie-BUEsnzYo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-hIBVm14M.js","/assets/chevron-left-Big4I3am.js","/assets/chevrons-up-down-D3py-tn_.js","/assets/circle-DG1Fkkbq.js","/assets/circle-alert-eVTdwW_q.js","/assets/circle-check-big-C32ZNgEB.js","/assets/circle-dashed-Db2BT2hJ.js","/assets/circle-minus-BHUQN3-U.js","/assets/circle-question-mark-Dp7-Tvjg.js","/assets/circle-user-round-Dz-nRlrW.js","/assets/cloud-off-DwLDzvN9.js","/assets/cloud-upload-5gZThAhz.js","/assets/coins-BEwqwjNG.js","/assets/compass-Cn0OZ7lN.js","/assets/concernCategories-Ns0hVC6V.js","/assets/corner-down-right-MLaJjk3e.js","/assets/createLucideIcon-BZjQjip-.js","/assets/en-DZnTLtGz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Czvr-qKk.js","/assets/file-exclamation-point-Bf7vJ4TM.js","/assets/flag-DTsiRSPT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DX7FWQCb.js","/assets/funnel-DKYu6xvm.js","/assets/hard-hat-B4e5reQz.js","/assets/hash-BM2D33A3.js","/assets/hourglass-BFYsQ3QZ.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DD5SQNRn.js","/assets/image-off-DSXJpKJ3.js","/assets/inbox-BekXXcan.js","/assets/index-C0t9dALh.js","/assets/index-D0hfKYZL.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DQdiI6c8.js","/assets/layers-D0aaL74e.js","/assets/leaderBoard-BbeZDJRT.js","/assets/lightbulb-DoDKEnCZ.js","/assets/link-2-D88yL8WD.js","/assets/link-2-off-DcUaqUe3.js","/assets/list-ordered-F9AsVAgW.js","/assets/list-tree-BYCeU_K_.js","/assets/lock-open-BPZqcMbP.js","/assets/log-in-BCmATd61.js","/assets/map-pin-CP8Hzkn7.js","/assets/marks-B3Q-1pn-.js","/assets/message-square-text-BcaNAQWy.js","/assets/minimize-2-BfX4q2Hd.js","/assets/package-3Xt7jLGK.js","/assets/package-check-6DxCWa8o.js","/assets/pencil-Cet-C2Qu.js","/assets/percent-Fy0mn7F_.js","/assets/pin-DFKrwuzH.js","/assets/pin-off-DAmEaWnE.js","/assets/play-BCG1kJZl.js","/assets/plug-zap-bTuAxfq1.js","/assets/prop-types-RD3fbola.js","/assets/radio-DY4NPahz.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Ccyqa2wv.js","/assets/repeat-COxDQb7z.js","/assets/ru-B6oWwPj2.js","/assets/save-Bs1yHci0.js","/assets/scopeLinks-CaX6wVSH.js","/assets/search-x-CrZjHXnI.js","/assets/segments-D5Uiedtv.js","/assets/send-BGia6JDS.js","/assets/shield-B1yuc9w3.js","/assets/shield-alert-Ch7-BgNy.js","/assets/sigma-Cs97stqJ.js","/assets/siren-Cp7wR4iB.js","/assets/snowflake-_QpfgH1H.js","/assets/split-D_jlgpUJ.js","/assets/square-check-big-CdfvDKiO.js","/assets/star-BcnUjfUU.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CAZZe7H_.js","/assets/table-2-DZBLgtNX.js","/assets/table-properties-QbOhDTwN.js","/assets/tag-DouggU6k.js","/assets/timer-off-DgT4kP2f.js","/assets/translations-C6LSEVli.js","/assets/trelloUtil-DLepWYHv.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-kw-9WoiJ.js","/assets/trending-up-B-ONnJ-s.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-CSAUlsq_.js","/assets/useChartTheme-CLbg_KsT.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-BrDo1rtd.js","/assets/useStatusBands-pb0zt679.js","/assets/useUrlScope-D_4Gwbnz.js","/assets/user-Cis9jC43.js","/assets/user-cog-DhwQWx5O.js","/assets/uz-B1lHxImF.js","/assets/uz_cyrl-Dkzv6M_0.js","/assets/vfx-DmYl6GCo.js","/assets/video-BiGHUQM6.js","/assets/wallet-gIw_l9yA.js","/assets/warehouse-DB4l2kU2.js","/assets/workflow-CBCw7NNf.js","/assets/x-C_FP1NZM.js","/assets/zap-D5f9lwGW.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
