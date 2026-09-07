/**
 * The live start/finish recorder's store — /idle-cell «Jonli».
 *
 * The register's ordinary door asks for a start and an end on two wheels, after
 * the fact. This one asks for two presses while it is happening: ▶ when the
 * cell stops, ■ when it runs again.
 *
 * THE CLOCK IS THE DEVICE'S, and that is a deliberate ruling (the operator,
 * 2026-09-07). Parts of the floor have no signal, so a press must record the
 * instant it happened whether or not anything can be sent — asking the server
 * for the time would make the recorded clock a property of the connection, and
 * on a slow line a stop would be stamped minutes after it began. So the instant
 * is taken here and the record travels later.
 *
 * What that costs, stated plainly because nothing else on the page can: a phone
 * whose clock is wrong (or moved) files a wrong time and the platform cannot
 * tell. This is the same hole the camera proofs were closed against by stamping
 * on the server. It is not closed here; it is made VISIBLE instead — the row
 * carries `created_at`, the only instant the server witnessed, so the gap
 * between the recorded end and it is on record for anyone reading the entry.
 *
 * The one failure mode that IS closed is the device's TIMEZONE: the wall clock
 * is computed for Asia/Tashkent explicitly rather than read off the phone's own
 * zone, so a handset left on another country's time still files plant hours.
 *
 * localStorage, not IndexedDB (which `proofQueue` needs for photo blobs): these
 * records are a few hundred bytes and the writes are synchronous, which is what
 * lets a press be durable before the sheet it opens has even rendered.
 */

const KEY = "idle_live_records_v1";
const TZ = "Asia/Tashkent";

// A run stops counting here. A leader who forgets ■ would otherwise file a
// fourteen-hour stop nobody witnessed the end of; capped, the record says how
// long it is allowed to claim and asks to be corrected before it can be sent.
// 8h is the length the manual form already warns about, so the two doors agree
// about what an implausible stop looks like.
export const CAP_MIN = 480;

// running → the stop is happening
// pending → ■ pressed, the clock is captured, the REASON is still owed
// queued  → complete, waiting for signal
// failed  → the server declined it; the reason is on the record
export const STATES = ["running", "pending", "queued", "failed"];

/* ------------------------------------------------------------------ clock */

const pad2 = (n) => String(n).padStart(2, "0");

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

/** The plant's wall clock for a device instant: { date: "YYYY-MM-DD", hhmm }. */
export function tashkentAt(ms = Date.now()) {
  const p = {};
  for (const { type, value } of parts.formatToParts(ms)) p[type] = value;
  // `hour` is "24" at midnight in some engines under hour12:false.
  const hh = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${hh}:${p.minute}` };
}

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":");
  const hh = parseInt(h, 10), mm = parseInt(m, 10);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
};
const fmtHHMM = (min) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
};

/** Elapsed minutes of a run, capped. Never negative: a device clock moved
 *  backwards mid-run must not print a stop that has not started. */
export function elapsedMin(rec, now = Date.now()) {
  if (rec.state !== "running") {
    const s = toMin(rec.start), e = toMin(rec.end);
    if (s == null || e == null) return 0;
    return e <= s ? e + 1440 - s : e - s;
  }
  return Math.min(CAP_MIN, Math.max(0, Math.floor((now - rec.startedAtMs) / 60000)));
}

export const isCapped = (rec, now = Date.now()) =>
  rec.state === "running" && now - rec.startedAtMs >= CAP_MIN * 60000;

/* ------------------------------------------------------------------- store */

let cache = null;
const listeners = new Set();

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(arr) ? arr : [];
  } catch {
    // A browser that refuses storage still records — for this tab's lifetime,
    // which is better than a shutter that does nothing.
    cache = [];
  }
  return cache;
}

function write(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* out of quota / storage denied — keep the in-memory copy */ }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const snapshot = () => read();

const uid = () =>
  (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 40);

/* ------------------------------------------------------------------ writes */

/**
 * Begin a stop. `atMs` is the instant of the PRESS, passed in by the caller so
 * the seconds the leader spends choosing a category belong to the stop rather
 * than being lost — the clock is stamped when they reach for the phone, not
 * when they finish answering.
 *
 * `date` is the day the record is filed under, taken at the START. A stop that
 * runs from 23:50 to 00:20 therefore stays on the day it began, which is
 * exactly what the register's midnight rule (end <= start ⇒ next day) expects.
 */
export function startRun({ atMs, cellId, cellCode, date, category, stopped }) {
  const at = tashkentAt(atMs);
  const rec = {
    id: uid(),
    state: "running",
    cellId, cellCode,
    date,
    category,
    stopped: !!stopped,
    start: at.hhmm,
    startedAtMs: atMs,
    end: null,
    note: "",
    capped: false,
    error: "",
  };
  write([...read(), rec]);
  return rec;
}

/**
 * End a stop, stamping the clock NOW — persisted immediately, before the reason
 * is asked for. The end is the perishable half: a leader who presses ■ and then
 * spends five minutes finding the words must not have the moment rewritten by
 * how long they took, and must not lose it if the app dies while they type.
 */
export function finishRun(id, atMs = Date.now()) {
  const now = atMs;
  return update(id, (r) => {
    if (r.state !== "running") return r;
    const capped = now - r.startedAtMs >= CAP_MIN * 60000;
    let end = capped ? fmtHHMM(toMin(r.start) + CAP_MIN) : tashkentAt(now).hhmm;
    // The register refuses end == start (it would be carried past midnight into
    // a silent 24-hour stop), so a stop that ended inside its own first minute
    // is filed as one minute rather than refused.
    if (end === r.start) end = fmtHHMM(toMin(r.start) + 1);
    return { ...r, state: "pending", end, capped };
  });
}

/** The reason arrived (and the times may have been corrected) — it can go. */
export function queueRun(id, { note, start, end, stopped }) {
  return update(id, (r) => ({
    ...r,
    note: (note ?? r.note).trim(),
    start: start ?? r.start,
    end: end ?? r.end,
    stopped: stopped ?? r.stopped,
    state: "queued",
    error: "",
  }));
}

export function retryRun(id) {
  return update(id, (r) => (r.state === "failed" ? { ...r, state: "queued", error: "" } : r));
}

export function discardRun(id) {
  write(read().filter((r) => r.id !== id));
}

function update(id, fn) {
  let out = null;
  write(read().map((r) => (r.id === id ? (out = fn(r)) : r)));
  return out;
}

/**
 * Auto-end every run that has reached the cap. A capped run is NOT filed by
 * itself — it lands in `pending` like any other, because the reason is still
 * owed and because a stop whose end nobody witnessed must be looked at before
 * it becomes a number.
 */
export function capOverdue(now = Date.now()) {
  const rows = read();
  if (!rows.some((r) => isCapped(r, now))) return false;
  write(rows.map((r) => {
    if (!isCapped(r, now)) return r;
    return { ...r, state: "pending", capped: true, end: fmtHHMM(toMin(r.start) + CAP_MIN) };
  }));
  return true;
}

/* -------------------------------------------------------------------- send */

export const payloadOf = (r) => ({
  cell_id: r.cellId,
  date: r.date,
  category: r.category,
  start: r.start,
  end: r.end,
  stopped: r.stopped,
  note: r.note,
  // The id the record was born with, sent on EVERY attempt: the server answers
  // a replay with the row it already wrote instead of filing a second one.
  client_key: r.id,
});

let sending = false;

/**
 * Send everything queued, oldest first. Single-flight: `online` fires while a
 * 20-second timer is already mid-flush, and two passes over one record is the
 * duplicate the client key exists to make harmless — no reason to produce it.
 *
 * `send(payload)` performs the POST; `onSent(rec)` is told about each success
 * so the page can refetch. A record is removed only once the server has
 * answered for it — the register then shows it, so nothing is stated twice.
 */
export async function flush(send, { onSent, retryable, describe } = {}) {
  if (sending) return;
  sending = true;
  try {
    for (const rec of read().filter((r) => r.state === "queued")) {
      try {
        await send(payloadOf(rec));
        discardRun(rec.id);
        onSent?.(rec);
      } catch (e) {
        if (retryable?.(e)) return;   // the line is down: stop, keep the queue
        update(rec.id, (r) => ({ ...r, state: "failed", error: describe?.(e) || "" }));
      }
    }
  } finally {
    sending = false;
  }
}
