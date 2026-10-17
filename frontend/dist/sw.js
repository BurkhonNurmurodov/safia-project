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

const BUILD = "2026-10-17T08:57:20.421Z";
const PRECACHE = ["/","/assets/AdminPanel-gBGhnOdt.js","/assets/AnalysisBoard-FcsuRQGM.js","/assets/Arc-COiI_Z9C.js","/assets/Assistant-sUkxjE36.js","/assets/BrigadirProfile-5Tqk6JPy.js","/assets/BroadcastReceivers-CV4CC0fo.js","/assets/BroadcastRecord-CV4rHzy_.js","/assets/Button-Bk_t1w-b.js","/assets/CatLockNotice-hjcnyc3D.js","/assets/CategoryLegendModal-C8vrQ5qB.js","/assets/CellConcerns-DjDRhsvF.js","/assets/CellDetails-CAV_rHiH.js","/assets/CellFormModal-Cj_5Qgbr.js","/assets/CellIdent-CqbQF0lE.js","/assets/CellLink-DUC7uZRc.js","/assets/Cells-DXaLE5RT.js","/assets/ColumnFilter-Bb3IP-zR.js","/assets/ColumnsPicker-CQx3Y8bd.js","/assets/CommentsModal-C9ES9J4P.js","/assets/ComparisonTable-DF5_qwiY.js","/assets/Concerns-Cp6B_gyX.js","/assets/CountStepper-gFSkrnNx.js","/assets/Daily-B_ORPgA3.js","/assets/DataTable-hMv383k8.js","/assets/DateRangePicker-3s19tItz.js","/assets/DayReportView-CdWQ51BU.js","/assets/DayStepper-CKOl451d.js","/assets/DifferenceBreakdown-atcldXe-.js","/assets/Downtime-DKqQSt2Q.js","/assets/Education-CloYqIoT.js","/assets/EducationLesson-Bz9aAgSv.js","/assets/EmptyState-BP7sBvro.js","/assets/Exam-BQevyr5J.js","/assets/FactorySelect-DuwZHLCO.js","/assets/ForeignObjects-lzssPpKj.js","/assets/Gamification-pCGS9o7E.js","/assets/GroupBadge-aG89npwH.js","/assets/HeatmapChart-DCXXwBHw.js","/assets/IdleCell-wjvrf7jk.js","/assets/KPICard-BEh-fYtB.js","/assets/Kaizen-IIIxhgNE.js","/assets/Kelish-DXv9t5HS.js","/assets/KpiDeltaCard-D00V45A6.js","/assets/LangTextInput-D1aqFIRR.js","/assets/Layout-DqTCweuN.js","/assets/LeaderAppeal-GgGhdayL.js","/assets/LeaderDayReport-OPTHuC9u.js","/assets/LeaderUnitReport-DUyPHtZh.js","/assets/Leaderboard-CdTAOgvw.js","/assets/Leaders-2ZsmzQyc.js","/assets/Lightbox-Bz-EIVNK.js","/assets/LiveOverview-BEecqYPl.js","/assets/Login-D9BfyXbS.js","/assets/NotFound-C3WEH8Gp.js","/assets/Notifications-B9ollRRA.js","/assets/Overview-Corza4KS.js","/assets/Pagination-COAM0GDz.js","/assets/PerenaladkaFactTable-DhsF4NmI.js","/assets/PersonCard-Zp5s082-.js","/assets/PlanFulfillment-42Ypr0Vw.js","/assets/Production-CGklGnOC.js","/assets/Profile-CKKSm39f.js","/assets/ProofCamera-C4ccCF2L.js","/assets/Quality-DnWkFe5c.js","/assets/RawRows-DtU0ccyI.js","/assets/RequestStateChip-BDw_t6Ev.js","/assets/RichTextEditor-BHVdqzhk.js","/assets/SaveState-BYg7VuHr.js","/assets/SearchInput-BRvPaQIm.js","/assets/SeasonalityHeatmap-B2Kb1ddN.js","/assets/SegmentedToggle-BQ511hIp.js","/assets/SetupTimes-hKRpo2c7.js","/assets/ShiftDaily-DzffEwn2.js","/assets/Staff-Dd46Bkb0.js","/assets/StaffListAtCheck-ZpmKEu5f.js","/assets/StatusBadge-BQ939kFp.js","/assets/TargetGoal-Bv49CYmj.js","/assets/Targets-DBtmmKgC.js","/assets/Tasks-DZZgMBFH.js","/assets/TimeWheelPicker-CX5SHprQ.js","/assets/Toast-BKMMOS69.js","/assets/Tooltip-Cid76g8p.js","/assets/TrendChart-euEab3yy.js","/assets/TripleSpeedometer-Cxu6U_9w.js","/assets/Trudoyomkost-BGGjTgqb.js","/assets/Turnover-RPWziAT5.js","/assets/TurnoverBits-DkoQj_st.js","/assets/UploadDropzone-DPsHVeIL.js","/assets/UsersActivity-BohA7lN7.js","/assets/VerdictBlock-YbDiEO98.js","/assets/VfxApiMap-Qbqu4PT5.js","/assets/VfxDictionaries-CA6VNSu-.js","/assets/VfxEmployees-B-ARcw7H.js","/assets/VfxHrMoves-BzlvVbRH.js","/assets/VfxJobs-CkBOydGi.js","/assets/VfxPhoto-BBdZmtJ0.js","/assets/VfxShifts-FY_rMrkF.js","/assets/VfxState-BfphVwhd.js","/assets/VfxTimebooks-DAPOcoPm.js","/assets/VfxTimesheet-C76nrfPs.js","/assets/WatchProgress-DqrtfUnS.js","/assets/WebLogin-RLUlul-5.js","/assets/WorkerConcerns-th1UQzAJ.js","/assets/Workers-Bie_L8am.js","/assets/Zagruzka-DBCVm4mE.js","/assets/ZagruzkaCell-tSLNmNF0.js","/assets/api-BARudBgF.js","/assets/archive-D8NzZaIr.js","/assets/archive-restore-DQEeJzlu.js","/assets/arrow-down-B6E-RZvo.js","/assets/arrow-down-wide-narrow-C1USXCMG.js","/assets/arrow-up-narrow-wide-Esgzk8fh.js","/assets/award-Bfdnk-u7.js","/assets/ban-CeUOK9oV.js","/assets/boxes-B30SFxbz.js","/assets/braces-OCVrRwrf.js","/assets/brigadirFilters-BK5O7C53.js","/assets/broadcastTree-CB-Hkp14.js","/assets/building-2-BufaOD80.js","/assets/calculator-BRK39yGA.js","/assets/calendar-BI4RV4Rq.js","/assets/calendar-days-CyijWjA8.js","/assets/camera-D5NUqkWf.js","/assets/categories-2nf42M5P.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dl7Q9H6v.js","/assets/chart-line-CoNuleiW.js","/assets/chart-pie-D_r6YHzO.js","/assets/chartRange-C4wbrFir.js","/assets/check-check-Bwi2aXuy.js","/assets/chevron-left-BsvrTn8x.js","/assets/chevrons-up-down-BUD9dalS.js","/assets/circle-CR6qaqlu.js","/assets/circle-alert-B17oKUuX.js","/assets/circle-check-big-CCknpnBx.js","/assets/circle-dashed-BiTMkgw3.js","/assets/circle-minus-BT18fD8y.js","/assets/circle-question-mark-D3r804T-.js","/assets/circle-slash-CCeLQHnE.js","/assets/circle-user-round-CGDQs78I.js","/assets/cloud-off-DaR3yetK.js","/assets/cloud-upload-BXSF3fak.js","/assets/compass-BQeaPVzJ.js","/assets/concernCategories-BPB3K5Oo.js","/assets/corner-down-right-D3XbWJ5F.js","/assets/createLucideIcon-Du-XnoJQ.js","/assets/es-CZoSO__X.js","/assets/external-link-ZFdLIbIJ.js","/assets/file-clock-DvcJYXeI.js","/assets/file-exclamation-point-12p-Z3D_.js","/assets/flag-B8IXz91d.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-5F_ePNq7.js","/assets/hash-CaHd4h4C.js","/assets/hourglass-z7i9WpcY.js","/assets/image-Bb3OViy2.js","/assets/image-off-503Psojj.js","/assets/inbox-DBRme0fw.js","/assets/index-BpAme31B.js","/assets/index-ByhNoNK_.css","/assets/keyboard-BTfT3dH7.js","/assets/languages-BfdYZOl9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BtuVX2Te.js","/assets/lightbulb-qIQor_or.js","/assets/link-2-46uwTaRQ.js","/assets/link-2-off-CagBNH91.js","/assets/list-ordered-BPLD9skO.js","/assets/list-tree-DdQemNHF.js","/assets/lock-open-CzSk8fCE.js","/assets/log-in-CyaovsfR.js","/assets/marks-DAJ5_ZVo.js","/assets/minimize-2-9OMhz0qG.js","/assets/package-check-DM_oZfRZ.js","/assets/pencil-ul_wAVrL.js","/assets/percent-B0g3lsXu.js","/assets/pin-CLR5MzBU.js","/assets/pin-off-RU4fl4VX.js","/assets/play-D0HcLsJ_.js","/assets/plug-zap-BryOvKhb.js","/assets/prop-types-Dkcd5BYH.js","/assets/radio-C68x0PFQ.js","/assets/react-apexcharts.esm-DslEoa2s.js","/assets/registers-BwBxjgno.js","/assets/repeat-CZm9hlb5.js","/assets/save-BnFyftgd.js","/assets/scopeLinks-ry7trAQy.js","/assets/scroll-text-BGSxzXUc.js","/assets/search-x-DPNZg0I_.js","/assets/segments-BOpm2pjF.js","/assets/send-Dlmfdi3w.js","/assets/settings-2-5RzO3Ooq.js","/assets/shield-BSjc3eF-.js","/assets/shield-alert-CJhpUoyK.js","/assets/shield-question-mark-CDYMAiQJ.js","/assets/siren-Cetge-Rf.js","/assets/snowflake-CN5Unt-c.js","/assets/split-CM5HIGvb.js","/assets/square-check-big-WvKWsIld.js","/assets/star-BBowzDVa.js","/assets/statusBands-CA8tcqwq.js","/assets/store-9lRw27KT.js","/assets/table-2-BfmYWNcF.js","/assets/table-properties-CUA3ai0n.js","/assets/tag-4GqESEW7.js","/assets/timer-off-BJyAIwE2.js","/assets/trending-down-gmGITvLM.js","/assets/trending-up-Bhr9YmAu.js","/assets/undo-2-Fd-11jmh.js","/assets/useChartTheme-BEra5Yuh.js","/assets/useElementWidth-a3HOSmif.js","/assets/useIsMobile-DqCrs7aE.js","/assets/useOpenParam-CmtvJEAS.js","/assets/useStatusBands-CEzrQGxx.js","/assets/useUrlScope-vl5aUtDW.js","/assets/user-7vOkBWnu.js","/assets/user-cog-ByUtYgEt.js","/assets/users-PSZ5tabY.js","/assets/vfx-D2TwpU6H.js","/assets/video-DnI7Js4_.js","/assets/wallet-q2cmBnMz.js","/assets/warehouse-PFm8dvNr.js","/assets/workflow-DUZYWIDN.js","/assets/x-Dv_QRfYv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
