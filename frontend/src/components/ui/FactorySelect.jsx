import { Factory } from "lucide-react";
import StyledSelect from "./StyledSelect";
import { PickFilter } from "./ColumnFilter";
import { useLang } from "../../context/LangContext";
import { useFactory, factoryName } from "../../context/FactoryContext";

/**
 * useFactorySection — the plant switcher as a <FilterPanel> section, for pages
 * whose toolbar consolidates every scope control into the one-row filter bar.
 * Returns null when the platform has fewer than two factories (no chrome at
 * all), and a `static` chip section for locked viewers (supervisor / leader):
 * their plant stays readable in the bar, but there is no control to imply a
 * choice the server would overrule. «All factories» is the FIRST option.
 */
export function useFactorySection() {
  const { t, lang } = useLang();
  const { factories, factory, setFactory, locked, allTab, enabled, current } = useFactory();
  if (!enabled) return null;
  const nameOf = (f) => factoryName(f, lang) || f.code;
  if (locked) {
    return {
      key: "factory", icon: Factory, static: true,
      label: t("factory.label"), display: current ? nameOf(current) : "—",
    };
  }
  const opts = [
    ...(allTab ? [{ value: "__all__", label: t("factory.all"), title: t("factory.all") }] : []),
    ...factories.map((f) => ({ value: f.id, label: nameOf(f) })),
  ];
  return {
    key: "factory", icon: Factory, label: t("factory.label"),
    active: factory != null,
    display: current ? nameOf(current) : "",
    onClear: allTab ? () => setFactory(null) : undefined,
    render: ({ close } = {}) => (
      <PickFilter
        opts={opts}
        value={factory == null ? "__all__" : factory}
        onChange={(v) => setFactory(v === "__all__" ? null : v)}
        close={close}
      />
    ),
  };
}

/**
 * FactorySelect — the plant switcher for the six factory-aware pages
 * (Overview, Zagruzka, Ojidaniya, Workers, Quality, Concerns).
 *
 * It is a DROPDOWN sitting in the page's normal filter row, first control on
 * the line — not a band of its own above the toolbar (the earlier
 * `FactoryTabs`). Two reasons the selector wins:
 *
 *   • The strip cost a whole horizontal band on every one of the six pages,
 *     on a platform whose primary device is a phone. A dropdown is one
 *     toolbar cell, and it stays one cell no matter how many plants the
 *     company opens — a pill strip grows until it has to scroll, and a
 *     scrolled strip can hide the very tab that is selected.
 *   • Everything else that narrows what these pages show — period, shift,
 *     supervisor — is already a control on that row, sized and aligned to the
 *     38px toolbar baseline. Putting the plant beside them means one place to
 *     look, one row to scan, and no second control zone to keep in sync.
 *
 * It stays the FIRST control in the row: the plant is the broadest narrowing
 * on the page, so left-to-right reads plant → period → shift → supervisor.
 *
 * It renders NOTHING when the platform has fewer than two factories: a
 * single-plant company gets exactly the app it had before this feature.
 *
 * A locked viewer (supervisor / leader — see services/factory_scope.py) gets a
 * static chip with the same footprint in the same cell, so the row does not
 * change shape between roles and a supervisor still always knows which plant
 * they are reading. Never a one-option dropdown: that implies a choice the
 * server would overrule.
 *
 * Props:
 *   label            – render the uppercase field label above the control
 *                      (default true). Pass false on toolbars whose controls
 *                      carry no labels (Quality) — the trigger then grows a
 *                      Factory icon so it still names itself.
 *   labelClassName   – display classes for that label; `hidden sm:block` on
 *                      rows that drop their labels on phones (Concerns).
 *   className        – width/flex classes for the cell, to match its siblings.
 *   triggerClassName – size/spacing passthrough to `StyledSelect`.
 */
export default function FactorySelect({
  label = true,
  labelClassName = "block",
  className = "sm:w-52 min-w-0",
  triggerClassName = "px-3 py-2 text-sm",
}) {
  const { t, lang } = useLang();
  const { factories, factory, setFactory, locked, allTab, enabled, current } = useFactory();

  if (!enabled) return null;

  const nameOf = (f) => factoryName(f, lang) || f.code;

  // Unlabelled rows have nothing else to say what this control is, so the
  // options carry the icon. Labelled rows already have the noun above them —
  // repeating it inside every row would just be noise.
  const deco = (text) =>
    label ? (
      text
    ) : (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Factory size={13} style={{ flexShrink: 0, color: "var(--brand-text)" }} />
        <span className="truncate">{text}</span>
      </span>
    );

  // «All factories» is FIRST: it is the widest scope in the list, so the
  // options read top-down from "everything" down to a single plant, the same
  // broad→narrow direction the toolbar itself reads left→right.
  const options = [
    ...(allTab
      ? [{ value: "__all__", label: deco(t("factory.all")), title: t("factory.allHint") }]
      : []),
    ...factories.map((f) => ({ value: f.id, label: deco(nameOf(f)), title: nameOf(f) })),
  ];

  return (
    <div className={className}>
      {label && (
        <label
          className={`${labelClassName} text-[10px] uppercase tracking-wider font-semibold mb-1`}
          style={{ color: "var(--text-4)" }}
        >
          {t("factory.label")}
        </label>
      )}

      {locked ? (
        // Same box, same height as the dropdown it replaces — minus the
        // chevron, which is the only honest way to show a value that cannot
        // be changed.
        <div
          className={`w-full flex items-center gap-2 rounded-lg ${triggerClassName}`}
          style={{
            background: "var(--bg-inner)",
            border: "1px solid var(--border-md)",
            color: "var(--text-1)",
          }}
          title={current?.code || ""}
        >
          <Factory size={13} style={{ flexShrink: 0, color: "var(--brand-text)" }} />
          <span className="truncate min-w-0 font-medium">
            {current ? nameOf(current) : "—"}
          </span>
        </div>
      ) : (
        <StyledSelect
          value={factory == null ? "__all__" : factory}
          onChange={(v) => setFactory(v === "__all__" ? null : v)}
          options={options}
          triggerClassName={triggerClassName}
        />
      )}
    </div>
  );
}
