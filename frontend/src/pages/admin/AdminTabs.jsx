import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import SegmentedToggle from "../../components/ui/SegmentedToggle";

/**
 * Two admin pages merged into one (2026-11-16): view tabs over the pages as
 * they were. `?t=<value>` is the open tab (what a retired page's address lands
 * on — RETIRED_ADMIN), else the one this device left open, else the first.
 *
 * A tab stays MOUNTED once it has been opened and is only hidden after that:
 * a page may hold an unsaved draft (the Verifix login), and a tab switch is
 * not a link the leave guard can ask about — unmounting would drop the draft
 * silently. Each tab's own one-line description sits under the toggle,
 * because the two halves are exactly the ones people mistake for each other.
 *
 * tabs: [{ value, labelKey, descKey, Page }]
 */
export default function AdminTabs({ id, tabs }) {
  const { t } = useLang();
  const [sp, setSp] = useSearchParams();
  const [saved, setSaved] = usePersistentState(`admin.${id}.tab`, tabs[0].value);
  const known = (v) => tabs.some((x) => x.value === v);
  const cur = known(sp.get("t")) ? sp.get("t") : known(saved) ? saved : tabs[0].value;

  // The tabs opened so far. The one on screen is always drawn; it is RECORDED
  // when the toggle leaves it, so it stays mounted from then on.
  const [seen, setSeen] = useState(() => new Set([cur]));
  const shown = seen.has(cur) ? seen : new Set(seen).add(cur);

  const pick = (v) => {
    setSeen((s) => new Set(s).add(cur).add(v));
    setSaved(v);
    const next = new URLSearchParams(sp);
    next.set("t", v);
    setSp(next, { replace: true });
  };
  const open = tabs.find((x) => x.value === cur);

  return (
    <div>
      <SegmentedToggle asTabs value={cur} onChange={pick}
        options={tabs.map((x) => [x.value, t(x.labelKey)])} />
      <p className="text-xs leading-snug mt-2 mb-4" style={{ color: "var(--text-3)", maxWidth: 760 }}>
        {t(open.descKey)}
      </p>
      {tabs.filter((x) => shown.has(x.value)).map(({ value, Page }) => (
        <div key={value} hidden={value !== cur}><Page /></div>
      ))}
    </div>
  );
}
