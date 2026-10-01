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

const BUILD = "2026-10-01T07:15:22.218Z";
const PRECACHE = ["/","/assets/AdminPanel-DGCYO0w2.js","/assets/AnalysisBoard-C8qxkIc9.js","/assets/Arc-BIQHWDjv.js","/assets/ArcLegacy-C-2AGMK_.js","/assets/BrigadirProfile-BXaoENq7.js","/assets/BroadcastReceivers-DyZjGKFh.js","/assets/BroadcastRecord-C5kolKff.js","/assets/CatLockNotice-BODKCIlT.js","/assets/CategoryLegendModal-C2FqkmvZ.js","/assets/CellConcerns-T6PAAycO.js","/assets/CellDetails-BitYz4cQ.js","/assets/CellFormModal-DdfoS2RU.js","/assets/CellIdent-BZnoH9jj.js","/assets/CellLink-CKM3PHB-.js","/assets/Cells-DVIOqP-x.js","/assets/ColumnFilter-C_DynO_u.js","/assets/ColumnsPicker-Dj_kLG1o.js","/assets/CommentsModal-BBDEq8-G.js","/assets/ComparisonTable-BHu7aAuo.js","/assets/Concerns-9hq43akb.js","/assets/ConfirmDialog-Coe_X4hq.js","/assets/Daily-Cu7kcjHs.js","/assets/DataTable-CpvySSTx.js","/assets/DateRangePicker-b4QKH3Rs.js","/assets/DayReportView-Cdjjdsb6.js","/assets/DayStepper-DWH1rJOU.js","/assets/DifferenceBreakdown-pXLnaJ8-.js","/assets/Downtime-Ba-ZWaWO.js","/assets/Education-D__vOOy1.js","/assets/EducationLesson-9qUnC-5E.js","/assets/EmptyState-CuNJkZ79.js","/assets/Exam-IcqqW7X3.js","/assets/FactorySelect-BtvEfBwK.js","/assets/Gamification-BxTNSfey.js","/assets/GroupBadge-DR2sZDFt.js","/assets/HeatmapChart-CknUjEHc.js","/assets/IdleCell-ByUOAgni.js","/assets/KPICard-DLLqP56K.js","/assets/Kaizen-C2SpvxO3.js","/assets/Kelish-CvmHVSD_.js","/assets/KpiDeltaCard-B2tPhK7c.js","/assets/LangTextInput-CMCh_xXP.js","/assets/Layout-C3EdAir2.js","/assets/LeaderAppeal-DHmWt2bv.js","/assets/LeaderDayReport-C6TERRAJ.js","/assets/LeaderUnitReport-Bre7UlJz.js","/assets/Leaderboard-r3RXIHb7.js","/assets/Leaders-Digcqdjo.js","/assets/Lightbox-BSpTupn9.js","/assets/LiveOverview-BCd21z9n.js","/assets/Login-l0aGOZl5.js","/assets/NotFound-D0WB7QGm.js","/assets/Overview-NNPVXURE.js","/assets/Pagination-FAjpLTD5.js","/assets/PerenaladkaFactTable-BvO0KTNo.js","/assets/PlanFulfillment-BNOGx93g.js","/assets/Production-CkL7_nMl.js","/assets/Profile-BdW39NMJ.js","/assets/ProofCamera-CuPr3koh.js","/assets/ProofPhoto-DZ4AW5kz.js","/assets/Quality-C3UBN5Zz.js","/assets/RequestStateChip-C6iWpZ1n.js","/assets/RichTextEditor-DIPy3hcb.js","/assets/SaveState-UfcpMgDn.js","/assets/SearchInput-65JIC2M6.js","/assets/SeasonalityHeatmap-DW-fkmFf.js","/assets/SegmentedToggle-B-P6X8QK.js","/assets/SetupTimes-CsO5dOLA.js","/assets/ShiftDaily-DQ9DFR0K.js","/assets/Staff-CWfnVJmw.js","/assets/StatusBadge-DP7SBM2V.js","/assets/TargetGoal-CzrI9lO9.js","/assets/Targets-CVerzXoH.js","/assets/Tasks-BC_9J6ep.js","/assets/TimeWheelPicker-BIZMSZtJ.js","/assets/Tooltip-x5C9jJ1H.js","/assets/TrendChart-cDTVFv29.js","/assets/TripleSpeedometer-2bCO2frf.js","/assets/Trudoyomkost-zH_H_xqz.js","/assets/UploadDropzone-CLyJoPuo.js","/assets/UsersActivity-BDHUMZ3H.js","/assets/VerdictBlock-BXlP99Cj.js","/assets/WatchProgress-D0iGbTqc.js","/assets/WebLogin-OQMLJr8j.js","/assets/WorkerConcerns-DYaAy01e.js","/assets/Workers-5bpbDd23.js","/assets/Zagruzka-D2PE43p2.js","/assets/ZagruzkaCell-DIEYw0SK.js","/assets/api-XiBuHnUm.js","/assets/archive-BfQEiGr_.js","/assets/archive-restore-C0BGGFlV.js","/assets/arrow-down-C0xuyonF.js","/assets/arrow-left-DBiIK7N9.js","/assets/arrow-left-right-DlZB_vAv.js","/assets/arrow-up-D8LCdoFV.js","/assets/arrow-up-narrow-wide-BhxO6WkK.js","/assets/arrow-up-right-B-_moE9i.js","/assets/award-pRjYtHNS.js","/assets/ban-0DDngc8o.js","/assets/bot-BlbKmAsg.js","/assets/boxes-CKEM3wpQ.js","/assets/brigadirFilters-DGKNiJJe.js","/assets/broadcastTree-mf_XmdE7.js","/assets/building-2-CsEwRO_w.js","/assets/calendar-BIHvCRnv.js","/assets/calendar-clock-CIC0hg-i.js","/assets/calendar-days-B7fH0KLA.js","/assets/calendar-range-4iMpYT3a.js","/assets/camera-DuK9NUDA.js","/assets/categories-DkkQEd_Q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dif_FMHf.js","/assets/chart-line-BFKD7lm0.js","/assets/chart-pie-wq6_S6YA.js","/assets/chartRange-DAWV0m6r.js","/assets/chevron-left-Bhx8dhUK.js","/assets/chevrons-up-down-Bb6ej1uW.js","/assets/circle-Hxj90UhZ.js","/assets/circle-check-big-SrJ-sYgO.js","/assets/circle-dot-03gvwAHN.js","/assets/circle-minus-tRTYapa6.js","/assets/circle-slash--__F3FIX.js","/assets/circle-user-round-BisRIdQJ.js","/assets/cloud-off-BMYaowep.js","/assets/cloud-upload-Di9Yk11v.js","/assets/compass-DU6TnzF_.js","/assets/concernCategories-BRtgbXT1.js","/assets/copy-B9EjsP79.js","/assets/corner-down-right-BLiHnQOj.js","/assets/createLucideIcon-pzvv5gpl.js","/assets/es-vRWtBgjI.js","/assets/exportXlsx-GqI7LhY7.js","/assets/external-link-DqwAWhdm.js","/assets/file-clock-B6NQiXJk.js","/assets/file-exclamation-point-Cc0TDUvs.js","/assets/file-spreadsheet-CdQdKgxs.js","/assets/file-text-BM06cJZR.js","/assets/flag-BolSttkd.js","/assets/flame-CPVmZ0lG.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DTtJWODU.js","/assets/hash-DVTG4fnd.js","/assets/history-94G9gisV.js","/assets/hourglass-Bf9ntefK.js","/assets/image-DB0GjTac.js","/assets/image-off-BOO6Mhp0.js","/assets/index-BHS8Hg0Y.css","/assets/index-NHKRcP-8.js","/assets/key-round-BatUMFQL.js","/assets/keyboard-Dm55zusb.js","/assets/languages-CDcYqXyp.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CX9GHtTa.js","/assets/lightbulb-DvmQgGB-.js","/assets/link-2-CyuFfq6N.js","/assets/link-2-off-CbcDtXj8.js","/assets/list-checks-BDd7pdT4.js","/assets/list-ordered-vuW8pi0D.js","/assets/list-tree-DJXtlBN7.js","/assets/lock-open-5enYi_rb.js","/assets/log-in-DSe7sbi_.js","/assets/maximize-2-BDG_uKTF.js","/assets/message-square-BrkVxeUI.js","/assets/minimize-2-BYvo8XTo.js","/assets/package-check-BdTVDC1u.js","/assets/paperclip-BFNKjMbz.js","/assets/pencil-Bdekp1wz.js","/assets/percent-zWYMPsMD.js","/assets/personName-CogOuS3K.js","/assets/pin-iW6-tnCe.js","/assets/pin-off-C0K_KsxL.js","/assets/play-bepQvd34.js","/assets/plug-zap-DtvsbWP2.js","/assets/presentation-CM9r_1ol.js","/assets/prop-types-DwVG-KSx.js","/assets/radio-BmHfTebp.js","/assets/react-apexcharts.esm-CTM_lfBR.js","/assets/repeat-BLHfmB_P.js","/assets/rotate-ccw-CFioTPkY.js","/assets/rotate-cw-D1j08YSW.js","/assets/save-BwUW-65M.js","/assets/scale-DUYYQhFt.js","/assets/scopeLinks-DdAfrrGA.js","/assets/scroll-text-B4bBvPsP.js","/assets/search-x-3esCJ6fu.js","/assets/segments-CoWJ0t_2.js","/assets/send-ChKV099T.js","/assets/settings-2-DW5c18B9.js","/assets/shield-DDlCG5Op.js","/assets/shield-alert-D-fYa6t7.js","/assets/shield-check-BRgMnANe.js","/assets/shield-question-mark-C2A5q3pT.js","/assets/siren-CvSuH0p9.js","/assets/snowflake-CGtYK28t.js","/assets/split-CX7OmHfr.js","/assets/square-Beu46cVN.js","/assets/square-check-big-BjyVndzf.js","/assets/star-C9efW20F.js","/assets/statusBands-CAsQhAWf.js","/assets/store-B7OOm-uN.js","/assets/table-2-DE5fxo-3.js","/assets/table-properties-DqPdUbfy.js","/assets/tag-BUCTH0TG.js","/assets/timer-off-BEBwW9m6.js","/assets/trending-down-pacYWp7P.js","/assets/trending-up-BSS__j4G.js","/assets/undo-2-tZlLPXeq.js","/assets/useChartTheme-Bo1wqzyN.js","/assets/useElementWidth-CAHeaEZk.js","/assets/useIsMobile-BS9CDW5o.js","/assets/useMutation-DnWNZDwu.js","/assets/useStatusBands-CLI1rUhc.js","/assets/useUrlScope-D8IkiQHR.js","/assets/user-cog-DUfqBpjq.js","/assets/user-frmtfDpi.js","/assets/user-minus-B5itJtSm.js","/assets/users-DP4M3V_f.js","/assets/video-_DeKNUVX.js","/assets/wallet-CO8w6DqQ.js","/assets/warehouse-7vKAXuLo.js","/assets/zap-CwXxaIzt.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
