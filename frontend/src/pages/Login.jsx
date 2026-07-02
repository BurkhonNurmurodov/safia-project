import { useState, useEffect } from "react";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

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
];

export default function Login() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [step,      setStep]      = useState("role");   // "role" | "name"
  const [role,       setRole]       = useState("");
  const [fullName,   setFullName]   = useState("");
  const [supervisor, setSupervisor] = useState("");   // leader → chosen brigadir/unit
  const [search,     setSearch]     = useState("");
  const [managers,     setManagers]     = useState([]);
  const [shiftAdmins,  setShiftAdmins]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  // Fetch manager names when supervisor is selected
  useEffect(() => {
    if (role === "supervisor") {
      setLoading(true);
      api.get("/api/managers")
        .then(r => setManagers(r.data))
        .catch(() => setManagers([]))
        .finally(() => setLoading(false));
    }
    if (role === "shift-manager") {
      setLoading(true);
      api.get("/api/auth/shift-admins")
        .then(r => setShiftAdmins(r.data))
        .catch(() => setShiftAdmins([]))
        .finally(() => setLoading(false));
    }
  }, [role]);

  function selectRole(r) {
    setRole(r);
    setFullName("");
    setSearch("");
    setStep("name");
  }

  function selectName(name) {
    setFullName(name);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!fullName.trim() || !role) return;

    const payload = JSON.stringify({ full_name: fullName.trim(), role });

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

  const filteredManagers = managers.filter(n =>
    n.toLowerCase().includes(search.toLowerCase())
  );

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

            {/* Supervisor — pick from list */}
            {role === "supervisor" && (
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

            {/* Shift-admin / Shift-manager — pick from 4 preset slots */}
            {role === "shift-manager" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.chooseSlot")}
                </label>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{t("login.loading")}</div>
                  ) : shiftAdmins.map(slot => (
                    <button
                      key={slot.name}
                      type="button"
                      onClick={() => selectName(slot.name)}
                      className="w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between"
                      style={{
                        color: fullName === slot.name ? "var(--brand-text)" : "var(--text-1)",
                        background: fullName === slot.name ? "var(--brand-bg)" : "transparent",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span>{tl(slot.name)}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-card)", color: "var(--text-3)" }}>
                        S{slot.shift}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Top-manager — text input */}
            {role !== "supervisor" && role !== "shift-manager" && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-3)" }}>
                  {t("login.fullName")}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={t("login.namePlaceholder")}
                  required
                  autoFocus
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  onFocus={e => e.target.style.boxShadow = "0 0 0 2px var(--brand-ring)"}
                  onBlur={e => e.target.style.boxShadow = "none"}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={!fullName.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: !fullName.trim() ? "var(--bg-accent)" : "var(--brand)",
                color: !fullName.trim() ? "var(--text-4)" : "#fff",
                cursor: !fullName.trim() ? "not-allowed" : "pointer",
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
