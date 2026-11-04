#include "config.h"

#include <Preferences.h>

Config CFG;

namespace {
const char* NS = "safia";
}

void configLoad() {
  Preferences p;
  p.begin(NS, true);
  CFG.ssid = p.getString("ssid", "");
  CFG.pass = p.getString("pass", "");
  CFG.key = p.getString("key", "");
  CFG.server = p.getString("server", DEFAULT_SERVER);
  p.end();
  if (!CFG.server.length()) CFG.server = DEFAULT_SERVER;
}

void configSave() {
  Preferences p;
  p.begin(NS, false);
  p.putString("ssid", CFG.ssid);
  p.putString("pass", CFG.pass);
  p.putString("key", CFG.key);
  p.putString("server", CFG.server);
  p.end();
}

void configForget() {
  Preferences p;
  p.begin(NS, false);
  p.clear();
  p.end();
  CFG = Config();
}

bool configHasWifi() { return CFG.ssid.length() > 0; }

bool configReady() { return configHasWifi() && CFG.key.length() > 0 && CFG.server.length() > 0; }
