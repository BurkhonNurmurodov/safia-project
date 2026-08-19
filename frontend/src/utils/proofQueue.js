/**
 * The camera page's offline queue.
 *
 * A leader shooting proofs walks a factory floor, and parts of it have no
 * signal. Refusing the shutter there would send them back to the spot with
 * coverage AFTER the thing they are photographing — which is exactly the
 * re-staging this feature exists to stop. So a shot taken with no network is
 * kept, whole, and uploaded when there is one.
 *
 * That is only safe because the TIME does not travel with the network. The
 * capture instant is derived from the server clock the page was handed at open,
 * advanced by `performance.now()` — a counter the phone's clock cannot move —
 * so a queued shot carries the same proof of when it was taken as an instant
 * one. The server records the gap separately (`received_at`), and a shot that
 * waited is marked `deferred` rather than trusted silently.
 *
 * IndexedDB and not memory: the queue has to survive the leader closing
 * Telegram, which is the most likely thing to happen while they walk back into
 * coverage. Blobs are stored as-is — IndexedDB keeps them without a base64
 * round-trip, which for a 2 MB photo is the difference between instant and a
 * visible freeze.
 */

const DB_NAME = "safia-proof";
const STORE = "queue";
const VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let out;
        try {
          out = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Park one shot. `item` = { leader, task, slot, capturedMs, phoneMs, blob }. */
export function enqueue(item) {
  return tx("readwrite", (s) => s.add({ ...item, queuedAt: Date.now() }));
}

/** Everything still waiting, oldest first — optionally for one task only. */
export async function pending(leader, task) {
  const rows = await tx("readonly", (s) => s.getAll());
  const all = Array.isArray(rows) ? rows : [];
  const mine = all.filter(
    (r) =>
      (leader == null || Number(r.leader) === Number(leader)) &&
      (task == null || Number(r.task) === Number(task)),
  );
  return mine.sort((a, b) => a.capturedMs - b.capturedMs);
}

export function drop(id) {
  return tx("readwrite", (s) => s.delete(id));
}

/**
 * Try to send everything queued for this leader, oldest FIRST.
 *
 * Order matters and is not cosmetic: slots are assigned in arrival order when
 * the shot does not name one, so flushing newest-first would put the later
 * photo in the earlier slot and leave the roll telling the wrong story.
 *
 * `send(item)` uploads one and resolves with the server's answer. A rejection
 * stops the flush and LEAVES the rest queued — a failure is almost always still
 * being offline, and draining into a dead network would only burn the battery.
 * A 4xx is different: the server has answered, the shot will never be accepted,
 * and keeping it would block every shot behind it forever, so it is dropped.
 */
export async function flush(leader, send) {
  const rows = await pending(leader, null);
  let sent = 0;
  let last = null;
  for (const row of rows) {
    try {
      last = await send(row);
      await drop(row.id);
      sent += 1;
    } catch (e) {
      const code = e?.response?.status;
      if (code && code >= 400 && code < 500) {
        await drop(row.id);
        continue;
      }
      break;
    }
  }
  return { sent, left: (await pending(leader, null)).length, last };
}
