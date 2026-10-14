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

const BUILD = "2026-10-14T16:13:20.312Z";
const PRECACHE = ["/","/assets/AdminPanel-gsvh0I4H.js","/assets/AnalysisBoard-CBt9Y-i4.js","/assets/Arc-BUT2Jwdt.js","/assets/Assistant-B3gyNqLa.js","/assets/BrigadirProfile-CXaykYro.js","/assets/BroadcastReceivers-B9PEo36p.js","/assets/BroadcastRecord-BW5xX7x6.js","/assets/Button-DyiEzTL3.js","/assets/CatLockNotice-CWOfU8CF.js","/assets/CategoryLegendModal-BuRfLiRo.js","/assets/CellConcerns-DFcGSN8I.js","/assets/CellDetails-CVnPXho-.js","/assets/CellFormModal-DkK5Axkk.js","/assets/CellIdent-Do0eEDhl.js","/assets/CellLink-C6yxsxIP.js","/assets/Cells-BDQ7F_eq.js","/assets/ColumnFilter-BsCLYkvM.js","/assets/ColumnsPicker-wh4AdV-o.js","/assets/CommentsModal-CfYEzBHY.js","/assets/ComparisonTable-C80v5YND.js","/assets/Concerns-zRsDrLoo.js","/assets/CountStepper-CVbeZZTn.js","/assets/Daily-DDhj6eoE.js","/assets/DataTable-BaHVymDs.js","/assets/DateRangePicker-CMNFFrwh.js","/assets/DayReportView-Db-hkEXQ.js","/assets/DayStepper-nL23Q14h.js","/assets/DifferenceBreakdown-Cc6u2jHq.js","/assets/Downtime-D6acCgcT.js","/assets/Education-BjkIPR92.js","/assets/EducationLesson-rNbDV6ok.js","/assets/EmptyState-CFsbV6ko.js","/assets/Exam-CVGdI2Uv.js","/assets/FactorySelect-C1AikNBH.js","/assets/Gamification-Uuw-IamD.js","/assets/GroupBadge-DQQooAdB.js","/assets/HeatmapChart-BJrrOQea.js","/assets/IdleCell-CqQl2mly.js","/assets/KPICard-COAc2QBn.js","/assets/Kaizen-CrP59POb.js","/assets/Kelish-Cvd29mh4.js","/assets/KpiDeltaCard-DxBZGb1Z.js","/assets/LangTextInput-C4wLkMRR.js","/assets/Layout-CCWvNTfl.js","/assets/LeaderAppeal-DLaqEQu4.js","/assets/LeaderDayReport-WcQea_k-.js","/assets/LeaderUnitReport-DXz3xY36.js","/assets/Leaderboard-DuwH6uYf.js","/assets/Leaders-B2tlH_IR.js","/assets/Lightbox-DZDG4ti7.js","/assets/LiveOverview-Ckx2em7p.js","/assets/Login-CTiprpoX.js","/assets/NotFound-BoMx9fQ2.js","/assets/Notifications-C7TEIrm_.js","/assets/Overview-DdlhQxGL.js","/assets/Pagination-CjIhrVxS.js","/assets/PerenaladkaFactTable-CRGHW_Jf.js","/assets/PersonCard-Bbbln9pH.js","/assets/PlanFulfillment-s91vmWT_.js","/assets/Production-CF6OlhTA.js","/assets/Profile-qvNwV83r.js","/assets/ProofCamera-D4PkTpo5.js","/assets/Quality-BJjrkz8b.js","/assets/RawRows-DBanFX8q.js","/assets/RequestStateChip-C_wjcay7.js","/assets/RichTextEditor-BOpcQqxl.js","/assets/SaveState-Dz8fB3d2.js","/assets/SearchInput-BDkuoEmG.js","/assets/SeasonalityHeatmap-CHt6KX6u.js","/assets/SegmentedToggle-CGO4gu7T.js","/assets/SetupTimes-k9m6eIJr.js","/assets/ShiftDaily-DL2zhXmx.js","/assets/Staff-D6x_dVxe.js","/assets/StaffListAtCheck-DcUVMu0U.js","/assets/StatusBadge-D6shY7wZ.js","/assets/TargetGoal-OYJGiuKs.js","/assets/Targets-ZfcW_U_Q.js","/assets/Tasks-DRUQ4HUR.js","/assets/TimeWheelPicker-BI-o8kof.js","/assets/Toast-BjTh6dli.js","/assets/Tooltip-QnGz8hro.js","/assets/TrendChart-CWXvL_Xr.js","/assets/TripleSpeedometer-BN1PVUUG.js","/assets/Trudoyomkost-4gfxA7NZ.js","/assets/Turnover-De9wxRVz.js","/assets/UploadDropzone-DDc_9pyK.js","/assets/UsersActivity-DYx1SFA6.js","/assets/VerdictBlock-jz1VfYyR.js","/assets/VfxApiMap-C-UbSupd.js","/assets/VfxDictionaries-BdMj6aHt.js","/assets/VfxEmployees-BX2nuurV.js","/assets/VfxHrMoves-B_6kkSqu.js","/assets/VfxJobs-DvX4dftX.js","/assets/VfxPhoto-rGD_hfvK.js","/assets/VfxShifts-DcWr-34P.js","/assets/VfxState-DlpZwZp8.js","/assets/VfxTimebooks-7DmNltnp.js","/assets/VfxTimesheet-BmR4_huN.js","/assets/WatchProgress-BP0NI3xj.js","/assets/WebLogin-CKAY4CGn.js","/assets/WorkerConcerns-G7qdpj-3.js","/assets/Workers-DTe1NOGn.js","/assets/Zagruzka-BoWAt6WL.js","/assets/ZagruzkaCell-C7_v4Ud-.js","/assets/api-6s5tgtBP.js","/assets/archive-DHfbtY1V.js","/assets/archive-restore-DxH723xN.js","/assets/arrow-down-A3UgkBS6.js","/assets/arrow-down-wide-narrow-BtfvfQCI.js","/assets/arrow-up-narrow-wide-DpdiKpsS.js","/assets/award-BCsjAuYa.js","/assets/ban-Bn70Mlgt.js","/assets/boxes-DJuFRt3n.js","/assets/braces-CVHMGp1y.js","/assets/brigadirFilters-pUlPhWIN.js","/assets/broadcastTree-B4kDIuIL.js","/assets/building-2-_ybiYuBh.js","/assets/calculator-DDOEfxW5.js","/assets/calendar-CnNK0PYi.js","/assets/calendar-days-BXyCoNG_.js","/assets/camera-DikyBqca.js","/assets/categories-CwUTf1pH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CVm_uHMj.js","/assets/chart-line-CA6By20B.js","/assets/chart-pie--VqMwTki.js","/assets/chartRange-C9WnlsuK.js","/assets/check-check-BW8XIueY.js","/assets/chevron-left-DQzCaAOc.js","/assets/chevrons-up-down-DDt1EIwS.js","/assets/circle-BMTYqEyW.js","/assets/circle-alert-DOmnPpQS.js","/assets/circle-check-big-CJ2Un1U7.js","/assets/circle-dashed-CpdIQYgN.js","/assets/circle-minus-Cp9knik4.js","/assets/circle-question-mark-DA2_ZHxq.js","/assets/circle-slash-B_CdCJ-c.js","/assets/circle-user-round-BHCIP34I.js","/assets/clock-3-BbrS0v6U.js","/assets/cloud-off-Bvc__SoM.js","/assets/cloud-upload-Mr9Db6CG.js","/assets/compass-BBag3agE.js","/assets/concernCategories-CsRbog8o.js","/assets/copy-BYj2rZK3.js","/assets/corner-down-right-CqbHy9RJ.js","/assets/createLucideIcon-YLNIh1qg.js","/assets/es-Bs1uZnJp.js","/assets/external-link-BFBAUCVr.js","/assets/file-clock-BTkt0tJK.js","/assets/file-exclamation-point-ta0cvWjO.js","/assets/flag-DHbRWAOu.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-7f-D1axk.js","/assets/hash-iyau9xIr.js","/assets/hourglass--26YYGKw.js","/assets/image-DDc76x-v.js","/assets/image-off-BbjiSI_9.js","/assets/inbox-yDytdR5u.js","/assets/index-BOGqmkx0.js","/assets/index-DWCq5gUB.css","/assets/keyboard-CkqqydfM.js","/assets/languages-BN6pPIG5.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-PJ8-9sb3.js","/assets/lightbulb-B5JP54mK.js","/assets/link-2-DGAM6o57.js","/assets/link-2-off-kB0KiEuu.js","/assets/list-ordered-CUFY9pM_.js","/assets/list-tree-B0U2LyLC.js","/assets/lock-open-e4iBC47e.js","/assets/log-in-QoaBev8P.js","/assets/marks-DjUlsW4i.js","/assets/minimize-2-C92oJ_0V.js","/assets/package-check-BQgnby5g.js","/assets/pencil-B4l0AYwH.js","/assets/percent-DCz5qFjB.js","/assets/pin-B0TJeote.js","/assets/pin-off-DBbCL9Wb.js","/assets/play-CKGZ4Yy3.js","/assets/plug-zap-C6Wedbrm.js","/assets/prop-types-BXXdNDV_.js","/assets/radio-B1SaMwKE.js","/assets/react-apexcharts.esm-dKLlBzsG.js","/assets/registers-Cjvd0q4T.js","/assets/repeat-CSGmvr9q.js","/assets/save-vMPeqr05.js","/assets/scopeLinks-Bx5dsl6l.js","/assets/scroll-text-CQRoJdXn.js","/assets/search-x-s6R5lviY.js","/assets/segments-CQ4seLvj.js","/assets/send-ppvMxm2U.js","/assets/settings-2-CB1WdESN.js","/assets/shield-D8X_8HxW.js","/assets/shield-alert-DHkQAdyv.js","/assets/shield-question-mark-CfhBIP64.js","/assets/siren-BZnDZjc3.js","/assets/snowflake-B5TGL7hK.js","/assets/split-BDo1qhvc.js","/assets/square-check-big-eZg3-pKH.js","/assets/star-DDFT8Tvk.js","/assets/statusBands-CSjTsxti.js","/assets/store-C9XixCaD.js","/assets/table-2-C1J9EPoc.js","/assets/table-properties-FWhoHAQb.js","/assets/tag-BOKxmeZs.js","/assets/timer-off-D3LynqYP.js","/assets/trending-down-DQNG4_nA.js","/assets/trending-up-DBBgZDOt.js","/assets/undo-2-BmdAQX--.js","/assets/useChartTheme-B0ksmNeq.js","/assets/useElementWidth-DUxAwiPi.js","/assets/useIsMobile-B56bz0eQ.js","/assets/useOpenParam-B4dRBWET.js","/assets/useStatusBands-B2TUSFsd.js","/assets/useUrlScope-DLpxykwu.js","/assets/user-cog-Bshk1WAf.js","/assets/user-qB82gx-6.js","/assets/users-CcBGIdW3.js","/assets/vfx-D0n0NwpF.js","/assets/video-Du9_Wy9-.js","/assets/wallet-DG49ZSfW.js","/assets/warehouse-B_Jtp3dA.js","/assets/workflow-O69adka9.js","/assets/x-Cmdh8ns6.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
