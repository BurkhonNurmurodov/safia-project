// The board's log: every line to the USB serial port (with the uptime) and the
// last ones kept in memory for `log` on the serial console and the setup page.
#pragma once
#include <Arduino.h>

void blog(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
String blogTail(size_t lines);          // newest last
String uptimeText(uint32_t ms);         // "2d 03:14:07"
