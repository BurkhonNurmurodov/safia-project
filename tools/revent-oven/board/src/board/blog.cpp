#include "blog.h"

#include <stdarg.h>

namespace {
const size_t KEEP = 60;
String ring[KEEP];
size_t next = 0, count = 0;
}  // namespace

String uptimeText(uint32_t ms) {
  uint32_t s = ms / 1000;
  char b[32];
  uint32_t d = s / 86400;
  if (d) snprintf(b, sizeof b, "%lud %02lu:%02lu:%02lu", (unsigned long)d, (unsigned long)(s / 3600 % 24),
                  (unsigned long)(s / 60 % 60), (unsigned long)(s % 60));
  else snprintf(b, sizeof b, "%02lu:%02lu:%02lu", (unsigned long)(s / 3600), (unsigned long)(s / 60 % 60), (unsigned long)(s % 60));
  return String(b);
}

void blog(const char* fmt, ...) {
  char msg[256];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof msg, fmt, ap);
  va_end(ap);
  String line = "[" + uptimeText(millis()) + "] " + msg;
  Serial.println(line);
  ring[next] = line;
  next = (next + 1) % KEEP;
  if (count < KEEP) count++;
}

String blogTail(size_t lines) {
  if (lines > count) lines = count;
  String out;
  for (size_t i = 0; i < lines; i++) {
    size_t idx = (next + KEEP - lines + i) % KEEP;
    out += ring[idx];
    out += '\n';
  }
  return out;
}
