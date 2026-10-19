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

const BUILD = "2026-10-19T13:12:24.273Z";
const PRECACHE = ["/","/assets/AdminPanel-Ctt7Odmf.js","/assets/AnalysisBoard-DRvidogo.js","/assets/Arc-Cthl7Cd8.js","/assets/Assistant-CAZWJ-Kn.js","/assets/BrigadirProfile-CrUhpXHp.js","/assets/BroadcastReceivers-CFUGigzX.js","/assets/BroadcastRecord-CFdf_xQL.js","/assets/Button-BAW1qN5J.js","/assets/CatLockNotice-DObSE3_W.js","/assets/CategoryLegendModal-Bf7CpShT.js","/assets/CellConcerns-BQxnsgV6.js","/assets/CellDetails-Cup5lgQN.js","/assets/CellFormModal-Bd05Npze.js","/assets/CellIdent-Coai8NSX.js","/assets/CellLink-BiXTy66V.js","/assets/Cells-DpHX9P5j.js","/assets/ColumnFilter-C9AXJdG_.js","/assets/ColumnsPicker-CaZuZt_w.js","/assets/CommentsModal-BfGyvR0L.js","/assets/ComparisonTable-DK5jMTEr.js","/assets/Concerns-B5vfIeX7.js","/assets/CountStepper-W6HoCElc.js","/assets/Daily-ynBijSsf.js","/assets/DataTable-Dfr-nmP3.js","/assets/DateRangePicker-B0XpEyWG.js","/assets/DayReportView-Ca8G0AP8.js","/assets/DayStepper-CeHFtd69.js","/assets/DifferenceBreakdown-BdhtQ3wo.js","/assets/Downtime-MqKhJUMm.js","/assets/Education-8EEqh0l2.js","/assets/EducationLesson-xRUu6usu.js","/assets/EmptyState-Dm24OpgQ.js","/assets/Exam-BRMWE0eb.js","/assets/FactorySelect-DAhVHKZc.js","/assets/Gamification-CBraBlo-.js","/assets/GroupBadge-CIP7S6q_.js","/assets/HeatmapChart-D6GGcDeR.js","/assets/IdleCell-Dz4E_c3a.js","/assets/KPICard-BcVM1YRo.js","/assets/Kaizen-DdrHhZrC.js","/assets/Kelish-ChZw1FV9.js","/assets/KpiDeltaCard-23FQGHxW.js","/assets/LangTextInput-DnCJ2rqT.js","/assets/Layout-ojr0_Ja2.js","/assets/LeaderAppeal-CedfnSUF.js","/assets/LeaderDayReport-4wFZ_kvE.js","/assets/LeaderUnitReport-Dgu8mLQ_.js","/assets/Leaderboard-BiJ-vRFd.js","/assets/Leaders-CQID4W-S.js","/assets/LeadersKpi-DF-I_gff.js","/assets/Lightbox-DVG8Oa61.js","/assets/LiveOverview-GukFusm9.js","/assets/Login-C5kp04B4.js","/assets/NotFound-B2ZdpgZq.js","/assets/Notifications-Cxci9HsT.js","/assets/Overview-BPStqenX.js","/assets/Pagination-BjfHkSfN.js","/assets/PerenaladkaFactTable-BMf1rH7e.js","/assets/PersonCard-B4dv0r5Y.js","/assets/PlanFulfillment-DYZXFG3s.js","/assets/Production-BAzXF02m.js","/assets/Profile-DUXgqzJS.js","/assets/ProofCamera-Dh0B6G66.js","/assets/ProofPhoto-BJXUD-o0.js","/assets/Quality-DXQkwdBz.js","/assets/RawRows-tm-YREwT.js","/assets/RequestStateChip-iJFXTNK_.js","/assets/RichTextEditor-Au1A4CgF.js","/assets/SaveState-BGjK_l0_.js","/assets/SearchInput-DeP1i2_7.js","/assets/SeasonalityHeatmap-CNTfymhe.js","/assets/SegmentedToggle-DUF2RDWA.js","/assets/SetupTimes-DRWFtsKw.js","/assets/ShiftDaily-CBAvPcdx.js","/assets/Staff-DV7vjPoa.js","/assets/StaffListAtCheck-DBW6-5Gx.js","/assets/StatusBadge-i1WdxeUn.js","/assets/TargetGoal-De5UZYrF.js","/assets/Targets-BRK21HcT.js","/assets/Tasks-Do8_wMNY.js","/assets/TimeWheelPicker-CJNbi1jy.js","/assets/Toast-BTa_132o.js","/assets/Tooltip-B1BJOFcZ.js","/assets/TrendChart-JXs_eWbT.js","/assets/TripleSpeedometer-DwDik-HQ.js","/assets/Trudoyomkost-Cr3Tmlb0.js","/assets/UploadDropzone-CdBngJ1v.js","/assets/UsersActivity-Cy7oUCDo.js","/assets/VerdictBlock-BsHni0Y8.js","/assets/VfxApiMap-BOh8yWfQ.js","/assets/VfxDictionaries-CZuBaMuU.js","/assets/VfxEmployees-mHLrDuW0.js","/assets/VfxHrMoves-D1lNxx60.js","/assets/VfxJobs-CszYE3t2.js","/assets/VfxPhoto-CKSbCMzm.js","/assets/VfxShifts-J03fuMZz.js","/assets/VfxState-GkrJ8dPN.js","/assets/VfxTimebooks-Dh_mQzFV.js","/assets/VfxTimesheet-CFNWiVpi.js","/assets/WatchProgress-oV987mbE.js","/assets/WebLogin-DozWB2fj.js","/assets/Workers-Dngh407F.js","/assets/Zagruzka-m2ftBPRA.js","/assets/ZagruzkaCell-nGDvHgmV.js","/assets/api-DFGkbctn.js","/assets/archive-BNZpd0se.js","/assets/archive-restore-_8CWHnv7.js","/assets/arrow-down-BBI7KK4R.js","/assets/arrow-down-right-BBnsLqNu.js","/assets/arrow-down-wide-narrow-DuvxcNki.js","/assets/arrow-up-narrow-wide-Nc8OCGqB.js","/assets/ban-BQov6R7M.js","/assets/boxes-CasqvXKO.js","/assets/braces-B3C5rMUN.js","/assets/brigadirFilters-BIKFUpck.js","/assets/broadcastTree-oexYGW9n.js","/assets/building-2-CkEzXR6c.js","/assets/calculator-C5QZgi4x.js","/assets/calendar-DfWVfKRm.js","/assets/calendar-days-yEgvL2Av.js","/assets/camera-fr2HbUrP.js","/assets/categories-BXHTCKzt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D96FQ1tz.js","/assets/chart-line-DhIZNjbu.js","/assets/chart-pie-C0omD0Jh.js","/assets/chartRange-Cq-HLdoS.js","/assets/check-check-BPFrQ3TS.js","/assets/chevron-left-D9AgSE3O.js","/assets/chevrons-up-down-CHxn17J1.js","/assets/circle-C2EypbA5.js","/assets/circle-alert-Lvt4ZYFo.js","/assets/circle-check-big-BSrLLgP7.js","/assets/circle-dashed-D3NZlYyL.js","/assets/circle-minus-E3KAhUgh.js","/assets/circle-question-mark-DVtLsiXJ.js","/assets/circle-slash-BTO_ujoc.js","/assets/circle-user-round-B6xDZWCa.js","/assets/cloud-off-fOq17_Hj.js","/assets/cloud-upload-VLccdXfZ.js","/assets/compass-Cm0__LWr.js","/assets/concernCategories-nhG1GcEt.js","/assets/corner-down-right-BT9G15sy.js","/assets/createLucideIcon-CJttz0s_.js","/assets/es-CGK0aBF7.js","/assets/external-link-DIYBWq8c.js","/assets/file-clock-DsMPODNs.js","/assets/file-exclamation-point-C1eM4xoX.js","/assets/flag-U2EDl-uT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-1Jmz_uJq.js","/assets/funnel-DO76pS4Y.js","/assets/hash-BKMpLv4i.js","/assets/hourglass-x6sLAd5k.js","/assets/image-KcTVwt3T.js","/assets/image-off--ZOhB5HS.js","/assets/inbox-laU3bMYj.js","/assets/index-B-bGhMav.css","/assets/index-BFFaazkj.js","/assets/keyboard-CmnF1olv.js","/assets/languages-C6Tiw6W1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B13mHBeD.js","/assets/lightbulb-CfmtsQ8x.js","/assets/link-2-DVtcZepU.js","/assets/link-2-off-wqxf4Mea.js","/assets/list-ordered-3WDX7hCK.js","/assets/list-tree-BPo9eWKr.js","/assets/lock-open-CDy2I-HN.js","/assets/log-in-C6PAnPB2.js","/assets/marks-CRSuOg8C.js","/assets/minimize-2-Gh2eZMZw.js","/assets/package-check-DDNJLQ_C.js","/assets/pencil-D3SS5Tpy.js","/assets/percent-DIAapgCQ.js","/assets/pin-fVbgkk3f.js","/assets/pin-off-C3jH16uk.js","/assets/play-DJTHc2Zp.js","/assets/plug-zap-BbXPAQ9-.js","/assets/prop-types-CI-M_J5m.js","/assets/radio-C5nNJL8c.js","/assets/react-apexcharts.esm-BrNrUmAT.js","/assets/registers-ohzeNmoQ.js","/assets/repeat-DYGQPOVx.js","/assets/save-DRJEv0oa.js","/assets/scopeLinks-sjoTR18V.js","/assets/scroll-text--Gvr3gg2.js","/assets/search-x-Cvd_r3VQ.js","/assets/segments-BrAkvvvZ.js","/assets/send-DcKggqre.js","/assets/settings-2-51oG9cEE.js","/assets/shield-B0SL_fmN.js","/assets/shield-alert-BVCwkkBy.js","/assets/shield-question-mark-CY9dJym3.js","/assets/siren-BvvB8eVR.js","/assets/snowflake-Cv_dsbBp.js","/assets/split-BsvT4iKQ.js","/assets/square-check-big-IQxl2iMh.js","/assets/star-D9SkuI9f.js","/assets/statusBands-VnxwW9np.js","/assets/store-BdCfb5gl.js","/assets/table-2-RqmlDPxA.js","/assets/table-properties-Cj85GFfh.js","/assets/tag-BJyfqpLo.js","/assets/timer-off-CQogzWb9.js","/assets/trending-down-Bn9AQHkI.js","/assets/trending-up-DSGZOCvf.js","/assets/undo-2-Cqw7i9fr.js","/assets/useChartTheme-p0brP_Fb.js","/assets/useElementWidth-BB5SAYBw.js","/assets/useIsMobile-DZLmA_8c.js","/assets/useOpenParam-BVEDAewF.js","/assets/useStatusBands-fGoA9brw.js","/assets/useUrlScope-DeNKqGIn.js","/assets/user-cog-CguVcU2K.js","/assets/user-minus-FIyOglRG.js","/assets/user-oZJWgqCL.js","/assets/users-BeDTh6Bv.js","/assets/vfx-BaRP-SG5.js","/assets/video-CrlgzB4V.js","/assets/wallet-C8eLwATA.js","/assets/warehouse-Cs6P0v4d.js","/assets/workflow-CfYW_tU4.js","/assets/x-BxorstfR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
