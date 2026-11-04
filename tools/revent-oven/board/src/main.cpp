// Safia oven board — the always-on COLLECTOR for the Revent ovens, on a
// LOLIN S2 Mini (ESP32-S2, 4 MB flash, 2 MB PSRAM).
//
// It does what tools/revent-oven/collector.py does on the test laptop:
//   every minute      each oven's live status          → IMS /api/ovens/collector/status
//   every 10 minutes  each oven's day logs (+ ServiceData.txt), only what IMS lacks
//   every hour        OvenSettings.xml, when it changed
// The ovens, the paces and what IMS already holds come from IMS's plan.
//
// READ-ONLY toward the ovens: the only requests this firmware can build are the
// three reads in core/soap.cpp.
//
// The status light (GPIO 15):
//   slow blink (1 a second)   not set up — no Wi-Fi network or no key
//   fast blink                looking for the Wi-Fi network
//   two short flashes         Wi-Fi is fine, IMS is not answering (or refused the key)
//   one short flash / 3 s     working
//   mostly on                 the setup hotspot is open
#include <Arduino.h>
#include <WiFi.h>
#include <esp_system.h>

#include <map>

#include "board/blog.h"
#include "board/config.h"
#include "board/ims.h"
#include "board/oven.h"
#include "board/portal.h"
#include "core/dime.h"
#include "core/sha256.h"
#include "core/soap.h"
#include "core/sync.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

namespace {

const int LED = 15;
const int BUTTON = 0;  // the «0» button: hold 3 s to open the setup hotspot

Ims ims;
Plan plan;
bool havePlan = false;

struct OvenNote {
  String name, ip;
  bool statusOk = false;
  String statusErr;
  uint32_t statusAt = 0;
  String logs;
  uint32_t logsAt = 0;
  String settings;
};
std::map<int, OvenNote> notes;
std::map<int, std::string> serviceSha;  // ServiceData.txt last sent, per oven

uint32_t nextRound = 0, lastLogs = 0, lastSettings = 0;
bool logsDone = false, settingsDone = false, forceAll = false, inRound = false;
uint32_t lastImsOk = 0, wifiDownSince = 0, wifiUpSince = 0, lastWifiTry = 0;
String imsError;
String consoleLine;

enum class Health { NoConfig, NoWifi, ImsDown, Working };

Health health() {
  if (!configReady()) return Health::NoConfig;
  if (WiFi.status() != WL_CONNECTED) return Health::NoWifi;
  if (imsError.length()) return Health::ImsDown;
  return Health::Working;
}

void restart(const char* why) {
  blog("restarting: %s", why);
  delay(300);
  ESP.restart();
}

String ago(uint32_t at) {
  if (!at) return "—";
  return uptimeText(millis() - at) + " ago";
}

String kb(size_t n) {
  char b[24];
  snprintf(b, sizeof b, n >= 1024 ? "%.1f KB" : "%.0f B", n >= 1024 ? n / 1024.0 : (double)n);
  return String(b);
}

bool endsWith(const std::string& s, const char* tail) {
  size_t n = strlen(tail);
  return s.size() >= n && s.compare(s.size() - n, n, tail) == 0;
}

// ── the light and the button ────────────────────────────────────────────────

void ledTick() {
  uint32_t t = millis();
  bool on = false;
  if (portal::isOpen()) {
    on = (t % 1000) > 100;
  } else {
    switch (health()) {
      case Health::NoConfig: on = (t / 500) % 2; break;
      case Health::NoWifi: on = (t / 100) % 2; break;
      case Health::ImsDown: {
        uint32_t p = t % 3000;
        on = p < 80 || (p > 250 && p < 330);
        break;
      }
      case Health::Working: on = (t % 3000) < 60; break;
    }
  }
  digitalWrite(LED, on ? HIGH : LOW);
}

void buttonTick() {
  static uint32_t downAt = 0;
  if (digitalRead(BUTTON) == LOW) {
    if (!downAt) downAt = millis();
    if (millis() - downAt > 3000 && !portal::isOpen()) portal::open(15, "button held");
  } else {
    downAt = 0;
  }
}

// What may run while a round waits on an oven or IMS.
void background() {
  portal::loop();
  ledTick();
  buttonTick();
}

// ── Wi-Fi ───────────────────────────────────────────────────────────────────

void wifiStart() {
  if (!configHasWifi()) return;
  blog("Wi-Fi: connecting to \"%s\"", CFG.ssid.c_str());
  WiFi.begin(CFG.ssid.c_str(), CFG.pass.c_str());
  lastWifiTry = millis();
}

void wifiTick() {
  if (portal::takeWifiChange()) {
    WiFi.disconnect(false);
    delay(100);
    wifiStart();
  }
  if (!configHasWifi()) {
    if (!portal::isOpen()) portal::open(60, "no Wi-Fi network set");
    return;
  }
  static bool wasUp = false;
  bool up = WiFi.status() == WL_CONNECTED;
  if (up && !wasUp) {
    blog("Wi-Fi: connected to \"%s\", IP %s, signal %d dBm", CFG.ssid.c_str(), WiFi.localIP().toString().c_str(),
         WiFi.RSSI());
    wifiDownSince = 0;
    wifiUpSince = millis();
  }
  if (!up && wasUp) {
    blog("Wi-Fi: lost the connection");
    wifiDownSince = millis();
  }
  wasUp = up;
  if (up) {
    // a hotspot nobody is using closes 3 minutes after the Wi-Fi works
    if (portal::isOpen() && millis() - wifiUpSince > 180000 && WiFi.softAPgetStationNum() == 0) portal::close();
    return;
  }
  if (!wifiDownSince) wifiDownSince = millis();
  uint32_t retry = portal::isOpen() ? 120000 : 30000;  // retries move the hotspot's channel
  if (millis() - lastWifiTry > retry) {
    WiFi.disconnect(false);
    wifiStart();
  }
  if (millis() - wifiDownSince > 10UL * 60000 && !portal::isOpen()) portal::open(15, "no Wi-Fi for 10 minutes");
  if (millis() - wifiDownSince > 60UL * 60000 && WiFi.softAPgetStationNum() == 0) restart("no Wi-Fi for an hour");
}

// ── the rounds ──────────────────────────────────────────────────────────────

void doStatus() {
  std::vector<Reading> rs;
  int ok = 0;
  for (OvenPlan& op : plan.ovens) {
    Reading x;
    x.ovenId = op.id;
    std::string body;
    OvenReply r = ovenAsk(
        op.ip, op.port, soap::Op::Status, 8000, 15000,
        [&](const uint8_t* p, size_t n) {
          if (body.size() + n > 64 * 1024) return false;
          body.append((const char*)p, n);
          return true;
        },
        background);
    std::string xml = body;
    if (soap::looksLikeDime((const uint8_t*)body.data(), body.size())) {
      FileCollector fc([](OvenFile&) {});
      DimeReader d(fc);
      d.feed((const uint8_t*)body.data(), body.size());
      xml = fc.envelope();
    }
    if (r.ok) {
      std::string err;
      if (soap::parseStatus(xml, x.lines, err)) x.ok = true;
      else x.error = err.c_str();
    } else {
      std::string ft;
      x.error = soap::fault(xml, ft) ? r.error + ": " + ft.c_str() : r.error;
    }
    OvenNote& n = notes[op.id];
    n.name = op.name;
    n.ip = op.ip;
    n.statusOk = x.ok;
    n.statusErr = x.error;
    if (x.ok) {
      n.statusAt = millis();
      ok++;
    } else {
      blog("%s (%s) status: %s", op.name.c_str(), op.ip.c_str(), x.error.c_str());
    }
    rs.push_back(x);
    background();
  }
  if (rs.empty()) return;
  ImsReply ir = ims.status(rs);
  if (!ir.ok()) imsError = "status: " + ir.error;
  blog("status: %d/%d oven(s) answered, IMS %s", ok, (int)rs.size(), ir.ok() ? "took it" : ir.error.c_str());
}

size_t queueCap() {
  size_t freeP = psramFound() ? ESP.getFreePsram() : 0;
  const size_t margin = 700 * 1024;  // the file arriving next, and room to spare
  size_t cap = freeP > margin ? freeP - margin : 0;
  if (cap > 1400 * 1024) cap = 1400 * 1024;
  if (cap < 64 * 1024) cap = 64 * 1024;
  return cap;
}

// Send what is queued; returns {sent, refused, failed}.
void sendQueue(OvenPlan& op, UploadQueue& q, int& sent, int& refused, int& failed, size_t& bytes) {
  for (Upload& u : q.items()) {
    ImsReply ir = ims.file(op.id, u);
    if (ir.ok()) {
      sent++;
      bytes += u.chunk.size();
      if (u.kind == "log") {
        Kept k;
        k.has = true;
        k.size = u.size;
        k.sha = u.sha;
        op.logs[u.name] = k;
      } else if (u.kind == "service") {
        serviceSha[op.id] = u.sha;
      } else if (u.kind == "settings") {
        op.settingsSha = u.sha;
      }
    } else if (ir.http == 409) {
      refused++;  // IMS holds something else now; the next round's plan says what
      blog("%s %s: IMS refused it (%s) — next round", op.name.c_str(), u.name.c_str(), ir.error.c_str());
    } else {
      failed++;
      blog("%s %s: not sent (%s)", op.name.c_str(), u.name.c_str(), ir.error.c_str());
      if (ir.http == 401) {
        imsError = "IMS refused the key";
        break;
      }
    }
    background();
  }
  q.clear();
}

// Read one oven's getLogs / getSettings answer as it arrives; `onFile` decides.
OvenReply readFiles(OvenPlan& op, soap::Op what, const FileCollector::FileFn& onFile, String& err) {
  FileCollector fc(onFile);
  DimeReader dime(fc);
  std::string sniff;
  bool decided = false, isDime = false;
  OvenReply r = ovenAsk(
      op.ip, op.port, what, 20000, what == soap::Op::Logs ? 180000 : 60000,
      [&](const uint8_t* p, size_t n) {
        if (!decided && n) {
          decided = true;
          isDime = (p[0] >> 3) == 1 && (p[0] & 0x04);
        }
        if (!isDime) {
          if (sniff.size() < 16384) sniff.append((const char*)p, n < 16384 - sniff.size() ? n : 16384 - sniff.size());
          return true;
        }
        return dime.feed(p, n);
      },
      background);
  std::string ft;
  if (!r.ok) {
    err = r.error;
    if (soap::fault(isDime ? fc.envelope() : sniff, ft)) err += String(": ") + ft.c_str();
  } else if (!isDime) {
    err = soap::fault(sniff, ft) ? String("SOAP fault: ") + ft.c_str() : String("the answer carries no files");
  } else if (!dime.done()) {
    err = String("the answer was cut short: ") + dime.error().c_str();
  } else if (soap::fault(fc.envelope(), ft)) {
    err = String("SOAP fault: ") + ft.c_str();
  }
  return r;
}

void logsOf(OvenPlan& op) {
  UploadQueue q(queueCap());
  std::vector<std::string> deferred;
  int same = 0, tails = 0, wholes = 0, broken = 0;
  String err;
  OvenReply r = readFiles(
      op, soap::Op::Logs,
      [&](OvenFile& f) {
        if (!f.complete) {
          broken++;
          blog("%s: %s did not fit in memory", op.name.c_str(), f.name.c_str());
          return;
        }
        if (endsWith(f.name, ".log")) {
          Kept k;
          auto it = op.logs.find(f.name);
          if (it != op.logs.end()) k = it->second;
          size_t off = 0;
          Action a = decide(k, f.data.data(), f.data.size(), f.sha, off);
          if (a == Action::Same) {
            same++;
            return;
          }
          Upload u;
          u.kind = "log";
          u.name = f.name;
          u.offset = off;
          u.size = f.data.size();
          u.sha = f.sha;
          if (a == Action::Tail) {
            if (!u.chunk.assign(f.data.data() + off, f.data.size() - off)) {
              broken++;
              return;
            }
            tails++;
          } else {
            u.chunk = std::move(f.data);
            wholes++;
          }
          q.add(std::move(u), &deferred);
        } else if (f.name == "ServiceData.txt") {
          if (serviceSha[op.id] == f.sha) return;
          Upload u;
          u.kind = "service";
          u.name = f.name;
          u.size = f.data.size();
          u.sha = f.sha;
          u.chunk = std::move(f.data);
          q.add(std::move(u), &deferred);
        }
      },
      err);
  // every file that arrived whole carries its own SHA-256: send those even
  // when the answer broke off later
  int sent = 0, refused = 0, failed = 0;
  size_t bytes = 0;
  sendQueue(op, q, sent, refused, failed, bytes);
  char line[200];
  snprintf(line, sizeof line, "%d unchanged, %d grew, %d new, %d sent (%s)%s%s", same, tails, wholes, sent,
           kb(bytes).c_str(), deferred.size() ? ", some wait for the next round (memory)" : "",
           broken ? ", some did not fit in memory" : "");
  OvenNote& n = notes[op.id];
  n.logs = err.length() ? err + " — " + line : String(line);
  n.logsAt = millis();
  blog("%s logs: %s (%.1f s, %s from the oven)", op.name.c_str(), n.logs.c_str(), r.ms / 1000.0,
       kb((size_t)r.bytes).c_str());
  (void)refused;
  (void)failed;
}

void settingsOf(OvenPlan& op) {
  UploadQueue q(queueCap());
  bool got = false, same = false;
  String err;
  readFiles(
      op, soap::Op::Settings,
      [&](OvenFile& f) {
        if (got || !f.complete) return;  // the settings XML is the one attachment
        got = true;
        if (f.sha == op.settingsSha) {
          same = true;
          return;
        }
        Upload u;
        u.kind = "settings";
        u.name = f.name.empty() ? "OvenSettings.xml" : f.name;
        u.size = f.data.size();
        u.sha = f.sha;
        u.chunk = std::move(f.data);
        q.add(std::move(u));
      },
      err);
  int sent = 0, refused = 0, failed = 0;
  size_t bytes = 0;
  sendQueue(op, q, sent, refused, failed, bytes);
  OvenNote& n = notes[op.id];
  n.settings = err.length() ? err : (same ? String("unchanged") : sent ? String("sent") : String("not sent"));
  if (err.length() || sent) blog("%s settings: %s", op.name.c_str(), n.settings.c_str());
}

void updatePortalStatus();

void roundTick() {
  if (inRound || !configReady() || WiFi.status() != WL_CONNECTED) return;
  if (!forceAll && (int32_t)(millis() - nextRound) < 0) return;
  inRound = true;
  uint32_t t0 = millis();
  Plan p;
  ImsReply r = ims.plan(p);
  if (!r.ok()) {
    imsError = "IMS: " + r.error;
    blog("plan: %s", r.error.c_str());
    nextRound = millis() + 30000;
    inRound = false;
    if (lastImsOk && millis() - lastImsOk > 30UL * 60000) restart("IMS has not answered for 30 minutes");
    if (!lastImsOk && millis() > 30UL * 60000) restart("IMS has not answered since the start");
    updatePortalStatus();
    return;
  }
  if (!havePlan || p.ovens.size() != plan.ovens.size())
    blog("plan: %d oven(s), status every %lus, logs every %lus", (int)p.ovens.size(), (unsigned long)p.statusS,
         (unsigned long)p.logsS);
  plan = p;
  havePlan = true;
  imsError = "";
  lastImsOk = millis();
  bool all = forceAll;
  forceAll = false;
  doStatus();
  if (all || !settingsDone || millis() - lastSettings >= plan.settingsS * 1000UL) {
    for (OvenPlan& op : plan.ovens) settingsOf(op);
    lastSettings = millis();
    settingsDone = true;
  }
  if (all || !logsDone || millis() - lastLogs >= plan.logsS * 1000UL) {
    for (OvenPlan& op : plan.ovens) logsOf(op);
    lastLogs = millis();
    logsDone = true;
  }
  nextRound = t0 + plan.statusS * 1000UL;
  inRound = false;
  updatePortalStatus();
}

// ── what the board says about itself ────────────────────────────────────────

String keyText() {
  if (!CFG.key.length()) return "not set";
  std::string k(CFG.key.c_str());
  std::string d = Sha256::hexOf((const uint8_t*)k.data(), k.size());
  return "set (" + String(CFG.key.length()) + " characters, sha256 " + String(d.substr(0, 12).c_str()) + "…)";
}

String showText() {
  String s;
  s += "Safia oven board " FW_VERSION "\n";
  s += "uptime     " + uptimeText(millis()) + "\n";
  s += "memory     " + String(ESP.getFreeHeap() / 1024) + " KB free, PSRAM " + String(ESP.getFreePsram() / 1024) + " KB free\n";
  s += "wifi       " + (CFG.ssid.length() ? "\"" + CFG.ssid + "\", password " + (CFG.pass.length() ? "set" : "none") : String("not set")) + "\n";
  if (WiFi.status() == WL_CONNECTED)
    s += "           connected, IP " + WiFi.localIP().toString() + ", signal " + String(WiFi.RSSI()) + " dBm, MAC " + WiFi.macAddress() + "\n";
  else
    s += "           not connected (MAC " + WiFi.macAddress() + ")\n";
  s += "server     " + CFG.server + "\n";
  s += "key        " + keyText() + "\n";
  s += "IMS        " + (imsError.length() ? imsError : lastImsOk ? "answered " + ago(lastImsOk) : String("not asked yet")) + "\n";
  s += "hotspot    " + (portal::isOpen() ? "open: \"" + portal::apName() + "\" → http://192.168.4.1" : String("closed")) + "\n";
  if (havePlan) {
    s += "ovens      " + String((int)plan.ovens.size()) + "; next round in " +
         String((int32_t)(nextRound - millis()) > 0 ? (nextRound - millis()) / 1000 : 0) + " s\n";
    for (OvenPlan& op : plan.ovens) {
      OvenNote& n = notes[op.id];
      s += "  " + op.name + " (" + op.ip + ":" + String(op.port) + ")\n";
      s += "    status   " + (n.statusOk ? "ok, " + ago(n.statusAt) : n.statusErr.length() ? n.statusErr : String("—")) + "\n";
      s += "    logs     " + (n.logs.length() ? n.logs + ", " + ago(n.logsAt) : String("—")) + "\n";
      s += "    settings " + (n.settings.length() ? n.settings : String("—")) + "\n";
    }
  }
  return s;
}

void updatePortalStatus() {
  using portal::htmlEscape;
  String h = "<table>";
  auto row = [&](const String& k, const String& v, int tone) {
    h += "<tr><td>" + htmlEscape(k) + "</td><td" + String(tone > 0 ? " class=ok" : tone < 0 ? " class=bad" : "") + ">" +
         htmlEscape(v) + "</td></tr>";
  };
  bool up = WiFi.status() == WL_CONNECTED;
  row("Wi-Fi", CFG.ssid.length() ? CFG.ssid + (up ? " — ulangan, " + WiFi.localIP().toString() : " — ulanmagan") : String("tanlanmagan"),
      up ? 1 : -1);
  row("Safia IMS", !configReady() ? String("kalit o'rnatilmagan (USB orqali)") : imsError.length() ? imsError : lastImsOk ? String("javob bermoqda") : String("hali so'ralmagan"),
      imsError.length() || !configReady() ? -1 : lastImsOk ? 1 : 0);
  for (OvenPlan& op : plan.ovens) {
    OvenNote& n = notes[op.id];
    row(op.name, n.statusOk ? String("javob bermoqda") : n.statusErr.length() ? n.statusErr : String("—"), n.statusOk ? 1 : n.statusErr.length() ? -1 : 0);
  }
  row("Ishlab turibdi", uptimeText(millis()), 0);
  h += "</table>";
  portal::setStatusText(h);
}

// ── the USB console ─────────────────────────────────────────────────────────

void handleLine(String l) {
  l.trim();
  if (!l.length()) return;
  int sp = l.indexOf(' ');
  String cmd = sp > 0 ? l.substring(0, sp) : l;
  String arg = sp > 0 ? l.substring(sp + 1) : "";
  cmd.toLowerCase();
  if (cmd == "help") {
    Serial.println("commands: show · log · scan · run · portal · set ssid <name> · set pass <password> · "
                   "set key <key> · set server <https://…> · forget · reboot");
  } else if (cmd == "show") {
    Serial.print(showText());
    Serial.println("OK");
  } else if (cmd == "log") {
    Serial.print(blogTail(60));
    Serial.println("OK");
  } else if (cmd == "set") {
    int s2 = arg.indexOf(' ');
    String field = s2 > 0 ? arg.substring(0, s2) : arg;
    String value = s2 > 0 ? arg.substring(s2 + 1) : "";
    field.toLowerCase();
    if (field == "ssid") {
      CFG.ssid = value;
      configSave();
      Serial.println("OK ssid \"" + value + "\"");
      WiFi.disconnect(false);
      wifiStart();
    } else if (field == "pass") {
      CFG.pass = value;
      configSave();
      Serial.println("OK pass (" + String(value.length()) + " characters)");
      WiFi.disconnect(false);
      wifiStart();
    } else if (field == "key") {
      value.trim();
      CFG.key = value;
      configSave();
      imsError = "";
      Serial.println("OK key " + keyText());
    } else if (field == "server") {
      value.trim();
      while (value.endsWith("/")) value.remove(value.length() - 1);
      if (!value.startsWith("https://") && !value.startsWith("http://")) {
        Serial.println("ERR the server starts with https:// or http://");
        return;
      }
      CFG.server = value;
      configSave();
      imsError = "";
      Serial.println("OK server " + value);
    } else {
      Serial.println("ERR set ssid|pass|key|server <value>");
    }
  } else if (cmd == "scan") {
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n; i++)
      Serial.printf("  %-32s ch %2d  %4d dBm  %s\n", WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i),
                    WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "password");
    WiFi.scanDelete();
    Serial.printf("OK %d network(s)\n", n < 0 ? 0 : n);
  } else if (cmd == "run") {
    forceAll = true;
    Serial.println("OK a full round (status, settings, logs) starts now");
  } else if (cmd == "portal") {
    portal::open(15, "console");
    Serial.println("OK hotspot \"" + portal::apName() + "\" → http://192.168.4.1");
  } else if (cmd == "forget") {
    configForget();
    Serial.println("OK everything forgotten — restarting");
    restart("forget");
  } else if (cmd == "reboot") {
    Serial.println("OK");
    restart("reboot asked");
  } else {
    Serial.println("ERR unknown command — try help");
  }
}

void consoleTick() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      handleLine(consoleLine);
      consoleLine = "";
    } else if (consoleLine.length() < 400) {
      consoleLine += c;
    }
  }
}

}  // namespace

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);  // powered by a charger, nobody reads: never wait on USB
  uint32_t t = millis();
  while (!Serial && millis() - t < 1500) delay(10);
  blog("Safia oven board %s — %s rev %d, PSRAM %u KB free, reset reason %d", FW_VERSION, ESP.getChipModel(),
       ESP.getChipRevision(), (unsigned)(ESP.getFreePsram() / 1024), (int)esp_reset_reason());
  configLoad();
  WiFi.persistent(false);
  WiFi.setHostname("safia-pech");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  if (configHasWifi()) wifiStart();
  if (!CFG.key.length()) blog("no collector key yet: set it over USB (setup_board.py)");
  updatePortalStatus();
}

void loop() {
  consoleTick();
  buttonTick();
  wifiTick();
  portal::loop();
  ledTick();
  roundTick();
  if (millis() > 24UL * 3600 * 1000 && !inRound) restart("daily restart");
  delay(5);
}
