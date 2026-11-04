#include "ota.h"

#include <Preferences.h>
#include <Update.h>
#include <esp_ota_ops.h>

#include "../core/sha256.h"
#include "blog.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

// The Arduino core validates a new firmware the moment it starts, unless this
// says the app will do it later — which is the whole rollback: ota::confirm()
// keeps it once IMS has answered. (C linkage: the core's weak hook is C.)
extern "C" bool verifyRollbackLater() { return true; }

namespace ota {
namespace {

const char* NS = "safia_ota";
const uint32_t TRIAL_MS = 30UL * 60000;    // on trial: this long to reach IMS
const uint32_t RETRY_MS = 60UL * 60000;    // a download that failed: wait this long

bool trial = false;
String tried;        // the version this board restarted into for a trial
String bad;          // a version whose trial failed here: never again
String lastNote;     // what the last update attempt said
String failedVer;    // a download that failed, and when
uint32_t failedAt = 0;

void save(const char* key, const String& v) {
  Preferences p;
  p.begin(NS, false);
  if (v.length()) p.putString(key, v);
  else p.remove(key);
  p.end();
}

}  // namespace

void begin() {
  Preferences p;
  p.begin(NS, true);
  tried = p.getString("try", "");
  bad = p.getString("bad", "");
  p.end();
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t st;
  trial = running && esp_ota_get_state_partition(running, &st) == ESP_OK && st == ESP_OTA_IMG_PENDING_VERIFY;
  if (tried.length() && tried != FW_VERSION) {
    // restarted into a new firmware and came back: the bootloader rolled it back
    bad = tried;
    save("bad", bad);
    save("try", "");
    tried = "";
    blog("update: firmware %s did not hold (it never reached IMS) — back on %s; %s is not tried again", bad.c_str(),
         FW_VERSION, bad.c_str());
  } else if (trial) {
    blog("update: running %s on trial — it keeps itself once IMS answers (30 min)", FW_VERSION);
  }
}

void confirm() {
  if (trial) {
    esp_ota_mark_app_valid_cancel_rollback();
    trial = false;
    blog("update: firmware %s reached IMS — kept", FW_VERSION);
  }
  if (tried.length()) {
    save("try", "");
    tried = "";
  }
}

void loop() {
  if (trial && millis() > TRIAL_MS) {
    blog("update: %s has not reached IMS in 30 minutes — going back to the firmware before", FW_VERSION);
    delay(300);
    esp_ota_mark_app_invalid_rollback_and_reboot();  // restarts; begin() then marks it bad
  }
}

bool onTrial() { return trial; }

void maybeUpdate(Ims& ims, const Plan& plan, const std::function<void()>& background) {
  const String& v = plan.fwVersion;
  if (!v.length() || v == FW_VERSION || trial) return;
  if (v == bad) return;
  if (v == failedVer && millis() - failedAt < RETRY_MS) return;
  if (plan.fwSha.size() != 64 || plan.fwSize < 200 * 1024) return;
  auto fail = [&](const String& why) {
    Update.abort();
    failedVer = v;
    failedAt = millis();
    lastNote = "update to " + v + " failed: " + why;
    blog("update: to %s failed: %s — tried again in an hour", v.c_str(), why.c_str());
  };
  blog("update: IMS publishes %s (this board runs %s) — downloading %u KB", v.c_str(), FW_VERSION,
       (unsigned)(plan.fwSize / 1024));
  if (!Update.begin(plan.fwSize, U_FLASH)) {
    fail(String("no room: ") + Update.errorString());
    return;
  }
  Sha256 sha;
  uint32_t t0 = millis();
  ImsReply r = ims.download(
      "/api/ovens/collector/firmware?version=" + v, plan.fwSize,
      [&](const uint8_t* p, size_t n) {
        sha.update(p, n);
        return Update.write(const_cast<uint8_t*>(p), n) == n;
      },
      background);
  if (!r.ok()) {
    fail(r.error.length() ? r.error : String("HTTP ") + String(r.http));
    return;
  }
  std::string got = sha.hex();
  if (got != plan.fwSha) {
    fail(String("the image's SHA-256 is not the plan's (") + got.substr(0, 12).c_str() + "…)");
    return;
  }
  if (!Update.end(true)) {  // checks the image and points the next start at it
    fail(String("the image did not check out: ") + Update.errorString());
    return;
  }
  save("try", v);
  blog("update: %s written in %.0f s — restarting into it", v.c_str(), (millis() - t0) / 1000.0);
  delay(500);
  ESP.restart();
}

String text() {
  String s = FW_VERSION;
  if (trial) s += " (on trial until IMS answers)";
  if (bad.length()) s += "; " + bad + " failed here, not tried again";
  if (lastNote.length()) s += "; " + lastNote;
  return s;
}

}  // namespace ota
