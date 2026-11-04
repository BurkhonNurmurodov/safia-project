#include "oven.h"

#include <WiFi.h>

#include "../core/http_response.h"

namespace {
uint8_t rx[4096];  // in the board's own RAM: reused by every call, one at a time
}

OvenReply ovenAsk(const String& ip, uint16_t port, soap::Op op, uint32_t idleMs, uint32_t totalMs,
                  const BodySink& sink, const std::function<void()>& background) {
  OvenReply r;
  uint32_t t0 = millis();
  WiFiClient c;
  if (!c.connect(ip.c_str(), port, 5000)) {
    r.error = "could not connect to " + ip + ":" + String(port);
    r.ms = millis() - t0;
    return r;
  }
  c.setNoDelay(true);
  std::string body = soap::request(op);
  String head = String("POST ") + soap::path() + " HTTP/1.1\r\n" + "Host: " + ip + ":" + String(port) + "\r\n" +
                "Content-Type: text/xml; charset=utf-8\r\n" + "SOAPAction: \"\"\r\n" + "Connection: close\r\n" +
                "Content-Length: " + String((unsigned)body.size()) + "\r\n\r\n";
  if (c.write((const uint8_t*)head.c_str(), head.length()) != head.length() ||
      c.write((const uint8_t*)body.data(), body.size()) != body.size()) {
    r.error = "the request could not be sent";
    c.stop();
    r.ms = millis() - t0;
    return r;
  }

  HttpResponse http(sink);
  uint32_t last = millis();
  bool closed = false;
  while (!http.complete() && !http.failed()) {
    int avail = c.available();
    if (avail > 0) {
      int n = c.read(rx, avail < (int)sizeof rx ? avail : (int)sizeof rx);
      if (n > 0) {
        last = millis();
        http.feed(rx, (size_t)n);
        continue;
      }
    }
    if (!c.connected() && c.available() <= 0) {
      closed = true;
      break;
    }
    if (millis() - last > idleMs) {
      r.error = "the oven stopped answering (" + String(idleMs / 1000) + " s without data)";
      break;
    }
    if (millis() - t0 > totalMs) {
      r.error = "the answer took longer than " + String(totalMs / 1000) + " s";
      break;
    }
    if (background) background();
    delay(2);
  }
  c.stop();
  r.ms = millis() - t0;
  r.bytes = http.bodyBytes();
  r.http = http.status();
  if (r.error.length()) return r;
  if (closed && !http.finish()) {
    r.error = String("the oven closed the connection: ") + http.error().c_str();
    return r;
  }
  if (http.failed()) {
    r.error = String("bad answer: ") + http.error().c_str();
    return r;
  }
  if (r.http != 200) {
    // a fault comes with HTTP 500; the caller reads its text from the body
    r.error = "HTTP " + String(r.http);
    return r;
  }
  r.ok = true;
  return r;
}
