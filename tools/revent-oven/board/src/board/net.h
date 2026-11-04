// The board's way out: a W5500 Ethernet module when one is wired, Wi-Fi
// beside it as the backup, Wi-Fi alone when no module answers.
//
// The W5500 sits on the S2 Mini's SPI pins and needs no interrupt or reset
// wire (the driver polls it every 10 ms):
//
//   W5500     S2 Mini
//   3V3   →   3V3        (not 5V)
//   GND   →   GND
//   SCLK  →   GPIO 7
//   MISO  →   GPIO 9     (the module may call it SO)
//   MOSI  →   GPIO 11    (SI)
//   CS    →   GPIO 12    (SCS)
//
// It is looked for once, at start; the board restarts every day, so a module
// wired later is found by the next start at the latest. While its cable is in
// and it has an address, Ethernet carries everything (IMS and the ovens); the
// moment the cable comes out the board falls back to Wi-Fi on its own.
#pragma once
#include <Arduino.h>

namespace net {

void begin();            // after WiFi.mode(): looks for the W5500
void loop();             // logs Ethernet changes; keeps the DNS servers the in-use network's
bool ethFound();         // a W5500 answered at start
bool ethUp();            // its cable is in and it has an address
bool wifiUp();
bool up();               // Ethernet or Wi-Fi
const char* via();       // "eth" | "wifi" | ""
String viaText();        // "Ethernet" | "Wi-Fi" | "none"
IPAddress ip();          // the board's address on the network in use
int linkMbit();          // the Ethernet link's speed, 0 without a link
String ethText();        // one line for `show`
String ethStatusUz();    // one line for the setup page (Uzbek)

}  // namespace net
