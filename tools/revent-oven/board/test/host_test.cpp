// Host tests for the board's core (no board needed): the saved answers of a
// real Revent 725 (3 Nov 2026) are fed through the same code the board runs,
// as one HTTP response split at random points, in three framings.
//
//   bash test/run_host_tests.sh <dir with raw_logs.bin, raw_settings.bin,
//                                raw_status.bin, status.txt and the files>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "../src/core/dime.h"
#include "../src/core/http_response.h"
#include "../src/core/sha256.h"
#include "../src/core/soap.h"
#include "../src/core/sync.h"

static int fails = 0, checks = 0;
#define CHECK(c, msg)                                   \
  do {                                                  \
    checks++;                                           \
    if (!(c)) {                                         \
      fails++;                                          \
      std::printf("FAIL %s (line %d)\n", msg, __LINE__); \
    }                                                   \
  } while (0)

static std::string readFile(const std::string& p) {
  std::ifstream f(p, std::ios::binary);
  std::stringstream s;
  s << f.rdbuf();
  return s.str();
}

static std::string hexOf(const std::string& s) { return Sha256::hexOf((const uint8_t*)s.data(), s.size()); }

static void testSha() {
  CHECK(hexOf("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha empty");
  CHECK(hexOf("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha abc");
  std::string m(1000000, 'a');
  Sha256 h;
  for (size_t i = 0; i < m.size(); i += 777) h.update((const uint8_t*)m.data() + i, std::min<size_t>(777, m.size() - i));
  CHECK(h.hex() == "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0", "sha million a, odd pieces");
}

// An HTTP response around `body`: 0 = Content-Length, 1 = chunked, 2 = until close
static std::string wrap(const std::string& body, int framing, std::mt19937& rng) {
  std::string h = "HTTP/1.1 200 OK\r\nServer: gSOAP/2.8\r\nContent-Type: application/dime\r\n";
  if (framing == 0) return h + "Content-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
  if (framing == 2) return h + "Connection: close\r\n\r\n" + body;
  std::string out = h + "Transfer-Encoding: chunked\r\n\r\n";
  size_t i = 0;
  while (i < body.size()) {
    size_t n = std::min<size_t>(body.size() - i, 1 + rng() % 9000);
    char sz[32];
    std::snprintf(sz, sizeof sz, "%zx\r\n", n);
    out += sz + body.substr(i, n) + "\r\n";
    i += n;
  }
  return out + "0\r\n\r\n";
}

struct Got {
  std::map<std::string, std::string> files;
  std::map<std::string, std::string> shas;
  std::string env;
};

// Feed one response in random pieces through HttpResponse → DimeReader → FileCollector.
static bool runAnswer(const std::string& resp, int framing, std::mt19937& rng, Got& got, std::string& err) {
  FileCollector fc([&](OvenFile& f) {
    got.files[f.name] = std::string((const char*)f.data.data(), f.data.size());
    got.shas[f.name] = f.sha;
  });
  DimeReader dime(fc);
  HttpResponse http([&](const uint8_t* p, size_t n) { return dime.feed(p, n); });
  size_t i = 0;
  while (i < resp.size()) {
    size_t n = std::min<size_t>(resp.size() - i, 1 + rng() % 3000);
    if (!http.feed((const uint8_t*)resp.data() + i, n)) {
      err = http.error() + " / " + dime.error();
      return false;
    }
    i += n;
  }
  if (!http.finish()) {
    err = "http: " + http.error();
    return false;
  }
  if (!dime.done()) {
    err = "dime not done: " + dime.error();
    return false;
  }
  got.env = fc.envelope();
  (void)framing;
  return true;
}

static void testLogs(const std::string& dir) {
  std::string raw = readFile(dir + "/raw_logs.bin");
  CHECK(!raw.empty(), "raw_logs.bin present");
  std::vector<std::string> names = {"001794.log", "001795.log", "001796.log", "001797.log",
                                    "001798.log", "001799.log", "001800.log", "ServiceData.txt"};
  for (int framing = 0; framing < 3; framing++) {
    for (int seed = 1; seed <= 3; seed++) {
      std::mt19937 rng(seed * 101 + framing);
      Got got;
      std::string err;
      bool ok = runAnswer(wrap(raw, framing, rng), framing, rng, got, err);
      CHECK(ok, ("logs answer read, framing " + std::to_string(framing) + ": " + err).c_str());
      CHECK(got.files.size() == names.size(), "8 files out of getLogs");
      for (auto& n : names) {
        std::string want = readFile(dir + "/" + n);
        CHECK(got.files.count(n) && got.files[n] == want, ("file bytes equal: " + n).c_str());
        CHECK(got.shas[n] == hexOf(want), ("file sha equal: " + n).c_str());
      }
      std::string ft;
      CHECK(!soap::fault(got.env, ft), "no fault in the logs envelope");
      CHECK(got.env.find("getLogsResponse") != std::string::npos, "envelope kept");
    }
  }
}

static void testSettings(const std::string& dir) {
  std::string raw = readFile(dir + "/raw_settings.bin");
  std::mt19937 rng(7);
  Got got;
  std::string err;
  CHECK(runAnswer(wrap(raw, 0, rng), 0, rng, got, err), ("settings answer read: " + err).c_str());
  CHECK(got.files.size() == 1 && got.files.count("OvenSettings.xml"), "OvenSettings.xml out of getSettings");
  CHECK(got.files["OvenSettings.xml"] == readFile(dir + "/OvenSettings.xml"), "settings bytes equal");
}

static void testStatus(const std::string& dir) {
  std::string raw = readFile(dir + "/raw_status.bin");
  CHECK(!soap::looksLikeDime((const uint8_t*)raw.data(), raw.size()), "status is plain XML");
  // through the HTTP reader too, split badly
  std::string body;
  HttpResponse http([&](const uint8_t* p, size_t n) {
    body.append((const char*)p, n);
    return true;
  });
  std::string resp = "HTTP/1.1 200 OK\r\nContent-Type: text/xml; charset=utf-8\r\nContent-Length: " +
                     std::to_string(raw.size()) + "\r\n\r\n" + raw;
  for (size_t i = 0; i < resp.size(); i += 5) http.feed((const uint8_t*)resp.data() + i, std::min<size_t>(5, resp.size() - i));
  CHECK(http.finish() && http.status() == 200 && body == raw, "status through HTTP");
  std::vector<std::string> lines;
  std::string err;
  CHECK(soap::parseStatus(body, lines, err), ("status parsed: " + err).c_str());
  // status.txt is revent_oven.py's own decoding, lines joined by \n
  std::string want = readFile(dir + "/status.txt"), joined;
  for (size_t i = 0; i < lines.size(); i++) joined += (i ? "\n" : "") + lines[i];
  CHECK(lines.size() == 39, "39 status lines");
  CHECK(joined == want, "status lines equal revent_oven.py's");
  if (joined != want) std::printf("  got: %s\n want: %s\n", joined.c_str(), want.c_str());
}

static void testSoapBits() {
  CHECK(soap::fixDoubleUtf8("\xc3\x90\xc2\x92\xc3\x91\xc2\x8b") == "\xd0\x92\xd1\x8b", "mojibake undone (Вы)");
  CHECK(soap::fixDoubleUtf8("\xd0\x92\xd1\x8b") == "\xd0\x92\xd1\x8b", "proper Cyrillic left alone");
  CHECK(soap::fixDoubleUtf8("caf\xc3\xa9") == "caf\xc3\xa9", "latin text that is not double UTF-8 left alone");
  CHECK(soap::unescapeXml("a &lt;b&gt; &amp; &#65;&#x42; &quot;") == "a <b> & AB \"", "entities");
  std::string fx =
      "<?xml version=\"1.0\"?><SOAP-ENV:Envelope><SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode>"
      "<faultstring>Method &apos;x&apos; not implemented</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>";
  std::string t;
  CHECK(soap::fault(fx, t) && t == "SOAP-ENV:Client Method 'x' not implemented", "fault text");
  std::vector<std::string> lines;
  std::string err;
  CHECK(!soap::parseStatus(fx, lines, err) && err == t, "status refuses a fault");
  std::string empt = "<r><returnStrings xsi:type=\"x\"><item/><item>a&amp;b</item><item></item></returnStrings></r>";
  CHECK(soap::parseStatus(empt, lines, err) && lines.size() == 3 && lines[0] == "" && lines[1] == "a&b" && lines[2] == "",
        "empty items");
  // the three requests, and nothing else
  CHECK(soap::request(soap::Op::Status).find("<item>status</item>") != std::string::npos, "status request");
  CHECK(soap::request(soap::Op::Logs).find("<ns:getLogs>") != std::string::npos, "logs request");
  CHECK(soap::request(soap::Op::Settings).find("<ns:getSettings>") != std::string::npos, "settings request");
}

static void testDecide() {
  std::string a(1000, 'x');
  for (size_t i = 0; i < a.size(); i++) a[i] = (char)(i * 7);
  std::string b = a + "tail-bytes";
  const uint8_t* pb = (const uint8_t*)b.data();
  size_t off = 99;
  Kept none;
  CHECK(decide(none, pb, b.size(), hexOf(b), off) == Action::Whole && off == 0, "new file → whole");
  Kept same{true, b.size(), hexOf(b)};
  CHECK(decide(same, pb, b.size(), hexOf(b), off) == Action::Same, "same → nothing");
  Kept prefix{true, a.size(), hexOf(a)};
  CHECK(decide(prefix, pb, b.size(), hexOf(b), off) == Action::Tail && off == a.size(), "grew → tail");
  Kept other{true, a.size(), hexOf("something else")};
  CHECK(decide(other, pb, b.size(), hexOf(b), off) == Action::Whole && off == 0, "changed → whole");
  Kept bigger{true, b.size() + 5, hexOf(b)};
  CHECK(decide(bigger, pb, b.size(), hexOf(b), off) == Action::Whole, "shrank → whole");
}

static Upload up(const std::string& kind, const std::string& name, size_t off, size_t n) {
  Upload u;
  u.kind = kind;
  u.name = name;
  u.offset = off;
  std::string s(n, 'z');
  u.chunk.assign((const uint8_t*)s.data(), s.size());
  return u;
}

static void testQueue() {
  CHECK(newerName("001800.log", "001799.log") && !newerName("001799.log", "001800.log"), "newer name");
  UploadQueue q(1000);
  std::vector<std::string> def;
  CHECK(q.add(up("log", "001794.log", 0, 400), &def), "first fits");
  CHECK(q.add(up("log", "001795.log", 0, 400), &def), "second fits");
  CHECK(q.add(up("log", "001800.log", 0, 500), &def), "newest pushes the oldest out");
  CHECK(def.size() == 1 && def[0] == "001794.log", "oldest deferred");
  CHECK(q.bytes() == 900, "bytes after eviction");
  def.clear();
  CHECK(!q.add(up("log", "001790.log", 0, 400), &def) && def.size() == 1 && def[0] == "001790.log",
        "an older file does not push newer ones out");
  CHECK(q.add(up("service", "ServiceData.txt", 0, 36), &def), "small one still fits");
  CHECK(!q.add(up("log", "001801.log", 50, 200), &def), "a tail never evicts");
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage: host_test <dir with the saved oven answers>\n");
    return 2;
  }
  std::string dir = argv[1];
  testSha();
  testSoapBits();
  testDecide();
  testQueue();
  testStatus(dir);
  testSettings(dir);
  testLogs(dir);
  std::printf("%d checks, %d failed\n", checks, fails);
  return fails ? 1 : 0;
}
