# Showcase — what to show the doctor

A running list of what the system does, in the order worth demonstrating. Keep
[SPEC.MD](./SPEC.MD) for the design; this is the walkthrough.

Statuses used below:

- **Ready** — built and working in the web app
- **Needs server** — the screen is built; it lights up once the matching server
  module lands

---

## The four steps that must work

From §13. If time runs short, cut anything else before cutting a step of this.

1. **Book an appointment on screen** — Ready
2. **A slip prints, with a QR code** — Needs server (print driver)
3. **A WhatsApp reminder arrives on a phone** — Needs server (Baileys + send loop)
4. **Scan the slip → the patient opens on the phone, and the desk screen jumps
   to them** — desk side Ready, needs server `/s/:ref`

Step 4 is the moment that sells it. Paper becomes a remote control for the
system. Practise it twice before the doctor is in the room.

---

## 1. Booking — the desk screen

**Ready.** The screen the secretary lives on.

- The day on one side, booking on the other. Booking never scrolls the day away.
- Pick an appointment type, and only the times that actually fit appear. A
  20-minute check-up and a 90-minute root canal see completely different gaps in
  the same day — worth showing back to back, it makes the point instantly.
- Booking opens a panel over the day; the day stays visible behind it.
- **Existing patient**: type a few letters of a name or a phone number.
- **New patient**: one toggle, name and number, done. A walk-in never becomes a
  second screen.
- Phone numbers are typed the way they are written in the paper book —
  `0100 555 4433` — and stored properly as `+201005554433`. The secretary is
  never asked to format anything.
- The day, and the type, are in the address bar. A tab can be left open on
  tomorrow.

**Say this:** the paper book is still on the desk during the pilot. This has to
be faster than it, or she will go back to the book and everything downstream
goes stale.

## 2. Double-booking is refused

**Ready in the mock; the real guarantee is the server's overlap check.**

Two appointments cannot overlap. It is enforced in a transaction at the moment
of writing, not by hiding buttons — so two people booking from two screens at
the same second still cannot collide. Worth stating plainly; it is the one hard
correctness promise in the system.

## 3. The patient page

**Ready.** This is what a scanned slip opens.

- Name, number, and any notes.
- **Next visit** in its own card — the one thing you want when someone is
  standing in front of you.
- Full history underneath, cancelled visits included and marked.
- The phone number is a link. On a phone, tapping it dials.

## 4. Scan-follow

**Desk side Ready. Needs server `/s/:ref`.**

Scan the QR on a printed slip with any phone camera. The patient's record opens
on the phone — and the desk screen jumps to the same patient by itself.

One refinement worth mentioning: if the secretary is halfway through booking
someone when a slip is scanned, the screen does **not** yank itself away. It
shows a banner naming the patient and waits. Her half-typed booking is never
destroyed by someone in the waiting room scanning a bit of paper.

## 5. Failures are loud

**Ready.** The banners live at the top of the desk screen.

- **Nothing came out of the printer** — names the job, the printer, and how many
  times it tried, with a **Print again** button. Reprinting just renders it
  again; no print job is ever "lost".
- **These patients were not reminded** — the ones the system could not message,
  each with the reason and a **tappable phone number**. She reads the list and
  picks up the handset.

**Say this:** a silent failure means a patient is never told and nobody finds
out until they do not show up. So nothing fails quietly — it either worked or it
is on the screen in front of her.

## 6. WhatsApp linking

**Ready. Needs server for a real session.**

- When the number is not linked, the desk shows the pairing QR and the exact
  steps. Linking is done at the front desk, not from a terminal — the person
  holding the phone is in the clinic, and you are not.
- **Test mode** is shown explicitly. A connected WhatsApp that silently sends
  nothing looks identical to a working one; the screen says which it is.

## 7. Arabic and English

**Ready.** One toggle in the header. The whole layout mirrors — this is a real
RTL build, not Arabic text in a left-to-right page.

Everything clinic-specific is configuration, not code: name, address, working
hours, appointment types and their durations, reminder wording. The second
clinic gets a different `config.json`, not a different program.

## 8. Live updates

**Ready. Needs server events.**

Two screens stay in step. Book on the tablet and the desk updates itself — no
refresh button anywhere in the app.

---

## Points that land with a doctor

- **Paper is not replaced, it is guaranteed.** Every booking prints. The day
  schedule prints each morning with a wide blank column, so he can keep writing
  on it exactly as he does now.
- **The printed schedules are themselves a backup.** If every digital thing were
  lost, the clinic still knows who is coming.
- **Backups.** Database, WhatsApp session and config, verified after each run,
  kept locally and off-site. Off-site copies are encrypted before they leave the
  building — these are medical records, and that is worth saying out loud.
- **It runs on the clinic's own PC.** No cloud, no subscription, no patient data
  leaving the building except an encrypted backup.
- **Stats, not paperwork.** Bookings taken, reminders sent, failures, no-shows —
  on a screen. This is the number that justifies the fee.

## Do not promise these

Deliberately out of scope: patients booking themselves over WhatsApp, any
chatbot or reply handling, payments or billing, clinical and treatment records,
user accounts and permissions. Ask before agreeing to any of them.

---

## Running it for the demo

```bash
bun install
cp config.example.json packages/server/config.json   # edit for the clinic
bun run dev
```

Open <http://localhost:8080>. The phone must be on the same wifi as the PC, and
the PC wants a static LAN IP or a DHCP reservation — otherwise the QR codes on
already-printed paper stop resolving.

Set `whatsapp.dryRun: true` while rehearsing so nothing is actually sent, and
turn it off for the live send in step 3.
