import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, ChevronRight, Headset, SearchX, ShieldAlert, UserRound, Users,
} from "lucide-react";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit, transliterate, convertFromUz } from "../utils/transliterate";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";

const tg = window.Telegram?.WebApp;

// The form is a search over every name in the plant now, so it needs the room —
// collapsed, the keyboard leaves barely two result rows visible. Vertical
// swipes stay disabled: the result list scrolls, and a swipe on it must not
// dismiss the app.
if (tg) {
  tg.expand?.();
  tg.disableVerticalSwipes?.();
}

const SUPPORT_URL  = "https://t.me/burkhon_n";
const MIN_QUERY    = 2;
const MAX_RESULTS  = 50;

const ROLE_TKEY = {
  "top-manager":   "login.chooseRole.top",
  "shift-manager": "login.chooseRole.shift",
  supervisor:      "login.chooseRole.sup",
  leader:          "login.chooseRole.leader",
  guest:           "login.chooseRole.guest",
};

// Guests type their own name — script must match the UI language (Latin for
// uz/en, Cyrillic for ru/uz_cyrl). Letters, apostrophes and hyphens only.
const LATIN_NAME_RE    = /^[A-Za-zʻʼ'’‘`\-\s]+$/;
const CYRILLIC_NAME_RE = /^[Ѐ-ӿʻʼ'’\-\s]+$/;

// One script-agnostic key per name, so a name typed in any of the four scripts
// matches the profile however it is spelled in the database. transliterate(…,
// "en") is the single target Latin and Uzbek-Cyrillic both converge on; the
// digraph folds below close the gaps it leaves — zh→j because Cyrillic ж
// becomes "zh" where Uzbek Latin writes j (Санжар vs Sanjar), and gh→g / kh→h
// because the Russian spelling drops ғ/ҳ/қ/ў (Ғулом → Гулом → "Gulom" against
// the canonical "Ghulom"). Folding only ever merges spellings, never splits
// them, so it can add a near-miss to the results but can never hide a match.
function fold(value) {
  if (!value) return "";
  return transliterate(String(value), "en")
    .toLowerCase()
    .replace(/[ʻʼ’‘`']/g, "")
    .replace(/shch/g, "sh")
    .replace(/zh/g, "j")
    .replace(/gh/g, "g")
    .replace(/kh/g, "h")
    .replace(/ts/g, "s")
    .replace(/\s+/g, " ")
    .trim();
}

// Same handler the sidebar's support link uses — Telegram refuses to open a
// t.me link through window.open on most platforms.
function openSupport() {
  if (tg?.openTelegramLink || tg?.openLink) {
    try {
      if (tg.platform === "macos") tg.openLink(SUPPORT_URL);
      else if (tg.openTelegramLink) tg.openTelegramLink(SUPPORT_URL);
      else tg.openLink(SUPPORT_URL);
      return;
    } catch (err) {
      console.error(err);
    }
  }
  window.open(SUPPORT_URL, "_blank");
}

const ROW_STYLE = { borderBottom: "1px solid var(--border)", color: "var(--text-1)" };

/* A single result / browse row: the name, then what claiming it would make the
   person. The role chip is the whole point — it answers, from the profile, the
   question the old form used to ask the user up front. Module scope on purpose:
   declared inside Login it would be a new component type on every keystroke and
   React would remount all fifty rows. */
function EntryRow({ entry, onPick, t, tl }) {
  const meta = [
    entry.supervisor ? tl(entry.supervisor) : null,
    entry.shift != null ? t("login.shiftN").replace("{n}", entry.shift) : null,
  ].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onPick(entry)}
      className="w-full text-left px-3.5 py-2.5 flex items-center gap-2 transition-colors"
      style={ROW_STYLE}
    >
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{tl(entry.name)}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
          >
            {t(ROLE_TKEY[entry.role])}
          </span>
          {entry.taken && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap"
              style={{ background: "rgba(234,179,8,0.14)", color: "#eab308" }}
            >
              {t("login.takenBadge")}
            </span>
          )}
        </span>
        {meta && (
          <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
            {meta}
          </span>
        )}
      </span>
      <ChevronRight size={15} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
    </button>
  );
}

export default function Login() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();

  const [step,      setStep]      = useState("find");   // "find" | "guest" | "confirm"
  const [query,     setQuery]     = useState("");
  const [browse,    setBrowse]    = useState(false);    // browsing by unit instead of searching
  const [unit,      setUnit]      = useState("");       // browse → chosen brigadir/unit
  const [picked,    setPicked]    = useState(null);     // the entry awaiting confirmation
  const [fullName,  setFullName]  = useState("");       // guest → typed name
  const [guestPid,  setGuestPid]  = useState(null);     // guest → re-claimed profile id
  const [guestList, setGuestList] = useState(false);    // guest → picker open
  const [options,   setOptions]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // One gated endpoint serves the whole catalogue. Keyboard-button launches
  // (the register flow — required for sendData) never receive initData, so the
  // bot signs the /login URL with ?rt= and we pass that instead; initData still
  // works for the other launch methods.
  function loadOptions() {
    setLoading(true);
    setLoadError(false);
    const rt = new URLSearchParams(window.location.search).get("rt") || "";
    api.post("/api/profiles/registration-options", {
      init_data: tg?.initData || "__dev__",
      ...(rt ? { reg_token: rt } : {}),
    })
      .then(r => setOptions(r.data))
      .catch(() => { setOptions(null); setLoadError(true); })
      .finally(() => setLoading(false));
  }
  useEffect(loadOptions, []);

  // The flat catalogue the search runs over. The legacy per-role lists are the
  // fallback for the seconds between a static-file swap and the backend
  // restart, when an older payload can still arrive.
  const entries = useMemo(() => {
    if (Array.isArray(options?.entries)) return options.entries;
    if (!options) return [];
    const sups = options.supervisors ?? [];
    const shiftOf = name => sups.find(s => s.name === name)?.shift ?? null;
    return [
      ...sups.map(s => ({
        key: `supervisor:${s.name}`, role: "supervisor", name: s.name,
        names: {}, shift: s.shift, supervisor: null, taken: false,
      })),
      ...Object.entries(options.leaders ?? {}).flatMap(([sup, names]) =>
        names.map(n => ({
          key: `leader:${sup}:${n}`, role: "leader", name: n,
          names: {}, shift: shiftOf(sup), supervisor: sup, taken: false,
        }))),
      ...(options.shift_managers ?? []).map(s => ({
        key: `shift-manager:${s.name}`, role: "shift-manager", name: s.name,
        names: {}, shift: s.shift, supervisor: null, taken: false,
      })),
      ...(options.top_managers ?? []).map(n => ({
        key: `top-manager:${n}`, role: "top-manager", name: n,
        names: {}, shift: null, supervisor: null, taken: false,
      })),
    ];
  }, [options]);

  // Every spelling a profile is known by, folded once. The server sends the
  // admin-set per-language names; /login cannot read the name-override
  // endpoint (it is auth-gated), so this is the only place they come from.
  const indexed = useMemo(() => entries.map(e => ({
    ...e,
    folds: [...new Set([e.name, ...Object.values(e.names || {})]
      .filter(Boolean).map(fold))],
  })), [entries]);

  const q = fold(query);
  const results = useMemo(() => {
    if (q.length < MIN_QUERY) return [];
    const hits = indexed.filter(e => e.folds.some(f => f.includes(q)));
    // A name starting with what was typed outranks one merely containing it;
    // the server's role-then-name order breaks the tie.
    const startsWith = e => e.folds.some(f => f.split(" ").some(w => w.startsWith(q)));
    return hits
      .map((e, i) => ({ e, i, s: startsWith(e) ? 0 : 1 }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .slice(0, MAX_RESULTS)
      .map(x => x.e);
  }, [indexed, q]);

  const units       = useMemo(() => entries.filter(e => e.role === "supervisor"), [entries]);
  const unitEntry   = useMemo(() => units.find(e => e.name === unit) || null, [units, unit]);
  const unitLeaders = useMemo(
    () => entries.filter(e => e.role === "leader" && e.supervisor === unit),
    [entries, unit],
  );

  const guestProfiles = options?.guests ?? [];

  // Guest name validation: script follows the UI language, two words minimum.
  const guestLatin    = lang === "uz" || lang === "en";
  const guestTyped    = fullName.trim().replace(/\s+/g, " ");
  const guestScriptOk = !guestTyped ||
    (guestLatin ? LATIN_NAME_RE.test(guestTyped) : CYRILLIC_NAME_RE.test(guestTyped));
  const guestWordsOk  = guestTyped.split(" ").filter(Boolean).length >= 2;
  const guestCanonical = guestLatin ? guestTyped : transliterate(guestTyped, "uz");
  const guestError =
    guestPid || !guestTyped ? "" :
    !guestScriptOk ? t("login.guestScript") :
    !guestWordsOk  ? t("login.guestTwoWords") : "";
  const guestOk = guestPid != null || (guestTyped && guestScriptOk && guestWordsOk);

  function choose(entry) {
    setPicked(entry);
    setStep("confirm");
  }

  function backToFind() {
    setPicked(null);
    setStep("find");
  }

  function send(data) {
    const payload = JSON.stringify(data);
    if (tg) {
      try { tg.sendData(payload); } catch (err) { console.error(err); }
      tg.close();
    } else {
      console.log("[Login] sendData payload:", payload);
      setSubmitted(true);
    }
  }

  // The payload is unchanged from the role-first form — the picked profile
  // supplies role and supervisor instead of the user answering for them.
  function handleConfirm(e) {
    e.preventDefault();
    if (!picked) return;

    if (picked.role === "guest") {
      if (guestPid) {
        send({ full_name: picked.name, role: "guest", guest_profile_id: guestPid });
        return;
      }
      // Canonical name travels in Uzbek Latin; the other three language
      // variants are derived silently (exact typed form for the typed
      // language, alphabet switching for the rest) — see convertFromUz.
      const overrides = {};
      for (const l of ["uz_cyrl", "ru", "en"]) {
        overrides[l] = l === lang ? guestTyped : convertFromUz(guestCanonical, l);
      }
      send({ full_name: guestCanonical, role: "guest", guest_overrides: overrides });
      return;
    }

    send({
      full_name: picked.name,
      role: picked.role,
      ...(picked.role === "leader" ? { supervisor: picked.supervisor } : {}),
    });
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <div className="text-center px-6">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{t("login.sent")}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4 py-8"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
      >
        {/* Header */}
        <div className="mb-5">
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text)" }}>
            Zagruzka
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>
            {step === "confirm" ? t("login.confirmTitle")
              : step === "guest" ? t("login.chooseRole.guest")
              : t("login.findTitle")}
          </h1>
          {step === "find" && !browse && (
            <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{t("login.findSub")}</p>
          )}
        </div>

        {/* The one shared options request failed — without it there is nothing
            to search, so say so instead of a misleading "not found". */}
        {loadError && !loading && (
          <div
            className="mb-4 rounded-xl px-3 py-2.5 text-xs"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "#ef4444",
            }}
          >
            {t("login.loadError")}
            <button type="button" onClick={loadOptions} className="ml-2 font-semibold underline" style={{ color: "#ef4444" }}>
              {t("login.retry")}
            </button>
          </div>
        )}

        {/* ── Step 1 — find yourself ─────────────────────────────────────── */}
        {step === "find" && !browse && (
          <div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("login.findPlaceholder")}
              className="mb-2"
            />

            {/* The dead end is deliberately NOT inside the scrolling list: it
                is the one screen an employee who cannot find themselves has to
                read in full, and its escape hatch must never sit below a fold. */}
            {!loading && q.length >= MIN_QUERY && results.length === 0 ? (
              <div
                className="rounded-xl"
                style={{ border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
              >
                <EmptyState
                  icon={SearchX}
                  title={t("login.noMatch")}
                  message={t("login.notFoundHelp")}
                  showUploadLink={false}
                  height="py-5 px-4"
                  action={
                    <button
                      type="button"
                      onClick={openSupport}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: "var(--brand)", color: "#fff" }}
                    >
                      <Headset size={14} />
                      {t("login.contactAdmin")}
                    </button>
                  }
                />
              </div>
            ) : (
              <div
                className="rounded-xl overflow-y-auto"
                style={{ maxHeight: 260, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
              >
                {loading ? (
                  <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                ) : q.length < MIN_QUERY ? (
                  <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.typeMore")}</div>
                ) : results.map(e => (
                  <EntryRow key={e.key} entry={e} onPick={choose} t={t} tl={tl} />
                ))}
              </div>
            )}

            {/* Secondary ways out — for someone who cannot spell their name,
                and for someone who genuinely is not staff. */}
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => { setBrowse(true); setUnit(""); }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-colors"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              >
                <Users size={15} style={{ color: "var(--text-3)" }} />
                {t("login.browseByUnit")}
                <ChevronRight size={15} className="ml-auto" style={{ color: "var(--text-4)" }} />
              </button>
              <button
                type="button"
                onClick={() => { setFullName(""); setGuestPid(null); setGuestList(false); setStep("guest"); }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-colors"
                style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)" }}
              >
                <UserRound size={15} />
                {t("login.iAmGuest")}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1b — browse by unit ───────────────────────────────────── */}
        {step === "find" && browse && (
          <div>
            <button
              type="button"
              onClick={() => (unit ? setUnit("") : setBrowse(false))}
              className="flex items-center gap-1 text-xs mb-3"
              style={{ color: "var(--text-3)" }}
            >
              <ArrowLeft size={13} />
              {unit ? t("login.back") : t("login.browseBack")}
            </button>

            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
              {unit ? tl(unit) : t("login.browsePickUnit")}
            </label>

            <div
              className="rounded-xl overflow-y-auto"
              style={{ maxHeight: 300, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
            >
              {loading ? (
                <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
              ) : !unit ? (
                units.length === 0 ? (
                  <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.notFound")}</div>
                ) : units.map(u => (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => setUnit(u.name)}
                    className="w-full text-left px-3.5 py-2.5 text-sm flex items-center gap-2 transition-colors"
                    style={ROW_STYLE}
                  >
                    <span className="flex-1 min-w-0 truncate">{tl(u.name)}</span>
                    {u.shift != null && (
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>
                        {t("login.shiftN").replace("{n}", u.shift)}
                      </span>
                    )}
                    <ChevronRight size={15} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
                  </button>
                ))
              ) : (
                <>
                  {/* The brigadir themselves — a supervisor who navigated here
                      by unit must be able to claim their own profile. */}
                  {unitEntry && (
                    <EntryRow entry={unitEntry} onPick={choose} t={t} tl={tl} />
                  )}
                  {unitLeaders.length === 0 && !unitEntry ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                      {t("login.browseUnitEmpty")}
                    </div>
                  ) : unitLeaders.map(e => (
                    <EntryRow key={e.key} entry={e} onPick={choose} t={t} tl={tl} />
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Guest — the one role that types its own name ────────────────── */}
        {step === "guest" && (
          <div>
            <button
              type="button"
              onClick={() => setStep("find")}
              className="flex items-center gap-1 text-xs mb-3"
              style={{ color: "var(--text-3)" }}
            >
              <ArrowLeft size={13} />
              {t("login.back")}
            </button>

            <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{t("login.guestIntro")}</p>

            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
              {t("login.guestNameLabel")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={fullName}
                maxLength={60}
                onChange={e => { setFullName(e.target.value); setGuestPid(null); }}
                placeholder={t("login.namePlaceholder")}
                className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--input-bg)",
                  border: `1px solid ${guestError ? "#ef4444" : "var(--border-md)"}`,
                  color: "var(--text-1)",
                }}
              />
              <button
                type="button"
                onClick={() => setGuestList(v => !v)}
                title={t("login.guestExisting")}
                className="flex-shrink-0 w-10 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: guestList ? "var(--brand-bg)" : "var(--bg-inner)",
                  border: `1px solid ${guestList ? "var(--brand)" : "var(--border-md)"}`,
                  color: guestList ? "var(--brand-text)" : "var(--text-3)",
                }}
              >
                <UserRound size={15} />
              </button>
            </div>
            {guestError ? (
              <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{guestError}</p>
            ) : (
              <p className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{t("login.guestHint")}</p>
            )}

            {guestList && (
              <div className="mt-2">
                <p className="text-xs mb-1.5" style={{ color: "var(--text-3)" }}>{t("login.guestExisting")}</p>
                <div
                  className="rounded-xl overflow-y-auto"
                  style={{ maxHeight: 180, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : guestProfiles.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.noGuestProfiles")}</div>
                  ) : guestProfiles.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setFullName(p.name); setGuestPid(p.id); setGuestList(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        color: guestPid === p.id ? "var(--brand-text)" : "var(--text-1)",
                        background: guestPid === p.id ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(p.name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!guestOk}
              onClick={() => choose({
                key: "guest", role: "guest",
                name: guestPid ? fullName : guestCanonical,
                names: {}, shift: null, supervisor: null, taken: false,
              })}
              className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: !guestOk ? "var(--bg-accent)" : "var(--brand)",
                color: !guestOk ? "var(--text-4)" : "#fff",
                cursor: !guestOk ? "not-allowed" : "pointer",
              }}
            >
              {t("login.confirm")}
            </button>
          </div>
        )}

        {/* ── Step 2 — confirm who you are ───────────────────────────────── */}
        {step === "confirm" && picked && (
          <form onSubmit={handleConfirm}>
            <div
              className="rounded-xl p-4 mb-3"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}
            >
              <div className="text-base font-semibold mb-2" style={{ color: "var(--text-1)" }}>
                {tl(picked.name)}
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt style={{ color: "var(--text-3)" }}>{t("login.roleLabel")}</dt>
                  <dd className="font-medium text-right" style={{ color: "var(--text-1)" }}>
                    {t(ROLE_TKEY[picked.role])}
                  </dd>
                </div>
                {picked.supervisor && (
                  <div className="flex justify-between gap-3">
                    <dt style={{ color: "var(--text-3)" }}>{t("login.unitLabel")}</dt>
                    <dd className="font-medium text-right" style={{ color: "var(--text-1)" }}>
                      {tl(picked.supervisor)}
                    </dd>
                  </div>
                )}
                {picked.shift != null && (
                  <div className="flex justify-between gap-3">
                    <dt style={{ color: "var(--text-3)" }}>{t("login.shiftLabel")}</dt>
                    <dd className="font-medium text-right" style={{ color: "var(--text-1)" }}>
                      {t("login.shiftN").replace("{n}", picked.shift)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Several accounts sharing one profile is legitimate (a person's
                second phone), so this warns rather than blocks — but it must
                not be possible to claim a colleague's profile without reading
                the sentence that says so. */}
            {picked.taken && (
              <div
                className="rounded-xl px-3 py-2.5 mb-3 flex gap-2"
                style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.35)" }}
              >
                <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: "#eab308" }}>
                    {t("login.takenWarnTitle")}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-2)" }}>
                    {t("login.takenWarnBody")}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              {t("login.confirmYes")}
            </button>
            <button
              type="button"
              onClick={() => (picked.role === "guest" ? setStep("guest") : backToFind())}
              className="w-full mt-2 py-2 text-xs"
              style={{ color: "var(--text-3)" }}
            >
              {t("login.confirmNo")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
