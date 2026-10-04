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

const BUILD = "2026-10-04T10:08:52.867Z";
const PRECACHE = ["/","/assets/AdminPanel-B1dQ972f.js","/assets/AnalysisBoard-D9_s-2v2.js","/assets/Arc-DuQOMx1j.js","/assets/ArcLegacy-CxKcC0T6.js","/assets/BrigadirProfile-ByHPtHTT.js","/assets/BroadcastReceivers-CJJd6Utz.js","/assets/BroadcastRecord-B97yLek9.js","/assets/CatLockNotice-BAugPKeT.js","/assets/CategoryLegendModal-C-Tj3CVE.js","/assets/CellConcerns-VKA5UfC9.js","/assets/CellDetails-u0wRLBZF.js","/assets/CellFormModal-BFSyJdFX.js","/assets/CellIdent-CoRtrBrU.js","/assets/CellLink-C8vHXcse.js","/assets/Cells-CD36aAsY.js","/assets/ColumnFilter-DmsmbKWR.js","/assets/ColumnsPicker-C3LVSWoq.js","/assets/CommentsModal-CpknS6Ws.js","/assets/ComparisonTable-CDe4j__R.js","/assets/Concerns-C1C6VLv3.js","/assets/ConfirmDialog-D9S0WnMD.js","/assets/Daily-BdsEVvGy.js","/assets/DataTable-B8YnW9b0.js","/assets/DateRangePicker-BCG6OdU_.js","/assets/DayReportView-Brfd3_Ut.js","/assets/DayStepper-Dq7QYNCs.js","/assets/DifferenceBreakdown-SbdY2yGD.js","/assets/Downtime-UhTzG20h.js","/assets/Education-C_nA-0fm.js","/assets/EducationLesson-BxMk_eB0.js","/assets/EmptyState-DILwdcYc.js","/assets/Exam--At44z9C.js","/assets/FactorySelect-M_A2zXNe.js","/assets/Gamification-Ce1-BnWo.js","/assets/GroupBadge-_buWRZqJ.js","/assets/HeatmapChart-CbUe1NLe.js","/assets/IdleCell-Byqfgo0A.js","/assets/KPICard-5ZJ_0TE2.js","/assets/Kaizen-BS0__mCE.js","/assets/Kelish-DuDJmD8F.js","/assets/KpiDeltaCard-DOcIOCs-.js","/assets/LangTextInput-gMt80jQq.js","/assets/Layout-dLGJZZ86.js","/assets/LeaderAppeal-C5d9tf-8.js","/assets/LeaderDayReport-DvUbiIcq.js","/assets/LeaderUnitReport-BFLR9ox5.js","/assets/Leaderboard-CeesrxAL.js","/assets/Leaders-DmI_Zwkf.js","/assets/Lightbox-jm4LsQNV.js","/assets/LiveOverview-cuEDr2IM.js","/assets/Login-CCgfxH81.js","/assets/NotFound-BXq3zQWr.js","/assets/Notifications-DUefdVo4.js","/assets/Overview-9WdXdBJH.js","/assets/Pagination-DwCpElMd.js","/assets/PerenaladkaFactTable-Dll1-SDR.js","/assets/PersonCard-D7Bvp31J.js","/assets/PlanFulfillment-BWCzSJHo.js","/assets/Production-DvpG-YRX.js","/assets/Profile-BWMZRVAO.js","/assets/ProofCamera-Ch-dHaDX.js","/assets/ProofPhoto-YgBUf4GL.js","/assets/Quality-C-cWzSE2.js","/assets/RawRows-B5T6o6T7.js","/assets/RequestStateChip-DGLg6LC1.js","/assets/RichTextEditor-qXQjjs7z.js","/assets/SaveState-BNmfC_1-.js","/assets/SearchInput-fSzgyXhg.js","/assets/SeasonalityHeatmap-CJk_7VMO.js","/assets/SegmentedToggle-BFZPqsYG.js","/assets/SetupTimes-aXpLUgcC.js","/assets/ShiftDaily-XFsRwEm3.js","/assets/Staff-BfOHIHD-.js","/assets/StaffLive-CIbyWP_l.js","/assets/StatusBadge-isvz2TFz.js","/assets/TargetGoal-DvHIhzVR.js","/assets/Targets-B8KfQuSm.js","/assets/Tasks-D9os-uYR.js","/assets/TimeWheelPicker-BUyISju3.js","/assets/Toast-X22d9G3M.js","/assets/Tooltip-6zJeCQEV.js","/assets/TrendChart-RuBhjdfi.js","/assets/TripleSpeedometer-Dn8zfzNe.js","/assets/Trudoyomkost-G_L3UwuO.js","/assets/UploadDropzone-xRJBcf-W.js","/assets/UsersActivity-BSQVYvro.js","/assets/VerdictBlock-BN-jpcCX.js","/assets/VfxApiMap-ucjpy3Co.js","/assets/VfxDictionaries-CZ6xdZR0.js","/assets/VfxEmployees-CZbBh6rD.js","/assets/VfxHrMoves-saN619Z6.js","/assets/VfxJobs-CGF2o2tb.js","/assets/VfxPhoto-DhJXVm0u.js","/assets/VfxShifts-4-20g9IL.js","/assets/VfxState-TGWsKr6N.js","/assets/VfxTimebooks-DAf_ITjN.js","/assets/VfxTimesheet-CmihfTZr.js","/assets/WatchProgress-DP3m1Uiy.js","/assets/WebLogin-CTGctE0f.js","/assets/WorkerConcerns-DuEweW7Z.js","/assets/Workers-CNoNfOwm.js","/assets/Zagruzka-D2KhmZnC.js","/assets/ZagruzkaCell-C5FX-0iq.js","/assets/api-BPdrpRQ6.js","/assets/archive-BLJ8tMAn.js","/assets/archive-restore-C2AJ-m6p.js","/assets/arrow-down-ktNti-0c.js","/assets/arrow-left-CM4A7LcH.js","/assets/arrow-up-CvwGWmUB.js","/assets/arrow-up-narrow-wide-BMF24JN2.js","/assets/arrow-up-right-4aHNYRBw.js","/assets/award-BNHo6vKy.js","/assets/ban-DLES_kzh.js","/assets/bot-BvvcV5z9.js","/assets/boxes-CMKLWX-g.js","/assets/braces-SUtaG-93.js","/assets/brigadirFilters-BYrfz90r.js","/assets/broadcastTree-BDg6XOHy.js","/assets/building-2-tG0VhN3Y.js","/assets/calendar-3_egRj7m.js","/assets/calendar-days-Dl_l7yBG.js","/assets/camera-DphwPsUG.js","/assets/categories-BM_NJ57h.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CgaIZqyZ.js","/assets/chart-line-BFwqjHQA.js","/assets/chart-pie-CDgTXQja.js","/assets/chartRange-DjmwDlaK.js","/assets/check-check-Bc-XRf2x.js","/assets/chevron-left-DlDObG-B.js","/assets/chevrons-up-down-B3_9ZrzW.js","/assets/circle-BmTgwQcA.js","/assets/circle-alert-Dk3n2iUz.js","/assets/circle-check-big-CiCzK3iQ.js","/assets/circle-dashed-BtQqDdHB.js","/assets/circle-minus-ysAwdMWk.js","/assets/circle-question-mark-COVCUWaW.js","/assets/circle-slash-DrUaBAxp.js","/assets/circle-user-round-Bjz_ll6p.js","/assets/clock-3-C9LBpFVP.js","/assets/cloud-off-QfLFI51j.js","/assets/cloud-upload-BKM-Btb7.js","/assets/compass-BTfmZ8I3.js","/assets/concernCategories-BWlpQxwU.js","/assets/copy-Jg7gyV14.js","/assets/corner-down-right--22BeOrj.js","/assets/createLucideIcon-mqjmnGyo.js","/assets/es-D9_XsRcz.js","/assets/exportXlsx-kxZQyRnL.js","/assets/external-link-UVVTYUbi.js","/assets/file-clock-DLuqDoya.js","/assets/file-exclamation-point-DsWxWC6m.js","/assets/file-spreadsheet-CldHNApo.js","/assets/file-text-CzUrwKDp.js","/assets/flag-BpIygukb.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cl8NAtmj.js","/assets/hash-ZphBv6En.js","/assets/history-DTh95Vze.js","/assets/hourglass-Dd0Lq-jZ.js","/assets/image-DkEqGdxl.js","/assets/image-off-CWfPwGoR.js","/assets/inbox-D_xxiLj7.js","/assets/index-BngiOmj1.css","/assets/index-D0shNcma.js","/assets/key-round-B1E271VQ.js","/assets/keyboard-DUBX-dTT.js","/assets/languages-D1uutVQm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DH3zEwDo.js","/assets/lightbulb-Dtk2Ni7V.js","/assets/link-2-off-D3MkBSvh.js","/assets/link-2-rlUjxoIC.js","/assets/list-ordered-Cq5A8PS5.js","/assets/list-tree-HV2F3ywK.js","/assets/lock-open-Cj_wct7i.js","/assets/log-in-DkRLtgZ3.js","/assets/maximize-2-B4dk2VpP.js","/assets/message-square-BEo9mRJX.js","/assets/minimize-2-DOVW2Zv4.js","/assets/package-check-BRYfo1xN.js","/assets/paperclip-BWxd6OKI.js","/assets/pencil-poxxLorN.js","/assets/percent-BGlwP99S.js","/assets/pin-54E-JDZV.js","/assets/pin-off-B6fnHTsE.js","/assets/play-BJKK9Dap.js","/assets/plug-zap-CcTWcY6M.js","/assets/presentation-DmTswUvk.js","/assets/prop-types-Dj4OVTrn.js","/assets/radio-CjpQG5K0.js","/assets/react-apexcharts.esm-DGakzdW9.js","/assets/registers-DkjNbPhw.js","/assets/repeat-BClKLnPu.js","/assets/rotate-ccw-c69Z86xR.js","/assets/rotate-cw-DocqSJBh.js","/assets/save-CYG0wQNU.js","/assets/scopeLinks-C7bL747j.js","/assets/scroll-text-EanxPNZA.js","/assets/search-x-C9FEUZCV.js","/assets/segments-CnMj6OF_.js","/assets/send-t84V_3wa.js","/assets/settings-2-NmokCo21.js","/assets/shield-EIkU3S3U.js","/assets/shield-alert-DYm2VRAe.js","/assets/shield-check-BQ4q0s03.js","/assets/shield-question-mark-TyC1UwRA.js","/assets/siren-CKVa9oJb.js","/assets/snowflake-2bfvmrHL.js","/assets/split-BehBJwM7.js","/assets/square-BLiYAwui.js","/assets/square-check-big-DHyQ_7_i.js","/assets/star-BPqLEw8f.js","/assets/statusBands-G0LehzWD.js","/assets/store-cWlMm4Sj.js","/assets/table-2-Byln3wlY.js","/assets/table-properties-RTIpbUOk.js","/assets/tag-BFh1sDAj.js","/assets/timer-off-Bp-v1o-T.js","/assets/trending-down-CSG4KSRB.js","/assets/trending-up-CJYhDC6z.js","/assets/undo-2-mNkZMWWA.js","/assets/useChartTheme-6wvRslAq.js","/assets/useElementWidth-CCaqwwvv.js","/assets/useIsMobile--_wFpWu6.js","/assets/useOpenParam-DQ2QPye0.js","/assets/useStatusBands-D5ctNHv-.js","/assets/useUrlScope-CjCNsGeI.js","/assets/user-cog-k2GWVehs.js","/assets/user-minus-DPkeTM8g.js","/assets/user-nr-PEoFQ.js","/assets/users-B5TCEwO8.js","/assets/video-BxYK_fNk.js","/assets/wallet-CCHklWSx.js","/assets/warehouse-DDat9Oiu.js","/assets/x-BhFZ9K2i.js","/assets/zap-DWwQNI1P.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
