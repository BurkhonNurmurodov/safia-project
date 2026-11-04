#include "net.h"

#include <ETH.h>
#include <WiFi.h>

#include "blog.h"

// The W5500 is OFF unless the build says otherwise (-DWITH_W5500=1 in
// platformio.ini's build_flags): no board has a module, and the probe's
// failure path is untested on the hardware (2026-11-04).
#ifndef WITH_W5500
#define WITH_W5500 0
#endif

namespace net {
namespace {

const int PIN_SCK = 7, PIN_MISO = 9, PIN_MOSI = 11, PIN_CS = 12;
// Jumper wires: well below the W5500's 80 MHz, and still far more than the
// ovens and IMS ever ask of it.
const uint8_t SPI_MHZ = 12;
// Higher than Wi-Fi's 100: Ethernet is the default way out whenever it is up,
// and when it goes down the system picks Wi-Fi by itself.
const int ETH_ROUTE_PRIO = 200;

bool found = false;

// What each network's DHCP handed out, read the moment it did (the DNS servers
// are ONE list for the whole board, and the network that renews its lease last
// overwrites them). Written by the network event task, read by loop().
volatile uint32_t ethDns1 = 0, ethDns2 = 0, wifiDns1 = 0, wifiDns2 = 0;

void onEvent(arduino_event_id_t e, arduino_event_info_t) {
  switch (e) {
    case ARDUINO_EVENT_ETH_START:
      ETH.setHostname("safia-pech");
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      ethDns1 = (uint32_t)ETH.dnsIP(0);
      ethDns2 = (uint32_t)ETH.dnsIP(1);
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      wifiDns1 = (uint32_t)WiFi.dnsIP(0);
      wifiDns2 = (uint32_t)WiFi.dnsIP(1);
      break;
    default:
      break;
  }
}

String ipText(uint32_t a) { return IPAddress(a).toString(); }

// Point the board's DNS at the servers of the network in use, so a name like
// production.safiacorporate.uz is never asked of a server on the other network
// (unreachable once that network is down).
void keepDns() {
  static uint32_t lastCheck = 0;
  if (lastCheck && millis() - lastCheck < 5000) return;
  lastCheck = millis();
  uint32_t want1 = 0, want2 = 0;
  if (ethUp()) {
    want1 = ethDns1;
    want2 = ethDns2;
  } else if (wifiUp()) {
    want1 = wifiDns1;
    want2 = wifiDns2;
  }
  if (!want1) return;
  bool fixed = false;
  if ((uint32_t)ETH.dnsIP(0) != want1) {
    ETH.dnsIP(0, IPAddress(want1));
    fixed = true;
  }
  if (want2 && (uint32_t)ETH.dnsIP(1) != want2) {
    ETH.dnsIP(1, IPAddress(want2));
    fixed = true;
  }
  if (fixed)
    blog("DNS: %s%s%s (the %s network's)", ipText(want1).c_str(), want2 ? ", " : "", want2 ? ipText(want2).c_str() : "",
         ethUp() ? "Ethernet" : "Wi-Fi");
}

}  // namespace

void begin() {
  if (!WITH_W5500) {
    blog("Ethernet: off in this build (WITH_W5500=0) — Wi-Fi only");
    return;
  }
  Network.onEvent(onEvent);
  // A W5500 that is not there answers nothing: the driver's chip check fails,
  // begin() says false within a moment, and the board goes on with Wi-Fi.
  found = ETH.begin(ETH_PHY_W5500, 1, PIN_CS, -1 /* no IRQ wire: polled */, -1 /* no RST wire */, SPI2_HOST, PIN_SCK,
                    PIN_MISO, PIN_MOSI, SPI_MHZ);
  if (!found) {
    blog("Ethernet: no W5500 module answered — Wi-Fi only");
    return;
  }
  ETH.setRoutePrio(ETH_ROUTE_PRIO);
  blog("Ethernet: W5500 found (MAC %s) — preferred over Wi-Fi once its cable is in", ETH.macAddress().c_str());
}

void loop() {
  if (!found) return;
  static bool wasLink = false, wasUp = false;
  bool link = ETH.linkUp();
  bool upNow = ethUp();
  if (link && !wasLink)
    blog("Ethernet: cable in, %d Mbit/s %s duplex", (int)ETH.linkSpeed(), ETH.fullDuplex() ? "full" : "half");
  if (!link && wasLink) blog("Ethernet: cable out — %s", wifiUp() ? "Wi-Fi carries the board" : "no network now");
  if (upNow && !wasUp)
    blog("Ethernet: IP %s/%d, gateway %s, DNS %s — IMS and the ovens go through Ethernet", ETH.localIP().toString().c_str(),
         (int)ETH.subnetCIDR(), ETH.gatewayIP().toString().c_str(), ipText(ethDns1).c_str());
  if (!upNow && wasUp && link) blog("Ethernet: lost its address");
  wasLink = link;
  wasUp = upNow;
  keepDns();
}

bool ethFound() { return found; }

bool ethUp() { return found && ETH.linkUp() && ETH.hasIP() && (uint32_t)ETH.localIP() != 0; }

bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

bool up() { return ethUp() || wifiUp(); }

const char* via() { return ethUp() ? "eth" : wifiUp() ? "wifi" : ""; }

String viaText() { return ethUp() ? "Ethernet" : wifiUp() ? "Wi-Fi" : "none"; }

IPAddress ip() { return ethUp() ? ETH.localIP() : WiFi.localIP(); }

int linkMbit() { return found && ETH.linkUp() ? (int)ETH.linkSpeed() : 0; }

String ethText() {
  if (!found) return "no W5500 module (Wi-Fi only)";
  String mac = "MAC " + ETH.macAddress();
  if (!ETH.linkUp()) return "W5500 found, no cable (" + mac + ")";
  String speed = String((int)ETH.linkSpeed()) + " Mbit/s " + (ETH.fullDuplex() ? "full" : "half");
  if (!ethUp()) return "cable in (" + speed + "), waiting for an address (" + mac + ")";
  return "connected, IP " + ETH.localIP().toString() + "/" + String((int)ETH.subnetCIDR()) + ", gateway " +
         ETH.gatewayIP().toString() + ", " + speed + ", " + mac + " — in use";
}

String ethStatusUz() {
  if (!found) return "";
  if (!ETH.linkUp()) return "kabel ulanmagan";
  if (!ethUp()) return "kabel ulangan, manzil kutilmoqda";
  return "ulangan, " + ETH.localIP().toString() + " (" + String((int)ETH.linkSpeed()) + " Mbit/s)";
}

}  // namespace net
