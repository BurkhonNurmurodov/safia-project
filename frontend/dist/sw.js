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

const BUILD = "2026-10-06T16:15:21.570Z";
const PRECACHE = ["/","/assets/AdminPanel-DrTSbVIV.js","/assets/AnalysisBoard-BeCzy-vn.js","/assets/Arc-Bs4ZKid9.js","/assets/Assistant-DDDrgYKd.js","/assets/BrigadirProfile-CUnRWiDZ.js","/assets/BroadcastReceivers-VjH8b_xh.js","/assets/BroadcastRecord-Dv4UZQKz.js","/assets/Button-CMSQwTib.js","/assets/CatLockNotice-CSQ3OsBb.js","/assets/CategoryLegendModal-Dgd7ARSe.js","/assets/CellConcerns-DMnX7rax.js","/assets/CellDetails-GpYtwFYS.js","/assets/CellFormModal-CzMDsWij.js","/assets/CellIdent-DAYGj9Pu.js","/assets/CellLink-BtZexYlT.js","/assets/Cells-N1Xyg3kD.js","/assets/ColumnFilter-J4Xw18T8.js","/assets/ColumnsPicker-CvguLuQd.js","/assets/CommentsModal-C2Im6jJi.js","/assets/ComparisonTable-Dbp_11w1.js","/assets/Concerns-C5LYXS6r.js","/assets/Daily-Cz5gu_II.js","/assets/DataTable-Bd0W9duP.js","/assets/DateRangePicker-BXpFR1tn.js","/assets/DayReportView-D6a9-jHA.js","/assets/DayStepper-BviS1Q2c.js","/assets/DifferenceBreakdown-DhLNkJyu.js","/assets/Downtime-JGzLgUlM.js","/assets/Education-nhCJVjOY.js","/assets/EducationLesson-UBFYfv2h.js","/assets/EmptyState-CW02ViHE.js","/assets/Exam-BkKuADl4.js","/assets/FactorySelect-B009cKUQ.js","/assets/Gamification-DTKQcM8G.js","/assets/GroupBadge-BXGv7CUt.js","/assets/HeatmapChart-DDPvtuqX.js","/assets/IdleCell-JRZZF-2c.js","/assets/KPICard-DmgVNYxJ.js","/assets/Kaizen-BvQFwa0L.js","/assets/Kelish-CCeF34E6.js","/assets/KpiDeltaCard-haY8aveQ.js","/assets/LangTextInput-CSVga8iT.js","/assets/Layout-DbVRv8D3.js","/assets/LeaderAppeal-D-0nVu0c.js","/assets/LeaderDayReport-KA5PwkTC.js","/assets/LeaderUnitReport-DpjMVihL.js","/assets/Leaderboard-Bl3rk0XN.js","/assets/Leaders-CCxC1x0y.js","/assets/Lightbox-Bb3P8vYQ.js","/assets/LiveOverview-D-vZqmW8.js","/assets/Login-BEpT0JDR.js","/assets/NotFound-CQQngm5f.js","/assets/Notifications-BiIet436.js","/assets/Overview-Blj7nUAa.js","/assets/Pagination-CQUtizId.js","/assets/PerenaladkaFactTable-Cs1V5Bvj.js","/assets/PersonCard-CUt3-Mgh.js","/assets/PlanFulfillment-yPVWzMef.js","/assets/Production-DteAG6cf.js","/assets/Profile-DVh_b6Ir.js","/assets/ProofCamera-Mm1m710m.js","/assets/ProofPhoto-B42DfF8F.js","/assets/Quality-DmTmlUUk.js","/assets/RawRows-Ba4Yt_mi.js","/assets/RequestStateChip-Bm7-Fssy.js","/assets/RichTextEditor-Chh6IUHy.js","/assets/SaveState-DsFDTRUo.js","/assets/SearchInput-LCRmjqyv.js","/assets/SeasonalityHeatmap-CWaGxbdi.js","/assets/SegmentedToggle-3xCtf4OE.js","/assets/SetupTimes-Cjur6LVI.js","/assets/ShiftDaily-zQZvOGc2.js","/assets/Staff-KuCeFLoc.js","/assets/StaffLive-CRlhdC1u.js","/assets/StatusBadge-frb5bboT.js","/assets/TargetGoal-DFsWuOoE.js","/assets/Targets-DKrLZSQN.js","/assets/Tasks-DDzDXb0Q.js","/assets/TimeWheelPicker-C15KDOwW.js","/assets/Toast-DcNw5n-t.js","/assets/Tooltip-ByP2SVgK.js","/assets/TrendChart-BX4AxAtS.js","/assets/TripleSpeedometer-B5fk83y2.js","/assets/Trudoyomkost-D-7_v7ag.js","/assets/Turnover-5PxOX48K.js","/assets/UploadDropzone-CM0XT5CV.js","/assets/UsersActivity-Bf9mCDAL.js","/assets/VerdictBlock-BmnlqL2T.js","/assets/VfxApiMap-C0BFfq2q.js","/assets/VfxDictionaries-CSMni33p.js","/assets/VfxEmployees-CNeROs3_.js","/assets/VfxHrMoves-o4MpcrkK.js","/assets/VfxJobs-0igW29ll.js","/assets/VfxPhoto-Bc--kOY6.js","/assets/VfxShifts-DeYI_OpP.js","/assets/VfxState-B4X62DyT.js","/assets/VfxTimebooks-Csm5gSMP.js","/assets/VfxTimesheet-D3bYpJZc.js","/assets/WatchProgress-DNNNQfnH.js","/assets/WebLogin-DMx_H-XY.js","/assets/WorkerConcerns-DQWvBG5K.js","/assets/Workers-BO1WryB4.js","/assets/Zagruzka-DiGV7zUE.js","/assets/ZagruzkaCell-DI1SwCiQ.js","/assets/api-Ptd8SRbt.js","/assets/archive-d6fL-LNk.js","/assets/archive-restore-C1x3XQ6d.js","/assets/arrow-down-DuSrstjj.js","/assets/arrow-up-narrow-wide-U85qHOJI.js","/assets/award-Dp7lZf3V.js","/assets/ban-tKoElCmD.js","/assets/boxes-DIeOjsnG.js","/assets/braces-DQzmj8LI.js","/assets/brigadirFilters-DICHNkh9.js","/assets/broadcastTree-CHaxoY7E.js","/assets/building-2-J6vlQjfU.js","/assets/calculator-0A2VzDJE.js","/assets/calendar-days-CTqyzJbk.js","/assets/calendar-frMiglue.js","/assets/camera-BvbgCFwb.js","/assets/categories-Cg7_T5qB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CCq7VBGs.js","/assets/chart-line-DlB9um9S.js","/assets/chart-pie-D4G0Eurn.js","/assets/chartRange-MCPayakM.js","/assets/check-check-KnimDvMI.js","/assets/chevron-left-6ULaeMN_.js","/assets/chevrons-up-down-BaTKTiTp.js","/assets/circle-alert-Bcde9qc8.js","/assets/circle-check-big-IL9IP4WA.js","/assets/circle-dashed-BLQEkXAZ.js","/assets/circle-minus-kZmK8lKg.js","/assets/circle-question-mark-DK1p7jMR.js","/assets/circle-slash-BFWVqcDB.js","/assets/circle-t4gOZ1Um.js","/assets/circle-user-round-CJo3VbuD.js","/assets/clock-3-CHDSWBZZ.js","/assets/cloud-off-cNJsE2jN.js","/assets/cloud-upload-CIwOJ4Rk.js","/assets/compass-BksqYuOj.js","/assets/concernCategories-C-CLRiYh.js","/assets/copy-CD7QDIPJ.js","/assets/corner-down-right-DevuQvNk.js","/assets/createLucideIcon-FaEHfYov.js","/assets/es-zCBWedFt.js","/assets/external-link-D-ko2oCM.js","/assets/file-clock-CDj_3HQF.js","/assets/file-exclamation-point-BuvfaHF4.js","/assets/flag-BI_bylFY.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B-BjGy9r.js","/assets/hash-D-4je7Cs.js","/assets/hourglass-DaphGxPb.js","/assets/image-BlZK_-hu.js","/assets/image-off-BZeyTPLB.js","/assets/inbox-2acBbY44.js","/assets/index-BKM2gJ54.css","/assets/index-NPsltNBN.js","/assets/keyboard-DwVsYM6O.js","/assets/languages-DUhQmMcs.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D8o9syCT.js","/assets/lightbulb-B55aKu6Z.js","/assets/link-2-fV53BGeQ.js","/assets/link-2-off-DJZoPdph.js","/assets/list-ordered-Bxp72H5g.js","/assets/list-tree-C3ICF6C7.js","/assets/lock-open-CF7unnTS.js","/assets/log-in-Cf7vS-4p.js","/assets/minimize-2-D1YEljiR.js","/assets/package-check-C2ZfEyeZ.js","/assets/pencil-RE3mFUIg.js","/assets/percent-Mfc0bIZ4.js","/assets/pin-Cae1-cSa.js","/assets/pin-off-ZA-PjVEp.js","/assets/play-Cuwwapzh.js","/assets/plug-zap-BQQYtCOm.js","/assets/prop-types-YmC6RdU6.js","/assets/react-apexcharts.esm-CmEBbi-W.js","/assets/registers-CPBZN0wx.js","/assets/repeat-Df2Bthbv.js","/assets/rotate-cw-DqBAO-4G.js","/assets/save-DfxWM9jC.js","/assets/scopeLinks-RVc__eie.js","/assets/scroll-text-BoEVbyYD.js","/assets/search-x-Dwu3oaTt.js","/assets/segments-LuWETbnV.js","/assets/send-CEXmINxh.js","/assets/settings-2-D5FRcUWE.js","/assets/shield-Fc0R408H.js","/assets/shield-alert-Bix5yfhI.js","/assets/shield-question-mark-8Dp_xO_9.js","/assets/siren-BBrehb2b.js","/assets/snowflake-B6kQLDEl.js","/assets/split-UY0XKyO9.js","/assets/square-check-big-BdZB1yM-.js","/assets/star-Xxp-0Yix.js","/assets/statusBands-DAKErjVl.js","/assets/store-Cou_JUKe.js","/assets/table-2-BmOLARdj.js","/assets/table-properties-RsuPdUcb.js","/assets/tag-C4zWvjOg.js","/assets/timer-off-Db5xd7Ky.js","/assets/trending-down-BthQyHw5.js","/assets/trending-up-BeKml3pQ.js","/assets/undo-2-BW8nzYqy.js","/assets/useChartTheme-CT4gNfgI.js","/assets/useElementWidth-DfCjt9aG.js","/assets/useIsMobile-DIHKo71f.js","/assets/useOpenParam-C-LqeDEo.js","/assets/useStatusBands-CJWRibiM.js","/assets/useUrlScope--CoQwfgM.js","/assets/user-C5NRgN_A.js","/assets/user-cog-CsfCu14w.js","/assets/users-pYen2S6U.js","/assets/vfx-yY8wDvY_.js","/assets/video-Jn8v-NKP.js","/assets/wallet-CzMbKAnf.js","/assets/warehouse-CgWIuNxj.js","/assets/x-DF3QqMyE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
