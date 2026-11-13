# Motion

How things on the platform move: what appears, what leaves, what answers a
press. The index of every topic file is CLAUDE.md «Where everything else is
written (`docs/`)».

## The motion system — one vocabulary for the whole platform (2026-11-13)

The operator, 2026-11-13: «take care of animations of popping up, pressing,
functionalities … of whole Safia program». Before it the platform had a shell
layer only (Tier 1 in `index.css`: the page fade-up, the modal pop-in, the
toast slide, the sidebar pill, the bell). An audit of the 526 source files
found what was missing:

- **Nothing animated on the way OUT.** Every dialog, menu, dropdown, sheet,
  toast and tooltip vanished in one frame — React unmounts at once, and half
  of the ~135 `<Modal>` call sites render it conditionally (`{x && <Modal>}`),
  so an exit state kept inside the template could never have covered them.
- **Floating panels appeared with no motion**: `StyledSelect`, `ActionMenu`,
  `DateRangePicker`, the `FilterPanel` dropdowns, `ColumnsPicker`, `Tooltip`,
  the header menus, the notification panel, the search results.
- **No press feedback.** `Button` had none (and no hover either); 540 raw
  `<button>`s had only the WebView's own tap highlight.
- **The gold pill of `SegmentedToggle` jumped** between segments (219 uses).
- Seven hand-rolled dialogs in `components/ui` and the phone sheets of the
  calendar had no entrance at all.

Everything below lives in `index.css` under «Motion system (Tier 2 · surfaces,
press, leaving)», plus two small modules.

### The rules

1. **Only opacity and transforms move.** Nothing in flow animates its size, so
   no animation can move a list (the standing rule «an action taken in a list
   must never move the list»).
2. **Entrances are short, exits shorter** (pop 140 ms in / 100 ms out, dialog
   200 / 150, sheet 280 / 200, toast 320 / 160). Something leaving must never
   keep the reader waiting.
3. **Motion never delays logic.** A surface that closes is gone for React in
   the same commit: focus is back on the opener, Escape belongs to the next
   layer, the page under a dialog takes clicks. Only pixels linger.
4. **The resting state is the element's own style.** The new enter keyframes
   name only `from` and run with no fill, so nothing lingers afterwards to trap
   a `position: fixed` child or re-stack the surface.
5. **`prefers-reduced-motion` switches all of it off** — no entrance, no copy
   on exit, no dip, no glide. The press WASH on `Button` stays: it is colour,
   not motion.

### Entering — a class on the surface

| Class | For | Motion |
|---|---|---|
| `.pop` | menus, dropdowns, popovers | drops 4px out of its trigger, 97% → 100%; `data-side="top"` (opened upward) rises instead |
| `.modal-backdrop` + `.modal-card` | dialogs | dimmer fades, card settles from 96% (Tier 1, unchanged) |
| `.sheet-backdrop` + `.sheet` | a phone's bottom sheets | dimmer fades, sheet rides up from the edge |
| `.sheet-card` | `TimeWheelPicker` | a sheet below 640px, a centred card above |
| `.sheet-root` + `.fade-in` + `.sheet` | `FilterSheet` | its dimmer is a separate element because it BLURS the page — a blur cannot see through a fading parent, so the root only keeps time |
| `.side-in` | a panel on the right edge («Yordamchi», the action log's detail) | slides in from that edge and back out to it |
| `.rise-in` | a bar on the bottom edge (the exam strip) | rises into place |
| `.tip` | `Tooltip` | fades in 100 ms, so sweeping across icons does not flicker |
| `.toast-in` | `Toast` | slides from its edge; `data-pos="bottom"` rises |
| `.fade-in` | a bare dimmer (the phone drawer's), a fullscreen view (/zagruzka) | fades |
| `.brk-in` | an in-flow reveal (a `PanelField` row unfolding) | Tier 1's 3px lift — in-flow content gets an entrance only |

### Leaving — `useLeaveRef` on the same element

`hooks/useLeaveRef.js` + `utils/leave.js`. Two forms of one thing:

- **`leaveRef`** (`utils/leave.js`) — a ready-made ref, no hook:
  `<div ref={leaveRef} className="pop …">`. One function serves every
  element (React keeps each element's own cleanup). For a surface nobody
  else needs a handle on — which is most of what a page builds by hand.
- **`useLeaveRef(itsRef)`** — for a component that READS the node
  (outside-click tests, measuring): pass the object ref it already uses and
  it keeps pointing at the node.

```jsx
const popRef = useRef(null);
const setPop = useLeaveRef(popRef);
…
{open && createPortal(<div ref={setPop} className="pop …">…</div>, document.body)}
```

It does not delay the unmount. When the element is about to leave the
document, a lifeless **copy** of it is left in its place wearing
`data-leaving`, plays the exit CSS gives that shape, and is removed.

Why a copy, and why it is safe:

- It is taken from the ref's **cleanup** (React 19), which runs before React
  tears the children down and before the node is removed — in both ways a
  surface goes (the component unmounting, or `open` turning false). Charts,
  photos, typed values, scroll positions and canvases are still there to copy.
  A layout-effect cleanup would not do: for the `open`-prop path it runs after
  the node is already gone.
- A clone carries no React handler, and it is `inert`, `aria-hidden` and deaf
  to the pointer; `id`s (except an SVG's own gradients and clips) and `name`s
  are stripped, `role` / `aria-live` are taken off the root. Nothing can press
  it, focus it, find it, or hear a toast announced twice.
- React's own nodes are never moved or kept, so `utils/domGuard.js` has nothing
  to report and the reconciler sees what it always saw.
- CSS decides the movement. The copy lives for the animation duration CSS gives
  its root (capped at 500 ms); **with no rule it is removed at once** — the
  failure mode is the old behaviour, never a stuck overlay.
- No copy at all: under reduced motion, in a hidden tab, for an in-flow element
  (only `fixed` / `absolute` surfaces — a copy of an in-flow box would hold its
  space and then drop it), when the surface's parent left too, or for a
  surface over 1,500 nodes (copying it would cost more than its exit lasts on
  the phones this runs on).
- StrictMode's mount rehearsal and a ref whose identity changes both call the
  cleanup with the node still in place; the copy is discarded then.

A new floating surface: give it an enter class and `useLeaveRef`. A shape with
its own exit adds one `…[data-leaving]` rule; without one it fades.

### Pressing

- **Every `<button>` and `[role="button"]` dips to 97% while held** and springs
  back (`scale`, so it composes with whatever transform or translate already
  places the control). A full-width one (`.w-full`) dips to 98.5% — 3% of a row
  is a lurch. `.press` gives the dip to something that is not a button,
  `.press-none` takes it away. The `/kelish` cell, the assessment verdict and
  the launcher tile are excluded by name: they carry a press of their own.
  Both rules sit in cascade layers, so a utility on one control still wins.
- The native tap highlight is left alone on raw buttons — it is the only press
  feedback a bare icon or a tappable row has.
- **`Button`** (`.btn`) answers fully in CSS, so a phone gets it too: a wash on
  hover (pointers that have one — `(hover: hover)`, or it would stick after a
  tap), a deeper wash and the dip while pressed. The wash is an inset shadow
  wider than any button: it paints over the fill and under the label, follows
  the radius and needs no pseudo-element (callers hang tap pads on those). A
  solid fill (`.btn-solid`: primary, danger, success) DARKENS, so the white
  label only gains contrast; neutral and tinted ones take `--press-wash`.
  A disabled or loading button answers nothing.
- A control whose own transition names colours or opacity
  (`transition-colors`, `transition-opacity`) would snap its dip, because
  Tailwind's lists leave `scale` out; two unlayered rules add it for buttons.
- A checkbox dips on the press only — never on mount, or a page of ticked
  boxes would all pop at once. The sidebar's rows take the hover wash under a
  finger.

### `SegmentedToggle` — the pill slides

The selected fill is ONE element (`.seg-ind`) laid under the labels and moved
to the chosen segment. It is measured from the selected button with
`offsetLeft / offsetWidth` — layout values, which a transform on an ancestor
(a dialog still settling in, a popover) cannot distort, at the cost of half a
pixel of rounding. Measured after every render and whenever the track or a
label resizes; it **glides only when the value changed** — a resize, a font
swap or a count arriving in a label re-seats it at once. Until it has a
measurement (the first frame, a toggle mounted inside something hidden) the
selected segment carries its own fill, as it always did, so a segment is never
selected and unmarked. The labels keep time with it (`.seg-btn`): the one
being left drops its white ink at once, the one chosen waits until the pill is
close — white on the bare track is unreadable on the light theme.

### Where it is wired

`Modal`, `ConfirmDialog`, `Lightbox`, `Toast`, `ActionMenu`, `StyledSelect`,
`DateRangePicker` (popover and both phone sheets), `ColFilter`, `FilterPanel`
(inline dropdowns, the grouped panel, `FilterSheet`), `ColumnsPicker`,
`Tooltip`, `TimeWheelPicker`, `TaskQueue`'s status dropdown, the seven
hand-rolled dialogs (`PendingInfoModal`, `FormulaModal`, `CommentModal`,
`ColorGuideModal`, `CategoryLegendModal`, `AttendanceModal`, the forecast
dialog in `WorkerForecast`), the header's profile and language menus and
sign-out question, the notification panel, the search results, the phone
drawer's dimmer, `LogPanel` (a sheet on a phone, a side panel on a desktop).

Second pass, the same day — what pages build by hand: the two phone sheets of
`/staff` (the filter sheet and its date picker, which had their own inline
`slideUpSheet` keyframes), the enlarged proof photo on `/leaders` and in the
AI triage (they open like `Lightbox`), the status dropdown on `/concerns`,
the row menu on the attendance upload, the three `RichTextEditor` menus, the
sign-out countdown, «Yordamchi»'s panel, the exam strip, the fullscreen
views on `/zagruzka` and the cell page (they fade in; one small enough to
copy fades out), and the three hand-pasted toasts (`WorkerForecast`,
`Daily`, `Trudoyomkost`).

Also fixed on the way: the calendar sheet's grab handle was positioned against
the screen, not the sheet (its sheet had no `relative`), and sat at the top of
the viewport.

**Left alone on purpose**: the «Sifat nazorati %» hover box in
`ShiftReportTable` (under active change the same day), the «Konteynerlar» TV
mode, the `/gamification` design preview, the camera page, and the wall
screens (`/live`, the launcher), which carry motion of their own.

### How it was checked

No local app (the standing rule). A static harness bundled the real templates
with the project's own Vite plugins and was driven in headless Chrome over
CDP: 114 assertions — desktop, a 390px touch phone, reduced motion, a
development build under StrictMode, the light theme — plus frames caught in
slow motion (animations and timers stretched by the same factor). It asserts
the things an eye cannot: the real dialog is gone and focus is back on the
opener in the same task the close was pressed, the copy is inert and holds the
scroll position and the typed text, exactly one copy exists and it is removed,
the pill lands within half a pixel of its segment, an in-flow element leaves
no copy, nothing is left behind. The page-built surfaces of the second pass
were checked as shapes (the same classes on the hook-less `leaveRef`), not by
mounting those pages.
