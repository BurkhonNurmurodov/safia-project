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
profile is deleted too** when the one claim on it is refused. The HR DM still goes
out (it needs only the account id and language, read before the delete);
nothing undoes the delete. Requests
refused before this change (2 on 9 Nov) are left as they were.
