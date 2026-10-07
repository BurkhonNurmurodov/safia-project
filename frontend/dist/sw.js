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

const BUILD = "2026-10-07T03:59:26.834Z";
const PRECACHE = ["/","/assets/AdminPanel-BY32M7UQ.js","/assets/AnalysisBoard-Bwhmzqo-.js","/assets/Arc-B8zV2_Q3.js","/assets/Assistant-C4Iz4ivd.js","/assets/BrigadirProfile-DwGu9FFD.js","/assets/BroadcastReceivers-B26CnMRu.js","/assets/BroadcastRecord-oz5ayiU5.js","/assets/Button-DLZ2ooA0.js","/assets/CatLockNotice-6XfxUfbe.js","/assets/CategoryLegendModal-C0pt8uJU.js","/assets/CellConcerns-D6AMzzlv.js","/assets/CellDetails-CPTIEfwF.js","/assets/CellFormModal-QSBduAAR.js","/assets/CellIdent-CVpz2qU_.js","/assets/CellLink-CG07TjF5.js","/assets/Cells-BOCYXA-I.js","/assets/ColumnFilter-BlRWpdlF.js","/assets/ColumnsPicker-BoOQW_7T.js","/assets/CommentsModal-DKPIQ5E-.js","/assets/ComparisonTable-fMON91P_.js","/assets/Concerns-Bmq5mYvu.js","/assets/Daily-DotCbqxi.js","/assets/DataTable-Cjt4KyUh.js","/assets/DateRangePicker-BFb9gbeD.js","/assets/DayReportView-BX5wZTmz.js","/assets/DayStepper-D7bgpJTZ.js","/assets/DifferenceBreakdown-BrvUHFux.js","/assets/Downtime-BT9IZglu.js","/assets/Education-3J-E7qaA.js","/assets/EducationLesson-DHmjd75S.js","/assets/EmptyState-5xccKv3c.js","/assets/Exam-BiqnKxZK.js","/assets/FactorySelect-CkHkqPjN.js","/assets/Gamification-BWyiG5aE.js","/assets/GroupBadge-C6tRHL8r.js","/assets/HeatmapChart-B064quUl.js","/assets/IdleCell-Cl1RWy3E.js","/assets/KPICard-CZBkmPfM.js","/assets/Kaizen-8c4Ulv3i.js","/assets/Kelish-BhEUeoXJ.js","/assets/KpiDeltaCard-BxJF_sft.js","/assets/LangTextInput-DiQA43ZI.js","/assets/Layout-BvljIF42.js","/assets/LeaderAppeal-2S7PLQw6.js","/assets/LeaderDayReport-DIXMiBMr.js","/assets/LeaderUnitReport-Buxi3ULf.js","/assets/Leaderboard-DXMh2EfF.js","/assets/Leaders-CSVKnC-8.js","/assets/Lightbox-B0XdEmKy.js","/assets/LiveOverview-DGtxzDFR.js","/assets/Login-Ad3e61DX.js","/assets/NotFound-BA58ur3F.js","/assets/Notifications-BXBJOZFi.js","/assets/Overview-CzGwZY3N.js","/assets/Pagination-B3hR8Vdh.js","/assets/PerenaladkaFactTable-GVhWzExW.js","/assets/PersonCard-B1fMWbWR.js","/assets/PlanFulfillment-Dx116oh7.js","/assets/Production-Blrs4uIG.js","/assets/Profile-3XoUS_Xi.js","/assets/ProofCamera-DxWxX4Iw.js","/assets/ProofPhoto-B4u0hGeC.js","/assets/Quality-BO9A4s-Y.js","/assets/RawRows-D2XKf_uN.js","/assets/RequestStateChip-By42oM9R.js","/assets/RichTextEditor-KCsuEQR5.js","/assets/SaveState-C4SLVxxY.js","/assets/SearchInput-WHL9Z27Z.js","/assets/SeasonalityHeatmap-rZiDcvGY.js","/assets/SegmentedToggle-DRYvSe_e.js","/assets/SetupTimes-D-SBLaub.js","/assets/ShiftDaily-DOu10PaT.js","/assets/Staff-DxxLltf5.js","/assets/StatusBadge-YFGWW3Xq.js","/assets/TargetGoal-CYI35Ovr.js","/assets/Targets-CQ_jZslu.js","/assets/Tasks-nF36JC2M.js","/assets/TimeWheelPicker-ddXkUPCe.js","/assets/Toast-CQB6ZqWx.js","/assets/Tooltip--xqc6ONB.js","/assets/TrendChart-DrJ90GRt.js","/assets/TripleSpeedometer-CLz_iFNT.js","/assets/Trudoyomkost-C6eSbIoU.js","/assets/Turnover-BKZcOAUC.js","/assets/UploadDropzone-B-bSVQi2.js","/assets/UsersActivity-BBttsyMq.js","/assets/VerdictBlock-BlI0ShZj.js","/assets/VfxApiMap-D_VdBsDX.js","/assets/VfxDictionaries-C_tfdSVn.js","/assets/VfxEmployees-VtEFv5gk.js","/assets/VfxHrMoves-1cgyXiH7.js","/assets/VfxJobs-BvF-EvYW.js","/assets/VfxPhoto-DdqDHbQu.js","/assets/VfxShifts-DQmu5CMC.js","/assets/VfxState-DkKD-KyT.js","/assets/VfxTimebooks-DkiziqGN.js","/assets/VfxTimesheet-DDYYiLB3.js","/assets/WatchProgress-9cXioqbD.js","/assets/WebLogin-Bn8pCwfI.js","/assets/WorkerConcerns-BHo_zbs7.js","/assets/Workers-B2ZnXqNn.js","/assets/Zagruzka-NfvZQDDR.js","/assets/ZagruzkaCell-DEth-6U0.js","/assets/api-B7vZS1t4.js","/assets/archive-ERC7Ik4m.js","/assets/archive-restore-8cAYoMw-.js","/assets/arrow-down-B9OwH3qh.js","/assets/arrow-up-narrow-wide-FivuiolO.js","/assets/award-CAJvz-_W.js","/assets/ban--k2fjXYe.js","/assets/boxes-CsgH5bHp.js","/assets/braces-D0ZHbdHM.js","/assets/brigadirFilters-CXEeWz-x.js","/assets/broadcastTree-Dkw02S89.js","/assets/building-2-Bz8blklu.js","/assets/calculator-H-pLJuBI.js","/assets/calendar-BKjlqeOl.js","/assets/calendar-days-C1RkoIRy.js","/assets/camera-CLMr49E2.js","/assets/categories-BvgT_wSa.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D7b7nuAF.js","/assets/chart-line-BaYahI6v.js","/assets/chart-pie-CKdw30A8.js","/assets/chartRange-Dz8jPzYC.js","/assets/check-check-BvU8Mhk8.js","/assets/chevron-left-CUBZlpnY.js","/assets/chevrons-up-down-DxAHoJfN.js","/assets/circle-WRa_Lo0O.js","/assets/circle-alert-CRJPdV5L.js","/assets/circle-check-big-DUUXGBrw.js","/assets/circle-dashed-DZw5tfpm.js","/assets/circle-minus-B2msKHmA.js","/assets/circle-question-mark-BSTShZgo.js","/assets/circle-slash-HDQzsZmM.js","/assets/circle-user-round-kWGXWiYn.js","/assets/clock-3-CneJkdWk.js","/assets/cloud-off-DIiVIlz5.js","/assets/cloud-upload-B4GMRJJo.js","/assets/compass-DoWtaxr7.js","/assets/concernCategories-DZWAfd6v.js","/assets/copy-DXJIw1B4.js","/assets/corner-down-right-Dzb0uzZ-.js","/assets/createLucideIcon-DmGetSmj.js","/assets/es-CG-nxUof.js","/assets/external-link-DKVsmb9v.js","/assets/file-clock-BqSVU8SJ.js","/assets/file-exclamation-point-B-C9hDhO.js","/assets/flag-DkG60TmU.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D8VN47uj.js","/assets/hash-CmUEvVbF.js","/assets/hourglass-BPLHKQ9V.js","/assets/image-DN6gxgfm.js","/assets/image-off-DZX55EEa.js","/assets/inbox-DirxliBT.js","/assets/index-BYLu8eK_.css","/assets/index-DyeNEC7Q.js","/assets/keyboard-DqQozj6o.js","/assets/languages-p15C_O4Q.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CAMiA5Yu.js","/assets/lightbulb-Bct6S8dr.js","/assets/link-2-ChbiXV7-.js","/assets/link-2-off-BDirO6jg.js","/assets/list-ordered-B5BW-ynQ.js","/assets/list-tree-BhwktCqG.js","/assets/lock-open-9utB3rpq.js","/assets/log-in-Bz8WvO0_.js","/assets/minimize-2-VgZJaRwv.js","/assets/package-check-CfimbDc_.js","/assets/pencil-CXjms4Fu.js","/assets/percent-D5BgGyiv.js","/assets/pin-Db_OMbRY.js","/assets/pin-off-CNI25m5q.js","/assets/play-C6PAScDG.js","/assets/plug-zap-Y71XTpd1.js","/assets/prop-types-vH9gEooT.js","/assets/radio-DhRpbdPY.js","/assets/react-apexcharts.esm-CUkYQ2eo.js","/assets/registers-BQbdiZuZ.js","/assets/repeat-CSD6Sw42.js","/assets/rotate-cw-D6bFI2n9.js","/assets/save-DaZTotmf.js","/assets/scopeLinks-xI9-RW9_.js","/assets/scroll-text-gY2Bkt_V.js","/assets/search-x-L5ZDC2YR.js","/assets/segments-m5jWPURa.js","/assets/send-B4Hcq66R.js","/assets/settings-2-CLFTk95I.js","/assets/shield-BlV3VMj8.js","/assets/shield-alert-v5pm2YPS.js","/assets/shield-question-mark-Bi3668XE.js","/assets/siren-DoVTBTVF.js","/assets/snowflake-CImb9cEo.js","/assets/split-C68FBg6Y.js","/assets/square-check-big-_QUxuUyg.js","/assets/star-BJtZMI64.js","/assets/statusBands-DhXHfRVX.js","/assets/store-BXDTGE1W.js","/assets/table-2-abWDEj61.js","/assets/table-properties-Bl2VCvJ1.js","/assets/tag-BjnRqvjR.js","/assets/timer-off-Bo4zGLMx.js","/assets/trending-down-gnLB79PD.js","/assets/trending-up-Dc_UlkF-.js","/assets/undo-2-DNv5ycL9.js","/assets/useChartTheme-gajt9e_l.js","/assets/useElementWidth-Dpp18li-.js","/assets/useIsMobile-BRfizRDM.js","/assets/useOpenParam-Da8BcGA2.js","/assets/useStatusBands-C2J5vwtT.js","/assets/useUrlScope-CdR8uEAb.js","/assets/user-D7a42n3D.js","/assets/user-cog-Z2lr3EPp.js","/assets/users-C_I8T1fU.js","/assets/vfx-D-6fZhnv.js","/assets/video-Boq-iq3C.js","/assets/wallet-BkYI4vRj.js","/assets/warehouse-CFkKzWK2.js","/assets/x-DkNPzCK2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
