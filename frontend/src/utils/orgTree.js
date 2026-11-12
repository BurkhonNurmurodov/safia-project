// «Tashkiliy tuzilma» (/panel/orgchart) — the tree and its geometry.
//
// The server sends profiles FLAT with their place (factory_id, shift,
// unit_id); which tier hangs where is drawn here:
//
//   company ─┬─ top-managers ─ people
//            ├─ shift-managers ─ people
//            ├─ plant ─ shift ─ brigadir ─ leaders
//            ├─ leaders of no unit · «Kutish mas'ullari» · guests · admins
//
// The roles that reach every unit (top- and shift-managers) hang on no plant:
// since 2026-11-04 a shift-manager's shift and plant decide nothing
// (docs/cells-and-org.md), so placing one under a plant would draw a boss the
// units do not have.
//
// The layout is a plain tidy tree with ONE twist: children that are all
// leaves are STACKED in columns under their parent instead of laid in a row.
// A brigadir's leaders side by side make an opened shift ~10 000px wide; in a
// column it is a third of that, and a group of thirty guests is a 4 × 8 block.

export const NODE_W = 212;
export const NODE_H = 58;
const GAP_X = 22;        // between sibling subtrees in a row
const GAP_Y = 52;        // between a parent and its children (holds the toggle pill)
const STACK_INDENT = 24; // the stacked column's trunk runs in this gutter
const STACK_GAP = 10;    // between stacked cards
const STACK_COL_GAP = 16;
const STACK_ROWS = 8;    // a column's height before a second one starts
const STACK_COLS = 4;    // …and the widest a stack gets (rows grow after that)
const RADIUS = 9;

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru");

const person = (p, children = []) => ({ id: p.key, kind: "person", role: p.role, profile: p, children });

/**
 * The tree. `data` is GET /admin/org-chart. Every node: `{ id, kind, children,
 * parent, people, roles, cells }` — `people` the PERSON nodes at or under it,
 * `roles` the same per role, `cells` the cells of the units under it; `kind`
 * is "root" | "group" (a role tier) | "factory" | "shift" | "person".
 */
export function buildTree(data) {
  const profiles = data?.profiles || [];
  const of = (role) => profiles.filter((p) => p.role === role).sort(byName);
  const factories = data?.factories || [];
  const plantIds = new Set(factories.map((f) => f.id));

  const group = (role, list, extra = {}) =>
    ({ id: `g:${role}`, kind: "group", role, children: list.map((p) => person(p)), ...extra });

  const leadersOf = new Map();
  const loose = [];
  for (const l of of("leader")) {
    if (l.unit_id == null) loose.push(l);
    else (leadersOf.get(l.unit_id) || leadersOf.set(l.unit_id, []).get(l.unit_id)).push(l);
  }

  const plant = (f, units) => {
    const shifts = [];
    for (const n of [1, 2, null]) {
      const mine = units.filter((u) => (u.shift === 1 || u.shift === 2 ? u.shift : null) === n);
      if (!mine.length) continue;
      shifts.push({
        id: `s:${f ? f.id : 0}:${n ?? 0}`, kind: "shift", shift: n,
        children: mine.map((u) => person(u, (leadersOf.get(u.id) || []).map((l) => person(l)))),
      });
    }
    return { id: `f:${f ? f.id : 0}`, kind: "factory", factory: f, children: shifts };
  };

  const units = of("supervisor");
  const children = [];
  const push = (n) => { if (n.children.length) children.push(n); };

  push(group("top-manager", of("top-manager")));
  push(group("shift-manager", of("shift-manager")));
  for (const f of factories) push(plant(f, units.filter((u) => u.factory_id === f.id)));
  // Units on no plant (or on an archived one): visible, never padded onto a
  // plant they may not belong to — the «All factories» rule of every page.
  push(plant(null, units.filter((u) => !plantIds.has(u.factory_id))));
  push(group("leader", loose, { loose: true }));
  push(group("idle-owner", of("idle-owner")));
  push(group("guest", of("guest")));
  push(group("admin", of("admin")));

  const root = { id: "root", kind: "root", children, anyPlant: factories.length > 0 };
  const index = new Map();
  (function walk(n, parent) {
    n.parent = parent;
    index.set(n.id, n);
    const me = n.kind === "person";
    n.people = me ? 1 : 0;
    n.roles = me ? { [n.role]: 1 } : {};
    // A unit's cells are counted once, on its brigadir — a leader's are theirs.
    n.cells = me && n.role === "supervisor" ? (n.profile.cells?.length || 0) : 0;
    for (const c of n.children) {
      walk(c, n);
      n.people += c.people;
      n.cells += c.cells;
      for (const [r, k] of Object.entries(c.roles)) n.roles[r] = (n.roles[r] || 0) + k;
    }
  })(root, null);
  return { root, index };
}

/** Ids from the root down to `id` (inclusive). */
export function pathTo(index, id) {
  const out = [];
  for (let n = index.get(id); n; n = n.parent) out.unshift(n.id);
  return out;
}

/** Every person node at or under `node`. */
export function peopleUnder(node, out = []) {
  if (node.kind === "person") out.push(node);
  for (const c of node.children) peopleUnder(c, out);
  return out;
}

// An axis-aligned polyline with rounded corners.
function rounded(pts) {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1], [cx, cy] = p[i], [bx, by] = p[i + 1];
    const la = Math.hypot(cx - ax, cy - ay), lb = Math.hypot(bx - cx, by - cy);
    const r = Math.min(RADIUS, la / 2, lb / 2);
    if (r < 1) { d += ` L${cx},${cy}`; continue; }
    d += ` L${cx + ((ax - cx) / la) * r},${cy + ((ay - cy) / la) * r}`
       + ` Q${cx},${cy} ${cx + ((bx - cx) / lb) * r},${cy + ((by - cy) / lb) * r}`;
  }
  const l = p[p.length - 1];
  return `${d} L${l[0]},${l[1]}`;
}

/**
 * Positions for the nodes on screen. `expanded` is a Set of node ids whose
 * children show. Returns `{ nodes: [{ node, x, y }], links: [{ id, d }],
 * pos: Map(id → {x, y}), width, height }` — a link's `id` is its CHILD's, so
 * the path to a selected node can be drawn in colour.
 */
export function layoutTree(root, expanded) {
  const box = new Map();
  const kidsOf = (n) => (expanded.has(n.id) ? n.children : []);

  (function measure(n) {
    const kids = kidsOf(n);
    let b;
    if (!kids.length) b = { w: NODE_W, h: NODE_H, mode: "leaf" };
    else if (kids.every((k) => !k.children.length)) {
      const cols = Math.min(STACK_COLS, Math.ceil(kids.length / STACK_ROWS));
      const rows = Math.ceil(kids.length / cols);
      const area = cols * (STACK_INDENT + NODE_W) + (cols - 1) * STACK_COL_GAP;
      b = { w: Math.max(NODE_W, area), h: NODE_H + GAP_Y + rows * NODE_H + (rows - 1) * STACK_GAP,
            mode: "stack", cols, rows, area };
    } else {
      let w = 0, h = 0;
      for (const k of kids) { const kb = measure(k); w += kb.w; h = Math.max(h, kb.h); }
      w += (kids.length - 1) * GAP_X;
      b = { w: Math.max(NODE_W, w), h: NODE_H + GAP_Y + h, mode: "row", inner: w };
    }
    box.set(n.id, b);
    return b;
  })(root);

  const nodes = [], links = [], pos = new Map();
  const put = (node, x, y) => { pos.set(node.id, { x, y }); nodes.push({ node, x, y }); };

  (function place(n, left, top) {
    const b = box.get(n.id), kids = kidsOf(n);
    if (b.mode === "leaf") { put(n, left + (b.w - NODE_W) / 2, top); return; }
    const kidsTop = top + NODE_H + GAP_Y;
    const busY = top + NODE_H + GAP_Y / 2 + 6;
    if (b.mode === "stack") {
      const px = left + (b.w - NODE_W) / 2, pcx = px + NODE_W / 2;
      put(n, px, top);
      const ax = left + (b.w - b.area) / 2;
      kids.forEach((k, i) => {
        const col = Math.floor(i / b.rows), row = i % b.rows;
        const colLeft = ax + col * (STACK_INDENT + NODE_W + STACK_COL_GAP);
        const x = colLeft + STACK_INDENT, y = kidsTop + row * (NODE_H + STACK_GAP);
        put(k, x, y);
        const trunk = colLeft + STACK_INDENT / 2, mid = y + NODE_H / 2;
        links.push({ id: k.id, d: rounded([[pcx, top + NODE_H], [pcx, busY], [trunk, busY], [trunk, mid], [x, mid]]) });
      });
      return;
    }
    let x = left + (b.w - b.inner) / 2;
    for (const k of kids) { place(k, x, kidsTop); x += box.get(k.id).w + GAP_X; }
    const first = pos.get(kids[0].id), last = pos.get(kids[kids.length - 1].id);
    const pcx = (first.x + last.x) / 2 + NODE_W / 2;
    put(n, pcx - NODE_W / 2, top);
    for (const k of kids) {
      const kx = pos.get(k.id).x + NODE_W / 2;
      links.push({ id: k.id, d: rounded([[pcx, top + NODE_H], [pcx, busY], [kx, busY], [kx, kidsTop]]) });
    }
  })(root, 0, 0);

  const b = box.get(root.id);
  return { nodes, links, pos, width: b.w, height: b.h };
}
