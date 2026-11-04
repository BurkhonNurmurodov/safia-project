// DIME (how the oven's gSOAP sends files), read as it arrives. Every record
// is announced once (its name from the DIME options, «./LogFiles/001794.log»
// → «001794.log»), its bytes passed on in pieces, then ended — chunked
// records (the oven sends 1 KB chunks) are joined into one record.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>

class DimeReader {
 public:
  struct Listener {
    virtual ~Listener() {}
    // index 0 is the SOAP envelope, 1.. the attachments
    virtual bool onStart(size_t index, const std::string& id, const std::string& name) = 0;
    virtual bool onData(const uint8_t* p, size_t n) = 0;
    virtual bool onEnd() = 0;
  };

  explicit DimeReader(Listener& l) : l_(l) {}

  bool feed(const uint8_t* p, size_t n);  // false = error (see error())
  bool done() const { return state_ == DONE; }
  bool failed() const { return state_ == FAILED; }
  const std::string& error() const { return err_; }
  size_t records() const { return records_; }

  static std::string nameFromOptions(const std::string& opts);
  static std::string basename(const std::string& path);

 private:
  enum State { HDR, OPTS, ID, TYPE, DATA, PAD, DONE, FAILED };
  bool fail(const std::string& why);
  bool fieldDone();
  void startField(State s, size_t len);

  Listener& l_;
  State state_ = HDR;
  uint8_t hdr_[12];
  size_t hdrGot_ = 0;
  // the current chunk
  bool me_ = false, cf_ = false;
  size_t optLen_ = 0, idLen_ = 0, typeLen_ = 0;
  uint64_t dataLen_ = 0;
  std::string opts_, id_;
  size_t fieldLeft_ = 0;  // bytes of the field still to read (incl. padding)
  size_t fieldReal_ = 0;  // bytes of the field that are content
  bool inRecord_ = false;  // a chunked record is open
  size_t records_ = 0;
  std::string err_;
};
