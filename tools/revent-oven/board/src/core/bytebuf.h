// A growable byte buffer. On the board it lives in PSRAM (the 2 MB on the
// chip) — a day log is ~250 KB and the board's own RAM is 320 KB in all.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <utility>

#ifdef ARDUINO
#include <esp_heap_caps.h>
#endif

class ByteBuf {
 public:
  ByteBuf() = default;
  ~ByteBuf() { release(); }
  ByteBuf(const ByteBuf&) = delete;
  ByteBuf& operator=(const ByteBuf&) = delete;
  ByteBuf(ByteBuf&& o) noexcept { swap(o); }
  ByteBuf& operator=(ByteBuf&& o) noexcept {
    if (this != &o) {
      release();
      swap(o);
    }
    return *this;
  }

  const uint8_t* data() const { return p_; }
  size_t size() const { return n_; }
  void clear() { n_ = 0; }
  void release() {
    if (p_) std::free(p_);
    p_ = nullptr;
    n_ = cap_ = 0;
  }

  // false when memory ran out; the buffer is then unchanged
  bool append(const uint8_t* src, size_t k) {
    if (!k) return true;
    if (n_ + k > cap_ && !grow(n_ + k)) return false;
    memcpy(p_ + n_, src, k);
    n_ += k;
    return true;
  }

  bool assign(const uint8_t* src, size_t k) {
    n_ = 0;
    return append(src, k);
  }

 private:
  bool grow(size_t need) {
    size_t c = cap_ ? cap_ : 16 * 1024;
    while (c < need) c *= 2;
    void* q = nullptr;
#ifdef ARDUINO
    q = heap_caps_realloc(p_, c, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!q) q = std::realloc(p_, c);
#else
    q = std::realloc(p_, c);
#endif
    if (!q) return false;
    p_ = static_cast<uint8_t*>(q);
    cap_ = c;
    return true;
  }
  void swap(ByteBuf& o) {
    std::swap(p_, o.p_);
    std::swap(n_, o.n_);
    std::swap(cap_, o.cap_);
  }

  uint8_t* p_ = nullptr;
  size_t n_ = 0;
  size_t cap_ = 0;
};
