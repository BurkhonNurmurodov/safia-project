#include "soap.h"

#include <cstdlib>

namespace soap {
namespace {

const char* ENV_HEAD =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
    "<SOAP-ENV:Envelope"
    " xmlns:SOAP-ENV=\"http://schemas.xmlsoap.org/soap/envelope/\""
    " xmlns:SOAP-ENC=\"http://schemas.xmlsoap.org/soap/encoding/\""
    " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\""
    " xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\""
    " xmlns:ns=\"urn:MCPtoPC\">"
    "<SOAP-ENV:Body>";
const char* ENV_TAIL = "</SOAP-ENV:Body></SOAP-ENV:Envelope>";

void putUtf8(std::string& out, uint32_t cp) {
  if (cp < 0x80) {
    out.push_back((char)cp);
  } else if (cp < 0x800) {
    out.push_back((char)(0xC0 | (cp >> 6)));
    out.push_back((char)(0x80 | (cp & 0x3F)));
  } else if (cp < 0x10000) {
    out.push_back((char)(0xE0 | (cp >> 12)));
    out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
    out.push_back((char)(0x80 | (cp & 0x3F)));
  } else {
    out.push_back((char)(0xF0 | (cp >> 18)));
    out.push_back((char)(0x80 | ((cp >> 12) & 0x3F)));
    out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
    out.push_back((char)(0x80 | (cp & 0x3F)));
  }
}

// Strict UTF-8 → code points. false on any malformed sequence.
bool decodeUtf8(const std::string& s, std::vector<uint32_t>& cps) {
  size_t i = 0;
  while (i < s.size()) {
    uint8_t c = (uint8_t)s[i];
    uint32_t cp;
    int more;
    if (c < 0x80) {
      cp = c;
      more = 0;
    } else if ((c & 0xE0) == 0xC0) {
      cp = c & 0x1F;
      more = 1;
    } else if ((c & 0xF0) == 0xE0) {
      cp = c & 0x0F;
      more = 2;
    } else if ((c & 0xF8) == 0xF0) {
      cp = c & 0x07;
      more = 3;
    } else {
      return false;
    }
    for (int k = 1; k <= more; k++) {
      if (i + k >= s.size()) return false;
      uint8_t d = (uint8_t)s[i + k];
      if ((d & 0xC0) != 0x80) return false;
      cp = (cp << 6) | (d & 0x3F);
    }
    if ((more == 1 && cp < 0x80) || (more == 2 && cp < 0x800) || (more == 3 && cp < 0x10000) ||
        cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF))
      return false;
    cps.push_back(cp);
    i += more + 1;
  }
  return true;
}

std::string localName(const std::string& tag) {
  size_t c = tag.find(':');
  return c == std::string::npos ? tag : tag.substr(c + 1);
}

// Text of an XML fragment with every tag dropped and whitespace collapsed.
std::string textOf(const std::string& frag) {
  std::string out;
  bool inTag = false;
  for (char c : frag) {
    if (c == '<') {
      inTag = true;
      out.push_back(' ');
    } else if (c == '>') {
      inTag = false;
    } else if (!inTag) {
      out.push_back(c);
    }
  }
  std::string un = unescapeXml(out), res;
  bool sp = true;
  for (char c : un) {
    bool ws = c == ' ' || c == '\n' || c == '\r' || c == '\t';
    if (ws) {
      if (!sp) res.push_back(' ');
      sp = true;
    } else {
      res.push_back(c);
      sp = false;
    }
  }
  while (!res.empty() && res.back() == ' ') res.pop_back();
  return res;
}

}  // namespace

const char* path() { return "/MCPtoPCinterface.cgi"; }

const char* opName(Op op) {
  switch (op) {
    case Op::Status: return "status";
    case Op::Logs: return "logs";
    case Op::Settings: return "settings";
  }
  return "?";
}

std::string request(Op op) {
  std::string body;
  switch (op) {
    case Op::Status:
      body =
          "<ns:exchangeStrings><srcStrings xsi:type=\"SOAP-ENC:Array\""
          " SOAP-ENC:arrayType=\"xsd:string[1]\"><item>status</item></srcStrings>"
          "</ns:exchangeStrings>";
      break;
    case Op::Logs:
      body = "<ns:getLogs></ns:getLogs>";
      break;
    case Op::Settings:
      body = "<ns:getSettings></ns:getSettings>";
      break;
  }
  return std::string(ENV_HEAD) + body + ENV_TAIL;
}

std::string unescapeXml(const std::string& s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    if (s[i] != '&') {
      out.push_back(s[i]);
      continue;
    }
    size_t semi = s.find(';', i);
    if (semi == std::string::npos || semi - i > 12) {
      out.push_back('&');
      continue;
    }
    std::string ent = s.substr(i + 1, semi - i - 1);
    if (ent == "lt") out.push_back('<');
    else if (ent == "gt") out.push_back('>');
    else if (ent == "amp") out.push_back('&');
    else if (ent == "quot") out.push_back('"');
    else if (ent == "apos") out.push_back('\'');
    else if (ent.size() > 1 && ent[0] == '#') {
      uint32_t cp = (ent[1] == 'x' || ent[1] == 'X') ? (uint32_t)std::strtoul(ent.c_str() + 2, nullptr, 16)
                                                       : (uint32_t)std::strtoul(ent.c_str() + 1, nullptr, 10);
      putUtf8(out, cp);
    } else {
      out.append(s, i, semi - i + 1);
    }
    i = semi;
  }
  return out;
}

std::string fixDoubleUtf8(const std::string& s) {
  std::vector<uint32_t> cps;
  if (!decodeUtf8(s, cps)) return s;
  std::string bytes;
  bytes.reserve(cps.size());
  for (uint32_t cp : cps) {
    if (cp > 0xFF) return s;  // not Latin-1: already proper text
    bytes.push_back((char)cp);
  }
  std::vector<uint32_t> check;
  if (!decodeUtf8(bytes, check)) return s;
  return bytes;
}

bool fault(const std::string& xml, std::string& text) {
  size_t pos = 0;
  while ((pos = xml.find("Fault", pos)) != std::string::npos) {
    // the start tag: «<Fault» or «<prefix:Fault» followed by '>' or a space
    size_t lt = xml.rfind('<', pos);
    if (lt != std::string::npos && xml[lt + 1] != '/' && lt + 1 <= pos) {
      std::string tag = xml.substr(lt + 1, pos + 5 - lt - 1);
      char after = pos + 5 < xml.size() ? xml[pos + 5] : '>';
      if (localName(tag) == "Fault" && (after == '>' || after == ' ' || after == '/')) {
        size_t gt = xml.find('>', pos);
        std::string close = "</" + tag + ">";
        size_t end = xml.find(close, gt);
        std::string inner = (gt == std::string::npos) ? "" : xml.substr(gt + 1, (end == std::string::npos ? xml.size() : end) - gt - 1);
        text = textOf(inner);
        if (text.empty()) text = "SOAP fault";
        return true;
      }
    }
    pos += 5;
  }
  return false;
}

bool parseStatus(const std::string& xml, std::vector<std::string>& lines, std::string& err) {
  lines.clear();
  std::string ft;
  if (fault(xml, ft)) {
    err = ft;
    return false;
  }
  // the first element named returnStrings (any prefix)
  size_t pos = 0, open = std::string::npos;
  while ((pos = xml.find("returnStrings", pos)) != std::string::npos) {
    size_t lt = xml.rfind('<', pos);
    if (lt != std::string::npos && xml[lt + 1] != '/' && localName(xml.substr(lt + 1, pos + 13 - lt - 1)) == "returnStrings") {
      open = lt;
      break;
    }
    pos += 13;
  }
  if (open == std::string::npos) {
    err = "no returnStrings in the answer";
    return false;
  }
  size_t gt = xml.find('>', open);
  if (gt == std::string::npos) {
    err = "broken answer";
    return false;
  }
  if (xml[gt - 1] == '/') return true;  // <returnStrings/>: no lines
  size_t i = gt + 1;
  for (;;) {
    size_t lt = xml.find('<', i);
    if (lt == std::string::npos) {
      err = "broken answer";
      return false;
    }
    if (xml[lt + 1] == '/') break;  // </returnStrings>
    size_t tgt = xml.find('>', lt);
    if (tgt == std::string::npos) {
      err = "broken answer";
      return false;
    }
    std::string tag = xml.substr(lt + 1, tgt - lt - 1);
    bool empty = !tag.empty() && tag.back() == '/';
    std::string name = tag.substr(0, tag.find_first_of(" /\t\r\n"));
    if (localName(name) != "item") {
      // something else inside: skip over its element
      i = tgt + 1;
      continue;
    }
    if (empty) {
      lines.push_back("");
      i = tgt + 1;
      continue;
    }
    std::string close = "</" + name + ">";
    size_t end = xml.find(close, tgt);
    if (end == std::string::npos) {
      err = "broken answer";
      return false;
    }
    std::string raw = xml.substr(tgt + 1, end - tgt - 1);
    lines.push_back(fixDoubleUtf8(unescapeXml(raw)));
    i = end + close.size();
  }
  return true;
}

bool looksLikeDime(const uint8_t* p, size_t n) { return n >= 12 && (p[0] >> 3) == 1 && (p[0] & 0x04); }

}  // namespace soap
