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

const BUILD = "2026-10-23T12:55:33.318Z";
const PRECACHE = ["/","/assets/AdminPanel-CS1Sa8bj.js","/assets/AnalysisBoard-BV9wy016.js","/assets/Arc-B7KzxI6R.js","/assets/Assistant-Kot75Hol.js","/assets/BrigadirProfile-ByO1o1ft.js","/assets/BroadcastReceivers-0YoDK387.js","/assets/BroadcastRecord-Df34ujGJ.js","/assets/Button-4bDKLx3s.js","/assets/CatLockNotice-O7MNhU4u.js","/assets/CategoryLegendModal-ZZEGFZiT.js","/assets/CellConcerns-CusgLjay.js","/assets/CellDetails-v0QMb1vX.js","/assets/CellFormModal-B8UKpRU8.js","/assets/CellIdent-ZoBkipL6.js","/assets/CellLink-BV7qGMUL.js","/assets/Cells-mx2zoHsg.js","/assets/ColumnFilter-DKk0FwwW.js","/assets/ColumnsPicker-xadXMKrf.js","/assets/CommentsModal-DcGdh-PW.js","/assets/ComparisonTable-CKEd2tBA.js","/assets/Concerns-CO-gCW3F.js","/assets/CountStepper-CPxjX2RF.js","/assets/Daily-kCOGl0L1.js","/assets/DataTable-CVNCHVC1.js","/assets/DateRangePicker-B22hK0TM.js","/assets/DayReportView-9FVeo8hn.js","/assets/DayStepper-BhGoS1S9.js","/assets/DayStrip-BUM59kXx.js","/assets/DifferenceBreakdown-BUc6P8fE.js","/assets/Downtime-DXcgJ_TN.js","/assets/Education-CJ8skn6K.js","/assets/EducationLesson-D4lfRBlH.js","/assets/EmptyState-DsqyfNcp.js","/assets/Exam-DL3Ptbte.js","/assets/FactorySelect-Bu1xvI-o.js","/assets/Gamification-DZcV0EmW.js","/assets/GroupBadge-CqvfkBOQ.js","/assets/HeatmapChart-DLIFKqkB.js","/assets/IdleCell-DKBx0sMS.js","/assets/KPICard-COxg9Tzl.js","/assets/Kaizen-CDnuDlUB.js","/assets/Kelish-6yeVDUJm.js","/assets/KpiDeltaCard-B8ybG_Tx.js","/assets/LangTextInput-DomXt68p.js","/assets/Layout-Dgw0Uq95.js","/assets/LeaderAppeal-DI5BDSp9.js","/assets/LeaderDayReport-DtrDuraL.js","/assets/LeaderUnitReport-DCMbfHeI.js","/assets/Leaderboard-CdlHyo7Q.js","/assets/Leaders-CDhOW9Br.js","/assets/LeadersKpi-C2ZvSLpB.js","/assets/Lightbox-Bxi_drOD.js","/assets/LiveOverview-CyPA3w8X.js","/assets/Login-DLoRAOQ_.js","/assets/NotFound-CgF8tvq3.js","/assets/Notifications-CjkQLFdg.js","/assets/Ontime-CdpyH_qB.js","/assets/Overview-CM5ghMlM.js","/assets/Pagination-g1IjjiR-.js","/assets/PerenaladkaFactTable-CzpIsclT.js","/assets/PersonCard-Ctivov47.js","/assets/PlanFulfillment-DiAWpqZA.js","/assets/Production-FN66rfMp.js","/assets/Profile-BYiEauBb.js","/assets/ProofCamera-BqY1RffC.js","/assets/ProofPhoto-C7cxHunw.js","/assets/Quality-Dxc6azzi.js","/assets/RawRows-BdHyJcoD.js","/assets/RequestStateChip-BqRcaIC6.js","/assets/RichTextEditor-D2jc8zZ9.js","/assets/SaveState-BNrd7GOY.js","/assets/SearchInput-BGvfOpQp.js","/assets/SeasonalityHeatmap-CQ4y0Xtc.js","/assets/SegmentedToggle-jw2ewCkf.js","/assets/SetupTimes-DrdzXlLQ.js","/assets/ShiftDaily-DSPL9TiA.js","/assets/Staff-Bg2cvkAa.js","/assets/StaffListAtCheck-DJJp7cfL.js","/assets/StatusBadge-9PTaUKan.js","/assets/StatusBandsModal-BmZ_O_d0.js","/assets/TargetGoal-DTLY_i4C.js","/assets/Targets-CXWliRBj.js","/assets/Tasks-DsDl0lXt.js","/assets/TimeWheelPicker-rU2mGvhD.js","/assets/Toast-BIYjG2h4.js","/assets/Tooltip-DV2Uypif.js","/assets/TrendChart-mDgab1-K.js","/assets/TripleSpeedometer-BTSbiRbd.js","/assets/Trudoyomkost-BeEzJ8WX.js","/assets/UploadDropzone-BXdPwvl8.js","/assets/UsersActivity-gLvwWA1v.js","/assets/VerdictBlock-DVswUAam.js","/assets/VfxApiMap-DE4Rttsw.js","/assets/VfxDictionaries-JyQlm2RV.js","/assets/VfxEmployees-CcMgKWWW.js","/assets/VfxHrMoves-CRd_HPRn.js","/assets/VfxJobs-BEAmM_hB.js","/assets/VfxPhoto-6hKfOyGx.js","/assets/VfxShifts-CFJ31pQd.js","/assets/VfxState-CMzWQGXS.js","/assets/VfxTimebooks-6DQW1eJ9.js","/assets/VfxTimesheet-uKCjqGaK.js","/assets/WatchProgress-DjOfrxpr.js","/assets/WebLogin-DDSoqVTG.js","/assets/Workers-gk0wxUzj.js","/assets/Zagruzka-DcKUTiA0.js","/assets/ZagruzkaCell-DhwqyuG2.js","/assets/api-DCXtMuMb.js","/assets/archive-DW0npfr1.js","/assets/archive-restore-BKPqf4fZ.js","/assets/arrow-down-Cq6p4QUc.js","/assets/arrow-down-right-7GqjUp52.js","/assets/arrow-down-wide-narrow-CaU9_rch.js","/assets/arrow-up-narrow-wide-DxfnRsUK.js","/assets/ban-BNwtgtjP.js","/assets/boxes-VtlwgomQ.js","/assets/braces-DM_ELAOg.js","/assets/brigadirFilters-jvZTwI3d.js","/assets/broadcastTree-C9-xygn7.js","/assets/building-2-w0WWOvEf.js","/assets/calendar-JFgxTssV.js","/assets/calendar-days-CbmrHzmr.js","/assets/camera-B1F2LbOm.js","/assets/categories-BYFQi4qZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CHm4gLBm.js","/assets/chart-line-BSg1HnSg.js","/assets/chart-pie-B48TaiWY.js","/assets/chartRange-SCsqaQch.js","/assets/check-check-CfRd6gYR.js","/assets/chevron-left-CQKA2nWV.js","/assets/chevrons-up-down-DRoYZhxw.js","/assets/circle-CkEaztZ1.js","/assets/circle-alert-CBHVx2XI.js","/assets/circle-check-big-bqc4fP5B.js","/assets/circle-dashed-B4saa8xb.js","/assets/circle-minus-C7jhmAR_.js","/assets/circle-question-mark-DryxyFX5.js","/assets/circle-slash-Bd9l7Gd8.js","/assets/circle-user-round-D77D_pcw.js","/assets/cloud-off-CCjWSnSS.js","/assets/cloud-upload-7RTYnI-6.js","/assets/compass-BZtK5sIf.js","/assets/concernCategories-Cwhp79Cn.js","/assets/corner-down-right-CmSiriTe.js","/assets/createLucideIcon-CvVeoaDs.js","/assets/es-B6Ybxc2Q.js","/assets/external-link-BgNRdj5i.js","/assets/file-clock-CNcX3ZYY.js","/assets/file-exclamation-point-DHdDJlxO.js","/assets/flag-DsmeyNCa.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-LHFMZWVl.js","/assets/funnel-C0O5cc6s.js","/assets/hash-UzUpYtqi.js","/assets/hourglass-CynwP7Ze.js","/assets/image-DQi4GFmv.js","/assets/image-off-Bj3pEQNT.js","/assets/inbox-hcpXrTZX.js","/assets/index-DFvJry-Q.css","/assets/index-DpttpPD_.js","/assets/keyboard-vj7QgMdw.js","/assets/languages-DFrTgmQx.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CpYLXIP9.js","/assets/leaderBoard-BuZzDeVJ.js","/assets/lightbulb-i4bOpGu7.js","/assets/link-2-BeR51hJk.js","/assets/link-2-off-vorUT5ue.js","/assets/list-ordered-C6UQFoGG.js","/assets/list-tree-BiWI1ow8.js","/assets/lock-open-DwidmhTn.js","/assets/log-in-CFzpEeGl.js","/assets/map-pin-DUQ_FPIU.js","/assets/marks-BPzd7FIs.js","/assets/minimize-2-BgKnwYVs.js","/assets/package-check-DLxjJ1-a.js","/assets/pencil-DManucpz.js","/assets/percent-BBciTb9S.js","/assets/pin-Yo6pl4ib.js","/assets/pin-off-Df-dcFRC.js","/assets/play-ahVetnLa.js","/assets/plug-zap-C6C5OGYO.js","/assets/prop-types-B2ejTuq1.js","/assets/radio-CdDguxqB.js","/assets/react-apexcharts.esm-Dw-kajl3.js","/assets/registers-lFmw1yUa.js","/assets/repeat-DYT9YBMF.js","/assets/save-DfwsIyMr.js","/assets/scopeLinks-qX3nA0hl.js","/assets/scroll-text-Jdr4GeV4.js","/assets/search-x-DCWfp0pB.js","/assets/segments-BOffu1Pp.js","/assets/send-CQnf4fRs.js","/assets/settings-2-Cq5ILVPO.js","/assets/shield-D5fsIyAy.js","/assets/shield-alert-B6ICvGus.js","/assets/shield-question-mark-BBSxEA83.js","/assets/sigma-DZjsewpN.js","/assets/siren-CXFupkOj.js","/assets/snowflake-DMeKlV_X.js","/assets/split-BWrcMOHo.js","/assets/square-check-big-B6I9GZ_B.js","/assets/star-aMQI68BQ.js","/assets/statusBands-BFCLMZbs.js","/assets/store-8ijw10Ka.js","/assets/table-2-CoqqHdj5.js","/assets/table-properties-elfvhWvt.js","/assets/tag-0sVHQOMb.js","/assets/timer-off-Cx6e4fkp.js","/assets/trendBuckets-DUWb4lGQ.js","/assets/trending-down-D3sHh5Y7.js","/assets/trending-up-B-do0jDb.js","/assets/undo-2-D6T5ZQUs.js","/assets/useChartTheme-C_5VeVLr.js","/assets/useElementWidth-Dxzewa7n.js","/assets/useIsMobile-CvBVpmqc.js","/assets/useOpenParam-C-s3dELk.js","/assets/useStatusBands-bq4F3uSs.js","/assets/useUrlScope-BHQcNlse.js","/assets/user-B2kaFG-G.js","/assets/user-cog-BLCnktIa.js","/assets/user-minus-DBhVQO-w.js","/assets/users-DytKJsMl.js","/assets/vfx-BhRBKAPG.js","/assets/video-B0YXlv9t.js","/assets/wallet-CIHHOVEh.js","/assets/warehouse-M83hy4u3.js","/assets/workflow-CUyCg7OL.js","/assets/x-DDQT8Wcj.js","/assets/zap-DrBM2IPC.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
