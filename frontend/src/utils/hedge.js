// A request that gates the whole app is ASKED AGAIN when it hangs.
//
// The stall reports (utils/stallReport.js) showed the commonest long wait on
// the logo screen is ONE request stuck on a connection that is otherwise
// working: on 7 Oct 2026 a leader's sign-in POST took 7.1 s while the GET sent
// beside it in the same instant came back in 0.8 s, and the server spent 13 ms
// on each. That is a packet lost on the way (a phone's 4G, or Cloudflare's leg
// to the origin) waiting out its retransmission backoff — 1 s, 2 s, 4 s. A
// second copy of the request travels on its own and usually lands at once.
//
// So `hedged(send)` sends the request; if it has not answered in HEDGE_MS it
// sends ONE more copy, takes whichever answers first and cancels the other.
// Only for requests that are safe to repeat and that the app cannot start
// without: the sign-in, the session check, page access and capabilities.
//
//   • An ANSWER — any status — settles it: a 401 says the same thing twice.
//   • A copy that fails with NO answer (a dropped connection) sends the second
//     copy at once instead of waiting for the timer.
//   • It fails only when every copy it sent has failed, with the last error.
//   • The losing copy is aborted, and utils/requestLog.js records it as
//     cancelled, so a stall report never reads it as a request the server
//     left unanswered.
//
// `send(signal)` must pass the signal on to the request (axios `signal`).

export const HEDGE_MS = 3000;
const COPIES = 2;

export function hedged(send, { after = HEDGE_MS } = {}) {
  return new Promise((resolve, reject) => {
    const copies = [];
    let settled = false;
    let failed = 0;
    let timer = null;

    const finish = (fn, value, winner) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      copies.forEach((c) => { if (c !== winner) c.abort(); });
      fn(value);
    };

    const launch = () => {
      if (settled || copies.length >= COPIES) return;
      const ctrl = new AbortController();
      copies.push(ctrl);
      if (copies.length < COPIES) {
        timer = setTimeout(launch, after);
      }
      let p;
      try {
        p = Promise.resolve(send(ctrl.signal));
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        (res) => finish(resolve, res, ctrl),
        (err) => {
          if (settled) return;
          failed += 1;
          // The server answered: that IS the answer, whatever its status.
          if (err?.response) { finish(reject, err, ctrl); return; }
          if (copies.length < COPIES) {
            clearTimeout(timer);
            launch();
            return;
          }
          if (failed >= copies.length) finish(reject, err, null);
        },
      );
    };

    launch();
  });
}
