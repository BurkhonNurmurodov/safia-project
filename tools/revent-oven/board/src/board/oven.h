// One read-only call to one oven over the factory LAN. The request is built by
// soap::request() and nothing else; the answer's body is handed on as it
// arrives (a 1.5 MB getLogs answer never sits in memory whole).
#pragma once
#include <Arduino.h>

#include <functional>

#include "../core/soap.h"

struct OvenReply {
  bool ok = false;
  int http = 0;
  String error;
  uint32_t ms = 0;
  uint64_t bytes = 0;
};

using BodySink = std::function<bool(const uint8_t*, size_t)>;

// idleMs: longest silence allowed between bytes; totalMs: the whole call.
// `background` runs while waiting (the setup page, the LED).
OvenReply ovenAsk(const String& ip, uint16_t port, soap::Op op, uint32_t idleMs, uint32_t totalMs,
                  const BodySink& sink, const std::function<void()>& background);
