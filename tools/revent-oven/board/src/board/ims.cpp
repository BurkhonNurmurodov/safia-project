#include "ims.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "blog.h"
#include "certs.h"
#include "config.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

namespace {
WiFiClientSecure tls;
WiFiClient plain;
bool tlsReady = false;

String urlEncode(const std::string& s) {
  static const char* hex = "0123456789ABCDEF";
  String out;
  for (unsigned char c : s) {
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') out += (char)c;
    else {
      out += '%';
      out += hex[c >> 4];
      out += hex[c & 15];
    }
  }
  return out;
}

String detailCode(const String& body) {
  JsonDocument d;
  if (deserializeJson(d, body)) return "";
  const char* code = d["detail"]["code"] | "";
  return code;
}
}  // namespace

ImsReply Ims::send(const char* method, const String& path, const uint8_t* body, size_t n, const char* ctype) {
  ImsReply r;
  String url = CFG.server + path;
  bool https = CFG.server.startsWith("https://");
  if (https && !tlsReady) {
    tls.setCACert(ROOT_CAS);
    tls.setHandshakeTimeout(20);
    tlsReady = true;
  }
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(10000);
  http.setTimeout(45000);
  bool begun = https ? http.begin(tls, url) : http.begin(plain, url);
  if (!begun) {
    r.http = -1;
    r.error = "bad server address: " + CFG.server;
    last_ = r.error;
    return r;
  }
  http.addHeader("X-Oven-Key", CFG.key);
  http.addHeader("User-Agent", "safia-oven-board/" FW_VERSION);
  http.addHeader("Accept", "application/json");
  if (ctype) http.addHeader("Content-Type", ctype);
  int code;
  if (!strcmp(method, "GET")) code = http.GET();
  else code = http.sendRequest(method, const_cast<uint8_t*>(body), n);
  r.http = code;
  if (code > 0) {
    r.body = http.getString();
  } else {
    r.error = HTTPClient::errorToString(code);
    char tlsErr[100] = {0};
    if (https && tls.lastError(tlsErr, sizeof tlsErr)) r.error += String(" (TLS: ") + tlsErr + ")";
  }
  http.end();
  if (code <= 0) {
    // a dead kept-alive connection: start the next one fresh
    if (https) tls.stop();
    else plain.stop();
  }
  if (code > 0 && code != 200) {
    String c = detailCode(r.body);
    r.error = "HTTP " + String(code) + (c.length() ? " " + c : "");
  }
  last_ = r.ok() ? "" : r.error;
  return r;
}

ImsReply Ims::plan(Plan& out) {
  ImsReply r = send("GET", "/api/ovens/collector/plan", nullptr, 0, nullptr);
  if (!r.ok()) return r;
  JsonDocument d;
  DeserializationError e = deserializeJson(d, r.body);
  if (e) {
    r.http = -2;
    r.error = String("the plan is not JSON: ") + e.c_str();
    last_ = r.error;
    return r;
  }
  Plan p;
  p.statusS = d["poll"]["status_s"] | 60;
  p.logsS = d["poll"]["logs_s"] | 600;
  p.settingsS = d["poll"]["settings_s"] | 3600;
  if (p.statusS < 15) p.statusS = 15;
  for (JsonObject o : d["ovens"].as<JsonArray>()) {
    OvenPlan op;
    op.id = o["id"] | 0;
    op.name = (const char*)(o["name"] | "");
    op.ip = (const char*)(o["ip"] | "");
    op.port = o["port"] | 8080;
    op.settingsSha = (const char*)(o["settings_sha256"] | "");
    for (JsonPair kv : o["logs"].as<JsonObject>()) {
      Kept k;
      k.has = true;
      k.size = kv.value()["size"] | 0;
      k.sha = (const char*)(kv.value()["sha256"] | "");
      op.logs[kv.key().c_str()] = k;
    }
    if (op.id && op.ip.length()) p.ovens.push_back(op);
  }
  out = p;
  return r;
}

ImsReply Ims::status(const std::vector<Reading>& readings) {
  JsonDocument d;
  JsonArray rs = d["readings"].to<JsonArray>();
  for (const Reading& x : readings) {
    JsonObject o = rs.add<JsonObject>();
    o["oven_id"] = x.ovenId;
    if (x.ok) {
      JsonArray ls = o["lines"].to<JsonArray>();
      for (const std::string& l : x.lines) ls.add(l);
      o["error"] = nullptr;
    } else {
      o["lines"] = nullptr;
      o["error"] = x.error.c_str();
    }
  }
  String body;
  serializeJson(d, body);
  return send("POST", "/api/ovens/collector/status", (const uint8_t*)body.c_str(), body.length(), "application/json");
}

ImsReply Ims::file(int ovenId, const Upload& u) {
  String path = "/api/ovens/collector/raw?oven_id=" + String(ovenId) + "&kind=" + urlEncode(u.kind) +
                "&name=" + urlEncode(u.name) + "&offset=" + String((unsigned long)u.offset) +
                "&size=" + String((unsigned long)u.size) + "&sha256=" + String(u.sha.c_str());
  return send("POST", path, u.chunk.data(), u.chunk.size(), "application/octet-stream");
}
