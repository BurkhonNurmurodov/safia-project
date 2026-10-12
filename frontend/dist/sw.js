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

const BUILD = "2026-10-12T06:49:10.125Z";
const PRECACHE = ["/","/assets/AdminPanel-B7ykBcSo.js","/assets/AnalysisBoard-DCdKU821.js","/assets/Arc-DNqY39mT.js","/assets/Assistant-B85TQBz_.js","/assets/BrigadirProfile-DrEmSnQ6.js","/assets/BroadcastReceivers-BdCj8XkH.js","/assets/BroadcastRecord-iuOX16tM.js","/assets/Button-B_z1Lduh.js","/assets/CatLockNotice-eE1lnNjr.js","/assets/CategoryLegendModal-C7j_9HyL.js","/assets/CellConcerns-HWdeK0hl.js","/assets/CellDetails-Bgmzl8iy.js","/assets/CellFormModal-DNOfuKH5.js","/assets/CellIdent-BnITnjZW.js","/assets/CellLink-DMZBvOru.js","/assets/Cells-CdC0kw2y.js","/assets/ColumnFilter-hdiGEJ1j.js","/assets/ColumnsPicker-B_ghuZEv.js","/assets/CommentsModal-Dy4lwtDG.js","/assets/ComparisonTable-C4wxcYOL.js","/assets/Concerns-CTAs9zsR.js","/assets/Daily-czm7EGVu.js","/assets/DataTable-BFIwnw_v.js","/assets/DateRangePicker-Bev44V7s.js","/assets/DayReportView-CCxDTx9Z.js","/assets/DayStepper-7kmIK5ke.js","/assets/DifferenceBreakdown-6iMGLwc5.js","/assets/Downtime-BRqw6BoZ.js","/assets/Education-D7hJgcLa.js","/assets/EducationLesson-thkXSIQ5.js","/assets/EmptyState-Bp4kBj9D.js","/assets/Exam-BHElrdek.js","/assets/FactorySelect-BPjYTg4h.js","/assets/Gamification-C2mFcfkK.js","/assets/GroupBadge-D4OISBl7.js","/assets/HeatmapChart-DPibbjRz.js","/assets/IdleCell-DDI0ZWlT.js","/assets/KPICard-BEQyWyCM.js","/assets/Kaizen-bdQvkYh_.js","/assets/Kelish-CHWtDyS-.js","/assets/KpiDeltaCard-yr7tKyr-.js","/assets/LangTextInput-C1uFuPms.js","/assets/Layout-Bit5HHfc.js","/assets/LeaderAppeal-Cp9iZdg6.js","/assets/LeaderDayReport-CyzA8q8u.js","/assets/LeaderUnitReport-B7K1oBm5.js","/assets/Leaderboard-kTNrUxVo.js","/assets/Leaders-GXM5KyIn.js","/assets/Lightbox--L4ODFTF.js","/assets/LiveOverview-CrDpF1Sy.js","/assets/Login-BwjoIL25.js","/assets/NotFound-CDcuOVaf.js","/assets/Notifications-DtMb1u6S.js","/assets/Overview-CxmACu7a.js","/assets/Pagination-_5dsorp1.js","/assets/PerenaladkaFactTable-4gusaZfW.js","/assets/PersonCard-DK9_-vRi.js","/assets/PlanFulfillment-Dd2Uh7ca.js","/assets/Production-jkIvJxT3.js","/assets/Profile-9wNDyrHy.js","/assets/ProofCamera-Puu1iJTc.js","/assets/ProofPhoto-BKR7WUdQ.js","/assets/Quality-erMxLRsM.js","/assets/RawRows-CmA7Luey.js","/assets/RequestStateChip-DNcegHDh.js","/assets/RichTextEditor-Bnp-acyk.js","/assets/SaveState-A4-HmfE8.js","/assets/SearchInput-C9GwERU6.js","/assets/SeasonalityHeatmap-Bw9PCbNT.js","/assets/SegmentedToggle-87I4K299.js","/assets/SetupTimes-JXRRkXd9.js","/assets/ShiftDaily-D53wk6Pb.js","/assets/Staff-C4TpQi1U.js","/assets/StatusBadge-PBNSd1yt.js","/assets/TargetGoal-DOKH2dI0.js","/assets/Targets-gUpXusPs.js","/assets/Tasks-DIbacx9i.js","/assets/TimeWheelPicker-BybIA8SN.js","/assets/Toast-zdhLxMvW.js","/assets/Tooltip-BUVE8L17.js","/assets/TrendChart-Bdh-9SFV.js","/assets/TripleSpeedometer-B7vFvACk.js","/assets/Trudoyomkost-DXM3Z80f.js","/assets/Turnover-MjXVU2Jt.js","/assets/UploadDropzone-799HmGtd.js","/assets/UsersActivity-psRvy353.js","/assets/VerdictBlock-DriGLEda.js","/assets/VfxApiMap-V2_6wYmB.js","/assets/VfxDictionaries-U3nQiv8k.js","/assets/VfxEmployees-D41D_szq.js","/assets/VfxHrMoves-iqLhaYoF.js","/assets/VfxJobs-vOZn5N7-.js","/assets/VfxPhoto-D2Vy7Xbh.js","/assets/VfxShifts-rHl9CgvE.js","/assets/VfxState-B5UDcIgB.js","/assets/VfxTimebooks-Cqxl7JG9.js","/assets/VfxTimesheet-qa5uM6Jr.js","/assets/WatchProgress-Bd__SHep.js","/assets/WebLogin-B52skDbA.js","/assets/WorkerConcerns-vsr_D0Ql.js","/assets/Workers-DXrWKySO.js","/assets/Zagruzka-Big1DUML.js","/assets/ZagruzkaCell-CyxUq3fr.js","/assets/api-B_047SD5.js","/assets/archive-Dfo7wi_j.js","/assets/archive-restore-BnEK7fwo.js","/assets/arrow-down-CIO9vH0-.js","/assets/arrow-down-wide-narrow-BNOe1DXv.js","/assets/arrow-up-narrow-wide-LabytIVI.js","/assets/award-BECXVxHx.js","/assets/ban-DdBevJyU.js","/assets/boxes-D0etHsRG.js","/assets/braces-B3Zs2evx.js","/assets/brigadirFilters-CJZfgl0O.js","/assets/broadcastTree-aeSp2ox7.js","/assets/building-2-CYEHyEzN.js","/assets/calculator-BqVG-_0m.js","/assets/calendar-B8rnWd-S.js","/assets/calendar-days-CNs6p9Q8.js","/assets/camera-BRDbmyEp.js","/assets/categories-CN_srRnG.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ccyn8Ln6.js","/assets/chart-line-DBZhD7Zy.js","/assets/chart-pie-l3UISi_T.js","/assets/chartRange-B2XEGgC6.js","/assets/check-check-DYfKm0Zn.js","/assets/chevron-left-CkD7J6Sk.js","/assets/chevrons-up-down-CuaCEJfQ.js","/assets/circle-Bfr66QdF.js","/assets/circle-alert-DF9ioJIB.js","/assets/circle-check-big-BTE0OUGP.js","/assets/circle-dashed-qT3s7XzL.js","/assets/circle-minus-zeCvEkhC.js","/assets/circle-question-mark-tCV3MpFw.js","/assets/circle-slash--b7v_I6l.js","/assets/circle-user-round-bzkAztuj.js","/assets/clock-3-SLpOGn11.js","/assets/cloud-off-ClKT4aTn.js","/assets/cloud-upload-xsgNInn7.js","/assets/compass-CuoWI8or.js","/assets/concernCategories-qjUUK1aG.js","/assets/copy-iqfrD2vY.js","/assets/corner-down-right-Bn_zp4nj.js","/assets/createLucideIcon-vXcV_vO2.js","/assets/es-xKYSw1iF.js","/assets/external-link-zWCsRAfF.js","/assets/file-clock-CD-L650X.js","/assets/file-exclamation-point-C9-NF5y2.js","/assets/flag-DrMAAbZd.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D12rVv9L.js","/assets/hash-8sMQnWwv.js","/assets/hourglass-CIwLvlgP.js","/assets/image-off-BEl4nAWq.js","/assets/image-ot7zL8iD.js","/assets/inbox-BGVMY8FD.js","/assets/index-C-Hq5DQb.js","/assets/index-CI1cZ1SD.css","/assets/keyboard-Buwc9U1K.js","/assets/languages-D2bSUrKn.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dxf_R4F-.js","/assets/lightbulb-DFxVtQTn.js","/assets/link-2-kDzHIAdx.js","/assets/link-2-off-B7vM5MUj.js","/assets/list-ordered-BfLxIPQ4.js","/assets/list-tree-CWX6uoT_.js","/assets/lock-open-C_XJSn-y.js","/assets/log-in-BBQ4FKZl.js","/assets/minimize-2-BzX675jv.js","/assets/package-check-DEWJz2G3.js","/assets/pencil-Dy4lFKc9.js","/assets/percent-WmsTWXJe.js","/assets/pin-Dx4g0H0L.js","/assets/pin-off-CcYdSl6r.js","/assets/play-BD4xncVE.js","/assets/plug-zap-CfQB1kBQ.js","/assets/prop-types-IIV5Kpi9.js","/assets/radio-D6U95EX4.js","/assets/react-apexcharts.esm-CQdakVPw.js","/assets/registers-D0AP5_-4.js","/assets/repeat-CHHNS5rB.js","/assets/save-DHXhFhGT.js","/assets/scopeLinks-D5K1n2gN.js","/assets/scroll-text-Cwb5scPu.js","/assets/search-x-CHu02v-q.js","/assets/segments-ChMtumBY.js","/assets/send-DRY93hAb.js","/assets/settings-2-D76AXdVT.js","/assets/shield-CE8zi6Q3.js","/assets/shield-alert-P6jc98ID.js","/assets/shield-question-mark-ZFh9Bgz1.js","/assets/siren-CFIJ5HLq.js","/assets/snowflake-DfVD2yt5.js","/assets/split-Ds6e-nVt.js","/assets/square-check-big-DyBsR573.js","/assets/star-da-OhWWO.js","/assets/statusBands-C4l5eNb9.js","/assets/store-BYdJs2_9.js","/assets/table-2-DaXfkNT5.js","/assets/table-properties-BGxRB_3Y.js","/assets/tag-BLtoehCl.js","/assets/timer-off-CWBGjaXr.js","/assets/trending-down-DdLf6fYW.js","/assets/trending-up-BSMwVSnH.js","/assets/undo-2-BRwj5tcQ.js","/assets/useChartTheme-Cl6aWD_Q.js","/assets/useElementWidth-D4eDIRsQ.js","/assets/useIsMobile-DW1lANYF.js","/assets/useOpenParam-BvtxW-dU.js","/assets/useStatusBands-C873stNS.js","/assets/useUrlScope-CNfFqXJx.js","/assets/user-CHv2aRKa.js","/assets/user-cog-DdzOMOsL.js","/assets/users-CoRl3rWM.js","/assets/vfx-CrJhVgth.js","/assets/video-CK9fCnNb.js","/assets/wallet-BNfpqLiQ.js","/assets/warehouse-BZPreLT_.js","/assets/workflow-aECD_TqQ.js","/assets/x-yt8Gkm8w.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
