// The setup hotspot: the board opens its own Wi-Fi «Safia-Pech-XXXX» (no
// password) with one page, where the factory Wi-Fi is picked from a phone and
// the board's state can be read. It opens when no Wi-Fi is set, when the «0»
// button is held for 3 seconds, or after 10 minutes without Wi-Fi; it closes
// by itself. The key and the IMS address are NOT settable here (USB only).
#pragma once
#include <Arduino.h>

namespace portal {

void open(uint32_t minutes, const char* why);
void close();
bool isOpen();
void loop();                 // serve the page; safe to call during a round
bool takeWifiChange();       // true once after somebody saved a network there
void setStatusText(const String& html);  // the board's state, shown on the page
String apName();

}  // namespace portal
