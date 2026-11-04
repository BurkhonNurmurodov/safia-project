// What to send to IMS, decided on the board: the oven answers getLogs with
// ALL its day files (1.5 MB on the 725) and IMS already holds most of them.
// Each file is hashed as it arrives and dropped at once when IMS has it;
// a file that grew sends only its new bytes; a new or changed file is sent
// whole. The uploads wait in a queue capped to the memory there is.
#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>

#include "bytebuf.h"
#include "dime.h"
#include "sha256.h"

struct Kept {
  bool has = false;
  size_t size = 0;
  std::string sha;  // lowercase hex
};

enum class Action { Same, Tail, Whole };

// The laptop collector's own rule (collector.py _send_log):
//   same size and sha            → nothing
//   it grew and the old part is  → only the bytes from `offset` on
//     byte-for-byte the kept one
//   anything else                → the whole file
Action decide(const Kept& kept, const uint8_t* data, size_t n, const std::string& sha, size_t& offset);

// "001800.log" > "001799.log": newer day files first when memory is short.
bool newerName(const std::string& a, const std::string& b);

struct Upload {
  std::string kind;  // log · service · settings
  std::string name;
  size_t offset = 0;
  size_t size = 0;   // the WHOLE file's size
  std::string sha;   // the WHOLE file's SHA-256
  ByteBuf chunk;     // the bytes from `offset` on
};

class UploadQueue {
 public:
  explicit UploadQueue(size_t capBytes) : cap_(capBytes) {}
  // false = it did not fit (and nothing it would have pushed out was newer);
  // a newer whole log file pushes the oldest queued whole log files out.
  bool add(Upload&& u, std::vector<std::string>* deferred = nullptr);
  std::vector<Upload>& items() { return items_; }
  size_t bytes() const { return bytes_; }
  void clear() {
    items_.clear();
    bytes_ = 0;
  }

 private:
  size_t cap_;
  size_t bytes_ = 0;
  std::vector<Upload> items_;
};

// One oven's getLogs / getSettings answer, read as it arrives (a DIME listener).
// Each finished attachment is handed to `onFile`, which may move its buffer.
struct OvenFile {
  std::string name;
  ByteBuf data;
  std::string sha;
  bool complete = true;  // false: memory ran out while it arrived
};

class FileCollector : public DimeReader::Listener {
 public:
  using FileFn = std::function<void(OvenFile&)>;
  explicit FileCollector(FileFn fn) : fn_(std::move(fn)) {}

  bool onStart(size_t index, const std::string& id, const std::string& name) override;
  bool onData(const uint8_t* p, size_t n) override;
  bool onEnd() override;

  const std::string& envelope() const { return env_; }
  size_t files() const { return files_; }

 private:
  FileFn fn_;
  size_t index_ = 0;
  std::string env_;
  OvenFile cur_;
  Sha256 sha_;
  size_t files_ = 0;
};
