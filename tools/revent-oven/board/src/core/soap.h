// The oven's SOAP service, READ-ONLY by construction: the three requests below
// are the only ones this firmware can build. The oven would also accept
// putRecipe, putSettings, putSw (firmware) and exchangeStrings(["delete", …]);
// nothing here can produce them. Mirrors tools/revent-oven/revent_oven.py.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace soap {

enum class Op { Status, Logs, Settings };

const char* path();            // "/MCPtoPCinterface.cgi"
std::string request(Op op);    // the whole envelope for one of the three reads
const char* opName(Op op);     // "status" · "logs" · "settings"

// Status answer → its lines, as revent_oven.decode_answer("status") gives them.
bool parseStatus(const std::string& xml, std::vector<std::string>& lines, std::string& err);

// A SOAP Fault's text (any element named Fault), or false.
bool fault(const std::string& xml, std::string& text);

// The oven treats its UTF-8 as Latin-1 and encodes it again («Выпечка» arrives
// as «ÐÑÐ¿ÐµÑÐºÐ°»); undo that when it round-trips, else return s unchanged.
std::string fixDoubleUtf8(const std::string& s);
std::string unescapeXml(const std::string& s);

// Does this body start like a DIME message (version 1, message-begin)?
bool looksLikeDime(const uint8_t* p, size_t n);

}  // namespace soap
