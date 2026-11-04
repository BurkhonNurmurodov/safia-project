// SHA-256, portable C++ — the same code on the board and in the host tests,
// so the digest the board sends is the one the tests checked.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

class Sha256 {
 public:
  Sha256() { reset(); }
  void reset();
  void update(const uint8_t* p, size_t n);
  void finish(uint8_t out[32]);
  std::string hex();  // finish + lowercase hex; the object must be reset() before reuse
  static std::string hexOf(const uint8_t* p, size_t n);

 private:
  void block(const uint8_t* p);
  uint32_t h_[8];
  uint64_t len_;
  uint8_t buf_[64];
  size_t used_;
};
