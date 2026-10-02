import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronRight, CircleDot, Megaphone } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import {
  CATEGORY_ICON, TONE_INK, displayBody, entryTitle, fmt, fmtDate, nameList, timeAgo,
} from "./notifMeta";
import { IconChip, StatusChip, UnreadDot } from "./NotifParts";

const ROW = "flex gap-3 px-4 py-3 sm:py-2.5 w-full text-left transition-colors hover:bg-[var(--bg-inner)] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2";

/**
 * One line of the feed. Three shapes (services/notification_center.fold):
 *   single — one row; opens its record, or unfolds its full text when it has none
 *   thread — every update about one record; opens the record, says how many
 *   group  — one kind's burst on one day («Kun yopildi: 18 ta bo'lim»);
 *            unfolds into its rows, and a «kun yopildi» line says live which
 *            units are still open
 * Reading is per PERSON on the server: opening or unfolding a line marks every
 * row inside it read (`onRead`).
 */
export default function FeedEntry({ entry, unread, onRead, onOpen }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICON[entry.category] || Megaphone;
  const ink = TONE_INK[entry.type];
  const title = entryTitle(entry);
  const body = displayBody(entry.body);
  const isGroup = entry.kind === "group";
  const markRead = () => { if (unread) onRead?.(entry.ids); };

  const meta = [timeAgo(entry.at, t)];
  if (entry.kind === "thread" && entry.count > 1) meta.push(fmt(t("notif.updates"), { n: entry.count }));
  if (isGroup && entry.sum) meta.push(fmt(t("notif.peopleSum"), { n: entry.sum }));

  const openUnits = Array.isArray(entry.open_units) ? entry.open_units : null;

  const content = (
    <>
      <UnreadDot on={unread} label={t("notif.stateUnread")} />
      <IconChip Icon={Icon} ink={ink} />
      <span className="flex-1 min-w-0 block">
        <span className={`block text-sm sm:text-[13px] leading-snug ${unread ? "font-semibold" : "font-normal"}`}
          style={{ color: "var(--text-1)" }}>
          {title}
        </span>
        {isGroup ? (
          <>
            {entry.names?.length > 0 && (
              <span className="block text-[13px] sm:text-xs mt-0.5 leading-snug" style={{ color: "var(--text-2)" }}>
                {nameList(entry.names, { t, tl, tx, people: entry.names_kind !== "text" })}
              </span>
            )}
            {openUnits && (
              <span className="block mt-1.5">
                {/* Live, and about ONE day — the one most of these closes were
                    for — so the chip names it. */}
                {openUnits.length > 0
                  ? <StatusChip tone="warn" icon={CircleDot}>{fmtDate(entry.open_for)}: {fmt(t("notif.stillOpen"), { n: openUnits.length })}</StatusChip>
                  : <StatusChip tone="ok" icon={CheckCircle2}>{fmtDate(entry.open_for)}: {t("notif.allClosed")}</StatusChip>}
              </span>
            )}
          </>
        ) : body ? (
          // `line-clamp-*` IS a display (-webkit-box): pairing it with
          // `block` cancels the clamp, so the two never share a class list.
          <span className={`text-[13px] sm:text-xs mt-0.5 leading-snug whitespace-pre-line ${expanded ? "block" : "line-clamp-2"}`}
            style={{ color: "var(--text-2)" }}>
            {body}
          </span>
        ) : null}
        <span className="block text-xs mt-1" style={{ color: "var(--text-3)" }}>
          {meta.filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );

  // A record to open — a link, keyboard- and middle-click-correct.
  if (!isGroup && entry.link) {
    return (
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <Link to={entry.link} className={ROW} style={{ outlineColor: "var(--brand)" }}
          onClick={() => { markRead(); onOpen?.(); }}>
          {content}
          <ChevronRight size={16} className="flex-shrink-0 mt-2" style={{ color: "var(--text-4)" }} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  // Nothing to open: the line unfolds instead — a group into its rows, a long
  // row into its whole text — so no row is ever a dead end.
  const canUnfold = isGroup || body.length > 90 || body.includes("\n");
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button type="button" className={ROW} style={{ outlineColor: "var(--brand)" }}
        aria-expanded={canUnfold ? expanded : undefined}
        onClick={() => { markRead(); if (canUnfold) setExpanded((v) => !v); }}>
        {content}
        {canUnfold && (
          <ChevronDown size={16} className="flex-shrink-0 mt-2 transition-transform"
            style={{ color: "var(--text-4)", transform: expanded ? "rotate(180deg)" : "none" }} aria-hidden="true" />
        )}
      </button>
      {isGroup && expanded && (
        <div className="pb-2" style={{ paddingLeft: 60 }}>
          {openUnits?.length > 0 && (
            <p className="text-xs pr-4 pb-2" style={{ color: "var(--status-warn)" }}>
              {t("notif.openUnits")}: {openUnits.map((n) => tl(n)).join(", ")}
            </p>
          )}
          {(entry.items || []).map((it) => {
            const inner = (
              <>
                <span className="block text-[13px] leading-snug" style={{ color: "var(--text-1)" }}>{it.title}</span>
                {it.body && (
                  <span className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--text-2)" }}>
                    {displayBody(it.body)}
                  </span>
                )}
                <span className="block text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{timeAgo(it.at, t)}</span>
              </>
            );
            return it.link ? (
              <Link key={it.id} to={it.link} onClick={() => onOpen?.()}
                className="block pr-4 py-2 hover:underline underline-offset-2"
                style={{ borderTop: "1px dashed var(--border)" }}>
                {inner}
              </Link>
            ) : (
              <div key={it.id} className="pr-4 py-2" style={{ borderTop: "1px dashed var(--border)" }}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
