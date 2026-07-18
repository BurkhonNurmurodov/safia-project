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

/**
 * Turn the /api/broadcast/recipients tree into CheckboxTree `groups`:
 * role ▸ profile ▸ Telegram user. A user leaf is keyed by its telegram_id (as
 * a string) so the same person held across profiles is mirrored automatically.
 * A profile with no registered users becomes a disabled leaf with a hint.
 *
 *   tl           – transliterate helper (profile names are DB text)
 *   noUsersLabel – hint text for an empty profile
 */
export function buildRecipientGroups(tree, t, tl, noUsersLabel) {
  return (tree || []).map((block) => {
    const meta = ROLE_SECTIONS[block.role] || {};
    return {
      key: block.role,
      label: meta.tKey ? t(meta.tKey) : block.role,
      icon: meta.icon,
      children: (block.profiles || []).map((p) =>
        p.users && p.users.length
          ? {
              key: p.key,
              label: tl(p.name),
              children: p.users.map((u) => ({
                key: String(u.telegram_id),
                label: u.name, // live getChat full name — kept verbatim
                sub: u.username ? `@${u.username}` : undefined,
              })),
            }
          : { key: p.key, label: tl(p.name), disabled: true, hint: noUsersLabel },
      ),
    };
  });
}
