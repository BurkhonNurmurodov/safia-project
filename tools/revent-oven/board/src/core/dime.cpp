#include "dime.h"

namespace {
const size_t MAX_FIELD = 4096;  // options / id / type are short in practice
inline size_t pad4(uint64_t n) { return (size_t)((n + 3) & ~(uint64_t)3); }
}  // namespace

bool DimeReader::fail(const std::string& why) {
  if (state_ != FAILED) err_ = why;
  state_ = FAILED;
  return false;
}

std::string DimeReader::basename(const std::string& path) {
  size_t cut = path.find_last_of("/\\");
  return cut == std::string::npos ? path : path.substr(cut + 1);
}

std::string DimeReader::nameFromOptions(const std::string& opts) {
  // gSOAP: [type u16][length u16][text] … — the first value is the file name
  size_t pos = 0;
  while (pos + 4 <= opts.size()) {
    size_t n = ((uint8_t)opts[pos + 2] << 8) | (uint8_t)opts[pos + 3];
    std::string v = opts.substr(pos + 4, n);
    while (!v.empty() && v.back() == '\0') v.pop_back();
    while (!v.empty() && v.front() == '\0') v.erase(v.begin());
    if (!v.empty()) return basename(v);
    pos += 4 + n;
  }
  return "";
}

void DimeReader::startField(State s, size_t len) {
  state_ = s;
  fieldReal_ = len;
  fieldLeft_ = (s == DATA) ? 0 : pad4(len);
}

// Called whenever the current field has no bytes left: move on, possibly
// across several empty fields at once.
bool DimeReader::fieldDone() {
  for (;;) {
    switch (state_) {
      case OPTS:
        startField(ID, idLen_);
        break;
      case ID:
        startField(TYPE, typeLen_);
        break;
      case TYPE:
        if (!inRecord_) {
          inRecord_ = true;
          if (!l_.onStart(records_, id_, nameFromOptions(opts_))) return fail("stopped by the reader");
        }
        state_ = DATA;
        if (dataLen_) return true;
        state_ = PAD;
        fieldLeft_ = 0;
        break;
      case DATA:
        state_ = PAD;
        fieldLeft_ = pad4(dataLen_) - (size_t)dataLen_;
        if (fieldLeft_) return true;
        break;
      case PAD:
        if (!cf_) {
          inRecord_ = false;
          records_++;
          if (!l_.onEnd()) return fail("stopped by the reader");
          if (me_) {
            state_ = DONE;
            return true;
          }
        }
        state_ = HDR;
        hdrGot_ = 0;
        return true;
      default:
        return true;
    }
    if (state_ != DATA && fieldLeft_) return true;
  }
}

bool DimeReader::feed(const uint8_t* p, size_t n) {
  size_t i = 0;
  while (i < n) {
    switch (state_) {
      case HDR: {
        while (i < n && hdrGot_ < 12) hdr_[hdrGot_++] = p[i++];
        if (hdrGot_ < 12) return true;
        if ((hdr_[0] >> 3) != 1) return fail("not a DIME record");
        me_ = hdr_[0] & 0x02;
        cf_ = hdr_[0] & 0x01;
        optLen_ = (hdr_[2] << 8) | hdr_[3];
        idLen_ = (hdr_[4] << 8) | hdr_[5];
        typeLen_ = (hdr_[6] << 8) | hdr_[7];
        dataLen_ = ((uint64_t)hdr_[8] << 24) | ((uint64_t)hdr_[9] << 16) | ((uint64_t)hdr_[10] << 8) | hdr_[11];
        if (optLen_ > MAX_FIELD || idLen_ > MAX_FIELD || typeLen_ > MAX_FIELD) return fail("DIME header too long");
        if (!inRecord_) {
          opts_.clear();
          id_.clear();
        }
        startField(OPTS, optLen_);
        if (!fieldLeft_ && !fieldDone()) return false;
        break;
      }
      case OPTS:
      case ID:
      case TYPE: {
        size_t take = n - i < fieldLeft_ ? n - i : fieldLeft_;
        size_t padded = pad4(fieldReal_);
        size_t done = padded - fieldLeft_;  // bytes of this field already read
        for (size_t k = 0; k < take; k++) {
          if (done + k < fieldReal_ && !inRecord_) {
            if (state_ == OPTS) opts_.push_back((char)p[i + k]);
            else if (state_ == ID) id_.push_back((char)p[i + k]);
          }
        }
        i += take;
        fieldLeft_ -= take;
        if (!fieldLeft_ && !fieldDone()) return false;
        break;
      }
      case DATA: {
        size_t take = (size_t)((n - i) < dataLen_ ? (n - i) : dataLen_);
        if (take && !l_.onData(p + i, take)) return fail("stopped by the reader");
        i += take;
        dataLen_ -= take;
        if (!dataLen_) {
          // keep the original length for the padding: recompute from the header
          uint64_t orig = ((uint64_t)hdr_[8] << 24) | ((uint64_t)hdr_[9] << 16) | ((uint64_t)hdr_[10] << 8) | hdr_[11];
          state_ = PAD;
          fieldLeft_ = pad4(orig) - (size_t)orig;
          if (!fieldLeft_ && !fieldDone()) return false;
        }
        break;
      }
      case PAD: {
        size_t take = n - i < fieldLeft_ ? n - i : fieldLeft_;
        i += take;
        fieldLeft_ -= take;
        if (!fieldLeft_ && !fieldDone()) return false;
        break;
      }
      case DONE:
        return true;  // nothing after the last record matters
      case FAILED:
        return false;
    }
  }
  return state_ != FAILED;
}
