// What the board needs to work, kept in its flash (NVS, namespace "safia"):
// the ONE Wi-Fi network it joins (the production block's «alisa»), the
// collector key and the IMS address. Set over USB only (setup_board.py / the
// serial console) — there is no setup hotspot. Nothing here is ever printed
// whole — the key and the password are shown as "set (N characters)".
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
bool configReady();        // key and server set
bool configHasWifi();
