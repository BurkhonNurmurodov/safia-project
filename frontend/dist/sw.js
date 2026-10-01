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

const BUILD = "2026-10-01T10:51:06.146Z";
const PRECACHE = ["/","/assets/AdminPanel-yZwPUFmR.js","/assets/AnalysisBoard-CNPyFaQT.js","/assets/Arc-CJABMxe0.js","/assets/ArcLegacy-BVWwcfZy.js","/assets/BrigadirProfile-DVt6jB1e.js","/assets/BroadcastReceivers-CdDxd7QN.js","/assets/BroadcastRecord-DCs5ZALo.js","/assets/CatLockNotice-Cwj2cmxW.js","/assets/CategoryLegendModal-52dW0ZMo.js","/assets/CellConcerns-DIpH5GCx.js","/assets/CellDetails-BByLzicg.js","/assets/CellFormModal-B4i3DT8y.js","/assets/CellIdent-D_Br015z.js","/assets/CellLink-C88qc68d.js","/assets/Cells-D6__l6oT.js","/assets/ColumnFilter-OhBmoDPt.js","/assets/ColumnsPicker-B_DNFYIA.js","/assets/CommentsModal-396FV53Y.js","/assets/ComparisonTable-Dr8lH6ZG.js","/assets/Concerns-BO_nOohC.js","/assets/ConfirmDialog-CrLdprfd.js","/assets/Daily-C96mR5II.js","/assets/DataTable-b6He_cOd.js","/assets/DateRangePicker-BsAZ5XIV.js","/assets/DayReportView-vOc50fz_.js","/assets/DayStepper-Dip7JzgD.js","/assets/DifferenceBreakdown-VFN-SLnn.js","/assets/Downtime-DBCUYt_V.js","/assets/Education-BG-SI7kc.js","/assets/EducationLesson-BVurSUW3.js","/assets/EmptyState-B3ViIpoh.js","/assets/Exam-CzTi6si8.js","/assets/FactorySelect-Csm4CH_Y.js","/assets/Gamification-CvrkDWgy.js","/assets/GroupBadge-BmKilrPg.js","/assets/HeatmapChart-DHQKe6NF.js","/assets/IdleCell-BPnNQfiz.js","/assets/KPICard-Cr8iWoMo.js","/assets/Kaizen-CmYbSkOj.js","/assets/Kelish-CftfmSjK.js","/assets/KpiDeltaCard-CE-9aXTJ.js","/assets/LangTextInput-M3oFH7os.js","/assets/Layout-BLlkiYfu.js","/assets/LeaderAppeal-AwpIdXAP.js","/assets/LeaderDayReport-CGaSPZYF.js","/assets/LeaderUnitReport-BvlVe6gS.js","/assets/Leaderboard-t5zUYCs-.js","/assets/Leaders-Jy-cqvnQ.js","/assets/Lightbox-BOF_0oly.js","/assets/LiveOverview-YxWL8hD0.js","/assets/Login-CmYGDAoX.js","/assets/NotFound-CS8w1ZPC.js","/assets/Overview-VaYaD3jV.js","/assets/Pagination-DKKbBrw3.js","/assets/PerenaladkaFactTable-CcYnW0xW.js","/assets/PlanFulfillment-DxeKYDix.js","/assets/Production-DzcCIDcT.js","/assets/Profile-BwmdAM_Y.js","/assets/ProofCamera-DPzbXg_3.js","/assets/ProofPhoto-okWIYe9W.js","/assets/Quality-Dv3167Wq.js","/assets/RequestStateChip-DNvVibY8.js","/assets/RichTextEditor-D80oaYTS.js","/assets/SaveState-BeZ_qiNW.js","/assets/SearchInput-80kcliYo.js","/assets/SeasonalityHeatmap-BbiGUp5r.js","/assets/SegmentedToggle-DGfDcJIm.js","/assets/SetupTimes-PqjLvQF6.js","/assets/ShiftDaily-D2KuR_VL.js","/assets/Staff-DaLviSeO.js","/assets/StaffLive-BRonS8Pj.js","/assets/StatusBadge-C2CIC91j.js","/assets/TargetGoal-B86yV9NX.js","/assets/Targets-B6wfNvZT.js","/assets/Tasks-DhFEW8dW.js","/assets/TimeWheelPicker-BiHYMao5.js","/assets/Tooltip-SNCXTbyb.js","/assets/TrendChart-_fKjqVe1.js","/assets/TripleSpeedometer-CNMzS0WL.js","/assets/Trudoyomkost-BsC7-lbz.js","/assets/UploadDropzone-CSZ7wbqt.js","/assets/UsersActivity-D9E9ZWjh.js","/assets/VerdictBlock-fJ3Tf8OU.js","/assets/WatchProgress-Dd2iru96.js","/assets/WebLogin-DM-czI2o.js","/assets/WorkerConcerns-V2bRcP3W.js","/assets/Workers-DnkuDb_6.js","/assets/Zagruzka-CwPRT5yR.js","/assets/ZagruzkaCell-CJqHc4jy.js","/assets/api-C4t5_V76.js","/assets/archive-CGc44zkq.js","/assets/archive-restore-Bc3P60gl.js","/assets/arrow-down-CwKGS8HG.js","/assets/arrow-left-Ca0GjMLX.js","/assets/arrow-left-right-DEjoyj3l.js","/assets/arrow-right-left-Cgtr5HHm.js","/assets/arrow-up--KucUSZ6.js","/assets/arrow-up-narrow-wide-BcNtehBg.js","/assets/arrow-up-right-zIuEPaT4.js","/assets/award-BvWCqm6k.js","/assets/ban-keBC8rnz.js","/assets/bot-HYFZBcnr.js","/assets/boxes-Bro1uCm1.js","/assets/brigadirFilters-2Q2g87_n.js","/assets/broadcastTree-Cnl9XIAN.js","/assets/building-2-B-Rnq4r1.js","/assets/calendar-D4zVLNGD.js","/assets/calendar-clock-CsuciRdh.js","/assets/calendar-days-Qf_Olufa.js","/assets/calendar-range-BV2slaLF.js","/assets/camera-WJZW5PNB.js","/assets/categories-D0FfYCz4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-8EU4a3B2.js","/assets/chart-line-BayxARBn.js","/assets/chart-pie-B_jMUAqo.js","/assets/chartRange-4ATk7XtK.js","/assets/chevron-left-BEArUlqs.js","/assets/chevrons-up-down-r083OIrM.js","/assets/circle-DqXbEENx.js","/assets/circle-check-big-0XjYwxTZ.js","/assets/circle-dot-boN2qJEM.js","/assets/circle-minus-8Yrh57KB.js","/assets/circle-slash-B9Wxb3dd.js","/assets/circle-user-round-CxlhiiJf.js","/assets/cloud-off-OFY6plip.js","/assets/cloud-upload-DYMgx9wp.js","/assets/compass-C4Bs-7zo.js","/assets/concernCategories-BpiTki2g.js","/assets/copy-C4n9Vlfm.js","/assets/corner-down-right-BwEMJtpg.js","/assets/createLucideIcon-CWfYWamz.js","/assets/es-CBtxY50d.js","/assets/exportXlsx-BU-KLzSG.js","/assets/external-link-DwaTD-Ne.js","/assets/file-clock-D3TUSlb6.js","/assets/file-exclamation-point-Dc7IlNP8.js","/assets/file-spreadsheet-C_PPEsXV.js","/assets/file-text-6C1x3i0S.js","/assets/flag-DAV88cpy.js","/assets/flame-BK7t01qr.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DsJPQKKC.js","/assets/hash-DYjgq2s5.js","/assets/history-ZxXRe2Nk.js","/assets/hourglass-QPxJ3MVW.js","/assets/id-card-BzkUZ_CK.js","/assets/image-cvhX0oe9.js","/assets/image-off-DwObJRmr.js","/assets/index-6rNv2tEv.css","/assets/index-DnvMtcdW.js","/assets/key-round-BEt-6d1n.js","/assets/keyboard-DiO9PwqL.js","/assets/languages-rMd_wOtk.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cz419kAr.js","/assets/lightbulb-lSIVsa8S.js","/assets/link-2-DTyQ1EcF.js","/assets/link-2-off-D0yEn74z.js","/assets/list-checks-CgkA62Yh.js","/assets/list-ordered-B4kRtzQg.js","/assets/list-tree-BQ-7YJ7d.js","/assets/lock-open-CKoh0jQI.js","/assets/log-in-B6EHRrsP.js","/assets/maximize-2-Dv0pvJAg.js","/assets/message-square-6RRjLEHJ.js","/assets/minimize-2-qBDJhjAc.js","/assets/package-check-BDQBM-Zw.js","/assets/paperclip-DZ7sVPaT.js","/assets/pencil-Dbwp17HG.js","/assets/percent-mIX138fU.js","/assets/personName-CogOuS3K.js","/assets/pin-BO4ASFOr.js","/assets/pin-off-bVMRva0H.js","/assets/play-D7RrwAT7.js","/assets/plug-zap-C8LvJgDu.js","/assets/presentation-CgJh0AUn.js","/assets/prop-types-DC0J6ch0.js","/assets/radio-kOZwdZjB.js","/assets/react-apexcharts.esm-DXThwHbC.js","/assets/repeat-DZiq7n2o.js","/assets/rotate-ccw-Bh42fFrL.js","/assets/rotate-cw-dhuI1Rrx.js","/assets/save-DMmIUfPd.js","/assets/scale-BzGHhzFC.js","/assets/scopeLinks-DLUTobzj.js","/assets/scroll-text-CDxvWRRO.js","/assets/search-x-mxTSylXD.js","/assets/segments-fccLsOCU.js","/assets/send-f-T7AgOb.js","/assets/settings-2-DH3wSH7G.js","/assets/shield-Dd9a9I73.js","/assets/shield-alert-C-SQQEoL.js","/assets/shield-check-0ykL8t17.js","/assets/shield-question-mark-CQw01wvU.js","/assets/siren-CBQcgK6W.js","/assets/snowflake-BIVViSTJ.js","/assets/split-Dy6UQj84.js","/assets/square-Drt6-vJa.js","/assets/square-check-big-B96Afuw6.js","/assets/star-CrJEghCU.js","/assets/statusBands-BBkgZ2J_.js","/assets/store-DJjbnm59.js","/assets/table-2-DrIGoApV.js","/assets/table-properties-8hMHIEXV.js","/assets/tag-DIgB5jZi.js","/assets/timer-off-MHVeunDq.js","/assets/trending-down-Bo4KT_Og.js","/assets/trending-up-Bnbr-alu.js","/assets/undo-2-G8BYZ79P.js","/assets/useChartTheme-auU4Wx8l.js","/assets/useElementWidth-DG-GQ5pu.js","/assets/useIsMobile-CcTeZ_rQ.js","/assets/useMutation-7U4dYtmQ.js","/assets/useStatusBands-KEI2o0lL.js","/assets/useUrlScope-DKCdVGKV.js","/assets/user-BJs6ElY6.js","/assets/user-cog-DsdNorHM.js","/assets/user-minus-BcnEIGfN.js","/assets/users-BOK0sEga.js","/assets/video-CS6_cUni.js","/assets/wallet-B2j6Smjc.js","/assets/warehouse-BuzF-fVN.js","/assets/zap-BxuHL78w.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
