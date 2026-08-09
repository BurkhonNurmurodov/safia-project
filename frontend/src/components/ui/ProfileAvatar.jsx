import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * THE avatar for a profile, everywhere one is drawn (header, sidebar footer,
 * /profile, admin Profiles rows). Shows the profile photo when one exists,
 * otherwise initials on a hue derived from the canonical name — the same
 * fallback the header always had, so a profile without a photo looks exactly
 * as it did before photos existed.
 *
 * The photo is fetched as a BLOB through the api client (auth headers ride
 * along — a bare <img src> would arrive anonymous and 401), keyed by
 * `photoVer` so react-query caches it forever and a replaced photo busts the
 * cache by key, never by guesswork.
 */

/** The caller's own profile card (profile key + photo version for the avatar,
 *  web login state, holders). ONE query shared by the header, the sidebar
 *  footer and the /profile page — same key everywhere, so it fetches once. */
export function useMyProfileDetails() {
  const { auth } = useAuth();
  return useQuery({
    queryKey: ["my-profile-details"],
    queryFn: () => api.get("/api/profiles/me/details").then((r) => r.data),
    enabled: auth?.status === "approved",
    staleTime: 60_000,
  });
}

export function nameInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function nameToColor(name = "") {
  let hash = 0;
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 42%)`;
}

export default function ProfileAvatar({
  name = "",        // display name (initials fallback)
  colorKey,         // hue source — raw canonical name, stable across languages
  profileKey,       // "role:id" — enables the photo fetch
  photoVer,         // photo version from the API; falsy = no photo, no request
  size = 32,
  className = "",
  style,
}) {
  const { data: blob } = useQuery({
    queryKey: ["avatar", profileKey, photoVer],
    queryFn: () =>
      api.get(`/api/profiles/photo/${encodeURIComponent(profileKey)}`, {
        responseType: "blob",
        params: { v: photoVer },
      }).then((r) => r.data),
    enabled: Boolean(profileKey && photoVer),
    staleTime: Infinity,
    retry: 0,
  });

  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const base = {
    width: size,
    height: size,
    ...style,
  };

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover flex-shrink-0 select-none ${className}`}
        style={base}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none ${className}`}
      style={{
        ...base,
        background: nameToColor(colorKey || name),
        fontSize: Math.max(9, Math.round(size * 0.34)),
      }}
    >
      {nameInitials(name)}
    </div>
  );
}
