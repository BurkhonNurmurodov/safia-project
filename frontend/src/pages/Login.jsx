import { useState, useEffect } from "react";
import { UserRound } from "lucide-react";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit, transliterate, convertFromUz } from "../utils/transliterate";

const tg = window.Telegram?.WebApp;

// Keep the registration form compact — never expand to full screen
if (tg) {
  tg.collapse?.();
  tg.disableVerticalSwipes?.();
}

const ROLES = [
  { value: "top-manager",   tKey: "login.chooseRole.top",        tKeyRu: "login.chooseRole.topRu" },
  { value: "shift-manager", tKey: "login.chooseRole.shift",      tKeyRu: "login.chooseRole.shiftRu" },
  { value: "supervisor",    tKey: "login.chooseRole.sup",        tKeyRu: "login.chooseRole.supRu" },
  { value: "leader",        tKey: "login.chooseRole.leader",     tKeyRu: "login.chooseRole.leaderRu" },
  { value: "guest",         tKey: "login.chooseRole.guest",      tKeyRu: "login.chooseRole.guestRu" },
];

// Guests type their own name — script must match the UI language (Latin for
// uz/en, Cyrillic for ru/uz_cyrl). Letters, apostrophes and hyphens only.
const LATIN_NAME_RE    = /^[A-Za-zʻʼ'’‘`\-\s]+$/;
const CYRILLIC_NAME_RE = /^[Ѐ-ӿʻʼ'’\-\s]+$/;

export default function Login() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const [step,      setStep]      = useState("role");   // "role" | "name"
  const [role,       setRole]       = useState("");
  const [shift,      setShift]      = useState(null);  // 1 | 2 — filters every list below
  const [fullName,   setFullName]   = useState("");
  const [supervisor, setSupervisor] = useState("");   // leader → chosen brigadir/unit
  const [search,     setSearch]     = useState("");
  const [options,    setOptions]    = useState(null); // pre-created profiles, all roles
  const [loading,    setLoading]    = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [guestPid,   setGuestPid]   = useState(null);  // guest → re-claimed profile id
  const [guestList,  setGuestList]  = useState(false); // guest → picker open

  // Every role now picks a pre-created profile — nobody types a name. One
  // gated endpoint serves all the pickers: it validates Telegram initData so
  // the name lists are only visible inside the bot's mini-app.
  useEffect(() => {
    setLoading(true);
    api.post("/api/profiles/registration-options", { init_data: tg?.initData || "__dev__" })
      .then(r => setOptions(r.data))
      .catch(() => setOptions(null))
      .finally(() => setLoading(false));
  }, []);

  function selectRole(r) {
    setRole(r);
    setShift(null);
    setFullName("");
    setSupervisor("");
    setSearch("");
    setGuestPid(null);
    setGuestList(false);
    setStep("name");
  }

  function selectShift(s) {
    setShift(s);
    setFullName("");
    setSupervisor("");
  }

  function selectName(name) {
    setFullName(name);
  }

  // Every role except top-manager narrows by shift first; leaders then pick a
  // supervisor, then one of that unit's leader profiles.
  const needsShift = role === "shift-manager" || role === "supervisor" || role === "leader";

  // Guest name validation: script follows the UI language, two words minimum.
  // Names are NOT unique — a typed name always creates its own guest profile,
  // so there is no taken-name check; re-claims go through the picker instead.
  const guestLatin   = lang === "uz" || lang === "en";
  const guestTyped   = fullName.trim().replace(/\s+/g, " ");
  const guestScriptOk = !guestTyped ||
    (guestLatin ? LATIN_NAME_RE.test(guestTyped) : CYRILLIC_NAME_RE.test(guestTyped));
  const guestWordsOk = guestTyped.split(" ").filter(Boolean).length >= 2;
  const guestCanonical = guestLatin ? guestTyped : transliterate(guestTyped, "uz");
  const guestError =
    role !== "guest" || guestPid || !guestTyped ? "" :
    !guestScriptOk ? t("login.guestScript") :
    !guestWordsOk  ? t("login.guestTwoWords") : "";
  const guestOk = guestPid != null || (guestScriptOk && guestWordsOk);

  const canSubmit = fullName.trim() && role && (!needsShift || shift) &&
    (role !== "leader" || supervisor) && (role !== "guest" || guestOk);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    const data = {
      full_name: fullName.trim(),
      role,
      ...(role === "leader" ? { supervisor } : {}),
    };
    if (role === "guest") {
      if (guestPid) {
        data.guest_profile_id = guestPid;
      } else {
        // Canonical name travels in Uzbek Latin; the other three language
        // variants are derived silently (exact typed form for the typed
        // language, alphabet switching for the rest) — see convertFromUz.
        data.full_name = guestCanonical;
        const overrides = {};
        for (const l of ["uz_cyrl", "ru", "en"]) {
          overrides[l] = l === lang ? guestTyped : convertFromUz(guestCanonical, l);
        }
        data.guest_overrides = overrides;
      }
    }
    const payload = JSON.stringify(data);

    if (tg) {
      try { tg.sendData(payload); } catch (err) { console.error(err); }
      tg.close();
    } else {
      console.log("[Login] sendData payload:", payload);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <div className="text-center px-6">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {t("login.sent")}
          </p>
        </div>
      </div>
    );
  }

  // Profiles without a shift stay hidden until an admin sets one.
  const managerNames = (options?.supervisors ?? [])
    .filter(s => shift != null && s.shift === shift)
    .map(s => s.name);
  const filteredManagers = managerNames.filter(n =>
    n.toLowerCase().includes(search.toLowerCase())
  );
  const topManagers = (options?.top_managers ?? []).filter(n =>
    n.toLowerCase().includes(search.toLowerCase())
  );
  const shiftAdmins = (options?.shift_managers ?? [])
    .filter(s => shift != null && s.shift === shift);
  const leadersForSupervisor = supervisor ? (options?.leaders?.[supervisor] ?? []) : [];
  const guestProfiles = options?.guests ?? [];

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
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text)" }}>
            Zagruzka
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>
            {t("login.title")}
          </h1>
        </div>

        {/* Step 1 — Role selection */}
        {step === "role" && (
          <div className="space-y-2">
            <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{t("login.chooseRole")}</p>
            {ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => selectRole(r.value)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--brand)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-md)"}
              >
                {t(r.tKey)}
                <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>/ {t(r.tKeyRu)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — Name */}
        {step === "name" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selected role badge + back */}
            <div className="flex items-center justify-between">
              <span
                className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}
              >
                {(() => { const r = ROLES.find(r => r.value === role); return r ? t(r.tKey) : role; })()}
              </span>
              <button
                type="button"
                onClick={() => setStep("role")}
                className="text-xs"
                style={{ color: "var(--text-3)" }}
              >
                {t("login.back")}
              </button>
            </div>

            {/* Shift — narrows every picker below; nothing unlocks until chosen */}
            {needsShift && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseShift")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => selectShift(s)}
                      className="px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                      style={{
                        background: shift === s ? "var(--brand-bg)" : "var(--bg-inner)",
                        border: `1px solid ${shift === s ? "var(--brand)" : "var(--border-md)"}`,
                        color: shift === s ? "var(--brand-text)" : "var(--text-1)",
                      }}
                    >
                      {t("login.shiftN").replace("{n}", s)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Supervisor — pick from list */}
            {role === "supervisor" && (
              <div style={{ opacity: shift ? 1 : 0.45 }}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseName")}
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("login.search")}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
                <div
                  className="rounded-xl overflow-y-auto"
                  style={{ maxHeight: 220, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : !shift ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.pickShiftFirst")}</div>
                  ) : filteredManagers.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.notFound")}</div>
                  ) : filteredManagers.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectName(name)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        color: fullName === name ? "var(--brand-text)" : "var(--text-1)",
                        background: fullName === name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shift-manager — the chosen shift's profiles only */}
            {role === "shift-manager" && (
              <div style={{ opacity: shift ? 1 : 0.45 }}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseName")}
                </label>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : !shift ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.pickShiftFirst")}</div>
                  ) : shiftAdmins.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.notFound")}</div>
                  ) : shiftAdmins.map(slot => (
                    <button
                      key={slot.name}
                      type="button"
                      onClick={() => selectName(slot.name)}
                      className="w-full text-left px-4 py-3 text-sm transition-colors"
                      style={{
                        color: fullName === slot.name ? "var(--brand-text)" : "var(--text-1)",
                        background: fullName === slot.name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(slot.name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Top-manager — pick their pre-created name profile */}
            {role === "top-manager" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseName")}
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("login.search")}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
                <div
                  className="rounded-xl overflow-y-auto"
                  style={{ maxHeight: 220, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : topManagers.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.notFound")}</div>
                  ) : topManagers.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectName(name)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        color: fullName === name ? "var(--brand-text)" : "var(--text-1)",
                        background: fullName === name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Guest — the one role that types its own name. The button on the
                right lists unassigned guest profiles for returning guests
                (re-claiming still goes through admin approval). */}
            {role === "guest" && (
              <div>
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
                  <p className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>
                    {t("login.guestHint")}
                  </p>
                )}
                {guestList && (
                  <div className="mt-2">
                    <p className="text-xs mb-1.5" style={{ color: "var(--text-3)" }}>
                      {t("login.guestExisting")}
                    </p>
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
              </div>
            )}

            {/* Leader — pick the shift's supervisor (unit) first… */}
            {role === "leader" && (
              <div style={{ opacity: shift ? 1 : 0.45 }}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseSupervisor")}
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("login.search")}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
                <div
                  className="rounded-xl overflow-y-auto"
                  style={{ maxHeight: 180, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : !shift ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.pickShiftFirst")}</div>
                  ) : filteredManagers.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.notFound")}</div>
                  ) : filteredManagers.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setSupervisor(name); setFullName(""); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        color: supervisor === name ? "var(--brand-text)" : "var(--text-1)",
                        background: supervisor === name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* …then one of that unit's pre-created leader profiles. Disabled
                until a supervisor is chosen. */}
            {role === "leader" && (
              <div style={{ opacity: supervisor ? 1 : 0.45 }}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseLeader")}
                </label>
                <div
                  className="rounded-xl overflow-y-auto"
                  style={{ maxHeight: 180, border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {!supervisor ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                      {t("login.pickSupervisorFirst")}
                    </div>
                  ) : leadersForSupervisor.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                      {t("login.noLeaders")}
                    </div>
                  ) : leadersForSupervisor.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => selectName(name)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{
                        color: fullName === name ? "var(--brand-text)" : "var(--text-1)",
                        background: fullName === name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {tl(name)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: !canSubmit ? "var(--bg-accent)" : "var(--brand)",
                color: !canSubmit ? "var(--text-4)" : "#fff",
                cursor: !canSubmit ? "not-allowed" : "pointer",
              }}
            >
              {t("login.confirm")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
