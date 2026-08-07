import { Factory } from "lucide-react";
import SegmentedToggle from "./SegmentedToggle";
import { useLang } from "../../context/LangContext";
import { useFactory, factoryName } from "../../context/FactoryContext";

/**
 * FactoryTabs — the plant switcher that sits at the top of every
 * factory-aware page (Overview, Zagruzka, Ojidaniya, Workers, Quality,
 * Concerns).
 *
 * THE design problem this solves: these pages already carry a dense toolbar of
 * period · shift · supervisor · view toggles, several of which are themselves
 * SegmentedToggles. Dropping one more pill strip into that row would make the
 * factory look like a peer of "min/hrs" — a formatting preference. It isn't. A
 * factory is the SUBJECT of the page; everything in the toolbar is a way of
 * slicing that subject. So the strip is lifted out of the toolbar entirely and
 * given the rank it has:
 *
 *   • It is full-bleed (negative margins cancel the content padding) and closed
 *     with a hairline rule, so it reads as a band above the page rather than a
 *     control inside it — the same move a breadcrumb makes.
 *   • It is labelled with a noun ("Zavod") beside an icon. Two identical pill
 *     strips stacked vertically are ambiguous no matter how they are styled;
 *     naming the superior one removes the ambiguity outright.
 *   • It is always the first thing under the title, on every one of the six
 *     pages, so "which plant am I reading" is answered in the same place every
 *     time and is never scrolled past on a phone.
 *
 * It renders NOTHING when the platform has fewer than two factories: a
 * single-plant company gets exactly the app it had before this feature.
 *
 * A locked viewer (supervisor / leader) gets the identical band with a static
 * chip in place of the toggle — same position, same label, so the page's
 * structure does not change shape between roles and a supervisor still always
 * knows which plant they are looking at.
 */
export default function FactoryTabs({ className = "" }) {
  const { t, lang } = useLang();
  const { factories, factory, setFactory, locked, allTab, enabled, current } = useFactory();

  if (!enabled) return null;

  // «All factories» is the LAST tab: the plants are the subject, the roll-up is
  // the summary you fall back to — putting it first would make every page open
  // by reading as "everything", which is the view this feature exists to split.
  const options = [
    ...factories.map((f) => ({
      value: f.id,
      label: factoryName(f, lang) || f.code,
      title: f.code,
    })),
    ...(allTab ? [{ value: "__all__", label: t("factory.all"), title: t("factory.allHint") }] : []),
  ];

  return (
    <div
      className={`-mx-4 md:-mx-6 px-4 md:px-6 pb-2.5 mb-4 ${className}`}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: 26, height: 26,
            background: "color-mix(in srgb, var(--brand) 12%, transparent)",
            color: "var(--brand)",
          }}
        >
          <Factory size={14} />
        </span>
        <span
          className="text-[10px] uppercase tracking-wider font-semibold flex-shrink-0"
          style={{ color: "var(--text-4)" }}
        >
          {t("factory.label")}
        </span>

        {locked ? (
          // No switcher — but the same band, so the answer to "which plant" is
          // in the place it is on every other screen. A one-option toggle would
          // imply a choice the server would overrule.
          <span
            className="text-sm font-semibold truncate px-2.5 py-1 rounded-lg"
            style={{
              color: "var(--text-1)",
              background: "var(--bg-inner)",
              border: "1px solid var(--border)",
            }}
            title={current?.code || ""}
          >
            {current ? (factoryName(current, lang) || current.code) : "—"}
          </span>
        ) : (
          <SegmentedToggle
            value={factory == null ? "__all__" : factory}
            onChange={(v) => setFactory(v === "__all__" ? null : v)}
            options={options}
            // The option set grows with the company; `scrollable` keeps the
            // SELECTED tab on screen instead of leaving the strip looking as
            // though nothing is chosen.
            scrollable
            asTabs
            ariaLabel={t("factory.label")}
            // Phone: take the rest of the row and let the track scroll inside
            // it. sm+: shrink-wrap to the labels (a half-empty full-width track
            // reads as a broken control), but still allowed to shrink — hence
            // flex-initial rather than flex-none — so a long list of plants
            // scrolls instead of pushing the row wider than the page.
            className="flex-1 min-w-0 sm:flex-initial"
          />
        )}
      </div>
    </div>
  );
}
