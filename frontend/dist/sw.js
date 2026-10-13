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

const BUILD = "2026-10-13T14:29:58.774Z";
const PRECACHE = ["/","/assets/AdminPanel-DqtyRZZS.js","/assets/AnalysisBoard-CHGqe861.js","/assets/Arc-CCx9bMnm.js","/assets/Assistant-B1MxKkdT.js","/assets/BrigadirProfile-BisOLGPr.js","/assets/BroadcastReceivers-CPzse3Mc.js","/assets/BroadcastRecord-CCb8eblu.js","/assets/Button-C3zVJlY6.js","/assets/CatLockNotice-CqNOXUK3.js","/assets/CategoryLegendModal-DCd-Patp.js","/assets/CellConcerns-C6QqkAMR.js","/assets/CellDetails-BdWy6PTg.js","/assets/CellFormModal-DRkkqCIv.js","/assets/CellIdent-BVn78FAL.js","/assets/CellLink-D3W1-E6w.js","/assets/Cells-BIEQ2XnE.js","/assets/ColumnFilter-VBwsObcm.js","/assets/ColumnsPicker-bVjQt2AS.js","/assets/CommentsModal-0p_uw_Kn.js","/assets/ComparisonTable-DYj_wyPR.js","/assets/Concerns-DJucP8Ps.js","/assets/CountStepper-D6PD_7j2.js","/assets/Daily-DE5rdZU0.js","/assets/DataTable-Be0TfmHS.js","/assets/DateRangePicker-xx6Tr_9W.js","/assets/DayReportView-CfjEkaOo.js","/assets/DayStepper-Bf2cafGJ.js","/assets/DifferenceBreakdown-DOtg7I8h.js","/assets/Downtime-C9r_pW_L.js","/assets/Education-Cm5INx-u.js","/assets/EducationLesson-DXP4qq9h.js","/assets/EmptyState-D0KLVHWk.js","/assets/Exam-D-Musxhj.js","/assets/FactorySelect-KqNAhBI2.js","/assets/Gamification-CGp91JWS.js","/assets/GroupBadge-C1xNm_F8.js","/assets/HeatmapChart-DudsOAoq.js","/assets/IdleCell-Ck1P5ebn.js","/assets/KPICard-D7FvYXLO.js","/assets/Kaizen-CICobSG_.js","/assets/Kelish-D8ER3fcg.js","/assets/KpiDeltaCard-D6J5Lrmv.js","/assets/LangTextInput-CYEv1zXr.js","/assets/Layout-DpbhAjvD.js","/assets/LeaderAppeal-DqospINP.js","/assets/LeaderDayReport-DuhdUj9l.js","/assets/LeaderUnitReport-JZ2nHfH_.js","/assets/Leaderboard-BMuC6EVw.js","/assets/Leaders-BhWLSdhy.js","/assets/Lightbox-BEtCAe5V.js","/assets/LiveOverview-Db9QaPSr.js","/assets/Login-CUvL_vGj.js","/assets/NotFound-CwSXUHTd.js","/assets/Notifications-BZV_038Z.js","/assets/Overview-Cm-RKj5Q.js","/assets/Pagination-DSGvfE5A.js","/assets/PerenaladkaFactTable-BJNjFe7b.js","/assets/PersonCard-D4Q8kNXD.js","/assets/PlanFulfillment-D9BziJXG.js","/assets/Production-5hrRtggx.js","/assets/Profile-BQQw-waD.js","/assets/ProofCamera-DVIfRKdK.js","/assets/Quality-CbtXswHk.js","/assets/RawRows-ZSf9eAXl.js","/assets/RequestStateChip-DykmUT1q.js","/assets/RichTextEditor-CXcmGaGV.js","/assets/SaveState-0WZjVcaM.js","/assets/SearchInput-BGeG4kZD.js","/assets/SeasonalityHeatmap--rnAzpX-.js","/assets/SegmentedToggle-DeoJx8d4.js","/assets/SetupTimes-DhowqAxJ.js","/assets/ShiftDaily-TqQcp0il.js","/assets/Staff-BmstUxM_.js","/assets/StaffListAtCheck-DYyfkLOJ.js","/assets/StatusBadge-CgOu3KuT.js","/assets/TargetGoal-CX52uyxX.js","/assets/Targets-C51kmQUc.js","/assets/Tasks-Ct3FSp9_.js","/assets/TimeWheelPicker-CP8Kj2vq.js","/assets/Toast-td6mYQUO.js","/assets/Tooltip-CpSRJ_us.js","/assets/TrendChart-45fTGfqS.js","/assets/TripleSpeedometer-CkG8jRNu.js","/assets/Trudoyomkost-R0br1Ezj.js","/assets/Turnover-tDf7N_cU.js","/assets/UploadDropzone-VYFgqWOD.js","/assets/UsersActivity-CUFAD-6-.js","/assets/VerdictBlock-Bjp5Z8ey.js","/assets/VfxApiMap-BZLA0hoc.js","/assets/VfxDictionaries-BPC4_XHe.js","/assets/VfxEmployees-CptvyZmw.js","/assets/VfxHrMoves-BpdaPsC_.js","/assets/VfxJobs-BgLidDNQ.js","/assets/VfxPhoto-1r04lF7V.js","/assets/VfxShifts-vsJnGg59.js","/assets/VfxState-C3C7k8Ya.js","/assets/VfxTimebooks-vIVDFt6i.js","/assets/VfxTimesheet-DWLLkxBh.js","/assets/WatchProgress-BpIAlK3U.js","/assets/WebLogin-DUfQwll3.js","/assets/WorkerConcerns-ChHGdKMJ.js","/assets/Workers-C-5O0ecH.js","/assets/Zagruzka-BTHSSb-9.js","/assets/ZagruzkaCell-CqfwSwmC.js","/assets/api-BkzLEDTV.js","/assets/archive-BowRpG3V.js","/assets/archive-restore-C9Q2_cpU.js","/assets/arrow-down-hn-U_Rjn.js","/assets/arrow-down-wide-narrow-AADEWacW.js","/assets/arrow-up-narrow-wide-DvTSswyh.js","/assets/award-D3gjtPaw.js","/assets/ban-83aEyZZC.js","/assets/boxes-BAnxc9G0.js","/assets/braces-B7hTMml4.js","/assets/brigadirFilters-CPgEmBY5.js","/assets/broadcastTree-e3uwrCsD.js","/assets/building-2-CL9eKgwh.js","/assets/calculator-CBwoHMWI.js","/assets/calendar-USXcb_sn.js","/assets/calendar-days-CwaOG5ca.js","/assets/camera-CGRky2Or.js","/assets/categories-yFwvvIbP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B5W4iFpF.js","/assets/chart-line-DTWYf5w7.js","/assets/chart-pie-3_O6mIbi.js","/assets/chartRange-CrcA1awr.js","/assets/check-check-DD7BpXEw.js","/assets/chevron-left-BemzVVOU.js","/assets/chevrons-up-down-DtcUmihC.js","/assets/circle-DQCE0eUx.js","/assets/circle-alert-cdaDbV8O.js","/assets/circle-check-big-QgfjoVno.js","/assets/circle-dashed-DNISZoB2.js","/assets/circle-minus-CK28fPsq.js","/assets/circle-question-mark-C02Qg47p.js","/assets/circle-slash-ByaeSvqd.js","/assets/circle-user-round-o6XgrEhP.js","/assets/clock-3-BG9T0WiI.js","/assets/cloud-off-iQrYId3p.js","/assets/cloud-upload-CMUzdnlp.js","/assets/compass-CHGVMPBn.js","/assets/concernCategories-B8zCSd7t.js","/assets/copy-B4YpssPF.js","/assets/corner-down-right-BnL3JiaQ.js","/assets/createLucideIcon-DlD7te_K.js","/assets/es-S0GhGcXr.js","/assets/external-link-DFMlNghR.js","/assets/file-clock-B3ht0Y5A.js","/assets/file-exclamation-point-DjU-B2MB.js","/assets/flag-hzcw9S2K.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Sw5h92bs.js","/assets/hash-CDxo3ieD.js","/assets/hourglass-CjddfgPb.js","/assets/image-CUIFbTdm.js","/assets/image-off-DFuXnemj.js","/assets/inbox-BWwECAzR.js","/assets/index-7f1rnqtY.css","/assets/index-DlEbSxP1.js","/assets/keyboard-CcX6v4_F.js","/assets/languages-D8jonxop.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C85PD7Vy.js","/assets/lightbulb-Uyhlvat_.js","/assets/link-2-D8qOj3d_.js","/assets/link-2-off-DS7N2W9v.js","/assets/list-ordered-CwuJ75Os.js","/assets/list-tree-mV4dvnoU.js","/assets/lock-open-BB4aclS0.js","/assets/log-in-BsqH4EcH.js","/assets/marks-Cnj4EOIu.js","/assets/minimize-2-CeOdbdWi.js","/assets/package-check-CtzGfubz.js","/assets/pencil-CGkNbGzv.js","/assets/percent-CzGzzwgq.js","/assets/pin-BTTFIQAy.js","/assets/pin-off-Dy_en9MR.js","/assets/play-DbAx9tBI.js","/assets/plug-zap-BNtd-pS4.js","/assets/prop-types-BMWLIN_8.js","/assets/radio-CtdX-hw1.js","/assets/react-apexcharts.esm-Pd6Cu92h.js","/assets/registers-BO1_j_sQ.js","/assets/repeat-SWxEoqEQ.js","/assets/save-CJSQCUoY.js","/assets/scopeLinks-CJ7BULyv.js","/assets/scroll-text-DW_uLvox.js","/assets/search-x-DnOOxfz9.js","/assets/segments-CZ6RU_H9.js","/assets/send-BftNilD0.js","/assets/settings-2-CPXz1Yhs.js","/assets/shield-BYy_HlL6.js","/assets/shield-alert-CuB-PUqh.js","/assets/shield-question-mark-q5UxgcQo.js","/assets/siren-8AbPCh0w.js","/assets/snowflake-eWWOvnxU.js","/assets/split-Bo46kFQL.js","/assets/square-check-big-DD6eclq9.js","/assets/star-C-HK21BD.js","/assets/statusBands-DuxI1cdI.js","/assets/store-BlHeYunG.js","/assets/table-2-BduW9wij.js","/assets/table-properties-Bh9k81C1.js","/assets/tag-RIAqEarJ.js","/assets/timer-off-Dui8_1N5.js","/assets/trending-down-DvJR_GJ-.js","/assets/trending-up-D5x1y940.js","/assets/undo-2-DYXslP8V.js","/assets/useChartTheme-Cf3XqSma.js","/assets/useElementWidth-ef2E9U9j.js","/assets/useIsMobile-QPm6UIGf.js","/assets/useOpenParam-DXH7_J1H.js","/assets/useStatusBands-CIros8O2.js","/assets/useUrlScope-iEDFwajr.js","/assets/user-DOl1Dyzu.js","/assets/user-cog-CnstwkDl.js","/assets/users-B9TPIWNh.js","/assets/vfx-B14BpZ7M.js","/assets/video-1YjkiJPx.js","/assets/wallet-DgQdDocL.js","/assets/warehouse--TrTTwlh.js","/assets/workflow-zb7vSYOe.js","/assets/x-DsUU5L09.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
