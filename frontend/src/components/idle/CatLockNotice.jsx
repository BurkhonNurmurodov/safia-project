// ── «you are seeing only your own categories» ───────────────────────────────
// A «Kutish mas'uli» reads /downtime and /idle-cell narrowed to the ojidaniya
// categories they own (services/idle_scope, applied on the server). This says
// so, on both pages, in one place.
//
// It is not decoration. A register showing a FRACTION of a day without saying
// so reads as a quiet shift — the reader has no way to tell «this cause was
// calm» from «the other causes are not being shown to me», and those are
// opposite conclusions about the same screen. Every other narrowing on these
// pages is a control the reader set themselves and can see; this one is not.
//
// `cats` comes off the payload (`cat_locked`), never from the viewer's role:
// the server decided the scope, and a second derivation here is how the words
// and the numbers under them would come to describe two different things.
import { ShieldQuestion } from "lucide-react";
import { CATS, catColor, iconFor } from "./categories";
import { useLang } from "../../context/LangContext";

export default function CatLockNotice({ cats }) {
  const { t } = useLang();
  if (!Array.isArray(cats) || !cats.length) return null;

  return (
    <div
      className="rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      <ShieldQuestion size={14} className="shrink-0" style={{ color: "var(--brand-text)" }} />
      <span className="text-[11.5px]" style={{ color: "var(--text-2)" }}>
        {t("downtime.catLocked")}
      </span>
      {cats.map((name) => {
        const code = CATS.find((c) => c.name === name)?.code
          || String(name).replace(/^Cat\s*/i, "");
        const hue = catColor(name);
        const Icon = iconFor(code);
        return (
          <span
            key={name}
            title={t(`downtime.cat.${code}.label`)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-bold shrink-0"
            style={{ background: `${hue}22`, color: hue, border: `1px solid ${hue}55` }}
          >
            <Icon size={11} strokeWidth={2.2} />
            {code}
            <span className="font-normal opacity-85 hidden sm:inline">
              · {t(`downtime.cat.${code}.label`)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
