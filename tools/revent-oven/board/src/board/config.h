// What the board needs to work, kept in its flash (NVS, namespace "safia"):
// the Wi-Fi network, the collector key and the IMS address. Set over USB
// (setup_board.py / the serial console); the Wi-Fi also from a phone through
// the setup hotspot. Nothing here is ever printed whole — the key and the
// password are shown as "set (N characters)".
#pragma once
#include <Arduino.h>

#define DEFAULT_SERVER "https://production.safiacorporate.uz"

struct Config {
  String ssid;
  String pass;
  String key;
  String server = DEFAULT_SERVER;
};

extern Config CFG;

void configLoad();
void configSave();
void configForget();
bool configReady();        // Wi-Fi name, key and server all set
bool configHasWifi();
