import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useUndoStack — Ctrl+Z / Ctrl+Y over SERVER writes, not over local state.
 *
 * Every entry carries its own two thunks: `redo` performs the write and `undo`
 * is its EXACT INVERSE — the same endpoint called with the value that stood
 * there before. That is the whole model, and it is what makes the stack honest
 * on a page whose numbers live on the server: a local state rewind would put a
 * figure back on screen that the API is still storing the other way round, and
 * the next refetch would silently take the undo back.
 *
 * Four rules the mechanism is built on, each of which closes a way for an undo
 * to move a number nobody asked it to:
 *
 *   • **Nothing is pushed until the server accepted the write.** An entry for a
 *     write that never landed offers to reverse a change that never happened,
 *     which on the next Ctrl+Z overwrites a value somebody else's is holding.
 *     Push from the SUCCESS path only.
 *
 *   • **`scope` clears the stack.** A history is a history OF something — here a
 *     (date, unit) pair. Undoing an edit made on one day while the page is
 *     showing another writes the old value onto the wrong day, and every figure
 *     involved looks plausible afterwards, so nothing on screen says it
 *     happened. Changing the scope string empties both halves.
 *
 *   • **Single flight.** Two rapid Ctrl+Z presses would both read the same
 *     cursor and fire the same inverse twice; the second lands on a value the
 *     first already restored and the entry beneath it is skipped.
 *
 *   • **A refused step is NOT consumed.** The endpoint can refuse (a closed day,
 *     a lost connection). The entry goes back where it came from, so the
 *     operator's next press retries it instead of silently stepping past it.
 *
 * A new write FORKS the timeline: the redo half is dropped, as in every editor.
 *
 * Returns `{ push, undo, redo, canUndo, canRedo, clear, busy, depth }`, where
 * `busy` is the direction currently in flight ("undo" | "redo" | null).
 * `undo()` / `redo()` resolve to the entry's `label` on success and to `null`
 * when there was nothing to do or the server refused — so the caller can say
 * WHAT went back. An undo the operator cannot see is an undo they cannot trust.
 */
export default function useUndoStack({ scope = "", limit = 50 } = {}) {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  // The DIRECTION in flight ("undo" | "redo" | null), not a bare boolean — the
  // two buttons need to know which of them to put a spinner in, and a shared
  // flag would spin both.
  const [busy, setBusy] = useState(null);
  // The stacks are read inside async steps, where the state closed over at the
  // press is already a frame old — the refs are what the steps actually read.
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const flight = useRef(false);

  const write = useCallback((p, f) => {
    pastRef.current = p; futureRef.current = f;
    setPast(p); setFuture(f);
  }, []);

  const clear = useCallback(() => {
    if (!pastRef.current.length && !futureRef.current.length) return;  // already empty
    write([], []);
  }, [write]);

  // Scope changed (another day, another unit) → the history describes something
  // that is no longer on screen.
  useEffect(() => { clear(); }, [scope, clear]);

  const push = useCallback((entry) => {
    const next = [...pastRef.current, entry];
    write(next.length > limit ? next.slice(next.length - limit) : next, []);
  }, [write, limit]);

  // `step` takes the next entry off the half it is walking, runs its thunk, and
  // moves it to the other half ONLY once the server has accepted it.
  const step = useCallback(async (dir) => {
    if (flight.current) return null;
    const from = dir === "undo" ? pastRef.current : futureRef.current;
    if (!from.length) return null;
    const entry = dir === "undo" ? from[from.length - 1] : from[0];

    flight.current = true; setBusy(dir);
    try {
      await (dir === "undo" ? entry.undo() : entry.redo());
      // Re-read the stacks instead of rebuilding from the arrays captured before
      // the await: an edit the operator made while this step was in flight has
      // already been pushed, and writing the pre-await arrays back would drop it
      // from the history without dropping it from the day. The entry is removed
      // by IDENTITY for the same reason.
      const p = pastRef.current.filter((x) => x !== entry);
      const f = futureRef.current.filter((x) => x !== entry);
      if (dir === "undo") write(p, [entry, ...f]);
      else write([...p, entry], f);
      return entry.label ?? "";
    } catch {
      return null;               // refused — the entry stays where it was
    } finally {
      flight.current = false; setBusy(null);
    }
  }, [write]);

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  return {
    push, undo, redo, clear, busy,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    depth: past.length,
  };
}

/**
 * useUndoHotkeys — the keyboard half, kept separate so a surface can take the
 * stack without the shortcuts (or the shortcuts without owning the stack).
 *
 * Ctrl/⌘+Z undoes; Ctrl/⌘+Y and Ctrl/⌘+Shift+Z redo — all three spellings,
 * because which one a person reaches for is a habit their previous tools gave
 * them, and a shortcut that does nothing reads as a broken feature.
 *
 * **A text field keeps its own Ctrl+Z.** Inside an input, a textarea, a select
 * or a contenteditable, the browser's native undo is undoing the CHARACTERS the
 * operator is typing — the spreadsheet cell editor on /production most of all.
 * Stealing that keystroke to reverse a saved figure instead is the one way this
 * feature could destroy work rather than restore it, so the handler stands down
 * whenever the event came from one.
 */
export function useUndoHotkeys({ undo, redo, enabled = true }) {
  // The handlers close over live page state, so they are new on every render —
  // read them through a ref rather than putting them in the effect's deps, or
  // the listener is torn down and re-added on every keystroke and every refetch.
  const fns = useRef({ undo, redo });
  fns.current = { undo, redo };

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); fns.current.undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); fns.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
