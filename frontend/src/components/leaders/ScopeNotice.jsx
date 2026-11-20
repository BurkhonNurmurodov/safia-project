import { Filter } from "lucide-react";
import Button from "../ui/Button";
import { useLang } from "../../context/LangContext";

/**
 * «N ta yozuv sahifa filtrlaridan tashqarida» — the honesty line under a list
 * that the PAGE-level scope bar narrowed.
 *
 * The scope bar sits above the tabs and drives every tab, which is what makes
 * it worth having: one place to say which days, which shift, whose rows. The
 * cost of one scope over several surfaces is that a filter picked for the
 * dashboard can hide work on a queue — a decision waiting on this admin, a
 * mis-dated day an admin came here to delete. Those are exactly the rows
 * somebody opened the tab FOR, and a list that drops them silently reads as
 * "nothing to do", which is the one wrong answer.
 *
 * So every scoped list prints what it is not showing, and hands back the
 * control that caused it. Amber whenever the hidden rows include work that
 * needs THIS viewer; plain otherwise, because "12 older days are out of
 * period" is information, not a warning.
 */

const TXT = {
  uz: {
    hidden: "{n} ta yozuv sahifa filtrlaridan tashqarida.",
    todo: "Ulardan {k} tasi sizning javobingizni kutmoqda.",
    showAll: "Barchasini ko'rsatish",
    shown: "Sahifa filtrlaridan tashqaridagi {n} ta yozuv ham ko'rsatilmoqda.",
    back: "Filtrga qaytish",
  },
  uz_cyrl: {
    hidden: "{n} та ёзув саҳифа филтрларидан ташқарида.",
    todo: "Улардан {k} таси сизнинг жавобингизни кутмоқда.",
    showAll: "Барчасини кўрсатиш",
    shown: "Саҳифа филтрларидан ташқаридаги {n} та ёзув ҳам кўрсатилмоқда.",
    back: "Филтрга қайтиш",
  },
  ru: {
    hidden: "{n} записей вне фильтров страницы.",
    todo: "Из них {k} ждут вашего решения.",
    showAll: "Показать все",
    shown: "Показаны и {n} записей вне фильтров страницы.",
    back: "Вернуть фильтр",
  },
  en: {
    hidden: "{n} records fall outside the page filters.",
    todo: "{k} of them are waiting on you.",
    showAll: "Show all",
    shown: "{n} records outside the page filters are shown too.",
    back: "Back to the filters",
  },
};

const C_WAIT = "#eab308";

/* `showing` (2026-11-20): the list has set the page scope aside and lists the
 * `hidden` rows too — said in the same place and the same shape, with the way
 * back (`onBack`) where «show all» was, so nothing under it moves. A list that
 * passes `showing` handles «show all» itself (`onClear`) instead of clearing
 * the PAGE's period and filters, which reached every other tab unannounced. */
export default function ScopeNotice({ hidden = 0, todo = 0, onClear, showing = false, onBack }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  if (!hidden) return null;

  const warn = todo > 0 && !showing;
  return (
    <div
      className="rounded-2xl px-3 py-2 mb-3 flex items-center gap-2 flex-wrap text-xs"
      style={{
        background: warn ? "rgba(234,179,8,0.10)" : "var(--bg-card)",
        border: `1px solid ${warn ? "rgba(234,179,8,0.35)" : "var(--border)"}`,
        color: "var(--text-3)",
      }}
    >
      <Filter size={13} className="flex-shrink-0" style={{ color: warn ? C_WAIT : "var(--text-4)" }} />
      <span>{(showing ? T.shown : T.hidden).replace("{n}", hidden)}</span>
      {warn && (
        <span className="font-semibold" style={{ color: C_WAIT }}>
          {T.todo.replace("{k}", todo)}
        </span>
      )}
      {showing ? (onBack && (
        <Button size="sm" variant="secondary" tint className="ml-auto max-md:min-h-[44px]" onClick={onBack}>
          {T.back}
        </Button>
      )) : onClear && (
        <Button size="sm" variant="secondary" tint className="ml-auto max-md:min-h-[44px]" onClick={onClear}>
          {T.showAll}
        </Button>
      )}
    </div>
  );
}
