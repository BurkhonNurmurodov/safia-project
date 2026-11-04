# Safia oven board

The always-on collector for the Revent ovens: a **LOLIN S2 Mini** (ESP32-S2FNR2,
4 MB flash, 2 MB PSRAM, 2.4 GHz Wi-Fi, USB-C) that does what
`tools/revent-oven/collector.py` does on the test laptop, on half a watt.

| Every | It reads (read-only) | And sends to IMS |
|---|---|---|
| minute | each oven's live status | `POST /api/ovens/collector/status` |
| 10 minutes | each oven's day logs + ServiceData.txt | only what IMS lacks, as raw bytes: `POST /api/ovens/collector/raw` |
| hour | OvenSettings.xml | only when it changed |
| 10 seconds (firmware 1.1+) | — | a heartbeat, only when nothing else reached IMS: `GET /api/ovens/collector/ping` |

Every request also carries `X-Collector-Info` (firmware, uptime, whether it went
out over Ethernet or Wi-Fi, the Wi-Fi name and signal, its address, free memory,
heartbeat pace): the admin page's
«Kollektor qurilmasi» → «Tekshirish» shows it, with whether the board is online.

The ovens, the paces and what IMS already holds come from IMS
(`GET /api/ovens/collector/plan`); add or remove an oven on `/panel/ovens`.
**READ-ONLY toward the ovens**: the only requests the firmware can build are
the three reads in `src/core/soap.cpp`.

## Updates over Wi-Fi (firmware 1.3+)

Once the board runs 1.3 or later it never needs the laptop again for a new
version:

```bash
# raise FW_VERSION in platformio.ini, then:
bash publish_firmware.sh
```

builds the firmware and publishes it to IMS (the APK's publish key,
`~/.safia-android/signing/publish.key`). At its next plan the board sees the
new version, downloads it (~1.4 MB, under a minute), checks its SHA-256, writes
it into its other app slot and restarts into it. The new firmware is **on
trial** until it reaches IMS — then it keeps itself; if it crashes, or runs 30
minutes without reaching IMS, the board goes back to the version before by
itself, and never tries that version again (publish a new number). Tested
2026-11-04: 1.3.4 → 1.3.5 in 47 s, kept on the first plan. The admin page's
«Kollektor qurilmasi» shows «1.3.4 → 1.3.5 (yangilanmoqda)» while it runs.

## An oven that does not answer

Each status read retries once; an oven that fails twice in a row is asked again
after 1, 2, 4, then every 5 minutes, and its logs and settings wait until it
answers. Every failed attempt is a connection the network has to carry, and on
2026-11-04 an office network («SPQR», not the factory's) cut the board off from
IMS entirely a couple of minutes after it kept trying ovens that are not there
(and kept it cut off). Test the board away from the factory with that in mind:
IMS answers for the first minute or two after a restart.

## Ethernet (firmware 1.2+, OFF by default)

The S2 Mini has no Ethernet of its own, and its USB port cannot drive a USB hub's
Ethernet adapter. A **W5500 Ethernet module** (an SPI board with an RJ45 socket,
e.g. «W5500 Lite» or the larger «W5500» module) wired to it does the job, with
six wires — no interrupt or reset wire is needed:

| W5500 | S2 Mini |
|---|---|
| 3V3 (or VCC 3.3V) | 3V3 — **never 5V** |
| GND | GND |
| SCLK / SCK | GPIO 7 |
| MISO / SO | GPIO 9 |
| MOSI / SI | GPIO 11 |
| CS / SCS | GPIO 12 |

**Off in the standard build** (`WITH_W5500=0` in `src/board/net.cpp`): no board
has a module, and the probe was never run with one. Build with
`-DWITH_W5500=1` in `build_flags` to switch it on — and test it on the module
before publishing that build.

Keep the wires short (under 15 cm). The board looks for the module once, at
start: `show` then says `ethernet   W5500 found …`, or `no W5500 module (Wi-Fi
only)`. With the cable in, it takes an address by DHCP and **everything goes
over Ethernet** — IMS and the ovens; Wi-Fi stays connected beside it as the
backup and takes over by itself the moment the cable comes out. No Wi-Fi network
is needed at all on Ethernet: key + IMS address over USB are enough. The admin
page shows «Ulanish: Ethernet · 100 Mbit/s». Power it from a good 5V supply
(1 A): the W5500 draws ~130 mA on top of the board's Wi-Fi.

The ovens must be reachable from the network the cable is on (on the production
block, the 192.168.0.x network).

## How it holds a 1.5 MB answer in 2 MB

`getLogs` takes no arguments: every call returns all 7 days (1.5 MB on the 725).
The board reads the answer as it arrives (`src/core/http_response.cpp` →
`dime.cpp` → `sync.cpp`), hashes each file on the way, and drops a file the
moment it turns out IMS holds it. A file that grew sends only its new bytes; a
new one is sent whole. Uploads wait in a queue capped to the free PSRAM; when it
is full, newer day files push older ones out, and whatever waits goes in the next
round. Every uploaded file carries its whole SHA-256, which IMS checks.

## Tools (once, on the Mac)

```bash
python3 -m venv ~/.safia-esp/venv
~/.safia-esp/venv/bin/pip install platformio esptool
```

The first build downloads the ESP32 toolchain (~5 GB into `~/.platformio`).

## Flash it

A new board does not show up on USB until it is in **download mode**: hold **0**,
press and release **RST**, release **0**. It then appears as
`/dev/cu.usbmodem01` («ESP32-S2»).

```bash
cd tools/revent-oven/board
~/.safia-esp/venv/bin/pio run -t upload --upload-port /dev/cu.usbmodem01
```

Then press **RST** once: the firmware starts and the board shows up as a
different `/dev/cu.usbmodem…` port (its own USB serial console). Later updates
need no buttons: `pio run -t upload` restarts it into download mode by itself.

## Set it up

The key is the board's own (`~/.safia/oven-board.key`; IMS knows its SHA-256 as
«board» in `services/revent_ovens.py`). It is written into the board over USB
and never shown again:

```bash
~/.safia-esp/venv/bin/python setup_board.py                      # key + IMS address
~/.safia-esp/venv/bin/python setup_board.py --wifi "Network name" # + Wi-Fi (asks the password)
~/.safia-esp/venv/bin/python setup_board.py --show               # what it is doing
```

**Wi-Fi from a phone** (no Mac needed at the factory): hold the **0** button for
3 seconds — the light stays on — join the open network **Safia-Pech-XXXX** and
open `http://192.168.4.1`. Pick the network, type the password, save. The page
also shows whether IMS and each oven answer, and the last log lines. The hotspot
also opens by itself when no network is set (and no Ethernet carries the board),
or after 10 minutes with no network at all, and closes by itself. The key and the IMS address cannot be changed there.

Only **2.4 GHz** networks with a plain password work well (not a login page,
not a per-person company login). The oven network must be reachable from the
Wi-Fi it joins — on the production block that is the 192.168.0.x network.

## The light (GPIO 15)

| Light | Means |
|---|---|
| slow blink, once a second | not set up — no key, or neither a Wi-Fi network nor an Ethernet module |
| fast blink | looking for a network (Ethernet cable or Wi-Fi) |
| two short flashes every 3 s | the network works, IMS does not answer or refused the key |
| one short flash every 3 s | working |
| on, with a short gap every second | the setup hotspot is open |

## The USB console

`~/.safia-esp/venv/bin/pio device monitor`, or `setup_board.py --cmd <command>`
(it answers during a round too, from 1.3.5):
`show` · `log` · `scan` · `run` (a full round now) · `portal` · `set ssid|pass|key|server …`
· `forget` · `reboot`.

## It looks after itself

It reconnects Wi-Fi every 30 s (every 2 minutes while Ethernet carries it),
restarts after an hour with no network or 30 minutes without IMS, and once a day. Powered by any USB phone charger — it
never waits on the USB port when no program has it open.

## Tests (no board needed)

```bash
bash test/run_host_tests.sh <folder with raw_logs.bin, raw_settings.bin, raw_status.bin, status.txt and the files>
```

feeds a real 725's saved answers (3 Nov 2026) through the board's own reading
code, framed three ways and split at random points, under the address and UB
sanitizers: every file must come out byte for byte with its SHA-256, and the
status lines must equal `revent_oven.py`'s.

## Root certificates

`src/board/certs.h` is written by `make_certs.py` from this Mac's store: the
Google Trust Services, GlobalSign, Let's Encrypt and SSL.com roots Cloudflare
and the origin use. GlobalSign Root CA ends 28 Jan 2028 — re-run before then.
