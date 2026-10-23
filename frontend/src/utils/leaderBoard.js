// THE /leaders board scoring — the pure functions every ranking of the
// leaders' checklist is composed of, lifted out of pages/Leaders.jsx so a
// second page can compose the SAME ranking instead of re-deriving it: the
// Monitoring tab, its «Mening o'rnim» card (over `/api/leaders/standing`) and
// the «Brigadirlar reytingi» board's «Lider nazorati» (over the pool
// `/api/leaderboard` ships). Change the board here and all three follow; a
// page with rules of its own would be a second leaderboard.
import { transliterate } from "./transliterate";

const isoShift = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The last FINISHED shift-day on the plant's wall clock: a day is over once
// 09:00 of the next morning has passed (shift 2's night closes then).
export const lastFinishedDay = () => {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" })
    .format(new Date(Date.now() - 9 * 3600e3));
  return isoShift(s, -1);
};
export const rowDate = (r) => String(r.date).slice(0, 10);

//   key → { days: Map(date → { sum, n }), off: Set(date) }
//
// `off` is the second half of the rule and the only one that shrinks a
// DENOMINATOR: days an admin took out of the results entirely. Everything else
// that "does not count" here — a voided row, a day nobody filed — is a real 0%
// occupying its slot, which is the whole difference. A day in `off` is neither
// a filing nor a miss: it leaves the numerator AND the window it was measured
// against, so the person's mean is taken over the days that remain.
//
// It is computed as "this key had an excluded row on that date and no surviving
// slot for it", never as "the row said excluded" — for a UNIT key a day whose
// other leaders filed normally still counts, on their rows, and only a unit-day
// that is excluded in full leaves the unit's window.
//
// `cuts` + `dates` are the second source of `off`, and the only one that can
// reach a day nobody filed. A row can say "this day does not count"; a day with
// no row says nothing at all, and a leader cut off on the 21st and read over
// 18–30 August has ten such days. So the CUTOFF travels as one fact per person
// (`cuts`: display key → the first ISO day that stopped counting) and is
// expanded here against `dates`, the days of the window this particular call is
// scored over. Every caller passes its own list — the standings window, the
// trend's span, the previous period, the sparkline's rolling range — because
// they score four different windows and a single shared list would be wrong for
// three of them.
//
// It happens HERE and not in `scoreSlots` because two readers never go through
// `scoreSlots` at all: the trend line builds `dayOff` straight off `off`, and
// the rolling spark tests `off.has(d)` per day. Expanding downstream would fix
// the ranking and leave those two on the old denominator — two answers to one
// question, on one card.
//
// `members` is the third source, and the only one that can name a person who
// filed NOTHING. Grouping rows cannot list somebody who left no row at all, so
// a leader who owed a checklist every day of the window and sent none was
// simply absent — from the ranking, the calendar and the headline average —
// while the unit ranking beside it already counted them as the 0 they scored
// (`unitSlots`). The page hands its scoped ROSTER in here (`rosterLeaders`,
// through `rosterFold`), and every name the rows did not produce gets an entry
// with no days: a real
// 0% over the window, which is exactly what a missing day already is. Their
// stopped-owing days come off through `cuts` like anybody else's, which is why
// the page folds the roster's own cutoff and no-cell floor into that map.
// Marked `unfiled`, because the Trend chip must not read «Yangi» beside
// somebody whose data has not begun — it has simply not arrived.
//
// `starts` is the other edge of the same question, and it runs the OTHER way:
// the first day a person owes at all (`owes_from` — the day a profile the sync
// created was claimed, or the brigadir picked it). Every day BEFORE it is a day
// nobody expected them to file, so it goes into `off` exactly as a cut day
// does — never folded into `cuts`, whose every reader tests `d >= from`. A
// profile nobody has claimed yet starts on "9999-12-31": every day is off and
// `scoreSlots` drops them, rather than ranking them last.
export const slotsBy = (rows, keyFn, cuts, dates, members, starts) => {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key || key === "N/A") continue;
    let e = map.get(key);
    if (!e) map.set(key, (e = { days: new Map(), off: new Set() }));
    const d = rowDate(r);
    // EXCLUDED outranks the window void below: an exclusion is a person's
    // explicit answer about this exact day, the void is a rule about all of
    // them — the same precedence the backend gives the two.
    //
    // …but only a DAY exclusion puts the date in `off` from a row. A CUTOFF is
    // a fact about a PERSON and says nothing about this unit's day: the
    // expansion below owns it, and it owns it PER KEY SPACE (`cutLeaders` for a
    // leader, `cutUnits` for a unit). Letting the row do it here meant a cut
    // leader who went on filing forgave their whole unit's misses — on a day
    // where their row was the unit's only one, the unit's day left the unit's
    // denominator, though the unit still owed a report from its other leaders.
    if (r.excluded) { if (!r.excluded.cutoff) e.off.add(d); continue; }
    // A row the backend voided on the shift-1 submission window is not a report.
    // The person is registered above BEFORE this bails, so they stay on the
    // roster — they keep their standings row, they keep counting in every
    // denominator — but the day itself gets no slot: it scores the same real 0%
    // a missing day scores, and Barqarorlik does not count it as filed. Filing
    // twice on one day and hitting the window once still settles the day at the
    // valid row's score, because only the voided one drops out here.
    if (r.rejected) continue;
    const day = e.days.get(d) || { sum: 0, n: 0 };
    day.sum += r.completion; day.n++;
    e.days.set(d, day);
  }
  // Everybody who owed and left no row. BEFORE the cut expansion, so a leader
  // cut on the 15th is owed only the days before it, and one cut before the
  // window opened leaves the board in `scoreSlots`, as a filer would.
  if (members)
    for (const key of members)
      if (key && key !== "N/A" && !map.has(key))
        map.set(key, { days: new Map(), off: new Set(), unfiled: true });
  // Every day of this window from the person's cutoff on, and every day before
  // the first one they owe: days they were never expected to file, so days
  // that belong in neither half of the average.
  if ((cuts?.size || starts?.size) && dates?.length) {
    for (const [key, e] of map) {
      const from = cuts?.get(key), start = starts?.get(key);
      if (from) for (const d of dates) if (d >= from) e.off.add(d);
      if (start) for (const d of dates) if (d < start) e.off.add(d);
    }
  }
  // A date that ended up with a real slot is not off, whatever else was filed
  // on it — see the header: one leader of a unit excluded does not take the
  // unit's day away from the leaders who filed it.
  //
  // This runs LAST, and that is what makes the two sources agree. A cut leader
  // who files anyway gets a row the backend already stamped `excluded`, so it
  // never reaches `e.days` and its date stays off — while a row the backend did
  // NOT stamp is a day somebody really was measured on, and it keeps its slot
  // rather than being silently erased by a rule about the days around it.
  for (const e of map.values())
    for (const d of e.days.keys()) e.off.delete(d);
  return map;
};

// Who of `roster` may go on the board as having filed NOTHING in `rs` — the
// `members` handed to `slotsBy`. Everybody, except a profile an UNMATCHED
// sheet spelling in those rows may name. A handful of the spellings the form
// collected never resolved to a profile (the matcher is scoped to the unit, so
// a leader who moved units reads as a stranger — Turdimurodov Nodirjon filed
// under Aripova Manzura until he became a brigadir himself), and a row filed
// under one must not make its leader look absent: that profile is left off the
// fold for the period, i.e. read exactly as it was before the roster joined
// in. Surname + first name, folded to one script, because the sheet spells
// people in either alphabet and in passport form. The bot keys every day by
// profile, so from September on this set is empty and nobody is held back.
export const nameToks = (s) => transliterate(String(s || ""), "uz").toLowerCase()
  .replace(/[ʻʼ'`‘’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
export const rosterFold = (roster, rs) => {
  if (!roster?.size) return roster;
  const spelt = [];
  for (const r of rs) {
    if (r.leader_id || r.missing || !r.leader || r.leader === "N/A") continue;
    const t = nameToks(r.leader);
    if (t.length >= 2) spelt.push(t);
  }
  if (!spelt.length) return roster;
  const out = new Set();
  for (const name of roster) {
    const own = new Set(nameToks(name));
    if (!spelt.some((t) => own.has(t[0]) && own.has(t[1]))) out.add(name);
  }
  return out;
};

// How many days of the window this person is actually measured over. Excluded
// days come off the top, so a leader with three excluded days in a seven-day
// period is scored over four — that is what "counts neither for nor against"
// means arithmetically, and scoring them 0 over seven is precisely what it is
// not. Never below 1: a window excluded in full has no mean to state, and
// dividing by 0 would print NaN where the honest answer is "nothing to score".
export const winFor = (winDays, off) => Math.max(0, winDays - (off ? off.size : 0));
// …scored over that window: Reyting = Σ day means ÷ every day of it,
// Barqarorlik = how many of those days carry a report at all.
export const scoreSlots = (map, winDays) =>
  [...map.entries()].flatMap(([name, { days, off, filed, unfiled }]) => {
    let sum = 0;
    for (const day of days.values()) sum += day.sum / day.n;
    const win = winFor(winDays, off);
    // Every day of this person's window was excluded, so there is nothing to
    // score them on — and 0% is the one answer that would be wrong, since it is
    // exactly the "counts against them" an exclusion exists to remove. They
    // leave the ranking, the calendar and the headline average, the same as
    // somebody with no rows in the period at all. Guarded on `winDays` so a
    // degenerate empty window (no period at all) still behaves as it always did.
    if (winDays > 0 && win <= 0) return [];
    const score = win ? sum / win : 0;
    // Scored and FILED are the same set of days for a leader — they file or they
    // do not — and two different sets for a unit, which can be half answered: a
    // day two of its three leaders filed carries a real score and is not a day
    // the unit filed. Barqarorlik, the «Kunlar» fraction and the calendar all
    // read the filed set, so the row's «6/7» is literally its green cell count.
    const done = filed || new Set(days.keys());
    return [{
      name, score,
      rating: Math.round(score),
      consist: win ? Math.round((done.size / win) * 100) : 0,
      sent: done.size,
      missed: Math.max(0, win - done.size),
      // Days taken out of the results — shown as such on the calendar grid, so
      // a blank cell is never read as a miss.
      excluded: off,
      // Which days those were, for the calendar grid under the register.
      days: done,
      // On the board off the roster alone — nothing in the rows (`slotsBy`).
      unfiled: !!unfiled,
    }];
  });

// Did this key actually FILE on that day, as opposed to merely scoring on it.
// ONE definition, because the sparkline re-ranks day by day without ever going
// through `scoreSlots` — a second reading there would draw a line of places the
// board never printed.
export const filedOn = (e, d) => (e.filed ? e.filed.has(d) : e.days.has(d));

// ── a UNIT's day is what its LEADERS did ─────────────────────────────────────
// A brigadir files nothing, so their day has to be composed from the people who
// owed a checklist on it: the mean over ALL of them, a leader who filed nothing
// counting as the 0 they scored, and the day counted as FILED only when every
// one of them filed.
//
// Grouping the rows by supervisor — what `slotsBy` does for the leader ranking
// — cannot say either of those things, because a leader who files nothing
// leaves no row at all. A unit of three where one filed at 100% therefore read
// 100% Reyting, 100% Barqarorlik and a green calendar cell for that day: three
// readings of a day two thirds of which never happened.
//
// `members` is the union of the REGISTRY (`roster`, the unit's leader profiles)
// and everybody actually seen filing for the unit. The union, not the registry:
// the two registers are allowed to disagree in public, and about 18% of the
// sheet's leader names resolve to no profile at all, so a roster-only
// denominator would drop precisely those people's scores out of their own
// unit's average. Off it come the two decisions an admin makes on the panel,
// each only on the days it covers — a CUTOFF (this person stopped counting from
// a date on) and a DAY EXCLUSION (this leader-day counts for nobody) — and the
// days before a member's first owed day (`startLeaders`, see `slotsBy`).
export const unitSlots = (rows, roster, cutLeaders, cutUnits, dates, startLeaders) => {
  const map = new Map();
  const unitOf = (u) => {
    let e = map.get(u);
    if (!e) map.set(u, (e = {
      days: new Map(), off: new Set(), filed: new Set(),
      members: new Set(),        // who owed this unit a checklist at all
      skip: new Map(),           // date → leaders excluded on it
      got: new Map(),            // date → leader → what arrived
    }));
    return e;
  };
  for (const r of rows) {
    const unit = r.supervisor, who = r.leader;
    if (!unit || unit === "N/A" || !who || who === "N/A") continue;
    const e = unitOf(unit);
    e.members.add(who);
    const d = rowDate(r);
    // The same precedence `slotsBy` gives these two, for the same reason: an
    // exclusion answers about THIS day, a cutoff is a rule about every day
    // after a date and is expanded below.
    if (r.excluded) {
      if (!r.excluded.cutoff) {
        let sk = e.skip.get(d);
        if (!sk) e.skip.set(d, (sk = new Set()));
        sk.add(who);
      }
      continue;
    }
    // Voided by the shift-1 filing window: not a report. It neither scores nor
    // counts as filed, so the day is this leader's real 0 inside the unit.
    if (r.rejected) continue;
    let day = e.got.get(d);
    if (!day) e.got.set(d, (day = new Map()));
    const a = day.get(who) || { sum: 0, n: 0 };
    a.sum += r.completion; a.n++;
    day.set(who, a);
  }
  // The registry, folded onto the units the period actually shows — and only
  // onto those. A unit that filed nothing whatever in the window is absent from
  // this ranking today, and putting it on the board at 0% is a separate
  // decision from making the units already on it count honestly.
  for (const [unit, e] of map)
    for (const n of roster?.get(unit) || []) e.members.add(n);

  const cutAt = (name, d) => {
    const from = cutLeaders?.get(name);
    return !!from && d >= from;
  };
  // Before the first day this person owes anything. The opposite direction of
  // a cutoff, so a test of its own rather than a value in `cutLeaders`.
  const notYet = (name, d) => {
    const start = startLeaders?.get(name);
    return !!start && d < start;
  };
  for (const [unit, e] of map) {
    // Every day the unit could be asked about. The window when there is one;
    // otherwise whatever the rows themselves span, which is the same fallback
    // `slotsBy` makes when it is handed no dates.
    const span = dates?.length
      ? dates : [...new Set([...e.got.keys(), ...e.skip.keys()])];
    for (const d of span) {
      const skip = e.skip.get(d), arrived = e.got.get(d);
      let owed = 0, sum = 0, missing = 0;
      for (const who of e.members) {
        // Nobody owed this: an admin took the day out, or took the person out
        // of the counting from a date on or before it, or it falls before the
        // first day they owe. That last one only while nothing ARRIVED: a day
        // somebody really filed is a day they were measured on (`slotsBy`'s
        // last pass, in this function's currency).
        if (skip?.has(who) || cutAt(who, d)
            || (notYet(who, d) && !arrived?.has(who))) continue;
        owed++;
        const a = arrived?.get(who);
        if (a) sum += a.sum / a.n; else missing++;
      }
      // Nobody was left to file it, so it belongs in neither half of the unit's
      // average — the answer an excluded day already gets for a leader.
      if (owed === 0) { e.off.add(d); continue; }
      // A day NOTHING arrived on gets no slot, exactly as it does for a leader:
      // it scores its real 0 through the window divisor, and the calendar
      // leaves it blank rather than painting a 0% somebody filed.
      if (missing < owed) e.days.set(d, { sum, n: owed });
      if (missing === 0) e.filed.add(d);
    }
    // The unit's own cutoff — every leader it has, cut, from the last of their
    // floors. Expanded like the leader ranking's and for the same reason: the
    // days nobody filed leave no row anywhere, so only the DECISION can put
    // them in `off`. It is kept beside the per-day arithmetic above rather than
    // folded into it because the backend computes it over EVERY row and every
    // leader, including the ones no roster can see.
    const from = cutUnits?.get(unit);
    if (from && dates?.length) for (const d of dates) if (d >= from) e.off.add(d);
    // A date that ended up with a real slot is not off, whatever else the
    // decisions say about it — `slotsBy`'s own last pass, kept identical.
    for (const d of e.days.keys()) e.off.delete(d);
  }
  return map;
};

// Dense ranking on the (primary, sub-rating) PAIR — a place is shared only when
// BOTH figures match, and the next distinct result is always place+1 (1, 2, 2,
// 3…): a six-way tie on 41 must be followed by 42, not 47. Lifted out of the
// leaderboard because the Trend column re-ranks the previous period and every
// spark day, and a place delta only means something if all three rank by
// EXACTLY the same rule. Sorts and writes `place` onto the entries in place.
export const rankPlaces = (list, metric) => {
  const val = (e) => (metric === "consist" ? e.consist : e.rating);
  const alt = (e) => (metric === "consist" ? e.rating : e.consist);
  const same = (a, b) => val(a) === val(b) && alt(a) === alt(b);
  list.sort((a, b) => val(b) - val(a) || alt(b) - alt(a) || a.name.localeCompare(b.name));
  list.forEach((e, i) => {
    e.place = i === 0 ? 1 : same(list[i - 1], e) ? list[i - 1].place : list[i - 1].place + 1;
  });
  return list;
};

// ── one board, whoever reads it ──────────────────────────────────────────────
// The pieces the ranking is composed of, lifted out of the component so the
// «Mening o'rnim» card can compose the SAME ranking over the platform-wide pool
// (`/api/leaders/standing`). A leader and a brigadir cannot read the board
// itself, and the place the card tells them must be the place an admin reads
// off the board for the same scope and window. Change the board here and the
// card follows; a card with rules of its own would be a second leaderboard.

// Is this row inside a scope: a date window plus the page's three narrowings.
export const inScope = (r, { from, to, shift = null, sup = "All", leader = "All" }) => {
  const d = rowDate(r);
  return (!from || d >= from) && (!to || d <= to)
    && (shift == null || r.shift === shift)
    && (sup === "All" || r.supervisor === sup)
    && (leader === "All" || r.leader === leader);
};

// Who OWED the rows of a scope — the roster, narrowed by exactly the filters
// that narrow the rows (see `rosterLeaders` in the component for why).
export const rosterIn = (roster, { shift = null, sup = "All", leader = "All" }) =>
  (roster ?? []).filter((p) => p.supervisor && p.name
    && (shift == null || p.shift === shift)
    && (sup === "All" || p.supervisor === sup)
    && (leader === "All" || p.name === leader));

// unit label → the names of the leaders who owe it a checklist.
export const rosterByUnit = (roster) => {
  const m = new Map();
  for (const p of roster) {
    let set = m.get(p.supervisor);
    if (!set) m.set(p.supervisor, (set = new Set()));
    set.add(p.name);
  }
  return m;
};

// Every name the feed holds a real filing under — an excluded day nobody filed
// (`missing`) is a decision, not a filing.
export const filedUnderOf = (rows) => {
  const s = new Set();
  for (const r of rows ?? []) if (r.leader && !r.missing) s.add(r.leader);
  return s;
};

// Who stopped counting, and from when — one entry per DECISION, keyed by the
// display name `slotsBy` groups by. `cutoffs` is the backend's answer for the
// names it has rows under; the ROSTER adds the two cases that map cannot carry,
// and both matter because the roster itself puts people on the board: a leader
// cut before they ever filed, a leader of a per-CELL unit who owns no cell
// (owes nothing from the switch on), and a leader none of whose cells counts in
// the загрузка who filed nothing since 1 October (`no_load_from`). Without them
// any one would print as a red row of days nobody asked them for.
//
// A roster CUTOFF speaks only for a name the feed has no rows under: where it
// has rows, the backend's key-level answer already weighed everybody filing
// under that spelling and cut it only once all of them were cut, and the
// roster, which lists profiles alone, must not overrule that. Several profiles
// sharing one name stop owing only once EVERY one of them has, from the last of
// their dates — the backend's own rule for a shared key.
export const buildCutLeaders = (cutoffs, filedUnder, roster) => {
  const m = new Map();
  for (const [name, c] of Object.entries(cutoffs ?? {})) m.set(name, c.from);
  const floors = new Map();                 // name → last floor, or null = someone still owes
  for (const p of roster ?? []) {
    if (!p.name) continue;
    const own = [];
    if (p.cutoff && !filedUnder.has(p.name)) own.push(p.cutoff);
    if (p.cell_from && !p.cells?.length) own.push(p.cell_from);
    // Every cell of theirs archived: a per-cell unit's leader owes nothing
    // from the day after the last archive day.
    if (p.cell_from && p.cells_gone_from)
      own.push(p.cells_gone_from > p.cell_from ? p.cells_gone_from : p.cell_from);
    // No cell in the загрузка and nothing filed since 1 October
    // (`services/leader_load.py`): owes nothing from that day on.
    if (p.no_load_from) own.push(p.no_load_from);
    const f = own.length ? own.sort()[0] : null;
    const had = floors.has(p.name), cur = floors.get(p.name);
    floors.set(p.name, !had ? f : cur == null || f == null ? null : f > cur ? f : cur);
  }
  for (const [name, f] of floors) {
    if (!f) continue;
    const cur = m.get(name);
    if (!cur || f < cur) m.set(name, f);
  }
  return m;
};

// The same for a whole unit, which the backend computes because the client
// cannot: a unit leaves its own denominator only once EVERY leader it has is
// cut, and the client is never handed a unit's full roster.
export const buildCutUnits = (cutUnits) =>
  new Map(Object.entries(cutUnits ?? {}).map(([name, c]) => [name, c.from]));

// The first day each display name OWES a checklist — the roster's `owes_from`
// (the day the profile was claimed, or picked by the brigadir; "9999-12-31" =
// created by the Verifix sync and claimed by nobody yet, so it owes nothing).
// The mirror of `buildCutLeaders`, in the opposite direction: several profiles
// sharing one name owe from the EARLIEST of their floors, and from the start
// of time as soon as any one of them has no floor at all. A roster without the
// key (an older backend, the exam fixture) reads as "no floor" — nothing moves.
export const buildStartLeaders = (roster) => {
  const floors = new Map();                 // name → earliest floor, or null = owes throughout
  for (const p of roster ?? []) {
    if (!p.name) continue;
    const f = p.owes_from || null;
    const had = floors.has(p.name), cur = floors.get(p.name);
    floors.set(p.name, !had ? f : cur == null || f == null ? null : f < cur ? f : cur);
  }
  const m = new Map();
  for (const [name, f] of floors) if (f) m.set(name, f);
  return m;
};

// THE ranking of a scope: leaders (`slotsBy`, the roster folded in as the
// people who filed nothing) or units (`unitSlots`, a unit's day composed of
// its leaders), scored over the window by `scoreSlots`.
export const boardScores = (mode, rows, roster, cutLeaders, cutUnits, dates, days, startLeaders) =>
  mode === "leader"
    ? scoreSlots(slotsBy(rows, (r) => r.leader, cutLeaders, dates,
        rosterFold(new Set(roster.map((p) => p.name)), rows), startLeaders), days)
    : scoreSlots(unitSlots(rows, rosterByUnit(roster), cutLeaders, cutUnits, dates,
        startLeaders), days);

// The pool's wire order: tuples, because a month of the platform is a few
// thousand of them. Rebuilt into the register's own row shape, so the board's
// functions read them unchanged.
export const poolRows = (raw) => (raw ?? []).map(
  ([date, leader, linked, supervisor, shift, completion, excl, voided, missing]) => ({
    date, leader, supervisor, shift, completion,
    leader_id: linked ? 1 : null,
    excluded: excl ? { cutoff: excl === 2 } : null,
    rejected: !!voided,
    missing: !!missing,
  }));
// The tenth element is `owes_from` (appended last, so an older pool without it
// reads as "no floor").
export const poolRoster = (raw) => (raw ?? []).map(
  ([name, supervisor, shift, cutoff, cellFrom, cells, filed, noLoad, cellsGone, owesFrom]) => ({
    name, supervisor, shift, cutoff,
    cell_from: cellFrom,
    no_load_from: noLoad || null,
    cells_gone_from: cellsGone || null,
    owes_from: owesFrom || null,
    cells: Array.from({ length: cells || 0 }),
    filed: !!filed,
  }));
