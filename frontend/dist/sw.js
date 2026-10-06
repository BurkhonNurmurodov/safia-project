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

const BUILD = "2026-10-06T16:30:20.386Z";
const PRECACHE = ["/","/assets/AdminPanel-Cre4tDeT.js","/assets/AnalysisBoard-C4OYHutw.js","/assets/Arc-H5QVAyFK.js","/assets/Assistant-Doa-vCsV.js","/assets/BrigadirProfile-_HcmKLqU.js","/assets/BroadcastReceivers-BIeNk-5a.js","/assets/BroadcastRecord-BV_D9KmN.js","/assets/Button-D19PlLTJ.js","/assets/CatLockNotice-Xohl1dhf.js","/assets/CategoryLegendModal-BmijPrEj.js","/assets/CellConcerns-CONDFKMp.js","/assets/CellDetails-CLaRttFa.js","/assets/CellFormModal-DxXrJOP6.js","/assets/CellIdent-B2082xnL.js","/assets/CellLink-vmneLe3_.js","/assets/Cells-C2qs8UQQ.js","/assets/ColumnFilter-DGuqv7oc.js","/assets/ColumnsPicker-BVlgh5cT.js","/assets/CommentsModal-Bwek7xlo.js","/assets/ComparisonTable-D4w3THij.js","/assets/Concerns-D7ICOry6.js","/assets/Daily-CVBUrjAN.js","/assets/DataTable-IrWNCP0X.js","/assets/DateRangePicker-B2t9ARow.js","/assets/DayReportView-C9ytmHCH.js","/assets/DayStepper-QpagnnR6.js","/assets/DifferenceBreakdown-BPFswEQM.js","/assets/Downtime-BgjDvIEa.js","/assets/Education-6SQjYgB_.js","/assets/EducationLesson-Cvwk3lV2.js","/assets/EmptyState-CLPTby5Y.js","/assets/Exam-8nO2xU4P.js","/assets/FactorySelect-tcMhD93d.js","/assets/Gamification-Dk4BeP2S.js","/assets/GroupBadge-Be7laKQr.js","/assets/HeatmapChart-DagBR0X4.js","/assets/IdleCell-QinFVHpE.js","/assets/KPICard-D8Xt_qjY.js","/assets/Kaizen-BVctcyR3.js","/assets/Kelish-B8i_FJ9E.js","/assets/KpiDeltaCard-Db6CsBjh.js","/assets/LangTextInput-dcS41mXh.js","/assets/Layout-C44TnpCE.js","/assets/LeaderAppeal-CNkyqC23.js","/assets/LeaderDayReport-BRIEuVUU.js","/assets/LeaderUnitReport-hRScvKvt.js","/assets/Leaderboard-Cb7sEok_.js","/assets/Leaders-Cy4OPWMj.js","/assets/Lightbox-D1Dpqshd.js","/assets/LiveOverview-Ckrm-dyK.js","/assets/Login-CiJVuOKr.js","/assets/NotFound-B93XTvTj.js","/assets/Notifications-BOe9BiKj.js","/assets/Overview-DUf-dK2o.js","/assets/Pagination-CT9EINGt.js","/assets/PerenaladkaFactTable-DDNXSKeN.js","/assets/PersonCard-BubZTRK9.js","/assets/PlanFulfillment-B9Sd1rY9.js","/assets/Production-Ce6duDii.js","/assets/Profile-D191fu_C.js","/assets/ProofCamera-Bp3ZGqH0.js","/assets/ProofPhoto-CEEIf8OG.js","/assets/Quality-mBVX9SJj.js","/assets/RawRows-bpqRR5iJ.js","/assets/RequestStateChip-DK1SFdfK.js","/assets/RichTextEditor-BNZ1LkUp.js","/assets/SaveState-B-z79_tX.js","/assets/SearchInput-CVcp4lzh.js","/assets/SeasonalityHeatmap-DbV47FVW.js","/assets/SegmentedToggle-Cp5sNorq.js","/assets/SetupTimes-B6wBaS97.js","/assets/ShiftDaily-BChUhbNH.js","/assets/Staff-C4a82oqa.js","/assets/StaffLive-DUKGzEL4.js","/assets/StatusBadge-BG3ZT2w2.js","/assets/TargetGoal-BioeA-HZ.js","/assets/Targets-B9LsXzy2.js","/assets/Tasks-BnWSeLrr.js","/assets/TimeWheelPicker-DlUHNkep.js","/assets/Toast-DbBrtKFQ.js","/assets/Tooltip-rycLsbI0.js","/assets/TrendChart-D7Az5ApT.js","/assets/TripleSpeedometer-Dbfzg8Tu.js","/assets/Trudoyomkost-C0skLVpZ.js","/assets/Turnover-Do_7F5_A.js","/assets/UploadDropzone-BKgFp40s.js","/assets/UsersActivity-BGSN328Q.js","/assets/VerdictBlock-A9Dvi-7I.js","/assets/VfxApiMap-DNzoa2Fu.js","/assets/VfxDictionaries-DXUqUXBj.js","/assets/VfxEmployees-BW9q--6b.js","/assets/VfxHrMoves-DIXH4x03.js","/assets/VfxJobs-CRiU22zn.js","/assets/VfxPhoto-DVSJmQih.js","/assets/VfxShifts-DD6kSGJd.js","/assets/VfxState-BP2grKDG.js","/assets/VfxTimebooks-DAshj9es.js","/assets/VfxTimesheet-B1JJ9XvX.js","/assets/WatchProgress-COQEpYD0.js","/assets/WebLogin-BXz5QnLy.js","/assets/WorkerConcerns-B9HRUVLO.js","/assets/Workers-Bb6s9VQ4.js","/assets/Zagruzka-xTZVoLnD.js","/assets/ZagruzkaCell-BqHCOMDw.js","/assets/api-CDm6gcr_.js","/assets/archive-PZlVQOrd.js","/assets/archive-restore-BB4auAaM.js","/assets/arrow-down-CTY3GEv1.js","/assets/arrow-up-narrow-wide-CIzC313c.js","/assets/award-q5YEgJKN.js","/assets/ban-bc9vXil0.js","/assets/boxes-C5f0KxWh.js","/assets/braces-CuY1H_u5.js","/assets/brigadirFilters-xYG9_BAB.js","/assets/broadcastTree-DZvxcSUb.js","/assets/building-2-BMr5VGDD.js","/assets/calculator-CqlINa_e.js","/assets/calendar-DEMLkUjH.js","/assets/calendar-days-FVuUnrTH.js","/assets/camera-DM9tkoBK.js","/assets/categories-wgRoalx9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BC53zLcM.js","/assets/chart-line-BwQl8FCg.js","/assets/chart-pie-C99vvOOy.js","/assets/chartRange-DA1Z6r2h.js","/assets/check-check-DlTysXoE.js","/assets/chevron-left-t2scav8C.js","/assets/chevrons-up-down-D-GT0ZvG.js","/assets/circle-BLHCHgTz.js","/assets/circle-alert-E17OnN9f.js","/assets/circle-check-big-BE5DBWIj.js","/assets/circle-dashed-BaSnkag6.js","/assets/circle-minus-CzQL6QFv.js","/assets/circle-question-mark-KR8_RA5D.js","/assets/circle-slash-Bb-4nLXa.js","/assets/circle-user-round-BbL8bMmZ.js","/assets/clock-3-Ccy5IsIp.js","/assets/cloud-off-Dm5ekln5.js","/assets/cloud-upload-Co52DJ2p.js","/assets/compass-m2sTT28U.js","/assets/concernCategories-DiGpz8EI.js","/assets/copy-DuE9Hu1o.js","/assets/corner-down-right-CXKOqTSh.js","/assets/createLucideIcon-DQbdU2jf.js","/assets/es-CcSG6Bqa.js","/assets/external-link-D7rdJC2x.js","/assets/file-clock-CiZunNSE.js","/assets/file-exclamation-point-CDpGijhI.js","/assets/flag-DXBkEZzo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-IB-Xala5.js","/assets/hash-9w-6VEMS.js","/assets/hourglass-Cb5kSU-r.js","/assets/image-BIzaE9u-.js","/assets/image-off-B8t9JwSB.js","/assets/inbox-DJDMg8Od.js","/assets/index-BKM2gJ54.css","/assets/index-Z8Cw4MYt.js","/assets/keyboard-B5P6I6fb.js","/assets/languages-DOpvG67X.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DTE4FhX2.js","/assets/lightbulb-Hv4mDq22.js","/assets/link-2-D6KHXNZY.js","/assets/link-2-off-BtTEq8cR.js","/assets/list-ordered-D8oYYKtZ.js","/assets/list-tree-VDVHZOGu.js","/assets/lock-open-CSv_qb1I.js","/assets/log-in-BEwMIAxR.js","/assets/minimize-2-D6SniG0-.js","/assets/package-check-ET0CVXAs.js","/assets/pencil-B_mFqY-y.js","/assets/percent-CH80qMw1.js","/assets/pin-AjDNpD63.js","/assets/pin-off-3IZlVooN.js","/assets/play-DE8sGw83.js","/assets/plug-zap-CvRqDlgx.js","/assets/prop-types-dSBjcLmV.js","/assets/react-apexcharts.esm-B4r0aHyp.js","/assets/registers-GNhM1pbY.js","/assets/repeat-Cueh_09d.js","/assets/rotate-cw-GJyQ5ID7.js","/assets/save-Cj3f-clg.js","/assets/scopeLinks-B6fn-ECN.js","/assets/scroll-text-DSEBOTfC.js","/assets/search-x-DWbvtjm-.js","/assets/segments-O40U_Jpo.js","/assets/send-DG3AybUU.js","/assets/settings-2-TEtsf3DG.js","/assets/shield-DZG8L0_R.js","/assets/shield-alert-BFxOWVPu.js","/assets/shield-question-mark-j7V_Dr6n.js","/assets/siren-BeHprzyl.js","/assets/snowflake-BNS-Sy2V.js","/assets/split-BUqHBGbN.js","/assets/square-check-big-Bn5ttBND.js","/assets/star-Dx9LFn65.js","/assets/statusBands-D6mQOISr.js","/assets/store-CrZR7wjC.js","/assets/table-2-B43wcmXe.js","/assets/table-properties-B3CEWLX8.js","/assets/tag-Ca0kmjSf.js","/assets/timer-off-BpH4x1Yg.js","/assets/trending-down-D8izVFHJ.js","/assets/trending-up-CqiSNmdf.js","/assets/undo-2-C6bJVusf.js","/assets/useChartTheme-WylD36Fg.js","/assets/useElementWidth-eDucdd4r.js","/assets/useIsMobile-B6q9F3UI.js","/assets/useOpenParam-fAPXkDJj.js","/assets/useStatusBands-2-CQOcGU.js","/assets/useUrlScope-W4hIaqKE.js","/assets/user-CseIu-pr.js","/assets/user-cog-BFnaxA7b.js","/assets/users-DyDz8Y6X.js","/assets/vfx-BDaE6Oyk.js","/assets/video-CxtEOMJC.js","/assets/wallet-BewGyi76.js","/assets/warehouse-CGNSwUmy.js","/assets/x-Dmle70ZY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
