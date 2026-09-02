# Late Proofs & Objections — how the two "ways back" work

*Safia Dashboard · Leaders monitoring · feature reference + leader instructions*

---

## Why they exist

Both features answer the same complaint from the floor: **a task can score 0 without anyone having decided that it should.**

A per-task deadline passes and the task auto-closes at 0 — the same outcome for the leader who never did the work and for the leader who did it and couldn't file in time (dead phone, a line that ran over). And an AI verdict deducts the task's whole weight the moment the flag is written, with nobody pressing anything.

So the platform now has two routes back, and deliberately they are **the same route in two places**: the leader speaks first, their brigadir judges whether the account is true, and only an admin can restore the point. A leader who missed a deadline and a leader the machine misjudged are the same person asking the same thing, so answering them through two different flows would have taught nobody anything.

---

## Part 1 — Late Proofs («Kechikkan isbotlar»)

### What it is

After a task's own deadline has gone by, the leader can still send the proof photos plus a written reason. It earns **no point on its own** — two people decide whether it earns one at all.

Nothing about the existing close changes. The task is still force-closed, still recorded not-done, still locked, the day still closes on its schedule and the score is still stamped as it always was. The late proof is a **separate record with its own photos**, which is what keeps every other part of the system unaware of it. In particular, **the AI never sees a late proof** — there is no verdict, no queue entry. A late proof is judged on *why* it is late, which is a question about a person, not about a photograph.

### When the door is open

A task is late-fileable while *all* of these hold:

- the unit closes tasks **one at a time** (per-task mode — nothing else has a per-task deadline to miss);
- the task's own window has **opened** and its deadline has **passed**;
- **its day is still open** — shift 1 files until 23:59, shift 2 until 09:00 the next morning;
- the task was **not actually done**;
- **no late proof already exists** for it;
- it isn't a task an admin handed back (those run on the day's deadline and aren't late).

"Its day is still open" is the window. The late door shuts when the checklist shuts, so a proof can never arrive for a day whose score has already been reported and read. A leader who filed *nothing* all day can still use it — an untouched day counts as open.

### The two-stage decision

The asymmetry is the design, not an omission:

| Stage | Who | Can do | Cannot do |
|---|---|---|---|
| 1 | The unit's **brigadir** | **Reject** (final) or **uplift to the admins** — an uplift *requires* their own written case | Grant the point |
| 2 | An **admin** | **Approve** or **reject** | — |

The person closest to the leader knows best whether the excuse is true, and is the worst possible choice for the only person who decides that it counts. This is enforced by which buttons exist at each stage, and re-checked server-side on every write ("you are a brigadir" is not "you are *this unit's* brigadir").

**Approval gives full weight** — not a fraction — through the same read-time override an admin's manual done/not-done ruling uses, so it moves the register, the leaderboard, the day report and the corrected report DM at once. The lateness is never laundered: the record, its chip and the day report all go on saying the proof arrived late and who decided it counted.

**Nothing expires it.** An undecided filing waits in both queues with a badge until a person acts, because the default is already 0 and a silent auto-reject would only take the decision away from the two people the flow exists to put it in front of.

### Provenance

Every photo carries whether it was **shot in the app** («ilovada») or **uploaded** («yuklangan»), plus its capture time and server stamp, and the card shows it — because a stamped shot and a hand-picked file that look identical would teach reviewers that the stamp is decoration.

---

## Part 2 — Objections («Norozliklar»)

### What it is

An objection argues a task the **AI rejected**. The old flow had one stage: the brigadir objected, straight to an admin. Two things were wrong with it:

- **The person who was judged could not speak.** The leader reads the verdict on their own day report, sees a photo they know is right refused for a reason they can answer, and had no control that did anything. Their only route was to persuade their brigadir to type it up — so what reached the admin was a second-hand paraphrase of an argument nobody recorded.
- **The admin ruled with one side of it.** One note, from somebody who was not there, about a photograph they did not take. Whether the reason is *true* is a question about the shift, and the person who can answer it is the brigadir — who was being asked to be the author instead of the witness.

### The chain

```
leader      files their own account, from the day report they were sent
brigadir    REFUSES it (final — the AI ruling stands) or UPLIFTS it,
            which requires their own written case
admin       reads BOTH notes and decides whether it is pointed
```

**Where a filing enters is decided by who filed it.** A leader → the brigadir stage. A brigadir → straight to the admins, their text recorded as the uplift. An admin → filed and settled in one act (an admin asking themselves for permission is not a flow). The brigadir's door stays open because ~18% of leader rows never resolve to a login — those leaders can't file for themselves, and making this leader-only would have closed the route back for exactly them.

**A brigadir's refusal touches no scoring column.** It settles the objection record and leaves the score where it already was. Only the admin stage restores weight, by writing `approved` on the verdict — the same field an admin's ordinary triage ruling writes, so nothing downstream learns a new rule.

**A settled ruling has an undo** (admin only, «Qarorni bekor qilish»). The verdict returns to open, the objection is marked cancelled rather than deleted — a score that moved twice has to stay explainable — and the leader may object again with a better account. Everyone who was told about the ruling is told it was reversed.

### Where all three read it

`/leaders` → **«Norozliklar»** and **«Kechikkan isbotlar»**, the last two tabs, sitting together because they are the two ways a task that scored 0 gets its weight back. Both queues are split by stage — **«Adminlarda»** and **«Brigadirlarda»** — and the tab badge counts the admin half, the only stage where the weight actually comes back.

Admins see everything, brigadirs see their own unit, **leaders see their own filings** — the flow asks a leader to explain themselves, so what became of that explanation has to be visible to them.

The objection card carries the **verdict, not just the objection**: the AI flag («Sana mos emas», «Rasmda sana yo'q», «Rasm vazifaga mos emas», «Bajarilgani ko'rinmayapti», «Rasm o'qilmadi»), the model's own prose, and the time window it measured against — plus **every note the chain has collected, in order**. Showing only the first and the last would hide the middle judgement, which is the one that decided whether an admin ever saw it.

Everybody is notified at every stage that takes the decision out of their hands. A leader who explained themselves and heard nothing back learns that explaining is pointless — which is the one outcome that would make the whole chain worthless.

---

## Instructions for leaders

### A — You missed a task's deadline

1. Open the bot and go to **«Vazifalar»**. A task whose time has run out still shows a button: **«📤 Kechikib topshirish»**.
2. You'll get a warning screen naming the hour that passed and stating plainly: **ball avtomatik berilmaydi** — the point is not automatic. Press **«📤 Ha, topshiraman»** to go on.
3. Send your proof photos. Two doors, side by side:
   - **«📷 Ilovada suratga olish»** — shoot in the app (the server burns the time stamp in);
   - **«🖼 Mavjud rasmni yuborish»** — send a photo you already have, straight into the chat.

   The counter shows how many are ready. **«🗑 Rasmlarni tozalash»** clears them and starts over. At least one photo is required. Your photos are kept while you write — you won't lose them.
4. Press **«➡️ Sababni yozish»** and write **why you were late**. This is mandatory and it is what the decision is actually made on. Be concrete — "the line ran over until 23:40 and I photographed it the moment it stopped" beats "I was busy". Your brigadir and the admins both read this exact text.
5. Confirm. You'll see **«✅ Kechikkan isbot yuborildi»**, and the card goes to your brigadir with your photos attached.
6. **Watch for the answer in the bot.** You'll be told at every step: «brigadirda ko'rib chiqilmoqda» → «adminlarga yuborildi» → «tasdiqlandi · full points» or «rad etildi · 0».
7. You can follow your own filings any time at **`/leaders` → «Kechikkan isbotlar»**.

> **Do it the same day.** The door closes when your checklist day closes — 23:59 for shift 1, 09:00 the next morning for shift 2. Once the day shuts, nothing can be filed for it, ever.

### B — The AI rejected a task you know you did

1. Open your **day report** — the button on the report message the bot sends you.
2. Find the rejected task. The card shows the AI's flag, its reasoning and the time window it measured against. **Read that first** — it usually tells you exactly what to answer.
3. Press **«Norozilik bildirish»**.
4. Write **why the rejection is wrong**, pointing at the evidence. Good: *"the clock is visible in the top-right corner of the photo but the AI misread it"*. Weak: *"I did the task"* — that isn't an argument about the verdict.
5. Send it. It goes to **your brigadir first**. They either refuse it (the AI ruling stands and the task keeps its 0) or pass it to the admins with their own written case. Only an admin can give the point back.
6. You'll be notified at every stage, in the bot. You can also follow it at **`/leaders` → «Norozliklar»**.
7. **If it was refused, you may object again** with a better account — but a refusal with the same words will end the same way. Add the fact that was missing.

### Worth knowing

- **These two are not interchangeable.** Missed the hour → *late proof*. Filed on time but the AI refused it → *objection*. Only tasks the AI actually rejected can be objected to.
- **Only one live case at a time** per task. You can't file a second while the first is still being decided.
- **Late is never hidden.** An approved late proof gives the full point, but the record keeps saying it arrived late and who decided it counted. The feature exists to be fair, not to erase the delay.
- **Nothing decides itself.** Neither queue times out. If your case is sitting with your brigadir, a person still has to open it — chase them if a day passes.
- **The reason is the whole submission.** Photos alone can't be ruled on, and neither can "sorry". Two people who weren't standing where you were have to be able to tell from your text whether it's true.
