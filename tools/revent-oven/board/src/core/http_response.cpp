#include "http_response.h"

#include <cctype>
#include <cstdlib>

namespace {
const size_t MAX_HEAD = 16 * 1024;

std::string lower(std::string s) {
  for (auto& c : s) c = (char)std::tolower((unsigned char)c);
  return s;
}
std::string trim(const std::string& s) {
  size_t a = 0, b = s.size();
  while (a < b && (s[a] == ' ' || s[a] == '\t')) a++;
  while (b > a && (s[b - 1] == ' ' || s[b - 1] == '\t' || s[b - 1] == '\r')) b--;
  return s.substr(a, b - a);
}
}  // namespace

bool HttpResponse::fail(const char* why) {
  if (state_ != FAILED) err_ = why;
  state_ = FAILED;
  return false;
}

bool HttpResponse::deliver(const uint8_t* p, size_t n) {
  if (!n) return true;
  got_ += n;
  if (!body_(p, n)) return fail("stopped by the reader");
  return true;
}

bool HttpResponse::parseHeaders() {
  // head_ holds everything up to (not including) the blank line
  size_t eol = head_.find("\r\n");
  std::string first = head_.substr(0, eol);
  if (first.compare(0, 5, "HTTP/") != 0) return fail("not an HTTP response");
  size_t sp = first.find(' ');
  if (sp == std::string::npos) return fail("bad status line");
  status_ = std::atoi(first.c_str() + sp + 1);
  bool chunked = false;
  bool haveLen = false;
  uint64_t len = 0;
  size_t pos = (eol == std::string::npos) ? head_.size() : eol + 2;
  while (pos < head_.size()) {
    size_t e = head_.find("\r\n", pos);
    if (e == std::string::npos) e = head_.size();
    std::string line = head_.substr(pos, e - pos);
    pos = e + 2;
    size_t colon = line.find(':');
    if (colon == std::string::npos) continue;
    std::string name = lower(trim(line.substr(0, colon)));
    std::string value = trim(line.substr(colon + 1));
    if (name == "content-length") {
      haveLen = true;
      len = std::strtoull(value.c_str(), nullptr, 10);
    } else if (name == "transfer-encoding") {
      chunked = lower(value).find("chunked") != std::string::npos;
    } else if (name == "content-type") {
      ctype_ = value;
    }
  }
  head_.clear();
  head_.shrink_to_fit();
  if (status_ == 204 || status_ == 304 || (status_ >= 100 && status_ < 200)) {
    state_ = DONE;
  } else if (chunked) {
    state_ = CHUNK_SIZE;
  } else if (haveLen) {
    left_ = len;
    state_ = len ? BODY_LEN : DONE;
  } else {
    state_ = BODY_CLOSE;
  }
  return true;
}

bool HttpResponse::feed(const uint8_t* p, size_t n) {
  size_t i = 0;
  while (i < n) {
    switch (state_) {
      case HEADERS: {
        head_.push_back((char)p[i++]);
        size_t k = head_.size();
        if (k >= 4 && head_.compare(k - 4, 4, "\r\n\r\n") == 0) {
          head_.resize(k - 4);
          if (!parseHeaders()) return false;
        } else if (k > MAX_HEAD) {
          return fail("headers too long");
        }
        break;
      }
      case BODY_LEN: {
        size_t take = (size_t)((n - i) < left_ ? (n - i) : left_);
        if (!deliver(p + i, take)) return false;
        i += take;
        left_ -= take;
        if (!left_) state_ = DONE;
        break;
      }
      case BODY_CLOSE: {
        if (!deliver(p + i, n - i)) return false;
        i = n;
        break;
      }
      case CHUNK_SIZE: {
        char c = (char)p[i++];
        if (c == '\n') {
          std::string s = trim(line_);
          line_.clear();
          size_t semi = s.find(';');
          if (semi != std::string::npos) s = s.substr(0, semi);
          if (s.empty()) return fail("bad chunk size");
          char* end = nullptr;
          left_ = std::strtoull(s.c_str(), &end, 16);
          if (end == s.c_str()) return fail("bad chunk size");
          state_ = left_ ? CHUNK_DATA : TRAILERS;
        } else if (line_.size() > 64) {
          return fail("bad chunk size line");
        } else {
          line_.push_back(c);
        }
        break;
      }
      case CHUNK_DATA: {
        size_t take = (size_t)((n - i) < left_ ? (n - i) : left_);
        if (!deliver(p + i, take)) return false;
        i += take;
        left_ -= take;
        if (!left_) state_ = CHUNK_CRLF;
        break;
      }
      case CHUNK_CRLF: {
        char c = (char)p[i++];
        if (c == '\n') state_ = CHUNK_SIZE;
        else if (c != '\r') return fail("bad chunk end");
        break;
      }
      case TRAILERS: {
        char c = (char)p[i++];
        if (c == '\n') {
          bool blank = trim(line_).empty();
          line_.clear();
          if (blank) state_ = DONE;
        } else if (line_.size() > 1024) {
          return fail("trailer too long");
        } else {
          line_.push_back(c);
        }
        break;
      }
      case DONE:
        return true;  // anything after the body is not ours
      case FAILED:
        return false;
    }
  }
  return state_ != FAILED;
}

bool HttpResponse::finish() {
  if (state_ == BODY_CLOSE) state_ = DONE;
  if (state_ == DONE) return true;
  if (state_ != FAILED) fail(state_ == HEADERS ? "connection closed before the answer" : "answer cut short");
  return false;
}
