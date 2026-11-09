import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Gift, Loader2, Pause, Play, SearchX, Shield, Star } from "lucide-react";
import Layout from "../components/layout/Layout";
import ErrorScreen from "../components/ui/ErrorScreen";
import Lightbox from "../components/ui/Lightbox";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { inTelegram } from "../utils/session";
import api from "../utils/api";
import { TXT, fill } from "./tgProfileText";

/* «Telegram profili» (/tg-user/:tid, admins only) — a registrant's Telegram
 * profile as the bot sees it, drawn like Telegram's own profile page. They wrote
 * to the bot, not to a person, so no admin could open it in Telegram itself
 * (docs/registration.md «The registrant's Telegram profile»). Every picture is a
 * Telegram file fetched through /admin/tg-file/raw as a blob — the file URL
 * carries the bot token, and the JWT rides on a header an <img src> can't send.
 */

// Bot API «Profile accent colors»: id → [light theme, dark theme]; two colours = a gradient.
const PROFILE_COLORS = {
  0: [["#BA5650"], ["#9C4540"]], 1: [["#C27C3E"], ["#945E2C"]],
  2: [["#956AC8"], ["#715099"]], 3: [["#49A355"], ["#33713B"]],
  4: [["#3E97AD"], ["#387E87"]], 5: [["#5A8FBB"], ["#477194"]],
  6: [["#B85378"], ["#944763"]], 7: [["#7F8B95"], ["#435261"]],
  8: [["#C9565D", "#D97C57"], ["#994343", "#AC583E"]],
  9: [["#CF7244", "#CC9433"], ["#8F552F", "#A17232"]],
  10: [["#9662D4", "#B966B6"], ["#634691", "#9250A2"]],
  11: [["#3D9755", "#89A650"], ["#296A43", "#5F8F44"]],
  12: [["#3D95BA", "#50AD98"], ["#306C7C", "#3E987E"]],
  13: [["#538BC2", "#4DA8BD"], ["#38618C", "#458BA1"]],
  14: [["#B04F74", "#D1666D"], ["#884160", "#A65259"]],
  15: [["#637482", "#7B8A97"], ["#53606E", "#384654"]],
};
// Telegram's seven name colours (accent_color_id 0–6), as its letter avatars draw them.
const PEER_GRADIENTS = [
  ["#FF845E", "#D45246"], ["#FEBB5B", "#F68136"], ["#B694F9", "#6C61DF"],
  ["#9AD164", "#46BA43"], ["#53EDD6", "#28C9B7"], ["#5BCBE3", "#359AD4"],
  ["#FF8AAC", "#D95574"],
];
const AVATAR = 112;
const AVATAR_Y = 32 + AVATAR / 2;   // the header's top padding + half the avatar
// The profile-background emoji, scattered round the avatar in three fading rings.
const PATTERN = [[88, 6, 26, 0.32], [134, 9, 20, 0.2], [186, 12, 16, 0.12]].flatMap(
  ([r, n, size, op], ring) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI + ring * 0.45;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.82, size, op };
  }));
const DT_LOCALE = { uz: "uz-Latn-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };
const CARD = { background: "var(--bg-card)", border: "1px solid var(--border)" };

/** A Telegram file as an object URL (null while it loads or if Telegram refuses). */
function useTgFile(fileId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!fileId) return undefined;
    let live = true, made = null;
    api.get("/admin/tg-file/raw", { params: { file_id: fileId }, responseType: "blob" })
      .then((r) => { if (live) { made = URL.createObjectURL(r.data); setUrl(made); } })
      .catch(() => {});
    return () => { live = false; if (made) URL.revokeObjectURL(made); setUrl(null); };
  }, [fileId]);
  return url;
}

function openTg(url) {
  const tg = window.Telegram?.WebApp;
  if (inTelegram() && tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

function birthday({ day, month, year }, lang, T) {
  const s = new Date(Date.UTC(year || 2000, month - 1, day)).toLocaleDateString(
    DT_LOCALE[lang] || "ru-RU",
    { day: "numeric", month: "long", timeZone: "UTC", ...(year ? { year: "numeric" } : {}) });
  if (!year) return s;
  const now = new Date();
  const m = now.getMonth() + 1;
  const n = now.getFullYear() - year - (m < month || (m === month && now.getDate() < day) ? 1 : 0);
  const tpl = typeof T.age === "string" ? T.age : T.age[new Intl.PluralRules("ru").select(n)] || T.age.other;
  return `${s} (${fill(tpl, { n })})`;
}

const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

function Avatar({ fileId, name, accent, size, ring = false, onOpen, label }) {
  const url = useTgFile(fileId);
  const box = { width: size, height: size, boxShadow: ring ? "0 0 0 3px rgba(255,255,255,0.22)" : undefined };
  if (fileId && !url) return <SkeletonBlock className="mx-auto shrink-0 rounded-full" style={box} />;
  if (!url) {
    const [a, b] = PEER_GRADIENTS[(accent ?? 5) % 7];
    const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return (
      <div aria-hidden className="mx-auto flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
        style={{ ...box, fontSize: size * 0.38, background: `linear-gradient(180deg, ${a}, ${b})` }}>
        {initials}
      </div>
    );
  }
  const img = <img src={url} alt="" draggable={false} className="h-full w-full rounded-full object-cover" />;
  return onOpen ? (
    <button type="button" aria-label={label} onClick={() => onOpen(url)}
      className="tgp-tap mx-auto block shrink-0 rounded-full" style={box}>{img}</button>
  ) : <div className="mx-auto shrink-0 rounded-full" style={box}>{img}</div>;
}

function Header({ data, dark, T, onZoom }) {
  const u = data.user;
  const set = PROFILE_COLORS[u.profile_accent_color_id];
  const cols = set ? set[dark ? 1 : 0] : null;
  const pattern = useTgFile(cols ? data.pattern : null);
  const status = useTgFile(data.emoji_status);
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  const full = data.photos[0]?.full || u.photo?.big_file_id;
  const level = u.rating?.level;
  const bg = !cols ? "var(--bg-card)"
    : cols[1] ? `radial-gradient(circle at 50% ${AVATAR_Y}px, ${cols[1]}, ${cols[0]} 75%)` : cols[0];
  return (
    <section className="relative overflow-hidden rounded-3xl px-4 pb-6 pt-8 text-center"
      style={cols ? { background: bg } : CARD}>
      {cols && (
        <div aria-hidden className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% ${AVATAR_Y}px, rgba(255,255,255,0.22), transparent 170px)` }} />
      )}
      {pattern && PATTERN.map((p, i) => (
        <img key={i} src={pattern} alt="" aria-hidden draggable={false} className="pointer-events-none absolute"
          style={{ width: p.size, height: p.size, left: `calc(50% + ${p.x - p.size / 2}px)`,
                   top: AVATAR_Y + p.y - p.size / 2, opacity: p.op, filter: "brightness(0) invert(1)" }} />
      ))}
      <div className="relative">
        <Avatar fileId={full} name={name} accent={u.accent_color_id} size={AVATAR} ring={!!cols}
          label={T.zoom} onOpen={(url) => onZoom({ url })} />
        <h2 className="mt-4 break-words text-[22px] font-semibold leading-7"
          style={{ color: cols ? "#fff" : "var(--text-1)" }}>
          {name}
          {status && <img src={status} alt="" className="ml-1.5 inline-block h-6 w-6 align-[-4px]" />}
        </h2>
        {level != null && (
          <div className="mt-2 flex justify-center">
            <span role="img" aria-label={fill(T.rating, { n: level })} title={fill(T.rating, { n: level })}
              className="relative inline-flex h-7 w-7 items-center justify-center">
              <Shield size={28} strokeWidth={0} fill="currentColor"
                style={{ color: level < 0 ? "#ef4444" : cols ? "#fff" : "var(--tg-link)" }} />
              <span className="absolute text-[12px] font-bold leading-none"
                style={{ color: level < 0 ? "#fff" : cols ? cols[0] : "var(--bg-card)" }}>{level}</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function CopyBtn({ text, T, toast }) {
  const copy = () => (navigator.clipboard?.writeText(text) ?? Promise.reject())
    .then(() => toast.success(T.copied, 1500), () => toast.error(T.copyFailed));
  return (
    <button type="button" onClick={copy} aria-label={T.copy} title={T.copy}
      className="tgp-tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ color: "var(--tg-link)" }}>
      <Copy size={20} />
    </button>
  );
}

/** One card of Telegram-style info rows: the label over the value, hairlines between. */
function InfoCard({ rows, T, toast }) {
  return (
    <section className="rounded-3xl py-1" style={CARD}>
      {rows.map((r, i) => (
        <div key={r.k}>
          {i > 0 && <div className="mx-5" style={{ borderTop: "1px solid var(--border-md)" }} />}
          <div className="flex items-center gap-2 py-3 pl-5 pr-3">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-5" style={{ color: r.link ? "var(--text-2)" : "var(--tg-link)" }}>
                {r.label}
              </div>
              {r.open ? (
                <button type="button" onClick={() => openTg(r.open)}
                  className="tgp-tap break-all rounded text-left text-[17px] leading-6 hover:underline"
                  style={{ color: "var(--tg-link)" }}>{r.value}</button>
              ) : (
                <div className="whitespace-pre-wrap break-words text-[17px] leading-6" style={{ color: "var(--text-1)" }}>
                  {r.value}
                </div>
              )}
              {r.sub && <div className="mt-0.5 text-[13px] leading-5" style={{ color: "var(--text-3)" }}>{r.sub}</div>}
            </div>
            {r.copy && <CopyBtn text={r.copy} T={T} toast={toast} />}
          </div>
        </div>
      ))}
    </section>
  );
}

function ChannelCard({ ch, T }) {
  const body = (
    <>
      <Avatar fileId={ch.photo} name={ch.title} size={52} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-semibold leading-6" style={{ color: "var(--text-1)" }}>{ch.title}</div>
        <div className="truncate text-[15px] leading-5" style={{ color: "var(--text-3)" }}>
          {ch.description || (ch.username ? `@${ch.username}` : "")}
        </div>
      </div>
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left";
  return (
    <section>
      <div className="flex justify-between px-5 pb-1.5 text-[13px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
        <span>{T.channel}</span>
        {ch.members != null && <span>{fill(T.members, { n: ch.members.toLocaleString() })}</span>}
      </div>
      {ch.username ? (
        <button type="button" onClick={() => openTg(`https://t.me/${ch.username}`)}
          className={`tgp-tap tgp-hover ${cls}`} style={CARD}>{body}</button>
      ) : <div className={cls} style={CARD}>{body}</div>}
    </section>
  );
}

function PhotoTile({ p, label, onZoom }) {
  const url = useTgFile(p.thumb);
  return (
    <button type="button" aria-label={label} onClick={() => url && onZoom({ full: p.full, url })}
      className="tgp-tap aspect-square overflow-hidden" style={{ background: "var(--bg-inner)" }}>
      {url ? <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
        : <SkeletonBlock className="h-full w-full rounded-none" />}
    </button>
  );
}

function GiftTile({ g }) {
  const url = useTgFile(g.img);
  const unique = g.number != null;
  const bg = g.colors?.[0] ? `radial-gradient(circle, ${g.colors[0]}, ${g.colors[1] || g.colors[0]})` : "var(--bg-inner)";
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl p-2"
      style={{ background: bg, border: "1px solid var(--border)" }}>
      {!g.img ? <Gift size={40} style={{ color: unique ? "#fff" : "var(--text-3)" }} />
        : url ? <img src={url} alt="" draggable={false} className="h-3/5 w-3/5 object-contain" />
        : <SkeletonBlock className="h-3/5 w-3/5 rounded-xl" />}
      <span className="flex max-w-full items-center gap-1 truncate text-[12px] font-medium"
        style={{ color: unique ? "#fff" : "var(--text-2)" }}>
        {unique ? `${g.name ?? ""} #${g.number}`
          : g.stars != null && <><Star size={12} fill="#eab308" strokeWidth={0} />{g.stars}</>}
      </span>
    </div>
  );
}

let playing = null;   // one track at a time, as in Telegram

function AudioRow({ a, T, toast }) {
  const audio = useRef(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => {
    const el = audio.current;
    if (el) { el.pause(); URL.revokeObjectURL(el.src); }
  }, []);
  const toggle = async () => {
    if (audio.current && !audio.current.paused) { audio.current.pause(); return; }
    if (!audio.current) {
      setBusy(true);
      try {
        const r = await api.get("/admin/tg-file/raw", { params: { file_id: a.file_id }, responseType: "blob" });
        const el = new Audio(URL.createObjectURL(r.data));
        el.onplay = () => setOn(true);
        el.onpause = () => setOn(false);
        el.onended = () => setOn(false);
        audio.current = el;
      } catch {
        toast.error(T.playFailed);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (playing && playing !== audio.current) playing.pause();
    playing = audio.current;
    audio.current.play().catch(() => {});   // iOS may want a second tap once loaded
  };
  const Icon = busy ? Loader2 : on ? Pause : Play;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button type="button" onClick={toggle} disabled={busy} aria-label={on ? T.pause : T.play}
        className="tgp-tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: "var(--tg-link)" }}>
        <Icon size={18} className={busy ? "animate-spin" : ""} fill={busy ? "none" : "currentColor"} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-5" style={{ color: "var(--text-1)" }}>
          {a.title || a.file_name || "—"}
        </div>
        <div className="truncate text-[13px] leading-5" style={{ color: "var(--text-3)" }}>
          {[a.performer, mmss(a.duration)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

function Zoom({ zoom, onClose }) {
  const full = useTgFile(zoom?.full);   // the thumbnail stands in until the large one lands
  return <Lightbox src={zoom ? full || zoom.url : null} onClose={onClose} />;
}

export default function TgProfile() {
  const { tid } = useParams();
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { theme } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState(null);
  const [zoom, setZoom] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tg-profile", tid],
    queryFn: () => api.get(`/admin/tg-profile/${tid}`).then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });

  if (error) {
    const gone = [404, 422].includes(error?.response?.status);
    return (
      <Layout title={T.title}>
        <ErrorScreen inline tone={gone ? "neutral" : "danger"} icon={gone ? SearchX : AlertTriangle}
          code={gone ? "404" : undefined}
          title={gone ? T.notFound : t("error.title")}
          message={gone ? T.notFoundMsg : (error?.response?.data?.detail || t("error.reload"))}
          action={gone ? { label: T.back, onClick: () => navigate(-1) }
            : { label: t("error.reload"), onClick: () => refetch() }} />
      </Layout>
    );
  }

  const u = data?.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : null;
  const phone = data?.phone && (data.phone.startsWith("+") ? data.phone : `+${data.phone}`);
  const more = (u?.active_usernames || []).filter((x) => x !== u.username);
  const intro = u?.business_intro;
  const rows = u ? [
    u.username && { k: "username", label: T.username, value: `@${u.username}`, link: true,
      open: `https://t.me/${u.username}`, copy: `@${u.username}`,
      sub: more.length ? fill(T.also, { list: more.map((x) => `@${x}`).join(", ") }) : null },
    u.bio && { k: "bio", label: T.bio, value: u.bio },
    phone && { k: "phone", label: T.phone, value: phone, copy: phone },
    u.birthdate && { k: "birthday", label: T.birthday, value: birthday(u.birthdate, lang, T) },
    u.business_location?.address && { k: "location", label: T.location, value: u.business_location.address },
    (intro?.title || intro?.message) && { k: "business", label: T.business,
      value: [intro.title, intro.message].filter(Boolean).join("\n") },
    u.paid_message_star_count && { k: "paid", label: T.paid, value: fill(T.stars, { n: u.paid_message_star_count }) },
  ].filter(Boolean) : [];
  const tabs = data ? [
    data.photos.length && { value: "photos", label: `${T.photos} ${data.photos.length}` },
    data.gifts.length && { value: "gifts", label: `${T.gifts} ${data.gift_count ?? data.gifts.length}` },
    data.audios.length && { value: "music", label: `${T.music} ${data.audios.length}` },
  ].filter(Boolean) : [];
  const cur = tabs.find((x) => x.value === tab)?.value ?? tabs[0]?.value;

  return (
    <Layout title={T.title} subtitle={name}>
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
        {isLoading || !data ? (
          <>
            <SkeletonBlock className="h-[260px] w-full rounded-3xl" />
            <SkeletonBlock className="h-[180px] w-full rounded-3xl" />
            <SkeletonBlock className="h-[72px] w-full rounded-3xl" />
          </>
        ) : (
          <>
            <Header data={data} dark={theme !== "light"} T={T} onZoom={setZoom} />
            {data.channel && <ChannelCard ch={data.channel} T={T} />}
            {rows.length > 0 && <InfoCard rows={rows} T={T} toast={toast} />}
            <InfoCard rows={[{ k: "id", label: T.tgId, value: String(u.id), copy: String(u.id) }]} T={T} toast={toast} />

            {tabs.length > 0 ? (
              <div className="space-y-3 pt-2">
                <div className="flex justify-center">
                  <SegmentedToggle asTabs value={cur} onChange={setTab} options={tabs} ariaLabel={T.title} />
                </div>
                {cur === "photos" && (
                  <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-3xl sm:grid-cols-4">
                    {data.photos.map((p) => <PhotoTile key={p.full} p={p} label={T.zoom} onZoom={setZoom} />)}
                  </div>
                )}
                {cur === "gifts" && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {data.gifts.map((g, i) => <GiftTile key={i} g={g} />)}
                  </div>
                )}
                {cur === "music" && (
                  <section className="rounded-3xl py-1" style={CARD}>
                    {data.audios.map((a) => <AudioRow key={a.file_id} a={a} T={T} toast={toast} />)}
                  </section>
                )}
              </div>
            ) : (
              <p className="px-5 text-center text-[13px]" style={{ color: "var(--text-3)" }}>{T.nothing}</p>
            )}
            <p className="px-5 text-center text-[13px]" style={{ color: "var(--text-3)" }}>{T.notShown}</p>
          </>
        )}
      </div>
      <Zoom zoom={zoom} onClose={() => setZoom(null)} />
      {toast.node}
    </Layout>
  );
}
