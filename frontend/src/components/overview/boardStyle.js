// The «Smena hisoboti» board's cell styling — one module, because «Bugungi
// davomat» (TodayAttendanceTable.jsx) is laid out with the same pieces and the
// two tables sit on one page. Plain constants live here rather than in the
// component file: a component module that also exports an object or an array
// loses fast refresh.

// Below `sm` a figure header stacks its sort chevron under the label and shows
// it only on the column that is sorted — a chevron beside every label is what
// would push five columns past a phone's width.
export const TH_FIG = "align-bottom sm:w-[17%] max-sm:px-1 max-[359px]:px-0.5 max-sm:[&>span]:flex-col "
  + "max-sm:[&>span]:items-center max-sm:[&>span]:gap-0.5 max-sm:[&_.lucide-chevrons-up-down]:hidden";
// The cell IS the swatch — square, full-bleed, and ruled by a 1px line of the
// CARD's own colour, which is the загрузка heatmap's cell exactly. Two earlier
// shapes are the mistakes this one answers: painted cells whose gridline was
// `--border` (a 5% white that any fill swallows, so three greens read as one
// block), and rounded tiles floating in a 3px gutter, which read as a row of
// buttons rather than a heatmap. Drawing the rule in the card's colour is what
// makes it show against ANY fill in BOTH themes.
//
// The COLOUR has to be inline and cannot be a class: `DataTable` paints every
// cell's border through `[&_td]:border-[var(--border)]`, a descendant selector
// that outranks any plain utility on the cell itself — a `border-[…]` class
// here compiles, loses, and leaves the grid invisible with nothing to show for
// it. `RULE` is that one declaration and every figure cell carries it.
export const TD_FIG = "text-center align-middle tabular-nums "
  + "leading-tight text-xs border";
export const RULE = { borderColor: "var(--bg-card)" };
// A linked cell moves its padding onto the link, so the whole tile is the
// target and the row keeps its height. Hover tints with the cell's own INK
// (`currentColor`), which lightens a white-ink fill and darkens a dark-ink
// one, in both themes, with no colour of its own.
export const TD_PAD = "px-1 max-[359px]:px-0.5 sm:px-2 py-2.5";
export const LINK_CLS = "block w-full outline-none transition-colors "
  + "hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] "
  + "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]";

// The name placeholders cycle a fixed list — Math.random() re-rolls on every
// render and makes the skeleton twitch (the SkeletonMatrix rule).
export const SK_NAME = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-7/12"];
