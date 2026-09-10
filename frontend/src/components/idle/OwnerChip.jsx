// ── WHO answers for an ojidaniya category ────────────────────────────────────
// From 2026-09-10 every waiting category has one named person responsible for
// driving it down («Kutish mas'uli»). This is the ONE way that name is drawn,
// so the «Xarajat» tree, the «Toifalar bo'yicha» matrix and the owner's own
// page cannot show it three different ways.
//
// It is a NAME, not a status: no traffic light, no tint of its own. The chip
// borrows the category's own hue where it sits on a coloured row so it reads as
// part of that row, and stays muted otherwise.
//
// A category with NOBODY assigned renders nothing at all — never «—» and never
// an empty chip. Twelve categories with two owners between them would otherwise
// grow ten placeholders that say only that the register is unfinished, which is
// a fact for the admin destination that manages it, not for every reader of
// every table. (The WORKBOOKS do print «—», because a blank cell in a
// spreadsheet reads as «this column did not apply here».)
import { UserRound } from "lucide-react";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";

// `owners` is the payload's category → person map (services/idle_scope.owner_labels).
// `tl` is the platform's ONE rule for rendering a stored person's name in the
// viewer's alphabet (admin override → transliteration), so an owner's name is
// spelled here exactly as that same person's name is spelled everywhere else.
export function ownerName(owners, category, tl) {
  const o = (owners || {})[category];
  return o?.name ? tl(o.name) || o.name : "";
}

export default function OwnerChip({ owners, category, tint, size = "md", full = false }) {
  const { tl } = useTranslit();
  const name = ownerName(owners, category, tl);
  if (!name) return null;

  const label = full ? name : shortPerson(name);
  const sm = size === "sm";
  return (
    <span
      title={name}
      className={`inline-flex items-center gap-1 rounded-md shrink-0 ${
        sm ? "px-1 py-[1px] text-[10px]" : "px-1.5 py-0.5 text-[10.5px]"
      }`}
      style={{
        background: tint ? `${tint}18` : "var(--bg-inner)",
        color: tint || "var(--text-3)",
        border: `1px solid ${tint ? `${tint}44` : "var(--border)"}`,
      }}
    >
      <UserRound size={sm ? 10 : 11} className="shrink-0" strokeWidth={2.2} />
      <span className="truncate max-w-[130px]">{label}</span>
    </span>
  );
}
