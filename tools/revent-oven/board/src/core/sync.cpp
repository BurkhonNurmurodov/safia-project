#include "sync.h"

#include <algorithm>

Action decide(const Kept& kept, const uint8_t* data, size_t n, const std::string& sha, size_t& offset) {
  offset = 0;
  if (kept.has && kept.size == n && kept.sha == sha) return Action::Same;
  if (kept.has && kept.size > 0 && kept.size < n && Sha256::hexOf(data, kept.size) == kept.sha) {
    offset = kept.size;
    return Action::Tail;
  }
  return Action::Whole;
}

bool newerName(const std::string& a, const std::string& b) {
  if (a.size() != b.size()) return a.size() > b.size();
  return a > b;
}

bool UploadQueue::add(Upload&& u, std::vector<std::string>* deferred) {
  size_t need = u.chunk.size();
  if (bytes_ + need <= cap_) {
    bytes_ += need;
    items_.push_back(std::move(u));
    return true;
  }
  // Only a whole LOG file may push older whole log files out of the queue.
  if (u.kind == "log" && u.offset == 0) {
    std::vector<size_t> older;
    for (size_t i = 0; i < items_.size(); i++)
      if (items_[i].kind == "log" && items_[i].offset == 0 && newerName(u.name, items_[i].name)) older.push_back(i);
    std::sort(older.begin(), older.end(),
              [&](size_t a, size_t b) { return newerName(items_[b].name, items_[a].name); });  // oldest first
    size_t freed = 0, k = 0;
    while (bytes_ - freed + need > cap_ && k < older.size()) freed += items_[older[k++]].chunk.size();
    if (bytes_ - freed + need <= cap_) {
      std::vector<size_t> drop(older.begin(), older.begin() + k);
      std::sort(drop.rbegin(), drop.rend());
      for (size_t i : drop) {
        if (deferred) deferred->push_back(items_[i].name);
        bytes_ -= items_[i].chunk.size();
        items_.erase(items_.begin() + i);
      }
      bytes_ += need;
      items_.push_back(std::move(u));
      return true;
    }
  }
  if (deferred) deferred->push_back(u.name);
  return false;
}

bool FileCollector::onStart(size_t index, const std::string& id, const std::string& name) {
  index_ = index;
  if (index == 0) {
    env_.clear();
    return true;
  }
  cur_ = OvenFile();
  cur_.name = name.empty() ? DimeReader::basename(id) : name;
  sha_.reset();
  return true;
}

bool FileCollector::onData(const uint8_t* p, size_t n) {
  if (index_ == 0) {
    if (env_.size() + n > 64 * 1024) return true;  // an envelope is ~1 KB; never grow without bound
    env_.append((const char*)p, n);
    return true;
  }
  sha_.update(p, n);
  if (cur_.complete && !cur_.data.append(p, n)) {
    cur_.complete = false;  // keep reading (and hashing) so the next files still arrive
    cur_.data.release();
  }
  return true;
}

bool FileCollector::onEnd() {
  if (index_ == 0) return true;
  cur_.sha = sha_.hex();
  files_++;
  fn_(cur_);
  cur_.data.release();
  return true;
}
