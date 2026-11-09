// «Telegram profili» (/tg-user/:tid) — the words in the four platform
// languages, beside the page (the /ovens pattern). `fill(s, {n: 3})` puts the
// numbers in. What the person wrote (name, bio, channel) stays as they wrote it.

export const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

const uz = {
  title: "Telegram profili",
  username: "foydalanuvchi nomi", also: "yana: {list}",
  bio: "o'zi haqida", phone: "telefon", birthday: "tug'ilgan kun", age: "{n} yosh",
  location: "manzil", business: "biznes", paid: "xabar narxi", stars: "{n} yulduz",
  tgId: "Telegram ID",
  channel: "Kanal", members: "{n} obunachi",
  photos: "Rasmlar", gifts: "Sovg'alar", music: "Musiqa",
  copy: "Nusxa olish", copied: "Nusxa olindi", copyFailed: "Nusxa olib bo'lmadi",
  rating: "Telegram reytingi: {n}-daraja",
  zoom: "Rasmni kattalashtirish", playFailed: "Musiqani ochib bo'lmadi", play: "Ijro etish", pause: "To'xtatish",
  nothing: "Telegram bu hisobning rasmlari, sovg'alari va musiqasini botga ko'rsatmadi.",
  notShown: "Hikoyalar va «oxirgi faollik» botga ko'rinmaydi — Telegram ularni faqat odamlarga ko'rsatadi.",
  notFound: "Telegram bu hisobni ko'rsatmadi",
  notFoundMsg: "Hisob o'chirilgan yoki u botni hech qachon ishga tushirmagan.",
  back: "Orqaga",
};

const uz_cyrl = {
  title: "Telegram профили",
  username: "фойдаланувчи номи", also: "яна: {list}",
  bio: "ўзи ҳақида", phone: "телефон", birthday: "туғилган кун", age: "{n} ёш",
  location: "манзил", business: "бизнес", paid: "хабар нархи", stars: "{n} юлдуз",
  tgId: "Telegram ID",
  channel: "Канал", members: "{n} обуначи",
  photos: "Расмлар", gifts: "Совғалар", music: "Мусиқа",
  copy: "Нусха олиш", copied: "Нусха олинди", copyFailed: "Нусха олиб бўлмади",
  rating: "Telegram рейтинги: {n}-даража",
  zoom: "Расмни катталаштириш", playFailed: "Мусиқани очиб бўлмади", play: "Ижро этиш", pause: "Тўхтатиш",
  nothing: "Telegram бу ҳисобнинг расмлари, совғалари ва мусиқасини ботга кўрсатмади.",
  notShown: "Ҳикоялар ва «охирги фаоллик» ботга кўринмайди — Telegram уларни фақат одамларга кўрсатади.",
  notFound: "Telegram бу ҳисобни кўрсатмади",
  notFoundMsg: "Ҳисоб ўчирилган ёки у ботни ҳеч қачон ишга туширмаган.",
  back: "Орқага",
};

const ru = {
  title: "Профиль Telegram",
  username: "имя пользователя", also: "также: {list}",
  bio: "о себе", phone: "телефон", birthday: "день рождения",
  age: { one: "{n} год", few: "{n} года", many: "{n} лет", other: "{n} года" },
  location: "адрес", business: "бизнес", paid: "цена сообщения", stars: "{n} звёзд",
  tgId: "Telegram ID",
  channel: "Канал", members: "{n} подписчиков",
  photos: "Фото", gifts: "Подарки", music: "Музыка",
  copy: "Скопировать", copied: "Скопировано", copyFailed: "Не удалось скопировать",
  rating: "Рейтинг Telegram: уровень {n}",
  zoom: "Увеличить фото", playFailed: "Не удалось открыть трек", play: "Воспроизвести", pause: "Пауза",
  nothing: "Telegram не показал боту фото, подарки и музыку этого аккаунта.",
  notShown: "Истории и «был(а) в сети» боту не видны — Telegram показывает их только людям.",
  notFound: "Telegram не показал этот аккаунт",
  notFoundMsg: "Аккаунт удалён или ни разу не запускал бота.",
  back: "Назад",
};

const en = {
  title: "Telegram profile",
  username: "username", also: "also: {list}",
  bio: "bio", phone: "phone", birthday: "birthday", age: "{n} years old",
  location: "location", business: "business", paid: "message price", stars: "{n} stars",
  tgId: "Telegram ID",
  channel: "Channel", members: "{n} subscribers",
  photos: "Photos", gifts: "Gifts", music: "Music",
  copy: "Copy", copied: "Copied", copyFailed: "Could not copy",
  rating: "Telegram rating: level {n}",
  zoom: "Enlarge photo", playFailed: "Could not open the track", play: "Play", pause: "Pause",
  nothing: "Telegram showed the bot no photos, gifts or music for this account.",
  notShown: "Stories and «last seen» are not visible to a bot — Telegram shows them to people only.",
  notFound: "Telegram did not show this account",
  notFoundMsg: "The account was deleted or never started the bot.",
  back: "Back",
};

export const TXT = { uz, uz_cyrl, ru, en };
