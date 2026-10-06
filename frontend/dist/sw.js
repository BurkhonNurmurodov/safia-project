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

const BUILD = "2026-10-06T16:56:43.637Z";
const PRECACHE = ["/","/assets/AdminPanel-C78qu5uH.js","/assets/AnalysisBoard-B41zAv_W.js","/assets/Arc-DAWa_6VD.js","/assets/Assistant-BFz8nNPN.js","/assets/BrigadirProfile-CuTnaVbb.js","/assets/BroadcastReceivers-YHuIppZq.js","/assets/BroadcastRecord-B8LWsfBy.js","/assets/Button-R9zQsK_o.js","/assets/CatLockNotice-CjmURpEA.js","/assets/CategoryLegendModal-CedfUQFD.js","/assets/CellConcerns-CAi3Wosk.js","/assets/CellDetails-fGR_8Pol.js","/assets/CellFormModal-HnWpnkh5.js","/assets/CellIdent-DJnTkC1x.js","/assets/CellLink-CFf2NJEv.js","/assets/Cells-DNUTs9ks.js","/assets/ColumnFilter-9BlN3vsu.js","/assets/ColumnsPicker-B45WOL54.js","/assets/CommentsModal-DMDQprDj.js","/assets/ComparisonTable-DJ9uXUep.js","/assets/Concerns-CAmXtVb-.js","/assets/Daily-DltTK9-7.js","/assets/DataTable-HsPChKir.js","/assets/DateRangePicker-DcLMeDrt.js","/assets/DayReportView-C6oMcKNJ.js","/assets/DayStepper-B9I5w0BO.js","/assets/DifferenceBreakdown-DvmynWqR.js","/assets/Downtime-ldtASCkY.js","/assets/Education-CCG0KT7V.js","/assets/EducationLesson-DdsHg-Fj.js","/assets/EmptyState-C8a7SWZu.js","/assets/Exam-Ch5oySJn.js","/assets/FactorySelect-ClSwQN_r.js","/assets/Gamification-DNJQ6zQH.js","/assets/GroupBadge-C4mVI-HZ.js","/assets/HeatmapChart-CnkYywII.js","/assets/IdleCell-D-t-58bU.js","/assets/KPICard-24uZeOiZ.js","/assets/Kaizen-C8WhaiOz.js","/assets/Kelish-BI5NJGx7.js","/assets/KpiDeltaCard-BjZWG9Mz.js","/assets/LangTextInput-Capa7iHG.js","/assets/Layout-DLcGrUmc.js","/assets/LeaderAppeal-Cvdjh5oP.js","/assets/LeaderDayReport-COILbXN6.js","/assets/LeaderUnitReport-D2pPikw6.js","/assets/Leaderboard-C1LNy2S6.js","/assets/Leaders-BqXN8PtP.js","/assets/Lightbox-Dj_R2y5c.js","/assets/LiveOverview-WFgHuiFp.js","/assets/Login-6zBZwiBr.js","/assets/NotFound-BbxJZwqm.js","/assets/Notifications-DN-JNjMi.js","/assets/Overview-CKofOc6w.js","/assets/Pagination-DU-iKmGH.js","/assets/PerenaladkaFactTable-r90OEb55.js","/assets/PersonCard-BEOKfx03.js","/assets/PlanFulfillment-C0ia_rI9.js","/assets/Production-_oICFXOT.js","/assets/Profile-nKO1CEhq.js","/assets/ProofCamera-DDFgVXiU.js","/assets/ProofPhoto-Hi_9_4TS.js","/assets/Quality-Bsawnvvq.js","/assets/RawRows-dPWgSpEq.js","/assets/RequestStateChip-D-v1BW-h.js","/assets/RichTextEditor-D1yApr2m.js","/assets/SaveState-DmV73jw8.js","/assets/SearchInput-C6YYSDtg.js","/assets/SeasonalityHeatmap-CrDEQ18h.js","/assets/SegmentedToggle-D9pkyZXO.js","/assets/SetupTimes-DXlBRtiE.js","/assets/ShiftDaily-DUTn_APZ.js","/assets/Staff-BIMthgv-.js","/assets/StaffLive-B5RTgRAA.js","/assets/StatusBadge-RzTovuk0.js","/assets/TargetGoal-DXT1Iuq9.js","/assets/Targets-BVFsxAHH.js","/assets/Tasks-kohAcA2O.js","/assets/TimeWheelPicker-BIrRu4gH.js","/assets/Toast-Ccz5Nout.js","/assets/Tooltip-CzGeHvTd.js","/assets/TrendChart-D72qpkbX.js","/assets/TripleSpeedometer-h6vO5rea.js","/assets/Trudoyomkost-CfdFbmuH.js","/assets/Turnover-D51MUXEf.js","/assets/UploadDropzone-Ce2m2J5S.js","/assets/UsersActivity-D_d-cqHU.js","/assets/VerdictBlock--Dc6HwGl.js","/assets/VfxApiMap-D6rFYPVv.js","/assets/VfxDictionaries-BY_cvz_g.js","/assets/VfxEmployees-Dyehuiw4.js","/assets/VfxHrMoves-f0Lh3Bx1.js","/assets/VfxJobs-7puwHnbI.js","/assets/VfxPhoto-BwyL2Fjh.js","/assets/VfxShifts-BgKXdyev.js","/assets/VfxState-DRNx6C7Q.js","/assets/VfxTimebooks-pFSFDATl.js","/assets/VfxTimesheet-D2TvNuP-.js","/assets/WatchProgress-DIlvcOBF.js","/assets/WebLogin-CtUuepka.js","/assets/WorkerConcerns-CVFP9yfO.js","/assets/Workers-QIoUXjxZ.js","/assets/Zagruzka-YNh8N2O1.js","/assets/ZagruzkaCell-BFqKi_NJ.js","/assets/api-DeU56L20.js","/assets/archive-DlX1BrB4.js","/assets/archive-restore-ShmEUp9F.js","/assets/arrow-down-CzARjWu4.js","/assets/arrow-up-narrow-wide-r2WkcCKH.js","/assets/award-BKD1tIC_.js","/assets/ban-Cau2EIi8.js","/assets/boxes-tQqQQQ6m.js","/assets/braces-CJLu7n0q.js","/assets/brigadirFilters-bn4QLXiO.js","/assets/broadcastTree-DHU5sUQr.js","/assets/building-2-GRzJm6s-.js","/assets/calculator-BlQw8-Rc.js","/assets/calendar-CiW31PoK.js","/assets/calendar-days-Dn52NBRM.js","/assets/camera-DvlEk4Ue.js","/assets/categories-CvqHEpY1.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DbumvoRl.js","/assets/chart-line-ZA3_FfwK.js","/assets/chart-pie-CpzudBe-.js","/assets/chartRange-CcQGcxmS.js","/assets/check-check-CzdrWu_B.js","/assets/chevron-left-8pnzTjBE.js","/assets/chevrons-up-down-DCY_IVRT.js","/assets/circle-BG9WWOiJ.js","/assets/circle-alert-UKjtzQ9j.js","/assets/circle-check-big-CTTm2u1M.js","/assets/circle-dashed-DRDjsWg8.js","/assets/circle-minus-B1upH0-7.js","/assets/circle-question-mark-DUtuc_Kr.js","/assets/circle-slash-BfChQJ4w.js","/assets/circle-user-round-BrvgTM8i.js","/assets/clock-3-DlqevoQ9.js","/assets/cloud-off-CfboCs3f.js","/assets/cloud-upload-CkhYkpcA.js","/assets/compass-B0O6prg_.js","/assets/concernCategories-BJokCIOB.js","/assets/copy-DLY7S_hY.js","/assets/corner-down-right-DM0ZDGvb.js","/assets/createLucideIcon-BXrjNCeD.js","/assets/es-LD_KrFTk.js","/assets/external-link-D2ig4sLO.js","/assets/file-clock-iV1M1XQA.js","/assets/file-exclamation-point-BtUhh8ZY.js","/assets/flag-BRpR5H1w.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-v6004WxY.js","/assets/hash-C_QGkCeo.js","/assets/hourglass-CWfQw7uH.js","/assets/image-mcekYj0f.js","/assets/image-off-x8OAHIcT.js","/assets/inbox-B4-Z0RzM.js","/assets/index-BKM2gJ54.css","/assets/index-D3bV2u4E.js","/assets/keyboard-OIT2XfyP.js","/assets/languages-k4XqDcL8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BHzBKB3m.js","/assets/lightbulb-D3o8DDmW.js","/assets/link-2-C8cURRp3.js","/assets/link-2-off-npHM8s-S.js","/assets/list-ordered-DhMHvUr3.js","/assets/list-tree-DhykyHXX.js","/assets/lock-open-B4i-QWeB.js","/assets/log-in-CpF7TeJO.js","/assets/minimize-2-DOKSddMd.js","/assets/package-check-BVs9TEK7.js","/assets/pencil-rbPDVFgd.js","/assets/percent-BFi9HvCu.js","/assets/pin-BoOC4DMx.js","/assets/pin-off-CgaDptbk.js","/assets/play-D5IsT2MT.js","/assets/plug-zap-BIZqZMpl.js","/assets/prop-types-CKU0c7Qp.js","/assets/react-apexcharts.esm-D4pGZXvA.js","/assets/registers-Cl0YwW8o.js","/assets/repeat-pl_kW7DP.js","/assets/rotate-cw-B_y7nv-X.js","/assets/save-BQusGzcF.js","/assets/scopeLinks-B83P8chc.js","/assets/scroll-text-DOjwWllW.js","/assets/search-x-D7Itf1hx.js","/assets/segments-DW_31wBE.js","/assets/send-DU9nHDWe.js","/assets/settings-2-tQBvUuxA.js","/assets/shield-BIsq6mif.js","/assets/shield-alert-BQDdSX6i.js","/assets/shield-question-mark-BU_no1Zl.js","/assets/siren-BYjmh8eg.js","/assets/snowflake-Ca-t7BFt.js","/assets/split-BonmcsUh.js","/assets/square-check-big-DzPMxHMm.js","/assets/star-Cnwc4i0Z.js","/assets/statusBands-CHg2bI2r.js","/assets/store-Dw1eQi56.js","/assets/table-2-BetyIZZJ.js","/assets/table-properties-C_fUfugi.js","/assets/tag-YHgONqPr.js","/assets/timer-off-DfrmPDX1.js","/assets/trending-down-LWcLYWrI.js","/assets/trending-up-mnGn1pL7.js","/assets/undo-2-P1wf3Xhg.js","/assets/useChartTheme-Bn542h9a.js","/assets/useElementWidth-CiNgRz0T.js","/assets/useIsMobile-BN83EUdl.js","/assets/useOpenParam-BWPzCDwp.js","/assets/useStatusBands-W1rHnzCP.js","/assets/useUrlScope-DoETVQae.js","/assets/user-XEpAZbes.js","/assets/user-cog-Cn2RvubW.js","/assets/users-CRgvN3ra.js","/assets/vfx-B4Cl1YcD.js","/assets/video-CUvcJ-j0.js","/assets/wallet-BuzagErk.js","/assets/warehouse-DHKSYLKw.js","/assets/x-BykQ1X58.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
