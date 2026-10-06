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

const BUILD = "2026-10-06T14:51:54.603Z";
const PRECACHE = ["/","/assets/AdminPanel-lDDVuuDa.js","/assets/AnalysisBoard-Bw9TivAT.js","/assets/Arc-MLGPh6NU.js","/assets/Assistant-VEKnQrDj.js","/assets/BrigadirProfile-DqyP0f2c.js","/assets/BroadcastReceivers-BpqFVjVo.js","/assets/BroadcastRecord-CARNTteS.js","/assets/Button-zqx9EvTE.js","/assets/CatLockNotice-CNUOq2Uz.js","/assets/CategoryLegendModal-CYvfe_4_.js","/assets/CellConcerns-CcHJmwXZ.js","/assets/CellDetails-Caenhyzh.js","/assets/CellFormModal-DEteYPGM.js","/assets/CellIdent-CYZXnrml.js","/assets/CellLink-TA9mc4z8.js","/assets/Cells-CSDfbWcG.js","/assets/ColumnFilter-C-v0MgKW.js","/assets/ColumnsPicker-CL9qfbAH.js","/assets/CommentsModal-DQQAUJb-.js","/assets/ComparisonTable-CJBrDcBV.js","/assets/Concerns-IntpMytX.js","/assets/Daily-DxKor-yW.js","/assets/DataTable-Cb5CDCCf.js","/assets/DateRangePicker-BbFT04Vl.js","/assets/DayReportView-DF9kVYBy.js","/assets/DayStepper-CRfDcFby.js","/assets/DifferenceBreakdown-B3WVoPrP.js","/assets/Downtime-BoMRI4Y_.js","/assets/Education-DwWAl_zc.js","/assets/EducationLesson-DpI7kxrQ.js","/assets/EmptyState-BkruPAY9.js","/assets/Exam-DJds6Jud.js","/assets/FactorySelect-BWf79jqh.js","/assets/Gamification-F_vnWHe7.js","/assets/GroupBadge-D_k9q5nM.js","/assets/HeatmapChart--Mvvxhbz.js","/assets/IdleCell-auWHqgOo.js","/assets/KPICard-B8wBP6a6.js","/assets/Kaizen-Dg6NaLYt.js","/assets/Kelish-DPElhFWk.js","/assets/KpiDeltaCard-Cak8zTtv.js","/assets/LangTextInput-eFE8wQg-.js","/assets/Layout-BcU5SnTq.js","/assets/LeaderAppeal-CFOpL91o.js","/assets/LeaderDayReport-Bdc55atT.js","/assets/LeaderUnitReport-BhN6XRis.js","/assets/Leaderboard-DK-7ujau.js","/assets/Leaders-C1Ewcfb3.js","/assets/Lightbox-B7vuColU.js","/assets/LiveOverview-BqYKBUVk.js","/assets/Login-sctu0yuW.js","/assets/NotFound-BNyolQAc.js","/assets/Notifications-erJUmNww.js","/assets/Overview-CjUV6UMK.js","/assets/Pagination-m5H-rbq7.js","/assets/PerenaladkaFactTable-FLjI5d6e.js","/assets/PersonCard-CYyzA2TG.js","/assets/PlanFulfillment-C2Czmti7.js","/assets/Production-C_0KrUez.js","/assets/Profile-wn_MchWo.js","/assets/ProofCamera-DHbsxetL.js","/assets/ProofPhoto-Cdtti6zB.js","/assets/Quality-lxxYkh4b.js","/assets/RawRows-BMnczg3e.js","/assets/RequestStateChip-BDK2jdY4.js","/assets/RichTextEditor-C5fTljJL.js","/assets/SaveState-CEhzTcqZ.js","/assets/SearchInput-BT2jC4xB.js","/assets/SeasonalityHeatmap-BUsQPJuZ.js","/assets/SegmentedToggle-B7THCP74.js","/assets/SetupTimes-4vYzraX9.js","/assets/ShiftDaily-DpX1nrfB.js","/assets/Staff-8IEUJ0EX.js","/assets/StaffLive-B8VF_8o1.js","/assets/StatusBadge-DnTqS702.js","/assets/TargetGoal-h3R900aX.js","/assets/Targets-C1U0678k.js","/assets/Tasks-CC1r19V9.js","/assets/TimeWheelPicker-HdgBnilI.js","/assets/Toast-DwqqH9F0.js","/assets/Tooltip-SHDJhysn.js","/assets/TrendChart-Glls9iWi.js","/assets/TripleSpeedometer-BKDbdhLc.js","/assets/Trudoyomkost-DeOLNZp8.js","/assets/Turnover-C9N3sICE.js","/assets/UploadDropzone-BzN2xFgn.js","/assets/UsersActivity-BaUsDSsE.js","/assets/VerdictBlock-BHhfhFth.js","/assets/VfxApiMap-DTlaJfG_.js","/assets/VfxDictionaries-BNEOnI0R.js","/assets/VfxEmployees-NiYR-A7h.js","/assets/VfxHrMoves-BgKqF_1e.js","/assets/VfxJobs-Bpwu3M8f.js","/assets/VfxPhoto-ARsPMFOQ.js","/assets/VfxShifts-BbRdUnNY.js","/assets/VfxState-CN-D4Nsn.js","/assets/VfxTimebooks-CncZk5yx.js","/assets/VfxTimesheet-DCba-TpP.js","/assets/WatchProgress-CLMypDDy.js","/assets/WebLogin-DpIQptnZ.js","/assets/WorkerConcerns-Bm55wUgD.js","/assets/Workers-BdIuJYJr.js","/assets/Zagruzka-B2-9FGr1.js","/assets/ZagruzkaCell-ASnA0OI6.js","/assets/api-DrAEDLSc.js","/assets/archive-C7Tox8uW.js","/assets/archive-restore-UBo8fQJT.js","/assets/arrow-down-C7ZE97sx.js","/assets/arrow-up-narrow-wide-CvqQAupD.js","/assets/award-Dlrqk5nr.js","/assets/ban-BTFs7L9k.js","/assets/boxes-CO4z6zwo.js","/assets/braces-dGwTL44Y.js","/assets/brigadirFilters-CGueDN36.js","/assets/broadcastTree-DUVEJg5a.js","/assets/building-2-DPDBfFew.js","/assets/calculator-CQuCHG3a.js","/assets/calendar-DTIrk473.js","/assets/calendar-days-DhS4kC-0.js","/assets/camera-CJMMHgI5.js","/assets/categories-Dtz-5E1w.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DIohUiFE.js","/assets/chart-line-D-xxP_hz.js","/assets/chart-pie-Dv_cQLFl.js","/assets/chartRange-CEnec44p.js","/assets/check-check-DpVbFBKX.js","/assets/chevron-left-Fzcbmx1h.js","/assets/chevrons-up-down-pz4uSFhc.js","/assets/circle-alert-CcHOfKql.js","/assets/circle-check-big-CrYPjTru.js","/assets/circle-dashed-anrQZFz0.js","/assets/circle-khcgoJ6R.js","/assets/circle-minus-Cl76VXEZ.js","/assets/circle-question-mark-BWnz-1kb.js","/assets/circle-slash-BwD4xUKb.js","/assets/circle-user-round-Cbr4zGXo.js","/assets/clock-3-Dotxu_N8.js","/assets/cloud-off-CWHAasCe.js","/assets/cloud-upload-DYodM-At.js","/assets/compass-Cv6R84AA.js","/assets/concernCategories-Dr-aWNKp.js","/assets/copy-C7DWoL4K.js","/assets/corner-down-right-BjP46kNl.js","/assets/createLucideIcon-BYu70lYj.js","/assets/es-D0c1FZxq.js","/assets/external-link-CfLp72Q6.js","/assets/file-clock-Bgp21xmK.js","/assets/file-exclamation-point-Bw0hctog.js","/assets/flag-B3k1MH6l.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BBgvHe9a.js","/assets/hash-DHwR6pbA.js","/assets/hourglass-Czwl0EsT.js","/assets/image-CVW6ghVr.js","/assets/image-off-CnaCcM9z.js","/assets/inbox-BI3hi3Oi.js","/assets/index-BKM2gJ54.css","/assets/index-TxUNcRV1.js","/assets/keyboard-CZ0q7QPP.js","/assets/languages-DodEgurW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CsBNcIc6.js","/assets/lightbulb-5L4TGZCW.js","/assets/link-2-Dub2URQS.js","/assets/link-2-off-D3a86bzN.js","/assets/list-ordered-Dms_HaSW.js","/assets/list-tree-CPM8wWiG.js","/assets/lock-open-Dmjp4Y1K.js","/assets/log-in-CBABmf8o.js","/assets/minimize-2-C0WdHZ0I.js","/assets/package-check-CeymR4Kf.js","/assets/pencil-Cj7BTpu4.js","/assets/percent-CAIFqZWI.js","/assets/pin-Bm3rTI-A.js","/assets/pin-off-CXReaq0X.js","/assets/play-DgwsBDKd.js","/assets/plug-zap-CpfRUwXM.js","/assets/prop-types-Bcpq4OzX.js","/assets/react-apexcharts.esm-ur8iKaKe.js","/assets/registers-CQLpvLDb.js","/assets/repeat-vNgxxqtZ.js","/assets/rotate-cw-Djl_JVAL.js","/assets/save-BP3e4u2K.js","/assets/scopeLinks-eiCqIC7e.js","/assets/scroll-text-i-NgmTEL.js","/assets/search-x-84lm1jSW.js","/assets/segments-CVJQZfPi.js","/assets/send-LM1XvSIN.js","/assets/settings-2-rbGYVVaG.js","/assets/shield-Nr6W0F96.js","/assets/shield-alert-BhywgGTA.js","/assets/shield-question-mark-BDKGyHcQ.js","/assets/siren-DNE6tAHe.js","/assets/snowflake-02egjuPp.js","/assets/split-BNFUQG8a.js","/assets/square-check-big-Djji-z0O.js","/assets/star-aeCHGfcc.js","/assets/statusBands-DO6RuhI5.js","/assets/store-kN-Lojk0.js","/assets/table-2-C5F7DEcj.js","/assets/table-properties-COcilf8h.js","/assets/tag-CDwVDfaf.js","/assets/timer-off-DCCdvwyB.js","/assets/trending-down-8bvQYZoa.js","/assets/trending-up-Jyfvlzhf.js","/assets/undo-2-DULW324-.js","/assets/useChartTheme-B0xdlani.js","/assets/useElementWidth-jGfLJPkJ.js","/assets/useIsMobile-CtO7n2ME.js","/assets/useOpenParam-CfoxGmS9.js","/assets/useStatusBands-BkT7lOHs.js","/assets/useUrlScope-CHe25_Md.js","/assets/user-cog-C1xDXUKq.js","/assets/user-oc9U2VHA.js","/assets/users-DKvlY_F8.js","/assets/vfx-jBq9EIHs.js","/assets/video-ZEQEWnJC.js","/assets/wallet-atp9gyF_.js","/assets/warehouse-DzePr94q.js","/assets/x-WJA9_uG4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
