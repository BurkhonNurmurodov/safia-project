// The board's side of the collector door (/api/ovens/collector/*) on IMS:
// the plan (which ovens, what IMS already holds), the live status, files.
// HTTPS checks IMS's certificate against the roots in certs.h; the key goes
// in X-Oven-Key and can do nothing but this.
#pragma once
#include <Arduino.h>

#include <map>
#include <string>
#include <vector>

#include "../core/sync.h"

// What the board says about itself on every request (X-Collector-Info):
// firmware, uptime, Wi-Fi, memory, heartbeat pace — written in main.cpp.
String deviceInfo();

struct OvenPlan {
  int id = 0;
  String name;
  String ip;
  uint16_t port = 8080;
  std::string settingsSha;
  std::map<std::string, Kept> logs;
};

struct Plan {
  uint32_t statusS = 60, logsS = 600, settingsS = 3600, pingS = 10;
  std::vector<OvenPlan> ovens;
};

struct Reading {
  int ovenId = 0;
  bool ok = false;
  std::vector<std::string> lines;
  String error;
};

struct ImsReply {
  int http = 0;       // < 0: no answer (connection, TLS, timeout)
  String body;
  String error;       // what went wrong, in words
  bool ok() const { return http == 200; }
};

class Ims {
 public:
  ImsReply plan(Plan& out);
  ImsReply status(const std::vector<Reading>& readings);
  ImsReply file(int ovenId, const Upload& u);
  ImsReply ping();  // the heartbeat between rounds: short timeouts, no retry
  String lastError() const { return last_; }
  uint32_t lastContactMs() const { return contact_; }  // any answer from IMS

 private:
  ImsReply send(const char* method, const String& path, const uint8_t* body, size_t n, const char* ctype);
  ImsReply sendOnce(const char* method, const String& path, const uint8_t* body, size_t n, const char* ctype,
                    bool quick = false);
  String last_;
  uint32_t contact_ = 0;
};
