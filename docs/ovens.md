# The Revent ovens («Pechlar»)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Pechlar» — the Revent ovens (`/ovens`, Laboratory, 2026-11-03)

The operator: show everything the Windows «Revent Oven Manager» shows — live
board, bakes, utilisation, alarms and door — on the platform; test with the
laptop on the production block first, find an always-on device later. Page key
**`ovens`**, Laboratory, **ADMIN-ONLY until opened on the Access tab**; the
register is `/panel/ovens` (tools group, no capKey).

**On the launcher it is the «Avtomatika» app's page, not a Laboratory one**
(2026-11-12, the operator: «add one app also called automation, and put the
Ovens screen in there, visibility for that screen should stay visible only to
admin»). Only where the row sits changed — `app: "automation"` on its link in
`config/navLinks.js`; the page key, its admin-only default and the register
are as above, so the tile shows to admins alone, and a non-launcher role
granted the page still finds it in the Laboratory group. See
`docs/navigation-and-shell.md`, «Ilovalar».

- **The server never reaches an oven.** The ovens are on the factory LAN; a
  COLLECTOR there (`tools/revent-oven/collector.py`, stdlib only) reads each
  oven and posts to `/api/ovens/collector/*` (`routers/ovens.py`
  `collector_router`): GET `/plan` (which ovens, how often, what is kept),
  POST `/status` (every minute, all ovens in one post), POST `/file` (a day
  log only when it changed — the bytes added since the kept copy, `offset` =
  that copy's size, the WHOLE file's SHA-256 checked, anything that does not
  add up → 409 and the collector sends it whole; ServiceData.txt and
  OvenSettings.xml when they change). Paces are `revent_ovens.POLL`, served by
  the plan.
- **READ-ONLY toward the ovens, by construction.** The oven's SOAP service
  has no password and accepts writes (recipes, settings, FIRMWARE). The
  collector calls only `revent_oven.call`, whose `OPERATIONS` hold status,
  getLogs and getSettings. Never add an operation there.
- **The collector key** (`X-Oven-Key` or Bearer) is checked against
  `revent_ovens.COLLECTOR_KEYS` — SHA-256 digests in code; the key lives only
  on the collector (`~/.safia/oven-collector.key` on the test laptop). It can
  read the plan and post readings, nothing else; wrong keys share the report
  door's per-address throttle. `/api/ovens/collector/` is in
  `security._EXEMPT_PREFIXES` and the action log's `_SKIP`; the assistant may
  touch neither it nor `/api/admin/ovens`. A new collector is a new digest.
- **The register accepts private LAN IPv4 only** (`_check_ip`): the collector
  is sent wherever the list says. An oven with collected data cannot be
  deleted (409 `has_history`) — switch it off.
  (2026-11-07: the register's «O'chirish» row action is GONE — the floor blamed it
  for ovens turning off. It only ever stopped collecting; no command reaches an
  oven. `active` is still read by the plan and the API, just not toggled here.)
- **Storage**: `revent_ovens` (register + last status lines + zlib settings
  + ServiceData text) and `revent_oven_logs` (one row per oven × log file,
  zlib, `day` = its first record's date). `services/revent_log.py` is THE
  record decoder (20-byte big-endian records; recipe / manual starts carry a
  name and a program) — `tools/revent-oven/revent_oven.py` keeps its own
  copy so it stays stdlib-only; change both together.
- **The plan lists only the log files an oven can still hold** (2026-11-05,
  `revent_ovens.plan_logs`): per oven the `PLAN_LOGS` (8) newest by name
  (the oven keeps its 7 newest day files) together with the 8 the collector
  sent last (an oven that restarts its numbering). IMS keeps every file
  forever, and the board parses the whole plan into its ~67 KB of internal RAM
  every minute — listing them all grew by one file per oven per day until it
  would not fit. A file the plan leaves out is sent whole again; `save_log`
  stamps `updated_at` even on identical bytes so it is listed from then on.
  An oven model keeping more than ~8 files would need `PLAN_LOGS` raised.
- **What each record MEANS is `services/revent_analytics.py`**, taken from the
  decompiled Windows app 1.3.39: oven modes from records 1/2 (off), 3 and 13
  (standby), 4 (energy save), 9/10 (recipe / manual bake), each lasting to
  the next — the app never reads change_state (18) or baking (17), and
  neither does this; a bake ends at the next 0,1,2,3,4,9,10,13; fault (15) /
  alarm (16) codes are named (`FAULT`), prover alarms (27) too; digital_out
  bits name the relays (`DIGITAL_OUT`, heat = 0x200 → heater hours),
  digital_in 0x80 = door closed, 0x100 = rotor switch; energy (33) is u16
  Wh counters (the app counts the first record's absolute total — here it is
  the baseline). Status lines: 31 (oven), 38 or 39 (with prover — 39 puts the
  prover status text at 38). Door time is split into «while the oven was on»
  and total, because a door left open through a shutdown is not heat loss.
  Settings passwords (`*PASSWORD*` strings) are never shown; a settings file
  carrying a DOCTYPE or entity is refused (no defusedxml on the box).
- **Nothing is stored derived**: each log file's facts are decoded once per
  (row, sha) and kept in memory (`_facts`, 400 files); a file that grew is
  decoded again. Days are the oven's own wall clock.
- **The page** (`pages/Ovens.jsx` + `components/ovens/` + `pages/ovensText.js`):
  tabs Hozir (one card per oven, polled 30 s: temperature vs set, bake
  progress, door/heater/steam/damper, probes, prover, faults, today's line) ·
  Pishirishlar (per-day chart, most-used set temperatures, every bake) ·
  Bandlik (each day's real mode timeline, hours table, heater hours) ·
  Signallar va eshik · Kun grafigi (temperature vs dashed set point with
  bakes shaded, then lanes for mode, door and relays, the day's bakes with
  programs) · Pech ma'lumotlari (serial, model, versions from the log,
  restarts, ServiceData counters — unnamed by the oven — every setting). Mode
  hues are categories, never traffic lights. An oven with no log in the period
  is named once, not drawn as rows of blanks.
- **Measured on the real 725 (3 Nov)**: a day file 213–252 KB, 44–64 manual
  bakes a day, baking ~65–77% of the logged time, heater ~8–9.5 h a day, the
  door ~75 openings a day while on; a week's period answer 0.2 s.
- **The always-on device is a LOLIN S2 Mini** (ESP32-S2FNR2, 4 MB flash,
  2 MB PSRAM, 2.4 GHz Wi-Fi; firmware `tools/revent-oven/board/`, 2026-11-04,
  the operator bought the board). It does `collector.py`'s job in C++: the
  same plan, paces, decisions (`sync.cpp` `decide` is `_send_log`'s rule)
  and read-only requests (`core/soap.cpp` builds only the three reads). It
  reads getLogs AS IT ARRIVES (`core/http_response` → `dime` → `sync`): each
  file hashed on the way and dropped once IMS has it, a grown file sends its
  tail, uploads wait in a queue capped to the free PSRAM (newer day files push
  older ones out; the rest go next round). It posts files to
  **`POST /api/ovens/collector/raw`** — the `/file` door with the bytes as the
  body and `oven_id · kind · name · offset · size · sha256` in the query
  (key checked BEFORE the body is read, body capped at `MAX_FILE`, the store
  `_store_file` shared with `/file` and run off the loop). Its own key,
  «board» in `COLLECTOR_KEYS` (`~/.safia/oven-board.key` on the build Mac, in
  the board's NVS — never shown, `show` prints a digest prefix). Setup: the key
  and IMS address over USB (`setup_board.py`), and the ONE Wi-Fi network over
  USB too (`setup_board.py --wifi` = «alisa», the password typed into the
  script). HTTPS checks IMS against the roots
  in `src/board/certs.h` (`make_certs.py`; GlobalSign Root CA ends Jan 2028).
  Host tests (`test/run_host_tests.sh`) feed the saved 725 answers through the
  core: every file byte for byte with its SHA-256, status lines equal to
  `revent_oven.py`'s. Toolchain in `~/.safia-esp/venv` (PlatformIO, esptool),
  ~5 GB in `~/.platformio`. A change to how ovens are read is made in BOTH
  `collector.py` and the board's core.
- **Live since 2026-11-04** on the production block's Wi-Fi «alisa»: ONE name
  for many access points, so the board scans every channel and joins the
  STRONGEST (`WIFI_CONNECT_AP_BY_SIGNAL` — the default first-found AP gave
  −69 dBm and ~2 KB/s; the strongest −59 dBm). The network is one
  192.168.0.0/21 (oven №1 192.168.0.100 on-link, the board 192.168.3.x);
  oven №2 192.168.250.100 sits behind the router with 0.6–2.6 s round trips.
  So the board waits 10 s to connect, 15 s of silence for a status (one retry)
  and 30 s for files, starts a fresh IMS connection after 15 s idle (Cloudflare
  drops idle ones) and retries an upload once. First round: 1.4–1.5 MB read
  per oven in ~75 s, six days uploaded, the seventh in the next round (memory).
- **Is the device online — «Kollektor qurilmasi» on `/panel/ovens`**
  (2026-11-04, the operator). IMS cannot reach the device, only hear it: every
  collector request (plan · status · file · and the heartbeat
  `GET /api/ovens/collector/ping`) is written to `revent_collectors` (one row
  per key name: last contact, what it asked, the address IMS saw, and the
  device's own `X-Collector-Info` — `fw · up · rssi · ssid · ip · heap ·
  psram · ping · net · link`, whitelisted by `revent_ovens.parse_info`), in its own small
  transaction so a refused file still counts. `revent_ovens.devices()` is THE
  rule: a device is online while heard within max(30, 2 × its pace + 15) s —
  its pace is its heartbeat (`ping` in its info, firmware 1.1+, POLL
  `ping_s` 10) else a round (60 s) — and «Tekshirish» waits up to pace + 20 s
  for it to call in (`GET /api/admin/ovens/devices`, admin-only, polled every
  3 s by `components/ovens/CollectorDevices.jsx`): online at once when heard
  lately, else «Oflayn» with the last contact and how long it waited; an
  offline device's details are its last report, dimmed. Firmware 1.1.0 adds
  the heartbeat (every `plan.pingS`, only when nothing else reached IMS in
  that time, short timeouts, never mid-round while IMS is failing) and the
  header on every request; 1.0.0 is heard once a minute.
- **ONE network, «alisa», and nothing else** (firmware 1.4.0, 2026-11-05,
  the operator: «the space on the device is limited — remove anything
  unnecessary; set it to alisa; when it is reachable it should connect and
  start working automatically»). Removed: the W5500 Ethernet support (1.2.0,
  never wired — no module was bought), the setup hotspot «Safia-Pech-XXXX» and
  its «0» button (how the office «SPQR» got onto the board on 2026-11-04), and
  the SPQR-era `netDiag` / `probeIms` readouts — 94 KB, 72.4% → 67.6% of the
  1.9 MB app slot. The board keeps ONE network in NVS, set over USB only; it
  looks for it every 30 s for as long as it takes (fast blink), restarts after
  an hour without it, and the moment it joins starts a round at once.
  `X-Collector-Info` now always says `net=wifi` and never `link` (IMS still
  reads both). Ethernet, if it is ever wanted again, is in git history (1.3.5).
  1.4.1 (same day): the USB `scan` stops the join attempt first and resumes it
  (a scan during a join failed and printed «0 network(s)»), marks the board's
  own network, and says ERR when a scan fails. Flashed over USB and published
  2026-11-05; the board holds «alisa» (password set) and its key — in the
  office it sees only «SPQR» and keeps looking.
- **The board updates itself over Wi-Fi** (firmware 1.3.0+, 2026-11-04, the
  operator: «if you need any modifications for the device do it now»). ONE
  release lives in `backend/data/ovens/firmware/` (`services/oven_firmware.py`
  — `<version>.bin` + `latest.json`, gitignored like the APK's), published
  from the build Mac by `tools/revent-oven/board/publish_firmware.sh`
  (builds, then `POST /api/ovens/collector/firmware/publish?version=` with the
  APK's publish key, `android_release.key_ok`; the image must be an ESP32-S2
  app — magic 0xE9, chip id 2, app-desc magic — of 200 KB..0x1E0000; logged as
  `config.oven_firmware_published`). `revent_ovens.plan()` carries
  `firmware {version, sha256, size}`; a board on another version, right after
  a plan answers and BEFORE reading ovens, downloads `GET
  /api/ovens/collector/firmware?version=` (collector key; 404 unless it is the
  published one) straight into its other app slot (`board/ota.cpp`, `Update`),
  checks the SHA-256 and restarts. The new firmware is ON TRIAL
  (`verifyRollbackLater()` → true, C linkage, so the core does not validate
  it): it keeps itself at its first good plan (`ota::confirm`); a crash before
  that, or 30 minutes without IMS, sends the bootloader back to the version
  before, and that version is never tried again on this board (NVS
  `safia_ota` try/bad) — re-publish under a NEW number. `/api/admin/ovens/devices`
  names the published version and «Kollektor qurilmasi» prints «1.3.4 → 1.3.5
  (yangilanmoqda)» meanwhile. Tested on the board: 1.3.4 → 1.3.5 in 47 s, kept.
  **Raise `FW_VERSION` in platformio.ini for every publish.** The heartbeat
  never runs during a download (it would share the TLS connection).
- **An oven that does not answer is asked less and less** (1.3.3+): one
  retry per status read only while it answered last time; two failures in a
  row → next try in 1, 2, 4, then every 5 minutes, logs and settings skipped
  until it answers. Found 2026-11-04 on the office Wi-Fi «SPQR»: a few minutes
  of failed connections to the (unreachable) ovens and the network stopped
  carrying ANY of the board's traffic — name lookups timed out, TCP to
  Cloudflare timed out, while memory and the board's own TCP table were fine;
  it cleared only after a minute of silence (a restart). The board's own
  readout on an IMS failure (`netDiag` + `probeIms`, removed in 1.4.0) is what
  showed it. The backoff did not
  stop SPQR's cut-off; it is there so a switched-off oven at the factory costs
  one connection every 5 minutes, not sixteen in four. The USB console answers
  during a round (`consoleTick` in `background()`), not during a firmware
  download.
- **TLS buffers live in PSRAM** (1.4.2, 2026-11-05). The prebuilt ESP32-S2
  libraries set `CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC`: two ~16 KB blocks per IMS
  connection from internal RAM, which Wi-Fi reconnects and oven reads
  fragment (74 → 59 KB free in 30 min). That day every status post failed on
  the BOARD for 50 minutes («SSL - Memory allocation failed», X509 errors)
  while it read both ovens every minute and its plan GETs and pings still got
  through — so IMS showed the device «online» with 12-minute-old data, and
  nothing on IMS could say why (the failure never left the board). `setup()`
  now calls `mbedtls_platform_set_calloc_free(tlsCalloc, tlsFree)` (PSRAM,
  internal RAM as the fallback); the oven status body reserves one PSRAM
  block. Safety net: IMS answering the plan but taking no reading (status or
  file) for 10 minutes restarts the board (never on a firmware on trial, never
  with no ovens in the plan). `show` gains the largest free block and
  «delivered … ago; last failure: …»; `X-Collector-Info` gains `blk`, `sent`
  (seconds since IMS took a reading) and `err` (the last failure) — the
  server keeps all three from v4.421.3 (`INFO_KEYS`) and «Kollektor
  qurilmasi» prints them: «Eng katta bo'sh blok», «IMS oxirgi qabul qilgan
  (qurilma hisobi)», and the board's own error inside the amber «status not
  arriving» line. That pair separates the three cases the card could not
  before: the board says it has not delivered (`sent` old, `err` set — the
  failure is on the board's side), it says it delivered while the card's
  «Holat oxirgi kelgan» is old (IMS took the post and stored nothing — look at
  the door's refusals), or the board is silent about it. A Wi-Fi signal at or
  below −80 dBm is printed amber and at or below −85 dBm red, with a line
  saying small requests (plan, heartbeat) pass where big ones (status, files)
  may not — on 2026-11-05 the card read online, −91 dBm and no status for 11
  minutes while the plan was asked every round. Wi-Fi at the board's spot that
  day roamed over five access points at −59…−86 dBm and dropped every few
  minutes.
- **A loaded bake whose timer has not started is READY, not baking**
  (`live()`: `baking` needs elapsed > 0, `ready` = total > 0 and elapsed 0 —
  the oven's «Темп. готова.»); the live card says «Boshlashga tayyor».
- Not built yet: recipes / autostarts
  (read-only calls exist, not used), export.
