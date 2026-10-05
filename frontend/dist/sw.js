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

const BUILD = "2026-10-05T18:42:54.685Z";
const PRECACHE = ["/","/assets/AdminPanel-BnodiN_o.js","/assets/AnalysisBoard-B_3t_7EY.js","/assets/Arc-CiVQO7Eg.js","/assets/BrigadirProfile-fWROAHxl.js","/assets/BroadcastReceivers-0BvyRnfY.js","/assets/BroadcastRecord-Dfey2sP6.js","/assets/Button-K83jyLtt.js","/assets/CatLockNotice-DCDDcN7T.js","/assets/CategoryLegendModal-D9ZH_jpR.js","/assets/CellConcerns--nBkS4-2.js","/assets/CellDetails-PKypZUO9.js","/assets/CellFormModal-D1A_ll55.js","/assets/CellIdent-DwcGqFYF.js","/assets/CellLink-B4FScvhC.js","/assets/Cells-CYkvjCEN.js","/assets/ColumnFilter-DpNCOIQz.js","/assets/ColumnsPicker-BmUOX7u3.js","/assets/CommentsModal-DKKl8wI5.js","/assets/ComparisonTable-B3_qXkNk.js","/assets/Concerns-FKUvCd40.js","/assets/Daily-dx_R5IY0.js","/assets/DataTable-Bp0GWE6_.js","/assets/DateRangePicker-BSjYJSQP.js","/assets/DayReportView-Bwz7vArC.js","/assets/DayStepper-vOo9cMr_.js","/assets/DifferenceBreakdown-CJs0WB18.js","/assets/Downtime-DZp9lNBL.js","/assets/Education-Dz4YpY-s.js","/assets/EducationLesson-CyOt5O9F.js","/assets/EmptyState-DPp-RHMf.js","/assets/Exam-BFbveLKT.js","/assets/FactorySelect-EL9UjUyJ.js","/assets/Gamification-9CnXhRDB.js","/assets/GroupBadge-BHhYnrgZ.js","/assets/HeatmapChart-osrdTPhd.js","/assets/IdleCell-CsmDy4gM.js","/assets/KPICard-ukGDeXQK.js","/assets/Kaizen-DIi6geL5.js","/assets/Kelish-BUg3Cssq.js","/assets/KpiDeltaCard-FyTjuzZx.js","/assets/LangTextInput-BGRtNFTb.js","/assets/Layout-DUdcxrHx.js","/assets/LeaderAppeal-EbCWhwf5.js","/assets/LeaderDayReport-DjAPev8g.js","/assets/LeaderUnitReport-RJ1JYkTL.js","/assets/Leaderboard-rbkaL5Z1.js","/assets/Leaders-DgbC2PpK.js","/assets/Lightbox-BptckVHi.js","/assets/LiveOverview-Cp58ujxK.js","/assets/Login-Cg7E5dHK.js","/assets/NotFound-DDhY3aGU.js","/assets/Notifications-BEHrFSk0.js","/assets/Overview-BIIIrVs_.js","/assets/Pagination-Dq7t67Tp.js","/assets/PerenaladkaFactTable-BJU7cX4W.js","/assets/PersonCard-Bl_PBTLC.js","/assets/PlanFulfillment-gFSHJvx4.js","/assets/Production-DPD29msd.js","/assets/Profile-DCAbhJYq.js","/assets/ProofCamera-BF6w5sOG.js","/assets/ProofPhoto-DSDpNg3j.js","/assets/Quality-WN6xc54H.js","/assets/RawRows-DFZXDbOK.js","/assets/RequestStateChip-Cr2eyis-.js","/assets/RichTextEditor-C29o-Xtk.js","/assets/SaveState-BGn7Eu95.js","/assets/SearchInput-Dy8-fCrR.js","/assets/SeasonalityHeatmap-BoDy3y1r.js","/assets/SegmentedToggle-BPK_oyp8.js","/assets/SetupTimes-D-lUGC1c.js","/assets/ShiftDaily-CPMX1rxo.js","/assets/Staff-XzAPudiP.js","/assets/StaffLive-CT4I3WA-.js","/assets/StatusBadge-DyZj3gk7.js","/assets/TargetGoal-CrLx7PLx.js","/assets/Targets-QXyEkX6q.js","/assets/Tasks-DUUj7aAo.js","/assets/TimeWheelPicker-CH_l0n4k.js","/assets/Toast-D-ckUgvj.js","/assets/Tooltip-DYpPwOC3.js","/assets/TrendChart-CA-lg7Uz.js","/assets/TripleSpeedometer-alsu6afp.js","/assets/Trudoyomkost-D83s2WoQ.js","/assets/Turnover-hhIDKRlF.js","/assets/UploadDropzone-C7bhkX7X.js","/assets/UsersActivity-BMF5JsKl.js","/assets/VerdictBlock-CTSwmstS.js","/assets/VfxApiMap-BfdR4oms.js","/assets/VfxDictionaries-Bq4j4G29.js","/assets/VfxEmployees-BD7mN2nl.js","/assets/VfxHrMoves-CwoX_y81.js","/assets/VfxJobs-C-PC38QS.js","/assets/VfxPhoto-BTt8AGhG.js","/assets/VfxShifts-afKMcjo8.js","/assets/VfxState-XGyvo9u4.js","/assets/VfxTimebooks-Bt_FV3ws.js","/assets/VfxTimesheet-ClNlmQzB.js","/assets/WatchProgress-Bw6B4YJa.js","/assets/WebLogin-C2RWaDER.js","/assets/WorkerConcerns-CWEhhHzH.js","/assets/Workers-CRHvq-IQ.js","/assets/Zagruzka-HbyGe03E.js","/assets/ZagruzkaCell-Do--ZgNd.js","/assets/api-eF9NmyQ1.js","/assets/archive-BsYCMcZU.js","/assets/archive-restore-BkiF_Pno.js","/assets/arrow-down-DN6xjKFg.js","/assets/arrow-left-kNnpkzL4.js","/assets/arrow-up-DogUVBvH.js","/assets/arrow-up-narrow-wide-BXxwzeh1.js","/assets/arrow-up-right-CY9r6ECd.js","/assets/award-BYsxOOez.js","/assets/ban-DkikKkcy.js","/assets/book-open-C1u6dPrw.js","/assets/boxes-CZOUHUez.js","/assets/braces-BzCzIcKQ.js","/assets/brigadirFilters-_Dvk2moL.js","/assets/broadcastTree-s0KgGGP6.js","/assets/building-2-C7vdaixX.js","/assets/calculator-Dr3gqzW2.js","/assets/calendar-5A8H7MtS.js","/assets/calendar-days-CUnGnqiB.js","/assets/camera-DwIEbhin.js","/assets/categories-btW2OBNy.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DL2tMfOV.js","/assets/chart-line-Chih1L-Z.js","/assets/chart-pie-BFefk60Z.js","/assets/chartRange-QxCE-A99.js","/assets/check-check-BK2RGnw-.js","/assets/chevron-left-8o_iHQVT.js","/assets/chevrons-up-down-DmKBX4dF.js","/assets/circle-CUTuEkss.js","/assets/circle-alert-TLbSUS2Z.js","/assets/circle-check-big-BXJghvPI.js","/assets/circle-dashed-bxdzSfZE.js","/assets/circle-minus-tPXtaRdX.js","/assets/circle-question-mark-Df2IcYnx.js","/assets/circle-slash-BWN7UiSu.js","/assets/circle-user-round-BaJhefbO.js","/assets/clock-3-B6x_CCGq.js","/assets/cloud-off-iqXzu0eo.js","/assets/cloud-upload-DfkLam-O.js","/assets/compass-CkKpM9zE.js","/assets/concernCategories-FgNLaAcg.js","/assets/copy-vshFknO6.js","/assets/corner-down-right-DjEabUSt.js","/assets/createLucideIcon-DvnBqUod.js","/assets/es-DCyAYras.js","/assets/exportXlsx-CssvXB4D.js","/assets/external-link-Bi_EyUnp.js","/assets/file-clock-D0zwCaZY.js","/assets/file-exclamation-point-CjsLFJN3.js","/assets/file-spreadsheet-D_7W-P6E.js","/assets/file-text-Cb4SBX6N.js","/assets/flag-BCUwz7PR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BqcgO7Nz.js","/assets/hash-D9hsELCy.js","/assets/history-OxGyuzAo.js","/assets/hourglass-B55glaQh.js","/assets/image-CxLcnzlQ.js","/assets/image-off-BG9Y75Tp.js","/assets/inbox-mpiixULr.js","/assets/index-B1BGX_7I.css","/assets/index-DgMwSD3L.js","/assets/key-round-sow9V2fT.js","/assets/keyboard-Cy95XUV9.js","/assets/languages-DiAB8Gcs.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B5E18Ztc.js","/assets/lightbulb-Cdf4nLqa.js","/assets/link-2-DTFjMnQ2.js","/assets/link-2-off-CTyX9bcr.js","/assets/list-ordered-9zFYMCPl.js","/assets/list-tree-BzjXt-GN.js","/assets/lock-open-CULWMztf.js","/assets/log-in-D7HSmmz2.js","/assets/maximize-2-B_ICm4mk.js","/assets/message-square-CmtXHR0R.js","/assets/minimize-2-B2iNjYwn.js","/assets/package-check-BzK5g8Fv.js","/assets/paperclip-Dyyixa9Y.js","/assets/pencil-ChBpuZKV.js","/assets/percent-BjV64QbT.js","/assets/pin-D12Oe0_L.js","/assets/pin-off-D4Lfnrdh.js","/assets/play-Bv5lhc01.js","/assets/plug-zap-oDZF7UB9.js","/assets/presentation-Dul9Q0yQ.js","/assets/prop-types-BruZRqoz.js","/assets/radio-NYD41VaW.js","/assets/react-apexcharts.esm-DFyHI-hH.js","/assets/registers-B-qU3POT.js","/assets/repeat-CV47sQ2E.js","/assets/rotate-ccw-rtLtTOLT.js","/assets/rotate-cw-BIwL7gyX.js","/assets/save-DMRKrWKu.js","/assets/scopeLinks-sf29dkCg.js","/assets/scroll-text-CTOjl0gF.js","/assets/search-x-D0-VK4nD.js","/assets/segments-5KoZDs9B.js","/assets/send-BXaBmSrm.js","/assets/settings-2-D2gBW7U0.js","/assets/shield-BPUTJe-9.js","/assets/shield-alert-B9Ujrp3x.js","/assets/shield-check-CeKA58Ew.js","/assets/shield-question-mark-UyGutMQc.js","/assets/siren-CdQfbpKg.js","/assets/snowflake-B9D56oiX.js","/assets/split-DOYKyQgi.js","/assets/square-CCdZqc5B.js","/assets/square-check-big-EQ672z5o.js","/assets/star-BO2e00Hi.js","/assets/statusBands-8uIF3FNY.js","/assets/store-C3AkvrAs.js","/assets/table-2-Bhr7Kt07.js","/assets/table-properties-BE5m2jyV.js","/assets/tag-FKvsFDLn.js","/assets/timer-off-BFfm18x0.js","/assets/trending-down-Dw1uhMKT.js","/assets/trending-up-BEMDbdBM.js","/assets/undo-2-D7QAxc0H.js","/assets/useChartTheme-QHOM12X8.js","/assets/useElementWidth-CnLhWM6x.js","/assets/useIsMobile-DrQKuS7M.js","/assets/useOpenParam-DE7RLJSq.js","/assets/useStatusBands-BIw28vjS.js","/assets/useUrlScope-CHG-Zip1.js","/assets/user-DL67eXnu.js","/assets/user-cog-B50dUZDV.js","/assets/users-CkrXDQAH.js","/assets/vfx-D4E4I8_p.js","/assets/video-DLdC6qF0.js","/assets/wallet-DYBqQSp5.js","/assets/warehouse-DprwGOa9.js","/assets/x-AEju_Ns_.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
