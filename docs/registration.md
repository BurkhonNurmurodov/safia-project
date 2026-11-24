# Registration

The index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Job seekers go to HR (`services/hr_contact.py`, 2026-11-09)

**The problem.** People who want to WORK at Safia search «Safia» in Telegram,
find this bot, press Start, read «📝 Ro'yxatdan o'tish» as «apply», and — the
name search not finding them — file a guest request through «Men mehmonman».
On 2026-11-09 production held 36 guest requests: 9 approved real guests, 25
pending (7 Oct → 9 Nov, every one with a phone, none ever in the app) and 2
rejected. From June to September there had been 4; from 5 Oct about five a
week. Matched against the Verifix mirror (`turnover_people`), one of the 27
was an employee: filed 19 Oct, hired by HR 2 Nov as a confectioner, left
5 Nov. They are job seekers, not staff, and no account holding a guest request
held a staff role — the name search keeps staff out of the guest door.

**What changed — every surface a job seeker reaches names HR:**

- **The contact is one setting**, `app_settings.hr_contact`, set on the admin
  Users tab («HR kontakti», `components/admin/HrContactButton.jsx`) through
  `PUT /admin/hr-contact` (`config.hr_contact_saved` in the Jurnal). Three
  shapes, refused otherwise (it lands on a page strangers open): a Telegram
  @username (a `t.me/<name>` link is stored as `@name`), an `https://` link, a
  phone number. Only the first two become buttons — a Telegram button cannot
  dial. Empty = nothing names a contact; every text has a «contact Safia's
  HR» form for that case. **It starts as `@safiahrrecruiting`**, the account
  the operator named on 9 Nov: `startup.seed_hr_contact` (a `later` step)
  writes it only when NO row exists, so an admin's own value — a blank too —
  is never overwritten; the value lives in the setting, not in code.
- **The bot's Telegram description and short description** (the empty chat
  before Start; the profile and a shared link) say who the bot is for and name
  HR. Written by `telegram_bot.set_bot_descriptions` WHEN AN ADMIN SAVES the
  contact — and once by the seed above, on the boot that creates the setting;
  any other boot leaves Telegram alone. Either write overwrites whatever
  BotFather held. Codes: default (no code)
  and `uz` = Uzbek Latin, `ru`, `en`; Telegram has no Uzbek-Cyrillic code. A
  failed Telegram call never undoes the save (`bot_synced: false` → a warning
  toast). **Search results show the bot's NAME, not its description** — the
  display name is BotFather's, not changed by code.
- **The welcome after the language pick** opens with who the bot is for
  (leaders, brigadirs, managers) and closes with the HR line. ONE message: the
  register button is a reply keyboard (sendData needs it), so HR cannot be an
  inline button beside it — it rides in the text, which Telegram links itself.
- **A waiting guest request** — `/start`, `/register`, a second guest filing —
  answers «already under review» PLUS the HR line (`_pending_msg`).
- **A closed (rejected) guest request** sends `rejected_guest` + the HR line
  instead of «contact the admin», which had sent the job seekers to us.
  So the admin's plain ❌ on a guest request IS the redirect; there is no
  separate button. The panel under Ghost Mode suppresses that DM.
- **/login**: «Ishga kirmoqchiman» sits between «Bo'lim bo'yicha topish» and
  «Men mehmonman» and opens a screen saying the system does not hire and a
  guest request is not an application, with the contact (+ a button for a
  link). The not-found state carries two buttons, each the answer for ONE of
  the two people who land there: a leader missing from the list (admin) and
  a job seeker who typed their own name (HR). The guest screen says a guest is
  a partner or auditor and links back to the job screen. The search subtitle
  names the roles the system is for.
- **Copy names ROLES, never «employees»**: only leaders, brigadirs and managers
  have profiles, so a line worker IS a Safia employee who cannot register —
  «Men Safia xodimiman» or «for Safia employees» would invite them in.

**The re-claim picker leaked names.** «Mavjud profilni tanlash» listed every
guest profile without an APPROVED holder — pending and rejected requests too,
which on 9 Nov was exactly the 27 job seekers' full names, shown to anyone who
pressed Start. It now lists only guest profiles NOBODY has a request on
(an admin's unclaimed pre-created ones). A guest retrying their own refused
request types their name; the bot mints a fresh profile (the refused one is
gone — see below).

**The backlog** (25 pending, 2 rejected on 9 Nov) is closed by an admin
rejecting each pending guest request on the Users tab — with Ghost Mode off,
each person receives the HR message naming the seeded contact. The 2 already
rejected were told «contact the admin» and get nothing new unless messaged by
hand.

## A rejected guest is deleted (`telegram_bot._drop_rejected_guest`, 2026-11-09)

The operator: «when the guest registration is rejected, delete them». A refused
guest request used to stay as a `rejected` row on a profile nobody could pick
again, so the Profiles tab's «Mehmonlar» filled with «Bog'lanmagan» names.
Now `decide_registration` — the panel's ❌ and the Telegram button alike —
deletes the request instead of marking it, through `profiles._remove_role_row`
(the account goes too when that was its only role, exactly as the panel's
profile delete does), then deletes the guest profile and everything keyed to it
(`_purge_profile_key`) unless another request still names it. The same holds
for the auto-rejected rivals when one claim on a profile is approved — their
requests go, the profile stays with the winner. **An admin's pre-created guest
profile is deleted too** when the one claim on it is refused — **except «PwC»**
(the operator, 2026-11-24: «delete all, keep PwC»; `telegram_bot.KEPT_GUESTS`,
matched by name — registration mints only names of 2+ words, so a one-word
«PwC» is always the admin's own): its refused request goes, the profile stays. The HR DM still goes
out (it needs only the account id and language, read before the delete);
nothing undoes the delete. Requests
refused before this change (2 on 9 Nov) are left as they were.

## The registrant's Telegram profile («Profilni ko'rish», `/tg-user/:tid`, 2026-11-09)

The operator: a registrant writes to the BOT, not to a person, so no admin can
open their Telegram profile and see who they are. Every registration request
the bot DMs to the admins (and every `/pending` row) now carries a first button
**«👤 Profilni ko'rish»** (`telegram_bot._tg_profile_btn`), a mini-app button
opening `/tg-user/<telegram id>` — and the button STAYS on the message once the
request is decided (only ✅/❌ and the panel button go), because a person is
worth looking up after the decision too.

The page (`pages/TgProfile.jsx`, admins only — `RequireAdmin`, the endpoint
`verify_admin`) is drawn like Telegram's own profile: the header in the
person's profile colour (Bot API «profile accent colors», light / dark set by
the app theme) with their profile-background emoji scattered round the avatar,
the name with the emoji status, the Telegram rating level as a shield (red when
negative — Telegram's own sign of a doubtful buyer); then the personal channel
(title, description, subscribers), the info rows (username and every other
active username, bio, the phone they SHARED at /start — `telegram_users.phone`,
birthday with age, business address and intro, paid-message price), the
Telegram ID, and tabs for all profile photos (tap → full size), gifts and
profile music (playable).

`GET /admin/tg-profile/{telegram_id}` (`routers/admin.py`) asks Telegram in
parallel: `getChat`, `getUserProfilePhotos`, `getUserProfileAudios`,
`getUserGifts`, `getCustomEmojiStickers` (the status and pattern emoji), and
`getChat` + `getChatMemberCount` for the channel. A method Telegram refuses
leaves its part empty; a refused `getChat` is the page's 404. Every picture and
track goes through the existing `/admin/tg-file/raw` proxy as a blob — the file
URL carries the bot token. The route is hidden from «Yordamchi»
(`assistant_api._HIDDEN_PREFIXES`): strangers' bios and phones are not platform
data.

**What a bot cannot see, so the page cannot show:** stories, «last seen» /
online, the channel's latest post, anything the person's privacy settings hide
from non-contacts (a hidden photo is simply absent). The page says the first two
in its footnote. Business opening hours are left out (no registrant has one).

## «Chiqish» on the «no pages» screen wiped accounts (2026-11-20)

Mini-app users reported being «logged out». The register showed 11 accounts in
14 days (7–20 Nov; three on the 20th) of approved leaders and brigadirs — up to
346 earlier sign-ins — whose OWN session sent `DELETE /api/auth/me` 6–55
seconds after an approved sign-in (`identity.own_account_deleted`). That call
deletes the account and every role; the person had to register again and wait
for approval, or registered on the shared cell phone as somebody else.

- **The door**: `NoAccess` («Sahifa biriktirilmagan», `App.jsx`) offered
  «Chiqish» → `logout()` with NO confirmation, and inside Telegram `logout()`
  was that DELETE. The header's «Chiqish» always asked first and left only the
  active role (`leaveRole`); this screen did not.
- **Now**: the screen's primary button is «Qayta yuklash» (a reload). Its
  «Chiqish» does exactly what the header's does: a confirm, then `leaveRole`.
  In a browser it stays `logout()`, which only ends the session. `logout()` no
  longer has a Telegram branch, and `DELETE /api/auth/me` itself answers
  410 (`auth.delete_me`): a mini app still on a bundle from before v4.614.0
  presses the old unconfirmed «Chiqish», gets the refusal, closes — and the
  account survives. Leaving a LAST role still
  deletes the account, behind that confirm.
- **Not found: why approved leaders saw the screen at all.** The live data
  cannot produce it: the stored matrix opens 9 pages to `leader`, 17 to
  `supervisor`, and no leader or brigadir profile or account carries a deny. So
  the screen was decided on a client state no record kept. Each showing now
  posts to `/api/crash-report` (`CLIENT-CRASH`, «No-pages screen shown (role)»)
  with the role, the route's page, `dest`, whether the matrix was the server's
  or the coded defaults, the counts of role pages, granted and denied pages,
  and whether a token was stored. Read the next one before guessing.
- **The report fired at once** (22:14 a leader on /production, 22:19 a
  brigadir on /zagruzka — each role's FIRST page, so the client had decided the
  role had none). The log was not readable from outside, so from that evening
  the DM itself carries the details (`component` = «NoAccess {json}»: the
  roles the held matrix gives the blocked page, the role's page count in it,
  how old the page-access and capability answers were — bucketed fresh /
  minutes / older so one cause stays one DM an hour — the granted and DENIED
  page lists, and whether an exam attempt was active). Once per page load
  (`noAccessChecked`): the re-check can put the route back on its loader and
  mount the screen again. And the screen asks the
  server again as it opens (both queries invalidated): a decision taken on
  stale data turns into the page by itself; a true «no pages» stays.
- **FOUND (21 Nov, the first detailed DM)**: a leader on /production, the
  screen decided for page `overview` with `dest` `/production`, 9 role pages,
  nothing denied, data fresh. The leader had opened «/»: `RequirePage`
  (overview) refused and rendered `<Navigate to="/production">`, which moves
  the address bar AT ONCE and the routes a moment later. A re-render of the
  still-mounted «/» route in that gap (the sign-in answer landing, a refetch)
  compared its target with `window.location.pathname` — already
  `/production` — read it as «already there, still refused» and showed
  «no pages». `RequirePage` now compares with the ROUTER's location
  (`useLocation`), so that re-render simply redirects again. Never compare a
  route decision with `window.location` — it runs ahead of the routes.
