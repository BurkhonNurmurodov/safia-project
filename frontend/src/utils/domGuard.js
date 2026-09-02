import { APP_VERSION } from "./version";

/**
 * THE guard against a DOM the app no longer recognises.
 *
 * React removes and re-orders the exact DOM nodes it created, and it assumes
 * nothing else touched them. When something did — an in-app or browser
 * translator rewriting text nodes, a WebView add-on, an injected overlay — the
 * next commit calls `removeChild()` on a node whose parent has since changed
 * and the browser throws `NotFoundError`. A commit-phase throw is not
 * recoverable inside React: the whole subtree unmounts, `ScopedErrorBoundary`
 * catches it, and a supervisor mid-shift gets an error card instead of the page
 * they opened. (Reported from `/quality` on v4.20.0 — "Failed to execute
 * 'removeChild' on 'Node'", with a component stack of nothing but a Skeleton
 * being torn down as the data landed.)
 *
 * Three rules it is built on:
 *
 *  1. **It only runs where the browser was going to THROW.** Both patches test
 *     the same condition the DOM spec throws on and fall straight through to
 *     the native method otherwise — so working code, the rich-text editor's own
 *     DOM surgery included, executes exactly as before.
 *  2. **It COMPLETES the intent rather than swallowing it.** A node React wants
 *     gone is removed from wherever it actually ended up (leaving it behind
 *     would be a ghost row nothing can clear), and a node React wants inserted
 *     is appended to the parent it was meant for — right parent, possibly wrong
 *     order, which is a cosmetic loss next to a dead page.
 *  3. **It is never silent.** A recovered desync posts to `/api/crash-report`
 *     as kind `recovered`, once per session per operation. A guard nobody can
 *     see firing is indistinguishable from a bug that went away, and this one
 *     hides exactly the evidence that would name its cause.
 *
 * Installed from `main.jsx` before `createRoot`, because the first commit React
 * performs is already one of the commits this protects.
 */

let installed = false;
const reported = new Set();

/** One report per session per operation — the cause is a standing condition on
 *  that device, so the second hundred hits say nothing the first did not. */
function report(op) {
  if (reported.has(op)) return;
  reported.add(op);
  const stack = String(new Error("dom-desync").stack || "").slice(0, 3000);
  try {
    // Lazy: `utils/api` pulls axios and the session plumbing, and this module
    // has to be installed before any of that is worth loading.
    import("./api")
      .then(({ default: api }) =>
        api
          .post("/api/crash-report", {
            kind: "recovered",
            message: `DOM desync recovered · ${op}`,
            stack,
            component: `at ${op} (domGuard)`,
            url: String(window.location.pathname + window.location.search).slice(0, 500),
            version: APP_VERSION,
            ua: String(navigator.userAgent || "").slice(0, 500),
          })
          .catch(() => { /* offline or throttled — logged server-side either way */ }),
      )
      .catch(() => { /* chunk unreachable; the page still survives, which is the point */ });
  } catch { /* reporting must never become the failure it is reporting */ }
}

export function installDomGuard() {
  if (installed || typeof Node === "undefined") return;
  installed = true;

  const nativeRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      report("removeChild");
      if (child.parentNode) {
        // Finish the job where the node really is. A node React has written off
        // but the document still holds is a row the app can no longer reach.
        try { return nativeRemove.call(child.parentNode, child); } catch { /* raced */ }
      }
      return child; // already detached: React's intent is satisfied
    }
    return nativeRemove.apply(this, arguments);
  };

  const nativeInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, ref) {
    // A null reference means "append" and is the spec's own happy path — only a
    // reference belonging to somebody else is the throwing case.
    if (ref && ref.parentNode !== this) {
      report("insertBefore");
      return nativeInsert.call(this, node, null);
    }
    return nativeInsert.apply(this, arguments);
  };
}
