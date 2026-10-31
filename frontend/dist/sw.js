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

const BUILD = "2026-10-31T05:57:36.975Z";
const PRECACHE = ["/","/assets/AdminPanel-D6KuLUTv.js","/assets/AnalysisBoard-BYySYJiI.js","/assets/Arc-Jcy0sRbO.js","/assets/Assistant-Q1SE64fk.js","/assets/BrigadirProfile-bGJOLwjw.js","/assets/BroadcastReceivers-D4dCFrJP.js","/assets/BroadcastRecord-C3J1zKTK.js","/assets/Button-BdnvKcod.js","/assets/CatLockNotice-DQv1lkPz.js","/assets/CategoryLegendModal-BKFQaE_z.js","/assets/CellConcerns-3dUPO9TC.js","/assets/CellDetails-DKnkbehm.js","/assets/CellFormModal-C4iC1YFI.js","/assets/CellIdent-Csvwft1F.js","/assets/CellLink-CpmG3X3J.js","/assets/Cells-CCNo97O7.js","/assets/ColumnFilter-AmUZWfwn.js","/assets/ColumnsPicker-DZ5zJCyC.js","/assets/CommentsModal-SzYlZw5X.js","/assets/ComparisonTable-Dl9maggv.js","/assets/Concerns-CZwNz8OX.js","/assets/CountStepper-CmX0kiS8.js","/assets/Daily-BIV11oef.js","/assets/DataTable-B9ELa8J3.js","/assets/DateRangePicker-s2v8Oxkj.js","/assets/DayReportView-mbXaK4ul.js","/assets/DayStepper-DXyatAdZ.js","/assets/DayStrip-C5xWcOc7.js","/assets/DifferenceBreakdown-yUSuPmfk.js","/assets/Downtime-CMLIn_Bb.js","/assets/Education-D_rt4xPC.js","/assets/EducationLesson-lJdIxsPE.js","/assets/EmptyState-DYg6wdPa.js","/assets/Exam-Bg1RHtag.js","/assets/FactorySelect-EEaTzIGd.js","/assets/Gamification-CtbexLFn.js","/assets/HeatmapChart-BMdEuEMC.js","/assets/IdleCell-C3lDqLbL.js","/assets/KPICard-DYJfGvbQ.js","/assets/Kaizen-BsBLdFwi.js","/assets/Kelish-D_fzO5BZ.js","/assets/KpiDeltaCard-DUaTua8-.js","/assets/LangTextInput-V-JPLkA8.js","/assets/Layout-B6bpdKo4.js","/assets/LeaderAppeal-DCA56vxL.js","/assets/LeaderDayReport-DybQQIAN.js","/assets/LeaderUnitReport-OEMnuzE8.js","/assets/Leaderboard-DO2a7Tx7.js","/assets/Leaders-uaCnhMiO.js","/assets/LeadersKpi-7q3I4meH.js","/assets/Lightbox-Jh5lLggP.js","/assets/LiveOverview-CAiM6x3E.js","/assets/Login--dDXvFXd.js","/assets/NotFound-0UqXvfFN.js","/assets/Notifications-DzBovI6G.js","/assets/Ontime-YyDNmUoD.js","/assets/Overview-D1YfATVA.js","/assets/Pagination-CWAcmncz.js","/assets/PerenaladkaFactTable-KWHwqtpF.js","/assets/PersonCard-1ubR3rUD.js","/assets/PlanFulfillment-E7yI4Q1E.js","/assets/Production-zXTT6ZW8.js","/assets/Profile-DFTMmH-b.js","/assets/ProofCamera-CO6spZqR.js","/assets/ProofPhoto-FZ1UH5wI.js","/assets/Quality-BalEZrAH.js","/assets/RawRows-C14b1yPH.js","/assets/Reports-BJBHfD7c.js","/assets/RequestStateChip-MSwU9JUq.js","/assets/RichTextEditor-Bw9eZIN1.js","/assets/SaveState-ON6ql99m.js","/assets/SearchInput-CyJJhvt-.js","/assets/SeasonalityHeatmap-Bw9Yd4ij.js","/assets/SegmentedToggle-BWi1GQsg.js","/assets/SetupTimes-BIld1i4g.js","/assets/ShiftDaily-BcDDLTMW.js","/assets/Staff-CrnMr2kD.js","/assets/StaffListAtCheck-CFiO9K6_.js","/assets/StatusBadge-DOOrgFkj.js","/assets/StatusBandsModal-DprZufmP.js","/assets/TargetGoal-DmoO5Tbs.js","/assets/Targets-DAt9I7MD.js","/assets/Tasks-DCfEsdnA.js","/assets/TimeWheelPicker-zu36LwBu.js","/assets/Toast-VMRJy7xV.js","/assets/Tooltip-BTC9ILp0.js","/assets/TrendChart-8IYDnx9J.js","/assets/TripleSpeedometer-BOR84ywn.js","/assets/Trudoyomkost-nupfh2K0.js","/assets/UploadDropzone-CbSOXrKU.js","/assets/UsersActivity-DFkzbERm.js","/assets/VerdictBlock-Baxn0PFy.js","/assets/VfxApiMap-B2OGm4qj.js","/assets/VfxDictionaries-Dlay06yM.js","/assets/VfxEmployees-e3u5jci5.js","/assets/VfxHrMoves-CNJ9nbid.js","/assets/VfxJobs-Hy4UPcf7.js","/assets/VfxPhoto-BFy4zKGO.js","/assets/VfxShifts-ByI4no-N.js","/assets/VfxState-ElHhUrU2.js","/assets/VfxTimebooks-D8yOHhIZ.js","/assets/VfxTimesheet-DlmG4vOF.js","/assets/WatchProgress-BInPpzkX.js","/assets/WebLogin-S6R_wSe3.js","/assets/Workers-gR5MU_3H.js","/assets/Zagruzka-DBLc26Ld.js","/assets/ZagruzkaCell-DIoAhsaj.js","/assets/api-BFm7MSgf.js","/assets/archive-DDNo36Ga.js","/assets/archive-restore-B6VWt7g2.js","/assets/arrow-down-BoAm3qle.js","/assets/arrow-down-right-B8l34HvO.js","/assets/arrow-down-wide-narrow-y8cslZWb.js","/assets/arrow-up-narrow-wide-BuwPK2e7.js","/assets/ban-4HNdBeeZ.js","/assets/boxes-DCz7KSxs.js","/assets/braces-uy4EBEZU.js","/assets/brigadirFilters-DBfNsyvk.js","/assets/broadcastTree-C8nX2mCC.js","/assets/calendar-1B00gSK1.js","/assets/calendar-days-DxlgHu47.js","/assets/camera-CBon-_5Z.js","/assets/categories-zToI-pd-.js","/assets/cellMoveRefusal-CWHyYv59.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BfoxPU9W.js","/assets/chart-line-BTYiMTgV.js","/assets/chart-pie-DBjad5SM.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-CJ4FL_0H.js","/assets/chevron-left-k0lNBchJ.js","/assets/chevrons-up-down-BC2vemon.js","/assets/circle-Cx709TXY.js","/assets/circle-alert-CAa9CcJJ.js","/assets/circle-check-big-F5fHoYu7.js","/assets/circle-dashed-CRixAcW6.js","/assets/circle-minus-DPZCc6uk.js","/assets/circle-question-mark-DUdXNYwa.js","/assets/circle-user-round-CqVF9B19.js","/assets/cloud-off-E2HltIu_.js","/assets/cloud-upload-Eq5iJ16P.js","/assets/coins-DY0rGT-I.js","/assets/compass-PZKjMmWY.js","/assets/concernCategories-n56B9usE.js","/assets/corner-down-right-3BobvI8A.js","/assets/createLucideIcon-COyzTc6s.js","/assets/en-CCsdaBfZ.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BPYdTa6V.js","/assets/file-exclamation-point-DkAgjPAi.js","/assets/flag-TSPPWXIT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BGpuWqr6.js","/assets/funnel-9coJMK9K.js","/assets/hash-CHq8prN5.js","/assets/hourglass-Bw2LAoDA.js","/assets/idleTime-CHPnJRpw.js","/assets/image-CKj08kPv.js","/assets/image-off-DFvaCTuw.js","/assets/inbox-DNxsc6sV.js","/assets/index-BF6NF0Xi.js","/assets/index-C7F5pw8q.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-VeGJ1KBk.js","/assets/layers-BKUkTpSE.js","/assets/leaderBoard-Ck7DJSyE.js","/assets/lightbulb-CYxCk6jw.js","/assets/link-2-CPrVCIL2.js","/assets/link-2-off-CuOFwKG0.js","/assets/list-ordered-BIB2tx_t.js","/assets/list-tree-BOoljGsm.js","/assets/lock-open-BJ3rKBjc.js","/assets/log-in-_tI5izAw.js","/assets/map-pin-33n85lDF.js","/assets/marks-Jj9MJt6C.js","/assets/minimize-2-Dg-8l8Of.js","/assets/package-C_Apx2bO.js","/assets/package-check-DLQWNChe.js","/assets/pencil-CUuadCXH.js","/assets/percent-CQQdRJi6.js","/assets/pin-BdA7rlgi.js","/assets/pin-off-c34wueIZ.js","/assets/play-CvpoGxmp.js","/assets/plug-zap-uYmqMK4w.js","/assets/prop-types-RD3fbola.js","/assets/radio-BdSNoOOu.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CcHNJuy1.js","/assets/repeat-CgRPqaJI.js","/assets/ru-CB4dLaNi.js","/assets/save-BGbKansI.js","/assets/scopeLinks-BHm8UfOU.js","/assets/search-x-B8Y9Mjyh.js","/assets/segments-D5Uiedtv.js","/assets/send-B8f-DGKp.js","/assets/shield-BvJtgraM.js","/assets/shield-alert-ChNiPGfq.js","/assets/sigma-Bp_WhMMq.js","/assets/siren-CfT46dNO.js","/assets/snowflake-DqasIjqz.js","/assets/split-BHAJ6-Gs.js","/assets/square-check-big-BZuD4UMd.js","/assets/star-T5GJW285.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CT7cYlZt.js","/assets/table-2-JGDrjZ5m.js","/assets/table-properties-Bk8-6R2Q.js","/assets/tag-Zxc57CFR.js","/assets/timer-off-WdiWp_vF.js","/assets/translations-CsxQHLZw.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-oUpzUDAp.js","/assets/trending-up-B93HM_cQ.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-51c2LmbC.js","/assets/useChartTheme-Cf29di2h.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-B9AgbNjv.js","/assets/useStatusBands-BECAXmek.js","/assets/useUrlScope-D2MSzo8N.js","/assets/user-CAF8pLZo.js","/assets/user-cog-Q7SVY_fj.js","/assets/uz-BQcOlvyY.js","/assets/uz_cyrl-MTIOn6OG.js","/assets/vfx-8_Arn2x2.js","/assets/video-QPQyUJT6.js","/assets/wallet-DCzB9r92.js","/assets/warehouse-CfRGmQIU.js","/assets/workflow-BhWFk1bw.js","/assets/x-psdoqjSS.js","/assets/zap-eb-zTCr2.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
