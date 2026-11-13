# Motion harness — check the motion system without running the app

The platform's motion system (`docs/motion.md`, `index.css` «Motion system») is
checked here: the REAL ui templates on one page, pressed in a headless Chrome.
Nothing ships to users; no backend, database or session is needed.

```bash
node frontend/tools/motion/run.mjs                 # every scenario (~2 min)
node frontend/tools/motion/run.mjs desktop phone   # some of them
node frontend/tools/motion/run.mjs --no-build      # reuse the last bundle
```

Scenarios: `desktop` · `slow` (frames caught mid-animation at ×10) · `phone`
(390px, real touch taps) · `reduced` (prefers-reduced-motion) · `strict` (React's
development build under StrictMode) · `light`. Exit code 1 when a check fails.
Bundles and screenshots go to `$MOTION_OUT` (default `<tmp>/safia-motion`) —
look at the screenshots, a passing check is not a look.

**Run it after touching** `index.css`'s motion rules, `utils/leave.js`,
`hooks/useLeaveRef.js`, or a template's enter/leave wiring (Modal,
ConfirmDialog, Toast, Button, SegmentedToggle, StyledSelect, DateRangePicker,
ColumnFilter, ColumnsPicker, ActionMenu, Tooltip, Lightbox, TimeWheelPicker).

## Files

- `page.jsx` — the page: one of each template with `data-testid`s, plus the
  shapes pages build by hand on `leaveRef`. A new surface worth checking goes
  here, with its scenario in `run.mjs`. Layout that exists only here is
  inline-styled: Tailwind scans the app's sources, not this folder.
- `main.jsx` — mounts it; the URL hash picks `#light` / `#strict`.
- `lang-stub.js` — stands in for `context/LangContext.jsx` (swapped by
  resolved path at build time), which needs the session and the API.
- `run.mjs` — bundles the page into one static html per mode (an IIFE, since a
  module script will not load over `file://`), launches Chrome, runs the checks.
- `cdp.mjs` — the DevTools-protocol plumbing. Finds Chrome the way the
  run-safia-project skill does (`SAFIA_CHROME` overrides).

## Traps it already steps around

- **A Vite build sets `NODE_ENV=production` whatever the mode**, so a
  "development" bundle still carried React's production build and StrictMode
  rehearsed nothing. `run.mjs` sets `NODE_ENV` per bundle, and the `strict`
  scenario asserts it is a development build AND that a mount effect ran twice.
- **Touch `:active`**: raw `Input.dispatchTouchEvent` skips Chrome's gesture
  recogniser, so it never shows a press; `Emulation.setEmitTouchEventsForMouse`
  hung the protocol call outright. `Input.synthesizeTapGesture` works.
- **A hung protocol call** must fail the run, not hang it: every call has a 30 s
  limit and the whole run a 10 min one.
- **The instant after a click** (focus, what is still in the DOM) is read inside
  the same `Runtime.evaluate` that clicks — a second round trip arrives after a
  150 ms effect is over.
- **Scrolling an element into view** (every pointer helper does) resets a
  scroll position a check set earlier — set scroll state last.
- **Slow motion** stretches CSS (`Animation.setPlaybackRate`) and timers by the
  same factor, so a leaving copy's lifetime stays in step with its animation.
