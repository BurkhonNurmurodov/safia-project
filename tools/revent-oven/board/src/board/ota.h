// Firmware updates over the network (firmware 1.3.0+), so the board never has
// to come back to a laptop for a new version.
//
// IMS publishes ONE firmware (services/oven_firmware.py; published from the
// build Mac with publish_firmware.sh). Every plan names it; a board running
// another version, between rounds:
//   1. downloads it with its collector key, hashing it on the way, straight
//      into its OTHER app slot (the 4 MB flash holds two),
//   2. keeps it only when the SHA-256 is the plan's and the image checks out,
//   3. restarts into it.
// The new firmware is ON TRIAL until it reaches IMS: then it keeps itself.
// If it crashes or restarts before that, the bootloader goes back to the one
// before by itself; if it runs 30 minutes without reaching IMS, it goes back
// on its own. A version that failed that way is not tried again on this board
// (publish the build again under a new version number).
#pragma once
#include <Arduino.h>

#include <functional>

#include "ims.h"

namespace ota {

void begin();       // at start: notes a firmware on trial, or a trial that failed
void confirm();     // IMS answered the plan: a firmware on trial keeps itself
void loop();        // a firmware on trial that never reaches IMS goes back
// Between rounds: updates when the plan names another version. Returns only
// when there was nothing to do or the update failed (it restarts otherwise).
void maybeUpdate(Ims& ims, const Plan& plan, const std::function<void()>& background);
bool onTrial();
String text();      // one line for `show`

}  // namespace ota
