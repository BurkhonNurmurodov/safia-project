import { useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import LangTextInput from "../ui/LangTextInput";
import Modal from "../ui/Modal";
import StyledSelect from "../ui/StyledSelect";
import { useMarkDraft } from "../ui/dialogLayers";
import { useLang } from "../../context/LangContext";
import { APP_HUES, APP_ICONS, DEFAULT_APP_ICON, DEFAULT_TAB_ICON } from "../../config/appIcons";
import { builtinApp, builtinTab, labelText, navName } from "../../utils/navLayout";
import { addApp, addTab, editApp, editTab, removeApp } from "../../utils/navLayoutEdit";
import { appNodeId, tabNodeId } from "../../utils/orgTree";
import { fill } from "../../pages/admin/orgChartText";

/**
 * «Tashkiliy tuzilma», the «Ilovalar» view — its two dialogs.
 *
 * `NavFormModal`: the name (four languages), icon and — for an app — tile
 * colour of an app or a menu tab, new or existing. One the code ships keeps
 * its own name and icon wherever a field is left as it was. `RemoveAppModal`:
 * an app goes, and what it held moves to the app picked here.
 *
 * Both only change the page's draft; nothing is sent before «Saqlash».
 */

// One cell of the icon / colour pickers. `aria-pressed` is the selection.
function Pick({ on, title, onClick, round = false, children, hue }) {
  return (
    <button
      type="button" aria-pressed={on} title={title} aria-label={title} onClick={onClick}
      data-app-hue={hue}
      className={`grid place-items-center w-9 h-9 flex-shrink-0 ${round ? "rounded-full" : "rounded-lg"}`}
      style={{
        color: on ? "var(--brand-text)" : "var(--text-2)",
        background: on ? "var(--brand-bg)" : "var(--bg-inner)",
        border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`,
        boxShadow: on ? "0 0 0 1px var(--brand)" : "none",
      }}
    >
      {children}
    </button>
  );
}

export function NavFormModal({ spec, ed, A, onClose, onDone }) {
  const { t, lang } = useLang();
  const markDraft = useMarkDraft();
  const isApp = spec.kind === "app";
  const cur = isApp ? spec.app : spec.tab;                       // undefined → a new one
  const def = cur ? (isApp ? builtinApp(cur.id) : builtinTab(cur.id)) : null;
  const FallbackIcon = def?.icon ?? (isApp ? DEFAULT_APP_ICON : DEFAULT_TAB_ICON);
  const defHue = def?.hue ?? "slate";

  const [label, setLabel] = useState(() => ({ ...(cur?.label || {}) }));
  const [icon, setIcon] = useState(cur?.iconName ?? null);       // null → the code's own / the default
  const [hue, setHue] = useState(cur?.hueName ?? (cur ? null : "teal"));
  const [tried, setTried] = useState(false);

  const named = Object.values(label).some((v) => String(v || "").trim());
  const nameMissing = !def && !named;                            // one the code ships keeps its own
  const Icon = (icon && APP_ICONS[icon]) || FallbackIcon;
  const shownHue = hue ?? defHue;
  const shownName = labelText(label, lang) || (def ? t(def.labelKey) : A.namePh);

  const submit = () => {
    if (nameMissing) { setTried(true); return; }
    const look = { label, icon, hue: isApp ? hue : undefined };
    if (isApp) {
      if (cur) { ed.apply(editApp(ed.cur, cur.id, look)); onDone(appNodeId(cur.id)); return; }
      const [next, id] = addApp(ed.cur, look);
      ed.apply(next);
      onDone(appNodeId(id));
      return;
    }
    if (cur) { ed.apply(editTab(ed.cur, cur.id, look)); onDone(null); return; }
    const [next, id] = addTab(ed.cur, spec.appId, look);
    ed.apply(next);
    onDone(id ? tabNodeId(spec.appId, { id }) : null);
  };

  const title = isApp ? (cur ? A.formEditApp : A.formNewApp) : (cur ? A.formEditTab : A.formNewTab);
  return (
    <Modal
      open onClose={onClose} title={title} zIndex={60}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{A.cancel}</Button>
          <Button variant="primary" onClick={submit}>{cur ? A.apply : A.create}</Button>
        </>
      )}
    >
      {/* What it will look like — the launcher's tile colour, the sidebar's name. */}
      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <span
          data-app-hue={isApp ? shownHue : undefined}
          className="grid place-items-center w-11 h-11 rounded-xl flex-shrink-0"
          style={isApp
            ? { color: "rgb(var(--hue))", background: "rgba(var(--hue), .16)" }
            : { color: "var(--text-2)", background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold" style={{ color: named || def ? "var(--text-1)" : "var(--text-3)" }}>
          {shownName}
        </span>
      </div>

      <FormField
        label={A.name} required={!def}
        hint={def ? A.nameKeep : undefined}
        error={tried && nameMissing ? A.nameNeeded : undefined}
      >
        <LangTextInput
          value={label} autoFocus={!cur}
          onChange={(l, text) => setLabel((v) => ({ ...v, [l]: text }))}
          placeholder={def ? t(def.labelKey) : A.namePh}
        />
      </FormField>

      <FormField label={A.icon}>
        <div className="flex flex-wrap gap-1.5 max-h-[172px] overflow-y-auto pr-1" role="group" aria-label={A.icon}>
          {def && (
            <Pick on={!icon} title={A.iconOwn} onClick={() => { setIcon(null); markDraft(); }}>
              <FallbackIcon size={17} aria-hidden="true" />
            </Pick>
          )}
          {Object.entries(APP_ICONS).map(([name, I]) => (
            <Pick
              key={name} title={name}
              on={icon === name || (!def && !icon && I === FallbackIcon)}
              onClick={() => { setIcon(name); markDraft(); }}
            >
              <I size={17} aria-hidden="true" />
            </Pick>
          ))}
        </div>
      </FormField>

      {isApp && (
        <FormField label={A.colour}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={A.colour}>
            {APP_HUES.map((h) => (
              <Pick key={h} round hue={h} title={h} on={shownHue === h} onClick={() => { setHue(def && h === defHue ? null : h); markDraft(); }}>
                <span className="w-5 h-5 rounded-full" style={{ background: "rgb(var(--glow))" }} />
              </Pick>
            ))}
          </div>
        </FormField>
      )}
    </Modal>
  );
}

export function RemoveAppModal({ app, ed, A, onClose, onDone }) {
  const { t, lang } = useLang();
  const name = navName(app, t, lang);
  const screens = app.links.length;
  const tabs = app.tabs.length - 1;
  const holds = screens + tabs > 0;
  const [to, setTo] = useState("");

  const remove = () => {
    ed.apply(removeApp(ed.cur, app.id, to || null));
    onDone(to ? appNodeId(to) : "root");
  };

  return (
    <Modal
      open onClose={onClose} zIndex={60} maxWidth="max-w-md"
      title={fill(A.removeAppTitle, { name })}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{A.cancel}</Button>
          <Button variant="danger" icon={<Trash2 size={14} />} disabled={holds && !to} onClick={remove}>{A.remove}</Button>
        </>
      )}
    >
      <p className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>
        {holds ? fill(A.removeAppHolds, { n: screens, m: tabs }) : A.removeAppEmpty}
      </p>
      {holds && (
        <FormField label={A.removeAppTo} required>
          <StyledSelect
            searchable ariaLabel={A.removeAppTo} placeholder={A.removeAppPick} value={to}
            options={ed.layout.apps.filter((a) => a.id !== app.id).map((a) => ({ value: a.id, label: navName(a, t, lang) }))}
            onChange={(v) => setTo(v || "")}
          />
        </FormField>
      )}
      <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{A.draftNote}</p>
    </Modal>
  );
}
