#include "portal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "blog.h"
#include "config.h"

namespace portal {
namespace {

WebServer* web = nullptr;
DNSServer* dns = nullptr;
bool openNow = false;
uint32_t openedAt = 0, openFor = 0;
bool changed = false;
String status;
uint32_t lastScan = 0;

String esc(const String& s) {  // htmlEscape's body
  String o;
  for (char c : s) {
    if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;";
    else if (c == '\'') o += "&#39;";
    else o += c;
  }
  return o;
}

const char* CSS =
    "body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1117;color:#e7e7ea}"
    "main{max-width:520px;margin:0 auto;padding:16px}"
    "h1{font-size:20px;margin:8px 0 4px}p{color:#a9abb3;font-size:14px;line-height:1.45}"
    ".card{background:#1a1d26;border:1px solid #2a2e3a;border-radius:14px;padding:14px;margin:12px 0}"
    "label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#a9abb3;margin:10px 0 6px}"
    "select,input{width:100%;box-sizing:border-box;font-size:16px;padding:11px;border-radius:10px;"
    "border:1px solid #2a2e3a;background:#0f1117;color:#e7e7ea}"
    "button{width:100%;margin-top:14px;font-size:16px;font-weight:600;padding:12px;border:0;border-radius:10px;"
    "background:#C8973F;color:#fff}"
    "table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-top:1px solid #2a2e3a}"
    "td:first-child{color:#a9abb3;width:42%}.ok{color:#4ade80}.bad{color:#f87171}"
    "pre{white-space:pre-wrap;font-size:11px;color:#a9abb3;max-height:300px;overflow:auto}";

void page() {
  String nets;
  int n = WiFi.scanComplete();
  if (n > 0) {
    for (int i = 0; i < n; i++) {
      String s = WiFi.SSID(i);
      if (!s.length()) continue;
      bool dup = false;
      for (int j = 0; j < i; j++)
        if (WiFi.SSID(j) == s) dup = true;
      if (dup) continue;
      nets += "<option value=\"" + esc(s) + "\"" + (s == CFG.ssid ? " selected" : "") + ">" + esc(s) + " (" +
              String(WiFi.RSSI(i)) + " dBm" + (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? ", ochiq" : "") +
              ")</option>";
    }
  }
  String h = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
             "<title>Safia · pech qurilmasi</title><style>";
  h += CSS;
  h += "</style></head><body><main><h1>Safia · pechlarni o'qiydigan qurilma</h1>"
       "<p>Bu qurilma pechlarni o'qib, ma'lumotni Safia IMS'ga yuboradi. Bu sahifada uni zavod Wi-Fi tarmog'iga ulaysiz.</p>";
  h += "<div class=card>" + status + "</div>";
  h += "<div class=card><form method=post action=/save>"
       "<label>Wi-Fi tarmog'i</label><select name=pick><option value=''>— ro'yxatdan tanlang —</option>" +
       nets +
       "</select>"
       "<label>yoki nomini yozing</label><input name=ssid autocomplete=off placeholder='Tarmoq nomi'>"
       "<label>Parol</label><input name=pass type=password autocomplete=off placeholder='Ochiq tarmoq bo‘lsa, bo‘sh qoldiring'>"
       "<button type=submit>Saqlash va ulanish</button></form>"
       "<p>Faqat 2,4 GHz tarmoqlar ko'rinadi. Ro'yxat har 30 soniyada yangilanadi — sahifani qayta oching.</p></div>";
  h += "<div class=card><label>Oxirgi yozuvlar</label><pre>" + esc(blogTail(25)) + "</pre></div>";
  h += "</main></body></html>";
  web->send(200, "text/html; charset=utf-8", h);
}

void save() {
  String ssid = web->arg("ssid");
  ssid.trim();
  if (!ssid.length()) ssid = web->arg("pick");
  String pass = web->arg("pass");
  if (!ssid.length()) {
    web->sendHeader("Location", "/");
    web->send(303);
    return;
  }
  CFG.ssid = ssid;
  CFG.pass = pass;
  configSave();
  changed = true;
  blog("setup page: Wi-Fi set to \"%s\"", ssid.c_str());
  String h = "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
             "<meta http-equiv=refresh content='20;url=/'><style>";
  h += CSS;
  h += "</style></head><body><main><h1>Saqlandi</h1><p>Qurilma «" + esc(ssid) +
       "» tarmog'iga ulanmoqda. 20 soniyadan keyin bu sahifa natijani ko'rsatadi.</p></main></body></html>";
  web->send(200, "text/html; charset=utf-8", h);
}

void toPage() {
  web->sendHeader("Location", "http://192.168.4.1/");
  web->send(302);
}

}  // namespace

String htmlEscape(const String& s) { return esc(s); }

String apName() {
  uint8_t m[6];
  WiFi.macAddress(m);
  char b[24];
  snprintf(b, sizeof b, "Safia-Pech-%02X%02X", m[4], m[5]);
  return String(b);
}

bool isOpen() { return openNow; }

void open(uint32_t minutes, const char* why) {
  openedAt = millis();
  openFor = minutes * 60000UL;
  if (openNow) return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(apName().c_str());
  dns = new DNSServer();
  dns->start(53, "*", IPAddress(192, 168, 4, 1));
  web = new WebServer(80);
  web->on("/", HTTP_GET, page);
  web->on("/save", HTTP_POST, save);
  web->onNotFound(toPage);  // phones probe a page to find a captive portal
  web->begin();
  openNow = true;
  WiFi.scanNetworks(true);
  lastScan = millis();
  blog("setup hotspot «%s» open for %lu min (%s)", apName().c_str(), (unsigned long)minutes, why);
}

void close() {
  if (!openNow) return;
  web->stop();
  delete web;
  web = nullptr;
  dns->stop();
  delete dns;
  dns = nullptr;
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  openNow = false;
  blog("setup hotspot closed");
}

void loop() {
  if (!openNow) return;
  dns->processNextRequest();
  web->handleClient();
  if (millis() - lastScan > 30000 && WiFi.scanComplete() != WIFI_SCAN_RUNNING) {
    WiFi.scanDelete();
    WiFi.scanNetworks(true);
    lastScan = millis();
  }
  if (millis() - openedAt > openFor && WiFi.softAPgetStationNum() == 0) close();
}

bool takeWifiChange() {
  bool c = changed;
  changed = false;
  return c;
}

void setStatusText(const String& html) { status = html; }

}  // namespace portal
