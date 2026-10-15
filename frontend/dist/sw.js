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

const BUILD = "2026-10-15T06:12:23.253Z";
const PRECACHE = ["/","/assets/AdminPanel-BP_VlK0w.js","/assets/AnalysisBoard--ZQGNBqd.js","/assets/Arc-w7ScQuJr.js","/assets/Assistant-Cf3Odfqs.js","/assets/BrigadirProfile-CsOBJjle.js","/assets/BroadcastReceivers-BlGqMYC7.js","/assets/BroadcastRecord-DVaSMGYx.js","/assets/Button-B1MPFbD-.js","/assets/CatLockNotice-Db1iWuad.js","/assets/CategoryLegendModal-xg5bKr1r.js","/assets/CellConcerns-CYOe7s3z.js","/assets/CellDetails-Bw1gwhb6.js","/assets/CellFormModal-B4RpWugb.js","/assets/CellIdent-CL9cTnir.js","/assets/CellLink-CQkI91lI.js","/assets/Cells-CVDBoB3f.js","/assets/ColumnFilter-CESpS7bN.js","/assets/ColumnsPicker-D3I3BuqK.js","/assets/CommentsModal-M9obUstO.js","/assets/ComparisonTable-C9zSqamR.js","/assets/Concerns-Csk9g0pd.js","/assets/CountStepper-HNyhHqSp.js","/assets/Daily-DEl2jDkZ.js","/assets/DataTable-DWhLRTpW.js","/assets/DateRangePicker-C0IAC3yS.js","/assets/DayReportView-3G_Imc-P.js","/assets/DayStepper--imnWfWF.js","/assets/DifferenceBreakdown-D16E4y-l.js","/assets/Downtime-BpYjHBT8.js","/assets/Education-DKwlaRKS.js","/assets/EducationLesson-CRsuUGH7.js","/assets/EmptyState-D6B2fmlA.js","/assets/Exam-CGCQw_rg.js","/assets/FactorySelect-Cqg4b5Bx.js","/assets/Gamification-CkybpU00.js","/assets/GroupBadge-BE2o0e2c.js","/assets/HeatmapChart-DEq2WD7N.js","/assets/IdleCell-D0QS3vuS.js","/assets/KPICard-CzCoxJJA.js","/assets/Kaizen-YDsdWLTJ.js","/assets/Kelish-CiZ0_BEy.js","/assets/KpiDeltaCard-uhs1Vnsc.js","/assets/LangTextInput-yWOfa7Vo.js","/assets/Layout-CmASSm9O.js","/assets/LeaderAppeal-DhDiwhCB.js","/assets/LeaderDayReport-BU-pkCCl.js","/assets/LeaderUnitReport-DQ18_NY6.js","/assets/Leaderboard-BaXjFFRN.js","/assets/Leaders-mVU8FTsV.js","/assets/Lightbox-CQb_cOYI.js","/assets/LiveOverview-BEUa3b3P.js","/assets/Login-CQ5tiGUl.js","/assets/NotFound-BCDKjwga.js","/assets/Notifications-BMWtOvt2.js","/assets/Overview-BRmUuUtt.js","/assets/Pagination-CCvltkja.js","/assets/PerenaladkaFactTable-CUpGZuoz.js","/assets/PersonCard-C9gGIU9Z.js","/assets/PlanFulfillment-DyvsG2Ke.js","/assets/Production-DAy2mdEh.js","/assets/Profile-Bf3_wqdZ.js","/assets/ProofCamera-CPGsrDSm.js","/assets/Quality-BYlprgA4.js","/assets/RawRows-BtK7E8bb.js","/assets/RequestStateChip-q5fycjIn.js","/assets/RichTextEditor-DARnwJkb.js","/assets/SaveState-BjiPtiNz.js","/assets/SearchInput-DgReTuU1.js","/assets/SeasonalityHeatmap-D785EB-g.js","/assets/SegmentedToggle-CMGVhf6r.js","/assets/SetupTimes-CEu3fydM.js","/assets/ShiftDaily-Ba1KkQb0.js","/assets/Staff-Bgw6rMr_.js","/assets/StaffListAtCheck-BuFSaqtP.js","/assets/StatusBadge-6ec1c3A6.js","/assets/TargetGoal-BVmVUNx6.js","/assets/Targets-BNFXt4nf.js","/assets/Tasks-BjWUNUqF.js","/assets/TimeWheelPicker-CfzjTHIs.js","/assets/Toast-28vZU_Td.js","/assets/Tooltip-DvrDZorK.js","/assets/TrendChart-CN_Dh2AS.js","/assets/TripleSpeedometer-BWN5H2nn.js","/assets/Trudoyomkost-CUA_SGAb.js","/assets/Turnover-DK8xIX2F.js","/assets/UploadDropzone-O6oYc3Me.js","/assets/UsersActivity-Uw3VNzbh.js","/assets/VerdictBlock-Q49o5gLc.js","/assets/VfxApiMap-D6eN4MhN.js","/assets/VfxDictionaries-Bt4Ej1Ml.js","/assets/VfxEmployees-A9v0wHZV.js","/assets/VfxHrMoves-CRj0p2OG.js","/assets/VfxJobs-D5395MHu.js","/assets/VfxPhoto-B4ALCm6G.js","/assets/VfxShifts-BFICJ4oh.js","/assets/VfxState-C48ovpMP.js","/assets/VfxTimebooks-BDQ44PC_.js","/assets/VfxTimesheet-QSAtHSvt.js","/assets/WatchProgress-C8V-1zYA.js","/assets/WebLogin-DXIvX7xd.js","/assets/WorkerConcerns-C1IXXqjp.js","/assets/Workers-BhPcc_5B.js","/assets/Zagruzka-BH_dlkdC.js","/assets/ZagruzkaCell-DGKRr5l4.js","/assets/api-rWynLykd.js","/assets/archive-BY45iDJP.js","/assets/archive-restore-BFbaXpVk.js","/assets/arrow-down-CmnaZt6U.js","/assets/arrow-down-wide-narrow-Cxj02VH9.js","/assets/arrow-up-narrow-wide-DX0tR71_.js","/assets/award-p16PanlJ.js","/assets/ban-wLf9ip07.js","/assets/boxes-CRt2yH_H.js","/assets/braces-CNhbzi7I.js","/assets/brigadirFilters-C_n2gZ7T.js","/assets/broadcastTree-BiokLF-X.js","/assets/building-2-B8iytZxg.js","/assets/calculator-CJnhfmgj.js","/assets/calendar-B8FfAHkf.js","/assets/calendar-days-DXCau-9x.js","/assets/camera-ChDqvoxU.js","/assets/categories-BQIzA_4Z.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CAmyK8pv.js","/assets/chart-line-CJ2uwXkQ.js","/assets/chart-pie-byh4Ah03.js","/assets/chartRange-DB-CzW07.js","/assets/check-check-CzIhIjKR.js","/assets/chevron-left-Bu4_iXM8.js","/assets/chevrons-up-down-hS_01cOR.js","/assets/circle-alert-DlfbSBcT.js","/assets/circle-check-big-qJjUWHr_.js","/assets/circle-dashed-BqEXh6hR.js","/assets/circle-minus-COibV5co.js","/assets/circle-question-mark-BJU9mYHl.js","/assets/circle-slash-CMCcCj9y.js","/assets/circle-user-round-VFTV_b3Y.js","/assets/circle-vMYROeBL.js","/assets/clock-3-Bm21T3_u.js","/assets/cloud-off-B1T4Gtm7.js","/assets/cloud-upload-BSRO7r-b.js","/assets/compass-DW_rwIHy.js","/assets/concernCategories-D84Po1L2.js","/assets/copy-D7uZx-7_.js","/assets/corner-down-right-Df7DRMXh.js","/assets/createLucideIcon-B_CMtjq_.js","/assets/es-B_dmlsKH.js","/assets/external-link-Ci50v6HE.js","/assets/file-clock-Cg26Telt.js","/assets/file-exclamation-point-MFUDdRqU.js","/assets/flag-BC5BhqbI.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DJTCX6fP.js","/assets/hash-NBpmKaPq.js","/assets/hourglass-BrMYaoS1.js","/assets/image-DcsSj_r1.js","/assets/image-off-C_yTfHnM.js","/assets/inbox-0NhjrdO9.js","/assets/index-CBKw4u90.css","/assets/index-CDGuOu5i.js","/assets/keyboard-B7qVnNA1.js","/assets/languages-2nZl-wCl.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BnCYS9I7.js","/assets/lightbulb-BYRn2wXe.js","/assets/link-2-B-mSPTVp.js","/assets/link-2-off-sSpPayj9.js","/assets/list-ordered-C-BV0aez.js","/assets/list-tree-82wpCTvm.js","/assets/lock-open-Db0JH9Zk.js","/assets/log-in-DiLTjgQ_.js","/assets/marks-CpCtrbQH.js","/assets/minimize-2-Bg399dw5.js","/assets/package-check-CzqPegLy.js","/assets/pencil-Cq-GO6Ff.js","/assets/percent-BR4lOd-V.js","/assets/pin-Cu9gLirL.js","/assets/pin-off-BTewUmwp.js","/assets/play-4N865oo5.js","/assets/plug-zap-2NcP3328.js","/assets/prop-types-CBmfqP3q.js","/assets/radio-CXX0_UPT.js","/assets/react-apexcharts.esm-CphGkTwD.js","/assets/registers-DDpgU9el.js","/assets/repeat-CDM7Cp_p.js","/assets/save-D45L5fPt.js","/assets/scopeLinks-0DThBhwY.js","/assets/scroll-text-BdlAICtg.js","/assets/search-x-BPfJXPFi.js","/assets/segments-DQu_UJya.js","/assets/send-BYIRL2gg.js","/assets/settings-2-9gHEs3cy.js","/assets/shield-8mm6npOC.js","/assets/shield-alert-D6UU0fPO.js","/assets/shield-question-mark-CjgbrwD4.js","/assets/siren-DX5_oMmR.js","/assets/snowflake-CzFg9qPj.js","/assets/split-CXP1ZFkf.js","/assets/square-check-big-CsJhFp-w.js","/assets/star-2QXDKDLm.js","/assets/statusBands-BnmTZk3y.js","/assets/store-uj9psFSf.js","/assets/table-2-Bh_UA_3-.js","/assets/table-properties-C1OEXn-g.js","/assets/tag-D1TbNO1y.js","/assets/timer-off-CRUG8kYi.js","/assets/trending-down-CvtUwY7I.js","/assets/trending-up-CREgAkb9.js","/assets/undo-2-BBqjf_SC.js","/assets/useChartTheme-DMbeyKgh.js","/assets/useElementWidth-BbS9HIoG.js","/assets/useIsMobile-D629MSym.js","/assets/useOpenParam-Bf9JHMlw.js","/assets/useStatusBands-D9QWIkOI.js","/assets/useUrlScope-Boe_svQQ.js","/assets/user-cog-CwSdayl-.js","/assets/user-t6DRjCrs.js","/assets/users-DnIQTE0M.js","/assets/vfx-CGC6F9PD.js","/assets/video-Zgwn5R5B.js","/assets/wallet-Br8coVVf.js","/assets/warehouse-CItWF8zC.js","/assets/workflow-CVvBmUh8.js","/assets/x-BYfsHbje.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
