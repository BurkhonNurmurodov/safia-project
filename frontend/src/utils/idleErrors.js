// One place that turns an idle-cell refusal into a sentence.
//
// Lived inside IdleCell.jsx until the live start/finish recorder needed the
// same answer: a queued record can reach the server long after the press, by
// which time somebody may have closed the day — and «day_closed» is the one
// refusal on this page the reader can actually act on, so it must read as an
// instruction rather than as a failed save. Two spellings of that would let the
// recorder report a closed day differently from the form beside it.

// The API's `detail` is either a string or an object carrying a `code`.
// The STRUCTURE lives on `detail_raw`: api.js's interceptor flattens every
// non-string `detail` to text and keeps the original there. Reading `detail`
// alone would find a JSON blob where the code should be — and print it.
export function errText(e, t) {
  const raw = e?.response?.data?.detail_raw;
  const d = e?.response?.data?.detail;
  const code = raw && typeof raw === "object" ? raw.code : null;
  if (code === "day_closed") return t("idleCell.dayClosedErr");
  if (typeof d === "string" && d) return d;
  return t("idleCell.saveError");
}

// Whether re-sending the SAME record could ever succeed. A dead connection or a
// 5xx is the case this whole feature is built around, so it is retried
// silently; a 4xx is the server declining the record itself, and retrying that
// on a timer would hammer a refusal for ever while telling nobody. The one 4xx
// a person can clear is 409 «day_closed» — somebody re-opens the day — so it is
// reported and left for a MANUAL retry rather than repeated automatically.
export function isRetryable(e) {
  const s = e?.response?.status;
  return !s || s >= 500;
}
