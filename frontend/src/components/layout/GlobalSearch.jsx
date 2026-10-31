import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Grid3x3, UsersRound, UserRound, Settings2, AlertTriangle } from "lucide-react";
import api from "../../utils/api";
import SearchInput from "../ui/SearchInput";
import GroupBadge from "../ui/GroupBadge";
import { SkeletonBlock } from "../ui/Skeleton";
import { hasOpenDialog } from "../ui/dialogLayers";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { ADMIN_NAV, ADMIN_GROUPS } from "../../config/adminNav";
import { useTranslit } from "../../utils/transliterate";
import { searchFold, matchScore } from "../../utils/searchFold";
import useIsMobile from "../../hooks/useIsMobile";
import { ALL_LINKS, NAV_GROUPS } from "../../config/navLinks";

/**
 * «Qidiruv» — the search across the platform: in the header from md up, and
 * at the top of the ☰ drawer on a phone (`drawer`, mounted by Sidebar.jsx),
 * whose header stays the title, the bell and the avatar.
 *
 * One box finds FIVE kinds of thing, each opening where it lives:
 *   pages          → the page (the sidebar's own list, by the viewer's access)
 *   admin tabs     → /admin/upload?tab=… (the panel's own list, by capability)
 *   cells          → /cells/:id — labelled by CODE and leader, never the
 *                    workshop (CLAUDE.md «A cell is its CODE»), though typing a
 *                    workshop name still finds it, as on /cells
 *   brigadirs      → /brigadir/:id, for a viewer who may open that page
 *   leaders        → the leader's profile for whoever manages profiles, else
 *                    the cell they run
 *
 * Pages and tabs are matched here; cells and people come from ONE request,
 * `GET /api/search/index` (backend/app/routers/search.py — the viewer's plant),
 * asked the first time the box is used and cached like any query, so every
 * keystroke after it answers at once and the box keeps working offline.
 * Matching is `utils/searchFold.js` — Cyrillic, Latin and a code typed on the
 * Russian layout all find the same thing.
 *
 * Keyboard: Ctrl/⌘ K or «/» focuses the header's box from anywhere (not while
 * a dialog is up, and «/» not while somebody is typing), ↑↓ walk the results,
 * Enter opens, Esc closes.
 *
 * `drawer`: 16px text (iOS zooms into anything smaller), no shortcut, and the
 * results overlay the drawer's menu at its full width. `onPick` runs before a
 * result opens — the drawer closes itself with it, since a move between two
 * cells keeps the same page mounted.
 */

const CAP = { pages: 6, admin: 5, cells: 6, units: 5, leaders: 6 };
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

// The best `cap` items of one kind, best first; `top` is the best score, which
// orders the kinds themselves — a person's own row above the cells that merely
// name them.
function rank(items, q, cap) {
  const hits = items
    .map((it) => ({ it, s: matchScore(q, it.terms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.it.sort.localeCompare(b.it.sort))
    .slice(0, cap);
  return { items: hits.map((x) => x.it), top: hits[0]?.s ?? 0 };
}

export default function GlobalSearch({ drawer = false, onPick }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, capTabs, deniedPages } = useCapabilities();
  const navigate = useNavigate();
  const wide = !useIsMobile(1280);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The index is asked for the first time the box is used, never on page load.
  const [used, setUsed] = useState(false);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  const isAdmin = auth?.role === "admin";
  const can = (page) => canAccessPage(auth?.role, page, access, capPages, deniedPages);
  const manageProfiles = isAdmin || capTabs.includes("profiles");
  const seeUnits = can("overview");

  const idx = useQuery({
    queryKey: ["search-index"],
    queryFn: () => api.get("/api/search/index").then((r) => r.data),
    enabled: used,
    staleTime: 5 * 60_000,
  });

  // ── what can be found, folded once per language / data change ──
  const pageItems = useMemo(() => {
    const groupLabel = Object.fromEntries(NAV_GROUPS.filter((g) => g.labelKey).map((g) => [g.id, t(g.labelKey)]));
    return ALL_LINKS
      .filter((l) => (l.adminOnly ? isAdmin : can(l.page)))
      .map((l) => {
        const label = t(l.key);
        return {
          id: `p:${l.to}`, kind: "page", to: l.to, Icon: l.icon, label, sort: label,
          sub: groupLabel[l.group] || "",
          terms: [searchFold(label), searchFold(l.to.replace(/[/-]/g, " "))],
        };
      });
  }, [t, isAdmin, access, capPages, deniedPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const adminItems = useMemo(() => {
    const groupLabel = Object.fromEntries(ADMIN_GROUPS.map((g) => [g.id, t(g.labelKey)]));
    return ADMIN_NAV
      .filter((n) => isAdmin || capTabs.includes(n.capKey ?? n.id))
      .map((n) => {
        const label = t(n.labelKey);
        return {
          id: `a:${n.id}`, kind: "admin", to: `/admin/upload?tab=${n.id}`, Icon: n.Icon, label, sort: label,
          sub: `${t("nav.admin")} · ${groupLabel[n.group] || ""}`, danger: n.danger,
          terms: [searchFold(label), searchFold(n.id), searchFold(t(n.descKey))],
        };
      });
  }, [t, isAdmin, capTabs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const entity = useMemo(() => {
    const d = idx.data;
    if (!d) return { cells: [], units: [], leaders: [] };
    const cells = (d.cells || []).map((c) => ({
      id: `c:${c.id}`, kind: "cell", to: `/cells/${c.id}`, Icon: Grid3x3,
      label: c.code, group: c.group, sort: c.code,
      sub: [c.leader ? tl(c.leader) : t("search.noLeader"), c.unit ? tl(c.unit) : null].filter(Boolean).join(" · "),
      terms: [searchFold(c.code), searchFold(c.sap), searchFold(c.leader), searchFold(c.unit),
        ...(c.names || []).map(searchFold)],
    }));
    const units = seeUnits ? (d.units || []).map((u) => ({
      id: `u:${u.id}`, kind: "unit", to: `/brigadir/${u.id}`, Icon: UsersRound,
      label: tl(u.name), sort: u.name,
      sub: u.shift ? t("search.shift").replace("{n}", u.shift) : "",
      terms: [searchFold(u.name), ...(u.aliases || []).map(searchFold)],
    })) : [];
    const leaders = (d.leaders || [])
      .map((l) => {
        const to = manageProfiles ? `/profile/leader/${l.id}` : l.cells?.[0] ? `/cells/${l.cells[0].id}` : null;
        if (!to) return null;
        const codes = (l.cells || []).map((c) => c.code);
        return {
          id: `l:${l.id}`, kind: "leader", to, Icon: UserRound,
          label: tl(l.name), sort: l.name,
          sub: [l.unit ? tl(l.unit) : null, codes.length ? codes.join(", ") : null].filter(Boolean).join(" · "),
          terms: [searchFold(l.name), ...(l.names || []).map(searchFold), ...codes.map(searchFold)],
        };
      })
      .filter(Boolean);
    return { cells, units, leaders };
  }, [idx.data, tl, t, seeUnits, manageProfiles]);

  const folded = useMemo(() => searchFold(q), [q]);
  const groups = useMemo(() => {
    if (!folded) return [];
    // Kinds in their own order unless one matched better (a stable sort).
    return [
      { key: "pages", label: t("search.grp.pages"), ...rank(pageItems, folded, CAP.pages) },
      { key: "admin", label: t("search.grp.admin"), ...rank(adminItems, folded, CAP.admin) },
      { key: "cells", label: t("search.grp.cells"), ...rank(entity.cells, folded, CAP.cells) },
      { key: "units", label: t("search.grp.units"), ...rank(entity.units, folded, CAP.units) },
      { key: "leaders", label: t("search.grp.leaders"), ...rank(entity.leaders, folded, CAP.leaders) },
    ].filter((g) => g.items.length).sort((a, b) => b.top - a.top);
  }, [folded, pageItems, adminItems, entity, t]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const loadingIndex = Boolean(folded) && used && idx.isPending;
  const failedIndex = Boolean(folded) && idx.isError && !idx.data;

  // A new query starts at the top result.
  useEffect(() => { setActive(0); }, [folded]);
  // Keep the active row in view while the arrows walk the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Ctrl/⌘ K anywhere, «/» when nobody is typing — never over a dialog. The
  // header's box only: the drawer's is not on screen until somebody opens it.
  useEffect(() => {
    if (drawer) return undefined;
    const onKey = (e) => {
      if (hasOpenDialog()) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
      if (combo || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    onPick?.();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (open && q) { setQ(""); return; }
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!flat.length) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % flat.length : (a - 1 + flat.length) % flat.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const uid = useId();
  const listId = `gs-list-${uid}`;
  const kbd = (
    <kbd className="hidden xl:inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
      {IS_MAC ? "⌘K" : "Ctrl K"}
    </kbd>
  );

  let n = -1; // running index across groups, for ↑↓ and aria-activedescendant
  return (
    <div ref={boxRef} className={`relative w-full min-w-0 ${drawer ? "" : "max-w-[440px]"}`}>
      <SearchInput
        ref={inputRef}
        value={q}
        onChange={(v) => { setQ(v); setOpen(true); setUsed(true); }}
        onFocus={() => { setOpen(true); setUsed(true); }}
        onClick={() => setOpen(true)}
        // Tab moves focus on: the list goes with it. A press inside the list
        // never blurs (its mousedown is prevented below).
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={wide && !drawer ? t("search.placeholder") : t("search.short")}
        clearLabel={t("search.clear")}
        hint={drawer ? null : kbd}
        inputClassName={drawer ? "text-base pl-8 pr-8 py-2" : "text-sm pl-8 pr-14 py-1.5"}
        role="combobox"
        aria-label={t("search.aria")}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && flat[active] ? `${listId}-${flat[active].id}` : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
      />

      {open && (
        <div
          // Keeps the input focused through a press anywhere in the list —
          // its scrollbar included — so a press there never closes it.
          onMouseDown={(e) => e.preventDefault()}
          className={`absolute left-0 top-full mt-1.5 z-[45] w-full rounded-xl overflow-hidden ${drawer ? "" : "min-w-[380px]"}`}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)",
                   boxShadow: "0 12px 32px rgba(0,0,0,0.28)" }}
        >
          <div ref={listRef} id={listId} role="listbox" aria-label={t("search.aria")}
            className="overflow-y-auto overscroll-contain py-1"
            style={{ maxHeight: drawer ? "calc(100dvh - 9rem - var(--tg-safe-top, 0px) - var(--tg-safe-bottom, 0px))" : "min(70vh, 520px)" }}>
            {!folded && (
              <p className="px-3 py-3 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
                {t("search.hint")}
              </p>
            )}

            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label} className="pb-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-3)" }}>
                  {g.label}
                </div>
                {g.items.map((it) => {
                  n += 1;
                  const i = n;
                  const on = i === active;
                  const Icon = it.Icon || Settings2;
                  return (
                    <div
                      key={it.id}
                      id={`${listId}-${it.id}`}
                      data-idx={i}
                      role="option"
                      aria-selected={on}
                      // Opens on the CLICK: the list's mousedown is prevented,
                      // so the input keeps focus and the list stays up until
                      // the click lands here. Opening on mousedown let the
                      // release land on whatever the closing list uncovered.
                      onClick={() => go(it)}
                      onMouseMove={() => { if (!on) setActive(i); }}
                      className={`mx-1 flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer ${drawer ? "min-h-[44px]" : ""}`}
                      style={{ background: on ? "var(--bg-inner)" : "transparent" }}
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                                 color: it.danger ? "#ef4444" : on ? "var(--brand-text)" : "var(--text-2)" }}>
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`truncate text-sm ${it.kind === "cell" ? "font-semibold tabular-nums" : "font-medium"}`}
                            style={{ color: "var(--text-1)" }}>
                            {it.label}
                          </span>
                          {it.kind === "cell" && <GroupBadge group={it.group} />}
                        </span>
                        {it.sub && (
                          <span className="block truncate text-xs" style={{ color: "var(--text-3)" }}>{it.sub}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {loadingIndex && (
              <div className="px-3 py-2 space-y-2" aria-hidden="true">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-7 w-full" />
                <SkeletonBlock className="h-7 w-5/6" />
              </div>
            )}

            {failedIndex && (
              <p className="px-3 py-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
                {t("search.loadFailed")}
              </p>
            )}

            {folded && !flat.length && !loadingIndex && (
              <p className="px-3 py-3 text-sm" style={{ color: "var(--text-3)" }}>
                {t("search.empty").replace("{q}", q.trim())}
              </p>
            )}
          </div>

          {flat.length > 0 && (
            <div className="hidden md:block px-3 py-1.5 text-[11px]"
              style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
              {t("search.keys")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
