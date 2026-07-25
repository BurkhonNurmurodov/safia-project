import { Star, UserCog, Users, Flag, Shield, UserRound } from "lucide-react";

// Role → label key + icon, matching the admin Profiles tab so the recipient
// tree reads identically across the platform. Shared by the Broadcast tab and
// the /broadcast mini-app picker.
export const ROLE_SECTIONS = {
  "top-manager":   { tKey: "admin.profiles.topManagers",   icon: Star },
  "shift-manager": { tKey: "admin.profiles.shiftManagers", icon: UserCog },
  "supervisor":    { tKey: "admin.profiles.supervisors",   icon: Users },
  "leader":        { tKey: "admin.profiles.leaders",       icon: Flag },
  "admin":         { tKey: "admin.profiles.admins",        icon: Shield },
  "guest":         { tKey: "admin.profiles.guests",        icon: UserRound },
};

// Roles whose profiles are bucketed by shift inside their section.
const SHIFT_ROLES = new Set(["shift-manager", "supervisor"]);

/**
 * Bucket a role's flat profile list into intermediate branches.
 *
 *   metaOf(node) → { id, label, sort } for a node that belongs to a bucket,
 *                  or null for one that has no position yet
 *   looseLabel   – label of the trailing bucket collecting the nulls
 *
 * Buckets keep the profile order they arrived in and are sorted among
 * themselves by `sort` (numbers numerically, anything else as text), with the
 * loose bucket last. A role where NOTHING has a position stays flat, so an
 * unfilled org chart never adds a pointless single wrapper.
 */
function bucketProfiles(role, nodes, metaOf, looseLabel, icon) {
  const buckets = new Map();
  const loose = [];
  for (const n of nodes) {
    const m = metaOf(n);
    if (!m) {
      loose.push(n);
      continue;
    }
    if (!buckets.has(m.id)) {
      buckets.set(m.id, {
        key: `${role}::${m.id}`, label: m.label, sort: m.sort, icon, children: [],
      });
    }
    buckets.get(m.id).children.push(n);
  }
  if (!buckets.size) return nodes;

  const out = [...buckets.values()]
    .sort((a, b) =>
      typeof a.sort === "number" && typeof b.sort === "number"
        ? a.sort - b.sort
        : String(a.sort).localeCompare(String(b.sort)))
    .map(({ sort, ...b }) => b);   // eslint-disable-line no-unused-vars
  if (loose.length) out.push({ key: `${role}::none`, label: looseLabel, icon, children: loose });
  return out;
}

/**
 * Insert the org-chart level between a role section and its profiles, so the
 * picker mirrors who reports to whom: shift-managers and supervisors bucket by
 * SHIFT, leaders by their SUPERVISOR. Every other role stays flat.
 *
 * Shared by the Broadcast recipient tree (admin tab + /broadcast mini-app) and
 * the Permissions profile picker — both feed the same CheckboxTree, so the two
 * pages must read identically. Nodes carry the `shift` / `unit` / `unitId`
 * metadata straight off the API row; the labels are localised here.
 */
export function groupProfileNodes(role, nodes, t, tl) {
  if (SHIFT_ROLES.has(role)) {
    return bucketProfiles(
      role,
      nodes,
      (n) => (n.shift == null ? null : {
        id: `shift-${n.shift}`,
        label: t("admin.cleanup.shiftN").replace("{n}", n.shift),
        sort: Number(n.shift),
      }),
      t("admin.profiles.noShift"),
      Clock,
    );
  }
  if (role === "leader") {
    return bucketProfiles(
      role,
      nodes,
      (n) => (n.unit ? {
        id: `unit-${n.unitId ?? n.unit}`,
        label: tl(n.unit),
        sort: tl(n.unit),
      } : null),
      t("admin.profiles.noSupervisor"),
    );
  }
  return nodes;
}

/**
 * Turn the /api/broadcast/recipients tree into CheckboxTree `groups`:
 * role ▸ [shift | supervisor] ▸ profile ▸ Telegram user. A user leaf is keyed
 * by its telegram_id (as a string) so the same person held across profiles is
 * mirrored automatically. A profile with no registered users becomes a
 * disabled leaf with a hint.
 *
 *   tl           – transliterate helper (profile names are DB text)
 *   noUsersLabel – hint text for an empty profile
 */
export function buildRecipientGroups(tree, t, tl, noUsersLabel) {
  return (tree || []).map((block) => {
    const meta = ROLE_SECTIONS[block.role] || {};
    const profiles = (block.profiles || []).map((p) => {
      const pos = { shift: p.shift, unit: p.unit, unitId: p.unit_id };
      return p.users && p.users.length
        ? {
            ...pos,
            key: p.key,
            label: tl(p.name),
            children: p.users.map((u) => ({
              key: String(u.telegram_id),
              label: u.name, // live getChat full name — kept verbatim
              sub: u.username ? `@${u.username}` : undefined,
            })),
          }
        : { ...pos, key: p.key, label: tl(p.name), disabled: true, hint: noUsersLabel };
    });
    return {
      key: block.role,
      label: meta.tKey ? t(meta.tKey) : block.role,
      icon: meta.icon,
      children: groupProfileNodes(block.role, profiles, t, tl),
    };
  });
}
