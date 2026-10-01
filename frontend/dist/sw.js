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

const BUILD = "2026-10-01T14:16:07.458Z";
const PRECACHE = ["/","/assets/AdminPanel-Cux0S3Zr.js","/assets/AnalysisBoard-j4xzeRlr.js","/assets/Arc-XscOZD34.js","/assets/ArcLegacy-D_KJPMRQ.js","/assets/BrigadirProfile-DyJAYwhI.js","/assets/BroadcastReceivers-C7Be60dX.js","/assets/BroadcastRecord-CTwxoM7A.js","/assets/CatLockNotice-BzuAbZ86.js","/assets/CategoryLegendModal-Chkl3LOB.js","/assets/CellConcerns-kPT48O5c.js","/assets/CellDetails-BTXHv9tJ.js","/assets/CellFormModal-5aNiQ8-O.js","/assets/CellIdent-C5HgZKMR.js","/assets/CellLink-gd3UQ2A3.js","/assets/Cells-BDTaDTSb.js","/assets/ColumnFilter-CB4ZlEqs.js","/assets/ColumnsPicker-C7CBsGvA.js","/assets/CommentsModal-50IhGd9F.js","/assets/ComparisonTable-CSuoteTI.js","/assets/Concerns-Z4LIxTE8.js","/assets/ConfirmDialog-CdY-W1OP.js","/assets/Daily--_qiAMmC.js","/assets/DataTable-B2xn4hxp.js","/assets/DateRangePicker-B_04vLNA.js","/assets/DayReportView-Cux-QW08.js","/assets/DayStepper-KEftde13.js","/assets/DifferenceBreakdown-BmYjEWD8.js","/assets/Downtime-CurBJM_t.js","/assets/Education-Dy9kgZN1.js","/assets/EducationLesson-DkQh4k1t.js","/assets/EmptyState-Bsec2NqN.js","/assets/Exam-DD172v6A.js","/assets/FactorySelect-DIz4-3Vl.js","/assets/Gamification-TJPzU-Lr.js","/assets/GroupBadge-4gVsxv5M.js","/assets/HeatmapChart-Ly1gyGxn.js","/assets/IdleCell-BXYcqhWA.js","/assets/KPICard-Bt5JPX0A.js","/assets/Kaizen-CtowFBRE.js","/assets/Kelish-DlnpPz5f.js","/assets/KpiDeltaCard-CqTw5PST.js","/assets/LangTextInput-BLuNnbP3.js","/assets/Layout-jrJj8NiE.js","/assets/LeaderAppeal-DLS2TLKf.js","/assets/LeaderDayReport-DfCQ7wN6.js","/assets/LeaderUnitReport-D0kBUSBM.js","/assets/Leaderboard-DfoeVkWD.js","/assets/Leaders-Dpg1yk0k.js","/assets/Lightbox-Bs8BFtHf.js","/assets/LiveOverview-pmbsvtAW.js","/assets/Login-DwwXR3AM.js","/assets/NotFound-CXwBJWTf.js","/assets/Notifications-hze1UBG-.js","/assets/Overview-ZPDVDTDg.js","/assets/Pagination-DhITzmd5.js","/assets/PerenaladkaFactTable-CG1ccJQs.js","/assets/PlanFulfillment-B22MCHj9.js","/assets/Production-CLDN3KR9.js","/assets/Profile-BNBbunjI.js","/assets/ProofCamera-DJALRuVX.js","/assets/ProofPhoto-CjcMDzE-.js","/assets/Quality-DUFpm7uz.js","/assets/RequestStateChip-DT-A2ked.js","/assets/RichTextEditor-CfCuoUsh.js","/assets/SaveState-D-TSa-Pw.js","/assets/SearchInput-CFmRQNVD.js","/assets/SeasonalityHeatmap-56Hd8Q8U.js","/assets/SegmentedToggle-CveMmip_.js","/assets/SetupTimes-CtngxHPv.js","/assets/ShiftDaily-ups1AsW2.js","/assets/Staff-Bm_EhKLA.js","/assets/StaffLive-CTApHKJ0.js","/assets/StatusBadge-I2x1ephR.js","/assets/TargetGoal-BvIBOgwN.js","/assets/Targets-JFDE-cEM.js","/assets/Tasks-DghKy255.js","/assets/TimeWheelPicker-CZXrd4nn.js","/assets/Toast-BdJjArEv.js","/assets/Tooltip-C3As-pIu.js","/assets/TrendChart-CeJyu2L7.js","/assets/TripleSpeedometer-Cb9i1dvx.js","/assets/Trudoyomkost-Dw9ETUnD.js","/assets/UploadDropzone-D0JltTVA.js","/assets/UsersActivity-DR2UZHaC.js","/assets/VerdictBlock-BbPHLe9x.js","/assets/WatchProgress-BAu8YUFh.js","/assets/WebLogin-BnFiG7ax.js","/assets/WorkerConcerns-Bjch8nFF.js","/assets/Workers-BhFvLyYF.js","/assets/Zagruzka-h6oR6Iix.js","/assets/ZagruzkaCell-DaZhxCZs.js","/assets/api-BG6XsUi1.js","/assets/archive-Nwk4L1Eb.js","/assets/archive-restore-CLV6mdEq.js","/assets/arrow-down-BACSulTY.js","/assets/arrow-left-yAGPJxj4.js","/assets/arrow-right-left-ubxAPNiF.js","/assets/arrow-up-CWI7FjoR.js","/assets/arrow-up-narrow-wide-Sr0mE4vN.js","/assets/arrow-up-right-Cpt3ZEe6.js","/assets/award-BGghyZvf.js","/assets/ban-Cgl5m8aj.js","/assets/bot-Cmy_gtKr.js","/assets/boxes-B8UnzQbq.js","/assets/brigadirFilters-FZu8Mh9o.js","/assets/broadcastTree-CViE4aCW.js","/assets/building-2-9Y1KlMyV.js","/assets/calendar-CzEoCfIj.js","/assets/calendar-days-BvOaPBx2.js","/assets/calendar-range-CoF9sQ11.js","/assets/camera-CEGhA2iR.js","/assets/categories-DbOgojez.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Km7NBfrJ.js","/assets/chart-line-BUnczV0p.js","/assets/chart-pie-CobD2O3U.js","/assets/chartRange-CuPevusF.js","/assets/chevron-left-CCeDF8nC.js","/assets/chevrons-up-down-TTB9-xBL.js","/assets/circle-BFlo1iUI.js","/assets/circle-alert-DwAYHRXp.js","/assets/circle-check-big-Du-Fve-L.js","/assets/circle-minus-BsqlodYE.js","/assets/circle-slash-CjP82fiN.js","/assets/circle-user-round-DEE0xvhY.js","/assets/cloud-off-BiGxxB5W.js","/assets/cloud-upload-oNPkKVIl.js","/assets/compass-ClArgti1.js","/assets/concernCategories-8ysBjn4t.js","/assets/copy-BlqfP2rh.js","/assets/corner-down-right-DzjTVg-5.js","/assets/createLucideIcon-BawCbjxm.js","/assets/es-CwLunoFw.js","/assets/exportXlsx-BDq4b3II.js","/assets/external-link-EC-bmbo1.js","/assets/file-clock-CKjIiYjx.js","/assets/file-exclamation-point-DscGtZWl.js","/assets/file-spreadsheet-DVZItz2C.js","/assets/file-text-B091QILi.js","/assets/flag-CO8akULN.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CcPwmvwa.js","/assets/hash-CeaWHqKQ.js","/assets/history-Ci8ItVNw.js","/assets/hourglass-CRZMTfnT.js","/assets/id-card-BI_jyhmA.js","/assets/image-CbludNn9.js","/assets/image-off-J5kUIMjl.js","/assets/inbox-ByxfIa_A.js","/assets/index-S0I328RS.css","/assets/index-tdMAyOML.js","/assets/key-round-D6aIBxon.js","/assets/keyboard-C5Dq0ETS.js","/assets/languages-n7WXywS9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BfLkPi-z.js","/assets/lightbulb-TRrqM9ms.js","/assets/link-2-bj1Lkpl0.js","/assets/link-2-off-BrlateOL.js","/assets/list-ordered-BhBbsm8o.js","/assets/list-tree-BcY7ospI.js","/assets/lock-open-CJv5EfHC.js","/assets/log-in-DtsuCBLi.js","/assets/maximize-2-HEMj17qv.js","/assets/message-square-BGweh0DB.js","/assets/minimize-2-Cv67-VU3.js","/assets/package-check-DvC5qpjB.js","/assets/paperclip-O70pnCaS.js","/assets/pencil-Cb65kivg.js","/assets/percent-CGTGH3Ne.js","/assets/pin-B1Cu6Jnq.js","/assets/pin-off-lCQ6X9J4.js","/assets/play-CmrHp0-S.js","/assets/plug-zap-B4WEmldH.js","/assets/presentation-BG0k88g1.js","/assets/prop-types-CHcYygtR.js","/assets/radio-BCe0oSBc.js","/assets/react-apexcharts.esm-BeTr4Xmu.js","/assets/repeat-DjWc8UH8.js","/assets/rotate-ccw-C1Zj7pDe.js","/assets/rotate-cw-BJ7LPLZU.js","/assets/save-CJmOFYxy.js","/assets/scopeLinks-CUn9S6Um.js","/assets/scroll-text-BDXjfZ_-.js","/assets/search-x-CcRoDAvN.js","/assets/segments-BaYtZiif.js","/assets/send-BSHAfPuC.js","/assets/settings-2-BYake8mt.js","/assets/shield-CoVVZZY3.js","/assets/shield-alert-DNd4nSZP.js","/assets/shield-check-I1mdghra.js","/assets/shield-question-mark-DQcTK2i-.js","/assets/siren-LIgFdLY2.js","/assets/snowflake-CXFv7tgz.js","/assets/split-C8h1aCcq.js","/assets/square-BK2_077a.js","/assets/square-check-big-BmemRIOf.js","/assets/star-DTrLoLvj.js","/assets/statusBands-BnF_KmBS.js","/assets/store-CqGhXwoO.js","/assets/table-2-DcYeJp3_.js","/assets/table-properties-6bjxbHKv.js","/assets/tag-Dgd2xbHM.js","/assets/timer-off-DXTXG9C4.js","/assets/trending-down-DDGgDgQM.js","/assets/trending-up-BCXBwXhD.js","/assets/undo-2-BnDsHs-p.js","/assets/useChartTheme-BixVrYbT.js","/assets/useElementWidth-bsJwkwfI.js","/assets/useIsMobile-DaeM6r1I.js","/assets/useOpenParam-_jAI698H.js","/assets/useStatusBands-P6rKM5b8.js","/assets/useUrlScope-I-tKwWHO.js","/assets/user-DzhnKfP7.js","/assets/user-cog-B-o3o-ga.js","/assets/user-minus-BLFmoLUf.js","/assets/users-Bm3nvdLP.js","/assets/video-CQl3IEKJ.js","/assets/wallet-DhuO3r4o.js","/assets/warehouse-CUiLTyvK.js","/assets/x-C5K86SO7.js","/assets/zap-BecYcgra.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
