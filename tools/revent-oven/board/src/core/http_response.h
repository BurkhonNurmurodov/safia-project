// An HTTP/1.x response read as it arrives: status line + headers, then the
// body handed on in pieces — by Content-Length, chunked, or until the oven
// closes the connection. Nothing of the body is kept here.
#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

class HttpResponse {
 public:
  // return false to stop reading (the caller has had enough or failed)
  using BodyFn = std::function<bool(const uint8_t*, size_t)>;

  explicit HttpResponse(BodyFn fn) : body_(std::move(fn)) {}

  bool feed(const uint8_t* p, size_t n);  // false = error (see error())
  bool finish();                          // the connection closed: is the body whole?

  bool headersDone() const { return state_ > HEADERS; }
  bool complete() const { return state_ == DONE; }
  bool failed() const { return state_ == FAILED; }
  int status() const { return status_; }
  const std::string& contentType() const { return ctype_; }
  const std::string& error() const { return err_; }
  uint64_t bodyBytes() const { return got_; }

 private:
  enum State { HEADERS, BODY_LEN, CHUNK_SIZE, CHUNK_DATA, CHUNK_CRLF, TRAILERS, BODY_CLOSE, DONE, FAILED };
  bool fail(const char* why);
  bool parseHeaders();
  bool deliver(const uint8_t* p, size_t n);

  BodyFn body_;
  State state_ = HEADERS;
  std::string head_;
  std::string line_;
  std::string ctype_;
  std::string err_;
  int status_ = 0;
  uint64_t left_ = 0;
  uint64_t got_ = 0;
};
