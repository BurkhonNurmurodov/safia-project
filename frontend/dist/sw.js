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

const BUILD = "2026-10-05T18:15:19.585Z";
const PRECACHE = ["/","/assets/AdminPanel-DiHsSuXs.js","/assets/AnalysisBoard-CiOl7HFk.js","/assets/Arc-DNOgHHUs.js","/assets/BrigadirProfile-64N4d7Dq.js","/assets/BroadcastReceivers-BsAScwEU.js","/assets/BroadcastRecord-B-n9-K7W.js","/assets/Button-NEtEUjfB.js","/assets/CatLockNotice-rDeuaZBp.js","/assets/CategoryLegendModal-Cm6X2fVa.js","/assets/CellConcerns-DkV_NhZy.js","/assets/CellDetails-S3qHbqwe.js","/assets/CellFormModal-Dy6pqrMB.js","/assets/CellIdent-fSvdDDPS.js","/assets/CellLink-DIUn99NJ.js","/assets/Cells-CDE51DYK.js","/assets/ColumnFilter-DooyEMr4.js","/assets/ColumnsPicker-CdDnRBCO.js","/assets/CommentsModal-DmH0UAGi.js","/assets/ComparisonTable-5kObqOZb.js","/assets/Concerns-Bs7yeS3v.js","/assets/Daily-O206C8cW.js","/assets/DataTable-BGTSj4cw.js","/assets/DateRangePicker-D86Us_Ic.js","/assets/DayReportView-D38OWINw.js","/assets/DayStepper-g9XN3uRX.js","/assets/DifferenceBreakdown-C3uLqan2.js","/assets/Downtime-DQveyvkn.js","/assets/Education-DMxvUrh9.js","/assets/EducationLesson-JWVVTLfQ.js","/assets/EmptyState-AAZSubV3.js","/assets/Exam-Cf81yabR.js","/assets/FactorySelect-Cl6EOiy7.js","/assets/Gamification-CArp9riY.js","/assets/GroupBadge-60jVgqPn.js","/assets/HeatmapChart-C-NkgMUn.js","/assets/IdleCell-s35LhN1Z.js","/assets/KPICard-Ezktblnb.js","/assets/Kaizen-DQiYPxKZ.js","/assets/Kelish-CeGgBWtj.js","/assets/KpiDeltaCard-jSzCMoVI.js","/assets/LangTextInput-D6eu1OuS.js","/assets/Layout-3M81Iwd-.js","/assets/LeaderAppeal-BYfUBT_N.js","/assets/LeaderDayReport-B3Yoh0zy.js","/assets/LeaderUnitReport-BAENHXig.js","/assets/Leaderboard-I_-myng0.js","/assets/Leaders-DIwlqsez.js","/assets/Lightbox-QUoxY7-w.js","/assets/LiveOverview-aO782tTD.js","/assets/Login-Cu7a16kx.js","/assets/NotFound-BtRGv4qy.js","/assets/Notifications-UwoOiYBD.js","/assets/Overview-5tWfOgRZ.js","/assets/Pagination-Bv3Tn1cW.js","/assets/PerenaladkaFactTable-BqqfyD01.js","/assets/PersonCard-D1ISB4Uj.js","/assets/PlanFulfillment-BYO73Ddc.js","/assets/Production-Cm-ZXcHx.js","/assets/Profile-Dg3yobD2.js","/assets/ProofCamera-BymdwBOY.js","/assets/ProofPhoto-W18jp2rI.js","/assets/Quality-BE1hrKoG.js","/assets/RawRows-SY8Cue2g.js","/assets/RequestStateChip-Dy0WzI4c.js","/assets/RichTextEditor-DCHt3yR-.js","/assets/SaveState-avH-xU83.js","/assets/SearchInput-DdAVKJMr.js","/assets/SeasonalityHeatmap-DDmyiu0X.js","/assets/SegmentedToggle-Ca_YO49b.js","/assets/SetupTimes-Hh6adNic.js","/assets/ShiftDaily-C7jOpiY_.js","/assets/Staff-mENAtWIU.js","/assets/StaffLive-C_M_A8vE.js","/assets/StatusBadge-BzcJZL6p.js","/assets/TargetGoal-Bl3aA1rh.js","/assets/Targets-DKyV-MHJ.js","/assets/Tasks-a9sqpmM6.js","/assets/TimeWheelPicker-C4yPnmCP.js","/assets/Toast-cvUk19qn.js","/assets/Tooltip-C8sAN1qi.js","/assets/TrendChart-Dqv5oJXZ.js","/assets/TripleSpeedometer-Ufs9rg0M.js","/assets/Trudoyomkost-DmJy5j4C.js","/assets/Turnover-DymwWCUb.js","/assets/UploadDropzone-GatbSl9K.js","/assets/UsersActivity-C4UlbsFi.js","/assets/VerdictBlock-DF5v-S_s.js","/assets/VfxApiMap-Ca6i4pH2.js","/assets/VfxDictionaries-DjwZUMVS.js","/assets/VfxEmployees-CZssE1kH.js","/assets/VfxHrMoves-D8Txicj9.js","/assets/VfxJobs-DSfNCjcO.js","/assets/VfxPhoto-Cjf4LNIX.js","/assets/VfxShifts-Ce1LAh5h.js","/assets/VfxState-Cs-T_Ddz.js","/assets/VfxTimebooks-qbaa3xGG.js","/assets/VfxTimesheet-CyQUk2ga.js","/assets/WatchProgress-aVQryQCg.js","/assets/WebLogin-BvMm0PD3.js","/assets/WorkerConcerns-JyiaHq7I.js","/assets/Workers-DaA6rXTR.js","/assets/Zagruzka-DYWRQ-z9.js","/assets/ZagruzkaCell-BdXC2UUG.js","/assets/api-mT_Ed_M5.js","/assets/archive-ngbM0_Ze.js","/assets/archive-restore-D_3KcEVM.js","/assets/arrow-down-DX6i3hII.js","/assets/arrow-left-BPm0OiQr.js","/assets/arrow-up-C1a0MefP.js","/assets/arrow-up-narrow-wide-YLktnkt6.js","/assets/arrow-up-right-BS_m6-Qs.js","/assets/award-B2MlhXV6.js","/assets/ban-zilPiKJu.js","/assets/book-open-Cl14oXDT.js","/assets/boxes-CXPcgI0Y.js","/assets/braces-Cd2iX58f.js","/assets/brigadirFilters-B7-h4wf5.js","/assets/broadcastTree-CoOKzzA8.js","/assets/building-2-Pq-mDgyU.js","/assets/calculator-qEFCsPcI.js","/assets/calendar-DFTvhDsa.js","/assets/calendar-days-CHHXqCWs.js","/assets/camera-Btw9zBa8.js","/assets/categories-CchlS06f.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D56nk002.js","/assets/chart-line-kJW3L16h.js","/assets/chart-pie-CrKtEizl.js","/assets/chartRange-BE1wNYb-.js","/assets/check-check-DNa7OVzk.js","/assets/chevron-left-BCLNcVCy.js","/assets/chevrons-up-down-ZmqmB_Uq.js","/assets/circle-Dd0e9xzx.js","/assets/circle-alert-nYkxUPxe.js","/assets/circle-check-big-BaQSJNyh.js","/assets/circle-dashed-4Aik30Gu.js","/assets/circle-minus-BJ7Ru7lm.js","/assets/circle-question-mark-DEdHmd3-.js","/assets/circle-slash-C2OZeByL.js","/assets/circle-user-round-AOjGylFq.js","/assets/clock-3-D6psTb14.js","/assets/cloud-off-D0jhBnLK.js","/assets/cloud-upload-Kg8W70bC.js","/assets/compass-Dyk6tP6p.js","/assets/concernCategories-Div5E3lf.js","/assets/copy-DIMtoNSu.js","/assets/corner-down-right-BcK8kQty.js","/assets/createLucideIcon-DPlnWZcM.js","/assets/es-CMuAYcha.js","/assets/exportXlsx-DhwhtdWH.js","/assets/external-link-iT77M6aT.js","/assets/file-clock-BsFqdQeV.js","/assets/file-exclamation-point-Bklbpa6Z.js","/assets/file-spreadsheet-KvOzK8yA.js","/assets/file-text-lnvEWE_r.js","/assets/flag-D2YaO0rX.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-COlNm_Ti.js","/assets/hash-BLhsnBW6.js","/assets/history-BJQeoOWz.js","/assets/hourglass-DZMfWqxh.js","/assets/image-CcsCQVNQ.js","/assets/image-off-Bk9qrUnN.js","/assets/inbox-CR4XUfbx.js","/assets/index-B1BGX_7I.css","/assets/index-CWoaU_Tf.js","/assets/key-round-ByNuctEc.js","/assets/keyboard-B0nXn2Bt.js","/assets/languages-BDJJpTTL.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CbHkq87T.js","/assets/lightbulb-wIeeBBQp.js","/assets/link-2-DX6w7dzO.js","/assets/link-2-off-D59slI6Z.js","/assets/list-ordered-DpQGWMn1.js","/assets/list-tree-1vlEMbvX.js","/assets/lock-open-Dl3-FUTA.js","/assets/log-in-DnmLfsCr.js","/assets/maximize-2-CtjYTag6.js","/assets/message-square-Bpgu_leb.js","/assets/minimize-2-h_W2Afni.js","/assets/package-check-CivuX2iR.js","/assets/paperclip-OhqIUqzX.js","/assets/pencil-BFhc4hzk.js","/assets/percent-C1tPxZjB.js","/assets/pin-D0N4NxYE.js","/assets/pin-off-DihuypCe.js","/assets/play-aYm2bWCW.js","/assets/plug-zap-BCyhuySk.js","/assets/presentation-BEfouqjv.js","/assets/prop-types-CLW8oDjz.js","/assets/radio-D6CluDDa.js","/assets/react-apexcharts.esm-Dy-m0hXS.js","/assets/registers-C3pxBG2G.js","/assets/repeat-m3n7dDWB.js","/assets/rotate-ccw-C9x_8l-Q.js","/assets/rotate-cw-C9tkEh5s.js","/assets/save-Bqht3DDt.js","/assets/scopeLinks-B7h1OpCW.js","/assets/scroll-text-CPfH56eo.js","/assets/search-x-DUrLVQMs.js","/assets/segments-3JWK8um0.js","/assets/send-D-ua6ZSK.js","/assets/settings-2-DL6Jb4nV.js","/assets/shield-CBfSr1Hi.js","/assets/shield-alert-23Vn4h4R.js","/assets/shield-check-BEDvoqhW.js","/assets/shield-question-mark-B8Gg9D7m.js","/assets/siren-pcrcFfHo.js","/assets/snowflake-4D5f7RTN.js","/assets/split-CrptJGLa.js","/assets/square-0z3j8GCq.js","/assets/square-check-big-tlZht7fv.js","/assets/star-CM87enRX.js","/assets/statusBands-B9So7vEb.js","/assets/store-iSrYXVT1.js","/assets/table-2-Dwl30JN1.js","/assets/table-properties-B6Ixt5Z5.js","/assets/tag-C29ryW8o.js","/assets/timer-off-DAO2XP3Z.js","/assets/trending-down-CH4qaOl2.js","/assets/trending-up-DBtJAgmP.js","/assets/undo-2-BYXuun-W.js","/assets/useChartTheme-C1s9KKA3.js","/assets/useElementWidth-BUZqwPYM.js","/assets/useIsMobile-B27dopB0.js","/assets/useOpenParam-C3RZfN2O.js","/assets/useStatusBands-B4hWBnps.js","/assets/useUrlScope-DmDkZf8X.js","/assets/user-CA2SgCpr.js","/assets/user-cog-Bmu6QL9F.js","/assets/users-CG4Cevni.js","/assets/vfx-U_d5lkd2.js","/assets/video-BLtWBw4-.js","/assets/wallet-BtsBY5qB.js","/assets/warehouse-BhzKgH5b.js","/assets/x-DiZr1Y-e.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
