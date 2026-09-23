# DECISIONS

Why the code is the way it is.

**Open work is not here.** It lives in the Notion Tasks database. This file was
once a blocker log (`BLOCKED.md`, 10–23 Aug 2026); everything in it that was a
thing still to do became a task on 24 Aug and was removed. What is left is the
reasoning — the choices that are lossy, that depart from a design, that break a
rule on purpose, or that were made once and should not be re-litigated from
scratch by whoever reads the code next.

Two entries are kept as **corrections**: they were written, they were wrong, and
deleting them would let the same mistake happen again.

---

# Data model

## Two refs, and the patient's is the only one in the UI

`appointments.ref` is `DDMMYY-XXXX`, scoped to a day because an appointment
happens on one. `patients.ref` is `XXXX` alone — four characters from the same
alphabet, no date, because a patient is not an event.

The patient ref exists because the clinic's paper book is **one page per
patient**, and that number goes at the top of the page. That is the whole
requirement, and it is what settles the format: four characters is what someone
writes by hand without resenting it, and the alphabet already drops `0/O` and
`1/I/L` so it survives being written and read back. 31⁴ is 923,521 codes — at
ten thousand patients a draw collides about once in ninety, which the UNIQUE
constraint and a retry absorb. Sequential (`P-0041`) was the alternative and
was not taken: it is no easier to write and it tells anyone holding the page how
many patients the clinic has.

So the appointment ref came off the record's history rows and out of the payment
confirmation. It is not gone — it is still on the day view's detail sheet and is
still what a reminder quotes down the phone (`REMINDER_PLACEHOLDERS`), both of
which are a ref being *said*, not written on a file. It is simply not an
identifier the desk copies anywhere.

`legacy_ref` stays and is a third, different thing: the *old* system's number,
free text, `NULL` for anyone registered since the migration. A record can carry
both, and during the changeover most will — one is ours and always present, one
is theirs and only on patients who predate us. The `LEGACY` badge still says a
record came across; the old number itself is still not drawn on the header,
which was already the call when the phone was the only number on that line and
is more clearly right now there is a ref beside it.

**Superseded, 21 Sep 2026, by the entry below.** An old patient has one number
now, not two, and it is theirs.

## Correction: an old patient has one number, and it is the one on their file

The entry above is right about the two *kinds* of ref and wrong about what
happens when a patient predates the clinic's move to this app.

What it described was built, and it did this: a patient entered with old ref
**710** was written with `legacy_ref = '710'` and then handed a fresh
`patients.ref` off the counter anyway, so the record read **909**. The header
drew 909 and a generic `LEGACY` badge, deliberately not drawing 710. The desk
was holding a paper file marked 710 and looking at a screen that said 909, with
nothing joining the two, and the migration had silently eaten a number the next
genuinely new patient was owed.

**Decided:** an old patient's `ref` **is** their old number. `legacy_ref` holds
the same string — it is what marks the record as having come across — and
`ref`'s UNIQUE constraint is what refuses the same number twice. Registering one
allocates nothing, so the sequence is untouched. Search matches on `ref` and
`legacy_ref` as well as name and phone, because the number on the file is what
the desk types. The badge draws the old number inside it (`OLD 710`) only where
it differs from the ref — which is now only the records written under the old
flow, and exactly the case where hiding it costs something.

Two refusals fall out of it, both the server's because only it can see the
register: a number another patient already has (`PATIENT_REF_TAKEN`), and a
plain number **at or above** the next patient number (`PATIENT_REF_RESERVED`).
The second looks strict and is not: the whole premise of a cutoff is that every
old number is below it, so it only fires on a mis-key (9100 for 910) or on a
clinic that has not set its next number yet. Left alone, that record is one that
cannot be kept — the sequence reaches 9100 eventually and refuses the *new*
patient, months later, for something typed today.

The records already written the wrong way are repaired by `bun db:repair-refs`
(`modules/migration/repair.ts`), which reports first and writes only with
`--apply`. It is a script and not part of `0011_patient_ref_next.sql` because it
cannot always succeed — an old number may already be another patient's ref — and
a migration that runs unattended on boot would have to either fail the boot or
skip silently. Neither is a thing to do to a clinic's register. It is idempotent,
and the two verdicts it refuses to act on (`taken`, `reserved`) each name what a
person has to decide first.

## Correction: `patient_ref_last` was read as "next" by everybody, including us

`settings.patient_ref_last` was the last number handed out, and the field in
Settings → Clinic said `Last patient number`. A clinic carrying on from a paper
count typed **910** and the next patient came out as **911**.

That was the documented behaviour and it was wrong about what the words mean. A
clinic setting up does not think "the last number I used"; it thinks "start
here". The column is `patient_ref_next` now, the field says **Next patient
number**, and the value is handed out as it stands: set 910 and the next two new
patients are 910 and 911. `0011_patient_ref_next.sql` renames the column and
adds one to every stored value, so no clinic's next registration shifts across
the rename.

The floor moved with it. Settings used to refuse a value *below* the highest ref
on file; it now refuses one at or below, because the value is handed out rather
than incremented first.

## Imported history is an appointment with no visit

An old patient's file often records work: two fillings in 2024, a root canal
last year. That belongs in the record's History and in nothing else — it must
not create revenue, a balance, a reminder, a queue entry or a statistic, and the
single figure a patient carries over stays **Owes**, the opening balance.

**Decided:** it is an `appointments` row flagged `is_imported`, `done`, carrying
`appointment_procedures` and **no visit at all**. No visit is the whole of it: a
visit is where money lives (§10), so a row without one cannot charge, owe or be
paid, and every money reader already joins through visits. The two readers that
count *appointments* rather than visits — the day view and `stats.summary` —
exclude it explicitly, the same way they already exclude an opening balance.

A dedicated `imported_procedures` table was the alternative and was not taken:
it would make `PatientHistoryEntry` a union and touch every renderer, to store
exactly what `appointment_procedures` already stores.

Lines are grouped by the day the file gives, so an afternoon reads as one
afternoon, and §5's once-per-list rule applies per day — the same tooth
extracted on two different days is two real lines. `date_unknown` marks the rows
the file did not date: `starts_at` is NOT NULL so they carry the cutoff instant,
and the flag is what stops the record reading that out as though it were the
day. The row draws a blank stamp and says *Before migration* instead.

## These rows are stamped at noon UTC, and nothing else in the app is

Every other date the API takes arrives with an `offsetMinutes` and is turned
into a day's bounds, because the question is always *which local day does this
instant fall in* (§12, `dates.ts`). An opening balance and an imported procedure
ask the opposite. They carry a day somebody wrote on a paper file years ago, and
all that has to survive is the day being **read back**.

Local midnight cannot do that. Egypt keeps DST, so midnight stored under one
offset is 23:00 the previous day under another: a procedure dated 14 March 2024
and stamped with a summer offset reads as the 13th. Getting it right would need
the offset in force on each of those dates — and the registration form cannot
know the one in force on a cutoff it never sees, because the cutoff lives in
Settings.

**Decided:** these rows are stamped at **noon UTC** on the day they name. Noon
reads back as that same day at every offset strictly between −12 and +12 —
which covers every clinic this app is for, Egypt being +2 or +3, and every zone
short of the date line — so the `old` block sends no `offsetMinutes` at all. It is safe
precisely because nothing rounds these rows into a day's bounds: the day view,
revenue and statistics all exclude them by flag, so no range query ever has to
agree with the stamp.

This does not generalise. A real appointment is an event at a time and keeps the
offset it was booked with; only a row whose date is a label may do this.

## The Old patient block was built without a design

`patient-edit.html` draws BASICS and the clinic's questions and nothing else;
the Open Design folder has fourteen screens and none of them has a switch on it.
So `components/OldPatientCard.tsx` is built from the tokens and from the shapes
that screen already settles — an eyebrow, a card of ruled rows, a list under its
own eyebrow — and recorded here rather than passed off as drawn.

Two choices in it are worth keeping:

- **The switch does not clear the fields.** Turning it off hides them and sends
  nothing; what is typed stays typed. A mis-tap that loses a number read off a
  paper file is worse than one that does not, and the guarantee the criteria
  actually ask for is about the *payload*, which `createInputOf` owns.
- **The catalogue and tooth sheets are the day cluster's, reused.** A procedure
  the doctor may record is exactly a procedure the old system may have recorded,
  and a second catalogue would be a second thing to keep in step with §5. They
  are driven by the day cluster's own query hook for one reason: `ProcedureSheet`
  takes a `RequestError`, and that hook is what produces one.

## An age is stored as 1 January

`patient-edit.html`'s basics row is `Age · sex` and holds a whole number.
`patients` has no age column: `birth_date` is the fact and `age` is derived from
it at read time (`ageFromBirthDate`), deliberately, because a stored age is
wrong within a year of storing it.

**Decided:** the row is drawn exactly as designed, and an age of 34 is written
as `1 January (this year − 34)`. That reads back as 34 all year and as 35 next
year — the patient ages, which is the point. What is lost is the day they age
*on*, which is what a clinic that only ever asked "how old are you?" never knew
either.

The lossy half is guarded rather than accepted: `birthDate` is only sent when
the age **string** on screen differs from the age the record arrived with. A
patient booked in through the day cluster — `patientDraft.ts` asks for the real
date off an ID card — therefore never has it flattened to 1 January by an editor
that was opened to fix their phone number. Covered in `patients.test.ts`.

**If this is wrong**, the fix is a designed date-of-birth row, not a code
change: `day/patientDraft.ts` already has the digits-only `DD / MM / YYYY` field
and its validation.

## `is_opening_balance` is on `appointments`, not on `visits`

The task specified `visits`. It went on `appointments` instead, because every
reader that has to tell a carried-over balance apart from a real one already
joins `appointments` and one of them can only reach it there: `stats.summary`'s
appointment counts are `FROM appointments` with no visit join, and
`appointment.byDate` — the day view — has no visits in it at all. On `visits`
the cutoff date would still have drawn four hundred `done` appointments nobody
attended.

## `patient.byId` returns `history`, not `visits`

The design's history row leads with the procedure and says whether the patient
came. A visits-only query could say neither, and a no-show — which never
produces a visit — was missing from the record entirely.

`patientService.byId` returns `history`, driven from `appointments` with the
visit left-joined:

- `status` — the appointment's, so `Came` / `No-show` / `Cancelled` is sayable.
- `procedures` — from `visit_procedures` when the patient reached the chair
  (those carry the price actually billed), from `appointment_procedures` when
  they did not, which is the only record of what was going to be done. Both are
  one query for the whole history, not one per row.
- `visitId` is nullable; the money columns are `0` on a row that never became a
  visit, and the client draws no amount at all rather than `EGP 0`.

## `patient.recent` returns a payload, not a bare array

`patient.recent q ({ limit }) → { patients, total }`. The heading's count is the
whole register and the page is capped at the limit, so the two cannot be read
off one array — and a second procedure for one integer would be a wasted round
trip over Tailscale on a screen that draws them together.

Related: `patientService.search` answers `[]` for an empty term, deliberately.
Browsing is `recent`; searching is `search`.

## There are no users, and that is the design

There is no `users` table, no login, and no server-side notion of who is holding
a phone. SPEC §1: **reachability on the tailnet is the authorization model.**
What exists is the role (§6), local to the device and switchable by anyone
holding it.

Real accounts would be a schema change and a genuine permission boundary, not a
settings row. The reasoning lives in `components/RoleSwitchSheet.tsx`, which
replaced an entire Users pane with a confirm sheet on the settings index.

## Both roles record procedures; the desk may leave them empty

The dentist asked on 12 Sep 2026 that the secretary stop entering procedures.
The first build (PR #56) read that as taking the editor away from her, behind a
"who records procedures" clinic setting defaulting to doctor only. That was
wrong: what he meant was that she should be *able* to leave them empty, not
that she loses anything. Reversed on 15 Sep 2026.

### No setting

`settings.procedures_recorded_by` is dropped (`0010`), with its Settings →
Clinic control, `day/recording.ts` and `day/useProcedureRecorder.ts`. Both
roles get the procedure editor everywhere the desk had it before #56.

### Procedures are optional until checkout

Booking, check-in and a patient still waiting may all have an empty list: what
is done is decided in the chair. Checkout is the one place a visit needs at
least one line, because there is nothing to charge without it. `VisitScreen`
refuses Confirm and Send to desk on an empty list once the patient is in the
chair or past it, and `visit.checkOut` refuses it too (`VISIT_HAS_NO_PROCEDURES`),
on the server and in the demo, so no other caller can close an empty visit. An
opening balance is exempt: it stands for carried-over debt and never has lines.

### Check-in adds no consultation

Check-in used to add the clinic's checkup line to every visit, so every booking
carried a Consultation and an empty check-in still had a line to charge. It no
longer does, on the server or in the demo: a visit opens with exactly what was
booked, and a consultation is a line someone picks. The waiver stays — a
checkup on a visit with other work on it is still not charged (PRODUCT.md) — and
checkout's refusal of an empty visit is now what stops a visit closing with
nothing on it.

### Rescheduling edits the plan too

A move asks all three questions: Procedures (seeded from the booking), When,
Confirm. The procedures are sent only when they changed, and a move that
changes only the plan keeps its time.

### The doctor edits future bookings

`DoctorVisitSheet` offers "Edit booking" on a booked appointment, which pushes
the same reschedule page over the doctor's day.

### The doctor books from a patient's record

The record's Book and Walk-in work on both roles. The shell routes them to
whichever day screen is mounted, and `DoctorDayScreen` opens the same
`BookingScreen` the desk's does. The server never gated booking by role, so the
desk-only rule lived in the client and nowhere else. The doctor's day still has
no FAB; the record is his way in.

A booking opened from a record returns to that record, both from Back and once
it is booked, because the record is where the user came from. The day under the
page is where the shell happened to mount it.

### The desk can discount at payment

`VisitPaymentScreen` has a Discount field that takes an amount off the charge
the lines add up to, and checkout is sent the lower `chargedTotal`. It cannot go
below what has already been paid. It was added when the desk lost the line
editor and is kept now that it has it back: a discount at the till is quicker
than repricing a line.

Two costs, both accepted for now: the discount is not stored as a discount —
only the lower charge is — so reports cannot tell a discounted visit from a
cheap one; and if the doctor edits the lines afterwards, `setProcedures`
recomputes the charge and the discount has to be given again.

**To reverse:** remove the Discount block and pass `visit.chargedTotal` again.

### The doctor's editor is `VisitScreen`, pushed over his day

`DoctorVisitSheet` has "Record what was done" once the patient has arrived
(checked in, at the desk, or done). It pushes `VisitScreen` in `checkout` mode
with the queue's standing. Confirm saves and returns to the day; Send to desk is
there for the patient in the chair. The doctor never reaches payment.

Editing a finished visit leaves it reopened with the appointment still `done`,
as an abandoned correction already could. The desk closes it through Edit visit.
Nothing prompts them to.

### UI only

`CLIENT_ROLES` stays a client-side preference. The server accepts
`visit.setProcedures` from any caller, as the task said; this is about which
screens each phone draws, and the role remains switchable by whoever holds it.

---

# Client architecture

## Crossing clusters is the shell's job, and it moves requests, not routes

Each cluster owns its own stack, so none of them can push a screen into another
one — which is why the patient record drew Book, Walk-in and Record payment and
let all three toast. The fix is in `shell/routes.ts`: the ask goes up to
`AppShell` and back down as a *request* carrying what the destination needs plus
a `seq`, and the destination cluster decides which of its screens that means.
`seq` is what makes one ask distinguishable from the last, so the same patient
can be booked twice; a cluster reads it during render, not in an effect, so the
screen is up in the same commit as the tab switch.

Going home — tapping the tab you are already on — runs the same wire backwards
and for the same reason. The shell cannot pop a route it does not own, so it
bumps a counter per tab and each cluster resets itself, deciding for itself what
home is. The Patients tab also scrolls its list to the top, because home there
is the search field and the register is longer than a screen; the other three
only pop.

A real navigator (SPEC §18 F3) gives both of these for free and both are written
to be deleted when one lands: every request is already the shape of a route's
params, and `goHome` is `popToTop`.

## A payment is taken against a patient, and the server allocates it

Money is handed over by a person, not by a visit. The desk knows what was paid
and who paid it; which of their unsettled visits it belongs against is
arithmetic, and arithmetic is the server's.

So `balance.settle` takes `{ patientId, amount, method }` and fills the
patient's unsettled visits **oldest debt first**, in one transaction, returning
the per-visit split. Record payment on the patient's record opens a sheet in
place — two fields, how much and how — and the desk never leaves the patient
they are looking at.

This reverses the entry that stood here, which had the button push into the
money cluster and land on a list of that patient's visits so one could be
picked. That was a fair reading of a real constraint — `visit.recordPayment`
took one `visitId` — but the constraint was the thing to fix. Asking the person
holding the cash to work out that 6,000 covers this visit and 150 of the next
one is asking them to do by hand what the server does exactly, and to get it
wrong in a way nothing would catch.

Two things that fell out of it, both wanted:

- **`PatientBalanceScreen` and `VisitPaymentsScreen` are gone**, and with them
  the money cluster's routes. Tapping a debtor opens that patient's record. Per
  visit money did not go with them: the record's history rows carry what was
  charged and what is still owed, and opening one reaches `VisitViewScreen`'s
  payment tab.
- **Record payment stopped being a cross-cluster request.** `onBook` and
  `onWalkIn` still are, and the mechanism in `shell/routes.ts` stays for them.

What is deliberately *not* here: a credit balance. Overpayment is refused at the
patient level rather than parked, because §10 derives every balance from charges
and payments, and money that belongs to no visit would have to be stored.

### The confirmation says what came in and what is left, and names no visits

It read *"EGP 6,000 — settled 060826-5NCC, part-paid 120826-57UQ"*, on the
reasoning that the desk posts to the paper file **per visit** and the ref is how
paper and app are matched.

That premise was wrong. The clinic's paper book is one page per patient
(confirmed 26 Aug 2026), so the desk posts one line against one page and those
refs pointed at pages that do not exist. It now reads *"EGP 6,000 recorded — EGP
3,550 still owed"*, or *"paid in full"* when it clears the balance — closing a
page is a different mark from writing a figure on it.

The allocation is unaffected. Balances are derived per visit (§10) and the
oldest-first split is unchanged; `balance.settle` still returns it, because a
receipt and an audit both need it. It is simply bookkeeping nobody copies out.

## Book and Walk-in are one screen with two openings

`BookingScreen` already made the walk-in the "now" answer to *when*, so the
record's two buttons are not two flows: both push that screen for the patient
they are on, and differ only in the answer it opens on. What they skip is
`BookPatientSheet`, whose only question — who is this for — the record has
already answered.

They are passed only on the secretary's phone. The doctor's day view has no
booking on it to reach, so on his the record keeps the screen's own fallback,
which names where the flow lives rather than failing silently.

## One branch or all of them — deliberately unsettled

The day view queries every branch (`appointment.byDate`'s `branchId` is optional
and is not passed) and the walk-in books into `branch.list`'s first row. With one
branch per clinic PC that is right, and a selector would be a control that never
changes anything; with two, the walk-in silently lands in the wrong one.

The spec settles the neighbouring question — "branch is not part of the
exclusion, one practitioner" (§5) — but never says whether a client sees one
branch or all of them. `settings.schedule` hints at one: each weekday row
carries a single `branchId`, so the clinic's own schedule assumes one branch is
open on a given day.

**If it is more than one**, this needs a branch in the app's *own* settings (the
device's branch, not the clinic's) rather than a picker on the walk-in sheet —
the secretary sits in one room and should not choose it per patient. That is the
app shell's, alongside the server address, and it is what the settings index's
identity card and the branch list's "YOU'RE HERE" tag are both already asking
for.

## The calendar sheet asks two different branch questions, one per surface

`isClosed` takes an optional `branchId`, and the month sheet passes it in one
place and not the other. That is the decision, not an oversight left standing.

The **month grid** stays unscoped. It counts every branch on purpose — "is
Thursday busy" is not a question the desk asks one branch at a time — and
`busiest` is what pays for the imprecision: the pick carries the branch holding
most of that day and the day view moves with it.

The **summary line under the grid** is scoped, to `busiest ?? branchId`. It is
not describing the month, it is describing the one day the desk is about to
commit to, and `onPick` already hands that day's busiest branch back. Unscoped,
it read "Closed that day" off whichever branch `clinic_days` happened to list
first for that weekday — so a clinic running Maadi on Friday and Nasr City on
Wednesday got a verdict belonging to neither of the branches on screen.

The scoped line can now disagree with the cell above it: a day the grid draws as
open, because some branch works it, can say "Closed that day" underneath. That
is the honest reading of two different questions, and the disagreement is the
information — the grid says the clinic has that day, the line says the branch
you are about to open does not.

## **Correction.** The chair's bar measures the booked slot, not the arrival

`slotProgress` used to run the clock from `checked_in_at` while leaving the end
where it was booked, so an early arrival lengthened the visit: twenty booked
minutes seen half an hour early were fifty minutes of room. The argument was
that a bar sitting at zero until the booked start tells the doctor he has not
begun something he is already doing.

That is true of someone twenty minutes early, and it is not true of this clinic.
The desk checks people in as they walk through the door and they queue, so the
gap between arrival and the booked end is not a visit. A 30-minute consultation
booked for noon, checked in at 08:47, drew `0 / 223 min`.

The denominator is now `duration_minutes` and nothing else, and the bar does not
run before the slot opens. That is a worse answer to the case the old rule was
written for and the right one for the case that actually happens.

The honest fix is a seated-at timestamp — `checked_in` means arrived, not
seated, and there is no record of when anyone reaches the chair. Until that
exists the bar draws the slot, which it can name, and not the visit, which it
cannot. Anyone adding that column should read this entry first: the bar is
waiting for it.

## **Correction.** The bar runs from the check-in after all

The entry above changed two things and only one of them was wrong.

`0 / 223 min` came from the **denominator**. The old rule set it to
`bookedEnd - checkedInAt`, and it was that subtraction that produced 223 — not
the fact that the clock started at the arrival. Pinning the denominator to
`duration_minutes` fixed the number completely. Moving the start to the booked
slot was a second change riding along with it, and it broke the bar: a patient
the card calls **IN THE CHAIR** sat at `0 / 45 min` and stayed there. Seen on a
real check-in at 08:24 against a slot booked for 13:30, the bar had five hours
of nothing to show before it would move.

A card that says someone is in the chair and a bar that says nothing has started
cannot both be right. So `slotProgress` now runs `duration_minutes` from
`checked_in_at`, and falls back to the booked start only when there is no
check-in to read — whoever is at the desk, who gets no bar anyway.

Two consequences, both accepted:

A patient seated half an hour late gets a full fresh slot. That is right. The
bar measures the visit, and a procedure booked for thirty minutes still takes
thirty minutes whenever it starts. Whether the clinic is behind is a different
question, and `dayDelay` already answers it.

A patient who arrives hours early and queues will read as running over while
they are still in the waiting room. That is the cost, and it is the seated-at
gap again: `checked_in` means arrived, and the chair is the head of the arrival
queue rather than anything anyone wrote down. The trade is deliberate. The case
this gets wrong needs a long queue and a very early arrival; the case the
previous rule got wrong was every check-in that happened before its slot opened,
which at this clinic is most of them.

The seated-at column would end both entries. It is still not built.

## **Resolved.** `visits.in_chair_at` — the column both entries were waiting for

Three rules were tried on one timestamp and all three failed, because the thing
being measured was never recorded. Arriving and being seated are different
events. `checked_in_at` is the first one. Nothing was the second one.

So the visit measured from the arrival read `11:40 over` for a patient the
doctor had not yet seen: she came through the door at 08:24, queued behind
someone whose visit ran to 08:55, and the bar spent that half hour counting her
wait as her treatment. Measuring from the booked slot instead just moved the
lie — a patient in the chair at 08:55 for a 13:10 appointment sat at `0 / 20 min`
for four hours.

`visits.in_chair_at` is the second event. Null means arrived and waiting; set
means the visit has begun, and the bar counts the booked duration from it.

The stamp is written by the server, never by a person, at the two moments the
chair changes hands:

- **Check-in into an empty chair.** Arriving and being seated are the same
  instant, which is the common case at a quiet clinic.
- **The chair emptying.** Both ways out — `awaitPayment` to the desk and a
  checkout straight from the chair — promote the longest wait. The transition
  and the promotion are one transaction, or a failure between them leaves an
  empty chair with a queue in front of it and nobody's bar running.

Longest wait wins, which is the order `arrivalQueue` already draws the queue in,
so the screen and the stamp cannot name different patients.

What this deliberately does **not** do is record when the patient physically sat
down. It records when the chair became theirs. A doctor who takes ten minutes
between patients gives the next one a bar that started ten minutes early, and
closing that gap needs a human to mark it — a button someone has to remember to
press, on a screen whose whole point is that the desk is busy. The clinic gets a
stamp that is exact at every handover and generous during a break, which is the
right way round.

The old fallback survives for visits recorded before the column: the screens
pass `inChairAt ?? checkedInAt`, and the migration backfills finished visits
from their check-in. Live visits at migration time are left null on purpose —
a queue in front of the chair is exactly what cannot be guessed, and stamping
those would mark waiting patients as seated.

## Empty time on the day view is not tappable

Tapping an empty slot should open a booking sheet. It does not. Empty time is
drawn on the timeline — it is where there is room — but a walk-in starts at
`now` and cannot be given the four o'clock the tap meant, and the patient picker
a real booking needs belongs to the Patients cluster. Creation on this screen is
the FAB, which opens the walk-in sheet (§7).

## The empty day's ring illustrates; it is not a second FAB

Same rule as above, applied to the other thing on the empty day that looked
pressable. `DayEmpty` passed `EmptyState` an `icon` of `<Text variant="title3">+</Text>`,
and `EmptyState` renders `icon` inside a plain `View` — the ring is 52px at
`radius.full`, which is `BookFab` exactly, holding the same glyph. So the one
screen whose whole subject is "there is nothing here yet" drew the FAB twice and
wired up one of them.

The bug report proposed giving the ring a press handler and thought that the
likely answer. It isn't, and the reason is the FAB the report does not mention:

- **Desk, future day** — the ring would become a *third* target for an action
  already offered by the FAB and by the `Book someone in` CTA below it.
- **Doctor, future day** — `DoctorDayScreen` passes no `onBook` and carries no
  FAB, because booking is the desk's job. There is no handler to give it.
- **Either screen, past day** — nothing to book. There is no handler to give it.

A press handler fixes one of four states, and only the state where the action
was already reachable twice. So the ring stops being drawn as the control
instead: `empty.ts` returns a muted `calendar` for a day that has not happened
yet, and `none` — no ring at all, matching `ClosedDay` — for a past day, which
is a fact rather than an offer.

**Audited before changing the shared component.** `EmptyState` has nine callers;
`DayStates` is the only one that has ever passed `icon`. Every other caller takes
the default muted `+`, which is correct for them: no other screen has a FAB for
it to be mistaken for. `EmptyState` therefore gained one thing only — `icon={null}`
suppresses the ring — which is unreachable from any existing caller. Its
pressability was left alone.

The third state the fix exposed: the future-day body read *"Book someone in for
later, or start a walk-in who is at the desk now"* on the doctor's screen too,
where neither is possible. `emptyDay` now takes `canBook` and tells the doctor
where bookings come from instead.

**Not in scope, still true:** `GalleryScreen` renders an `EmptyState` with an
`actionLabel` and no `onAction`. That is the dev gallery drawing a specimen, not
a screen offering an action.

## `packages/app/tsconfig.json` carries `allowImportingTsExtensions`

**A shared file edited from a screens cluster**, against §10, on purpose.

`@lustre/shared` is source, not a build artefact, and `index.ts` re-exports its
siblings with explicit `.ts` extensions. The app's tsconfig extends
`expo/tsconfig.base` rather than the repo's `tsconfig.base.json`, so it did not
carry the flag, and the **first** app file to import the contract fails to
typecheck. That is every cluster, not one of them. One line, identical in every
branch that would have hit it.

**Live cost, unfixed:** importing `@lustre/shared` pulls **zod** into the RN
bundle, because `enums.ts` builds its schemas at module scope. The app only
wants the tuples and the types. Worth a `shared/enums` entry point carrying no
zod, or accepting ~50KB.

## Clinic opening hours have one owner

`screens/day/hours.ts` is the single module that owns the day's bounds. It
prefers the server schedule (`settings.schedule`, `clinic_days`) and falls back
to hardcoded defaults when the clinic has never configured one, so an
unconfigured clinic does not render seven closed days.

## The settings cluster localizes failures in one place

`data/errors.ts` holds one sentence per `ERROR_CODE`, and a pane that can say
something better for a code passes it in. The now-deleted Data entry pane is why
the override exists: during a migration session, "something went wrong" is the
one thing the desk must not be told, because what it needs to know is that the
row is still on screen and nothing was lost. The override mechanism outlived the
pane and is still the right shape — a `NOT_FOUND` on a branch picker is worth
naming, and only the pane knows it was a branch.

It replaced two error mappers — the cluster's and that pane's own — which existed
because the pane ran on the real client while everything around it ran on
`data/_LocalApi`. Both are gone with the stand-in.

---

# Setup and connectivity

## The setup screen was built without a design

The Open Design project has fourteen screens and none is setup; nothing in
`brand-product` covers a first-run flow either. Built from `theme/tokens.ts` and
`ui/` directly, on the owner's call. It borrows `OfflineScreen`'s shape — one
centred card on canvas, no tab bar, no header — because they are the same kind
of surface: the app before it has anything true to draw.

**If setup is ever drawn, the mockup arrives second.** Treat the built version
as a proposal, not as the thing the design has to match.

## Onboarding persists to AsyncStorage, as two keys

`@react-native-async-storage/async-storage`, behind `shell/serverStore.ts` — the
only file in the app that touches it. **Two string keys rather than one JSON
blob**, so a half-written value comes back as an address that fails to answer
instead of a parse that throws on the boot path. Hydration starts on the first
subscriber and `App` holds a blank frame until it resolves.

It is a native module: `bun emu:build` / `bun device:build` once. A JS-only
reload will not pick it up.

## `OfflineScreen` has a way out

A consequence of persisting the address. Before it, a wrong address died with
the process; now it is remembered, and a typo means every launch resolves it,
fails, and lands on a screen whose only control is Try again — which can never
fix it. Hence one `text` button, "Change server address", and a `reconfiguring`
flag. The stored values are left in place so setup opens on them and the address
is *edited*, not retyped.

## Setup is not on the front door

The clinic's server PC is on a static address outside the router's DHCP pool, so
the address is knowable at build time in a way §14 did not assume. `app.json`'s
`extra.server.lan` ships it, and `shell/serverStore.ts` probes it during the boot
hold: a phone at the clinic this build was made for goes straight to the shell
and never sees setup.

Setup is now for the clinic that moved its server, the second clinic running the
same build (PRODUCT.md's one-time-fee commitment survives, because a default is
a default and not a requirement), and the typo.

**The distinction that makes it safe.** "Never reached this clinic" and "cannot
reach it right now" are different states and get different screens. A stored
address is **never** re-probed against the default — a phone whose clinic is
merely switched off is offline, not unconfigured, and sending it back to a screen
demanding an address it already has right is how a secretary retypes a correct
answer and still fails. `stored` carries that distinction.

**Cost, in the dev loop:** the committed default is the clinic's address rather
than `localhost:3002`, so an emulator lands on setup on first run. Entered once,
then persisted — once per install.

## The tailnet address comes from the server

§14 has both addresses "configured during onboarding", which meant the MagicDNS
name was typed into every handset, and typed again on all of them the day the
clinic moved its server.

The clinic PC already knows where it is: `.env` carries `TAILSCALE_IP` because
compose binds the published port to it. `health.check` reports a `tailscale`
address resolved from `TAILSCALE_HOSTNAME`, or from `TAILSCALE_IP` when that is
a real tailnet address rather than the 0.0.0.0 dev default. The app reads it on
every successful connection and stores it, so the address is configured once on
the server and the handsets follow.

**This is a contract change against §14 and `api/README.md`** — which is why it
went as a PR against `main` and not as a screen-local decision. The setup screen
keeps the field as a manual fallback: a server that reports nothing must not
wipe an address that works, and an older build that does not send the field is
indistinguishable from one that has not been configured.

## Prod builds are Tailscale only, and `__DEV__` is what says prod

The clinic server listens only on Tailscale and its firewall drops the API port
from the wifi, so a LAN address cannot answer a prod build: it was a 0.5 s probe
that always failed and a setup field that confused whoever filled it in. Demo
mode on a clinic phone put a fake register one tap from the real one.

So a prod build has neither. It probes the MagicDNS hostname alone, setup shows
that one field and no demo button, and on boot it deletes a stored LAN address
and a stored `lustre.demo` flag, so a phone upgraded from a dev or demo install
comes up on Tailscale and not in the demo.

**Why `__DEV__`, not an `extra.channel` or the EAS profile.** Metro sets it false
in every release bundle whatever `app.json` says, and nothing needs to be
remembered to get it right. A config value is a flag somebody forgets to flip
before a release; there is no EAS config in this repo to hang a profile on.
`extra.demo: true` on a release build still makes a demo build, which keeps the
demo that is handed to someone, and a prod build cannot be one because prod is
defined as not shipping it.

Dev builds keep the LAN field and demo mode: the emulator and a cable-attached
phone reach the dev server through `localhost`.

**Release builds could not use HTTP at all until this.** Android blocks cleartext
traffic from a release build unless the main manifest allows it, and only the
debug manifest Expo generates did. `android.usesCleartextTraffic` in `app.json`
was never a key Expo reads, so every release build failed to reach any server —
it showed as "That address did not answer" for an address that answers from the
same machine. `plugins/withCleartextTraffic.js` sets it on the main manifest,
app-wide rather than per host: Tailscale is the security boundary (SPEC §1), and
a network security config cannot name the `100.64.0.0/10` range a raw tailnet
address comes from.

## `/ws` stays the one push channel, and now it is numbered

"Push server-change events" was built on the socket §13 already had, not on SSE
or FCM. FCM is a third party holding a device registry for a clinic whose rule
is that none holds anything (PRODUCT.md), and SSE is the same socket with fewer
features. What the socket lacked was a way to know it had missed something.

**Every frame is numbered.** `epoch` names one server process, `seq` counts up
within it, and `v` is `WS_PROTOCOL_VERSION`. A reconnect sends back the epoch
and last seq it applied; the server replays what it still holds (the last 256)
and closes every connect with `hello`. `hello.resync` is true when the gap
cannot be filled — a restart, too much missed, a first connect — and the client
refetches every query.

The guarantees, as `api/serverEvents.ts` and `ws/index.ts` implement them:

- **Converges.** Anything the phone cannot prove it saw becomes a full
  refetch: a hole in `seq`, a new epoch, an unknown version, an unknown event
  name. An event never carries data to apply, so a wrong guess costs a round of
  queries and nothing else.
- **At most once per event, per phone process.** The cursor drops a `seq` it has
  applied, so a replay never runs an event twice. Nothing survives the app
  process being killed; the next connect is a first connect and resyncs.
- **No loops.** An event only ever triggers reads, never a write, so nothing a
  phone does on receipt can produce another event.
- **Authenticated the way everything is.** The socket is on the tailnet and
  nowhere else (§1). There are no accounts to authenticate it as.
- **Mutations announce themselves.** Patients, reminders, branches, procedure
  types and the questionnaire changed without telling the other phone before
  this; each now has an event.
- **Every read hears it.** The stale screens were mostly not the socket's
  fault. The day cluster reads through `useLocalQuery`, which has no cache, and
  the patients cluster keys its queries `['patients', …]` — so invalidating by
  tRPC router, which is all `live.ts` did, reached neither. `onServerChange`
  tells both: a mounted local read re-reads on any event, the patients cluster
  drops its root when a router it draws from changed.

Observability is a pino line per connect (`replayed`, `resync`) and per event
at debug, and a `live` breadcrumb per frame on the phone — event name and
outcome, never the ID.

---

# Design fidelity

## Half-pixel type resolves to the ramp — one decision, app-wide

The mockups measure type in half pixels (26 / 15.5 / 14.5 / 13.5 / 12.5 / 11.5 /
10.5), and `theme/tokens.ts` deliberately snaps them to one ramp. Every screen
reads these files that way. The same goes for the 22px gutter (`size.gutter` is
20), the 42–48px controls (`size.control` is 48) and the 16–20px card radii
(`radius.xl2` is 18).

**Structure, weight, colour role, copy and spacing rhythm are the design's
exactly. The sizes are the ramp's nearest.**

The clearest cost, recorded so the argument has a number attached: on the patient
editor the question controls are 48px rather than the mockup's ~42, so six
questions are ~36px taller than drawn. The mockup already scrolls at six, so
nothing is cut off.

Revisit as one decision across the app, never per screen.

## The record bar draws a pencil, not the mockup's `⋯`

A deliberate departure from `patient-view.html`, at the dentist's word, and the
smaller lie of the two: `⋯` promises a menu, and tapping it to land straight in
an editor is a promise broken every time. A pencil says the one thing the button
actually does.

It goes back to `⋯` — `ui/PopoverMenu`, `Edit` at the top — the day a second
action (merge, deactivate, export) gives the menu something to be.

## Other deltas taken deliberately

- **"YOU'RE HERE"** is drawn `tone="ink" variant="filled"` — the soft grey chip
  already used for REQUIRED — rather than the mockup's solid ink fill with white
  text. A fourth `Tag` variant for one tag on one screen is the per-screen
  override the ramp exists to prevent.
- **`isToothSpecific`** keeps its switch in the procedure editor. The mockup's
  properties card lists only quantity, checkup and active, but the flag is real,
  the row still shows a TOOTH tag, and the visit screen reads it.
- **Patient fields keeps deactivate over the mockup's delete**, and keeps the
  answer type locked once a question exists. The delete that orphans answers was
  removed on purpose; the mockup's "answers are kept but hidden" sheet describes
  deactivation in delete's words.
- **The branch card drops its second line.** The design gives each branch a
  phone number, a patient count, the year it opened and the month it closed, and
  tags the one the phone is standing in. `branches` is `id, name, address,
  active`, and nothing tracks which branch a phone is in. Every one of those
  would have been a number the pane made up, which is the bug the cluster was
  just taken off fixtures to fix. The identity card names the clinic for the
  same reason. They come back when the columns do — see the tasks split out of
  *Ten Settings panes run on fixtures*.
- **Working hours is a row in the CLINIC group** though `settings.html`'s index
  (GENERAL / CLINIC / ABOUT) has no slot for it. The alternative was deleting a
  working screen over an omission in a design file that never mentions opening
  hours at all. `glyph="hours"` is the one icon without mockup path data behind
  it. Delete the row and the import if the omission was intentional.

## Making a category writes two rows, or none

`settings-procedures.html`'s ghost "Category" button opens a sheet that names a
category and adds it to the tree on its own. It cannot work that way here: a row
is a category because something else names it as a parent, so a category with
nothing under it is just a root with a price — and `procedure.list` would offer
it on a visit.

So the sheet names the category and the editor behind it asks for the first
subtype. Both rows are written by one call — `procedure.createCategory`, in one
transaction — when that editor saves; backing out writes nothing. Two client
calls would have left a childless root priced 0 behind whenever the second
failed, which is the very thing this is avoiding. An empty category therefore cannot exist, which is this branch's answer
to the open question on the task ("what happens if you later file nothing under
it").

The alternative was a column — `is_category`, or a nullable price — which is a
migration on the shared database for a button, and forecloses nothing if it is
wanted later.

The other half of the same rule: a category whose only visible subtype is hidden
still draws, as a heading with its "Add to" button and nothing under it. It used
to vanish from the list while remaining unselectable, which left a row nothing
on this screen could reach.

## Bilingual labels: one rule, taking the locale as an argument

`custom_questions.label_ar` (`0003_custom_question_arabic_label.sql`), nullable
and unbackfilled. Which of the two labels shows is `resolveLabel` in
`@lustre/shared` — one rule, **taking the locale as an argument rather than
reading it**, because the patient tablet will ask the patient and pass a
different one against the same rows.

Still single-column: `procedure_types.name`, `branches.name`,
`settings.clinic_name`. `settings-procedures.html` draws the pair for procedures
and categories — the new category sheet asks in English only for exactly this
reason — so that pane is the next to want it. Same migration shape, and the rule
is already written.

**The answer is not bilingual and is not meant to become so:** it is stored once,
in whichever language it was given.

## Icons come from the library, not from the mockup

`settings.html` ships its own `IC` table of monoline glyphs, and
`screens/settings/components/icons.tsx` originally traced all of them, on the
reasoning that eight icons in one column had to look like one set. CLAUDE.MD
forecloses that reasoning in as many words — icons come from the library, "not
to match a mockup".

Converted 24 Aug (`b501b53`). Most were like-for-like. These changed what the
glyph depicts, not just how it is drawn:

| Row | Mockup drew | Now |
| --- | --- | --- |
| App | a window with a title bar | `AppWindow` |
| Clinic | a house with a cross | `Hospital` |
| Procedures & prices | a case with a lid | `Tags` |
| Patient fields | ruled lines with a `+` | `ListPlus` |
| Switch role | two arrows doubling back | `Repeat` |

WhatsApp is the documented carve-out and comes from `@expo/vector-icons`, as in
`screens/day/components/Reminders.tsx`. `domain/BrandMark.tsx` keeps
`react-native-svg` — that is brand artwork, not an icon.

Where the mockup has no glyph to substitute at all, the nearest library one
rather than a hand-drawn tenth path: `DataEntryIcon` is Lucide's
`ClipboardList`.

## `--older` earned a rule; `--discount` has not

`--older` was a design token with no rule saying when it applied — `success` at a
second value. The money dashboard is the rule: **money in against an earlier
visit.** It is `color.older` now, with one caller.

`--discount` is still out, for the original reason.

---

# Deliberately not shared

Three things that look like duplication and are not. Do not merge them.

- **`HistoryRow` is not `domain/VisitRow`.** It replaced `_LocalVisitRow` and
  knows about `AppointmentStatus`, so it is *further* from shared than what it
  replaced, not closer. If it is ever promoted the name is `domain/HistoryRow`.
- **The cutoff-date parse in `settings/data/clinic.ts`** looks like
  `domain/patientDraft`'s `birthDateIso` and is a different rule: a date of birth
  is refused for being too early, a cutoff for being in the future. (It was in
  `dataEntry/entryForm.ts` until that screen went; the rule did not change with
  the address.)
- **`SexToggle` is not `ui/SegmentedControl`.** Two reasons, the second being the
  real one. *Look:* `SegmentedControl` is System A's pill — a white thumb on
  `surface2`, sized for the two panes of a screen — where the design's toggle is
  an `ink` fill with white type riding on the end of a line of type inside a
  card; a filled half here has to read as an answer, not as a tab. *States:* it
  takes `value: T` and always draws a thumb, so a patient nobody recorded a sex
  for would show `Female` selected. That null state is the difference between
  "not answered" and "answered with the first option", and is worth having on the
  shared control regardless.

---

# Live sharp edges

Known, guarded, not yet fixed. None of these is a task because none is
straightforwardly actionable — each needs a design decision first.

## A **required** `date` question makes intake impossible

`date` has no control, so the editor draws it read-only. `validateIntake`,
though, requires an answer to every *active required* question — not merely the
ones the client can draw. So a clinic that ticks "required" on a date question
can no longer register anybody: every Save comes back `A required question was
left blank.`, naming a field the desk can see and cannot fill.

**Handled, not fixed.** `unaskableRequired` spots it and the screen says so —
Save is refused with the question named and the way out (make it optional in
Settings) rather than a round trip that always fails. Editing is unaffected;
`validatePatch` judges only the keys it is sent.

**The real fix is the control** — `'date'` in `EDITABLE_KINDS` and a field
returned from its case in `AnswerEditor`. Until then nothing stops a dentist
ticking the box, so the editor has to survive it.

## `notes` is on the record and on no design

`patients.notes` exists, `create` and `update` both take it, and the day
cluster's booking flow writes it. Neither `patient-edit.html` nor
`patient-view.html` draws a field for it, so the editor does not send it — and,
because a patch leaves out what it is not given, a note written at booking
survives every save made there.

It is a `ui/Textarea` and ten minutes whenever the design says where it goes.

## The ref is editable, and on no design

`patient-edit.html` draws four basics — name, phone, email, age·sex — and no
number. `patient-view.html` does not draw one either; the header's ref chip was
already built from the record rather than from a mockup. So when ref editing
landed there was nothing to follow.

It was not invented as a block of its own. It is one more hairline-ruled row at
the top of the same BASICS card, in the card's own idiom: the 78px label
column, the mono face the phone and the age already use because they are
figures, and the same under-the-row message the other four get. The top is
where it goes because that is what the number is — the first fact on the
record, read off the top of the paper page.

Three states, and the middle one is the reason this is not simply gated away:

- **Registering** draws nothing. The counter hands out the number and the desk
  has no say in it, so there is no field to draw.
- **Any role but the doctor** draws it and nothing else. The number is worth
  reading off the screen by whoever is holding the phone; only changing it is
  the doctor's.
- **The doctor** gets the input.

`canEditRef` is the server's own rule (`REF_EDIT_ROLES`), asked here so the
screen is correct rather than so the screen is the protection — with no
accounts (§1) the role is this handset's word for itself and the server checks
it again. See the ref-editing entry under Data model.

**The audit trail is not drawn at all.** `patient.refHistory` is wired in
`data/api.ts` and covered, but nothing on the record reads it: a trail of past
numbers is a support question asked months later, not something the desk needs
mid-correction, and there is no design for where it would sit. A designed
section and it is a small job.

## The A–Z grouping is described, not drawn

`patients-list.html` ends with a line of prose: "A–Z groups continue below. In
Arabic the list sorts and mirrors right-to-left; chevrons point left." The
chevron half is built (`components/icons.tsx` swaps the glyph on
`I18nManager.isRTL`). The grouping is not designed anywhere — no band, no index
rail — and the server answers newest-first, so it was not invented.

Needs a designed screen showing what a group band looks like, and
`patient.recent` growing an `order`.

## Every time in the app is 12-hour, and the device does not get a vote

All clock times display as 12-hour with a meridiem. There is no 24-hour anywhere
in the UI. Formatting happens in one place — `domain/clock`, the way money
happens in `domain/MoneyValue` — because the per-screen alternative drifts back
the moment someone adds a screen, which is exactly how the day cluster and the
settings cluster ended up with two copies of the same eight lines.

24-hour `HH:MM` survives as *transport* and nothing else: it is what the server
sends and what `settings`' `timeFromMinutes` writes back. It never reaches a
screen. Storage is unchanged — `TIME` and `timestamptz` as before.

The meridiem localizes and the digits do not. `ص`/`م` in Arabic, because that is
what an Egyptian reader expects; Latin numerals in both languages per §7.11,
because DM Mono has no Arabic-Indic coverage and the day view's columns are
tabular. That split is why `clock12` hands back the figure and the marker
separately — the marker has to reach the Naskh face without taking the digits
with it, the same problem `ج.م` has in `MoneyValue`.

## Working hours are back on the native time dialog, for now

Working hours briefly used an app-owned wheel (`3d6ad2d`, on
`@quidone/react-native-wheel-picker`) so the picker could be localized and
skinned. It was pulled before it reached a phone: the control still needs work,
and the clinic's release could not wait on it. `TimePickerField` is the earlier
`DateTimePickerAndroid` dialog again, with the value it shows localized like
every other clock in the app. The wheel's code, and what was learned making it
perform — virtualize the columns, keep `_enableSyncScrollAfterScrollEnd` off,
give `Sheet` a `scrollBody` escape — is in that commit for when it is picked up
again.

## `ui/` localizes its own copy, and the boundary test says so

`components/ui/boundaries.test.ts` keeps Lustre out of the design system, and
`../../i18n` is on its allow-list. That needed deciding rather than noting.

A primitive already holds copy: `Button` renders a label, `Select` a
placeholder, `ErrorState` a whole sentence. The question was never whether
`ui/` may know English words — it is which language it shows them in. `useT` is
`(string) => string` against a catalogue keyed by the English copy, which makes
it a locale service in the same class as the device chrome
`react-native-safe-area-context` reports: it cannot couple a primitive to a
domain type, and that coupling — not vocabulary — is the invariant the rule
protects. The alternative was to leave every primitive English and translate at
each call site, which puts the same copy in fifty screens instead of one
component.

What stays forbidden is what the rule was written for: a primitive importing
`@lustre/shared` for a domain enum, a tRPC client, or `../domain`. Reaching the
catalogue through the `theme` barrel to dodge the list is not a third option —
it is this decision, taken quietly, and it is how the rule was first got around.

## Locale is a reactive app concern; clinic names remain stored as written

`LocaleProvider` owns the persisted handset locale, the shared catalogue, and
live LTR/RTL direction. A change re-renders consumers immediately, sets Yoga's
root direction for the current tree, and calls `I18nManager.forceRTL` so the
native window starts in the same direction next time. Direction-sensitive
controls read the provider rather than a module-load snapshot.

The catalogue lives in `@lustre/shared`, keyed by the English copy, so
server-side rendering can read the same strings without importing the app.
Client failures still switch only on `ERROR_CODE` and never inspect server
messages: the switch picks the English sentence and the catalogue translates it
on the way out, which is why there is one table and not a second one keyed by
code. There is no receipt renderer anywhere in the repo yet, and no receipt
string table stands in for one — when it lands it reads this catalogue.

A key may carry `{slot}` markers, filled from `CopyVars`. The slot is in the
English key as well as the Arabic, so the two can order a sentence differently —
`Open on {day}` against `مفتوح يوم {day}` — rather than a call site
concatenating a translated fragment onto a name. Where English pluralises with
a suffix and Arabic uses a different word, both forms are keys and the count
picks between them.

`packages/app/src/i18n/catalogue.test.ts` is the guard. `localizeCopy` falls
back to its English key by design, so a missing entry is silent at runtime and
invisible in review; the test reads the source for `t('…')`, for copy props on
the primitives that localize them, and for the children of the ones that
localize children, and fails on anything with no Arabic.

This does not invent bilingual database fields. Custom questions continue to
use `label_ar`; procedure names, branch names, and `clinic_name` remain the
single stored value and are displayed verbatim. Adding their Arabic columns,
backfill rules, editing controls, and receipt resolution is explicit follow-up
schema work.

---

# The clinic machine

## The server cannot change the schema, and production is marked in the database

The clinic laptop runs `compose.yaml` twice, as `lustre-prod` and `lustre-dev`,
each with its own volume, network and passwords. Production's Postgres has three
roles (`infra/postgres/init/10-roles.sh`): the image's superuser, which nothing
uses; `lustre_owner`, which owns the schema and runs migrations; and
`lustre_app`, which the server connects as and which can read and write rows but
not `DROP`, `TRUNCATE` or `ALTER`.

That is why production does not migrate on boot. The server never holds the
owner's password, so a bug or a hijacked request can delete rows at worst, never
tables, and the deploy runs `scripts/migrate.ts` as the owner before starting it.
Laptops and the dev stack keep `MIGRATE_ON_BOOT=true`. `lustre_app` keeps
`CREATEDB` because the backup's restore check builds and drops a scratch
database; it cannot drop the clinic's, which it does not own.

The seed and the test suite refuse a database whose `lustre.environment` is
`production`, read from the database with `current_setting`, not from the URL.
The seed's old guard called hostname `db` local, and `db` is exactly what the
production database is called inside its stack: `bun db:seed` in the server
container would have deleted every patient. No flag overrides the marker.

## A release's number comes from the script, and the runtime ignores it

`MAJOR.MINOR.PATCH`: an APK is the next minor, an OTA update the next patch on
the APK it runs on, and a major is asked for (infra/README.md "Versions"). Until
this, `expo.version` was meant to be bumped by hand and never was, so every APK
shipped as `1.0.0`, and every update was a UUID, so "which commit was that
update" had no answer.

**Why the script and not app.json.** A number typed into a file is a number that
does not get typed, and it was not. The
script already knows everything the number depends on (the tags and what is
staged) and passes it in as `LUSTRE_VERSION`. app.json says `0.0.0`, which is
what every build that is not a release reads.

**Why the fingerprint skips the version.** `@expo/fingerprint` hashes
`expo.version` by default, so a numbered update would have landed under a runtime
no phone has and gone nowhere without an error. `fingerprint.config.js` turns
that off. The skips are written as names because `require('@expo/fingerprint')`
fails from `packages/app` in bun's layout, and the fingerprint replaces a config
that fails to load with an empty one without a word; a first attempt looked like
it worked and did nothing. Turning the skip on changed the runtime once, so
the APK staged before it (runtime `2de6fe94…`) takes no update published after
it: the first numbered release has to be an APK.

**Why tags as well as the staging directory.** The staging directory is what
shipped; a tag is the code it shipped from. The number is the higher of the two,
so losing either cannot repeat a number. Rolling back is checking out a tag and
publishing again as the next patch, never re-using an old number.

## The off-site backup signs in as the doctor, and the refresh token is the cost

`drive.ts` used a **service account**, and the reason written into its header was
operational: no browser step, no refresh token to babysit, and nothing to
re-authorize when the clinic machine reboots at 07:00 with nobody watching. That
reasoning was sound and the setup still never worked, because of a fact it did
not account for: **a service account has no Drive storage of its own.** Uploading
into a folder in somebody's My Drive fails with `storageQuotaExceeded`. The way
out is a shared drive or domain-wide delegation, and the doctor's account is
personal Gmail, which has neither. The unattended path was unattended and
uploaded nothing.

So off-site backup is now the doctor's own Drive, authorized once through OAuth
(SPEC §16). `bun drive:authorize` runs on the **operator's** machine, not the
clinic's: loopback callback on `127.0.0.1`, OAuth state, PKCE,
`access_type=offline`, and one scope — `drive.file`, which sees only what the app
itself created, so a grant for backups is not a grant to read the rest of the
doctor's Drive. The
script creates the **Lustre Clinic Backups** folder itself, which is what makes
that narrow scope sufficient.

**What it costs.** Exactly what the old header warned about, and the warning was
right — it was simply cheaper than not backing up. The clinic server holds a
refresh token in its private environment file (mode `0600`), mints access tokens
from it into memory, and writes none of them to disk. A reboot at 07:00 is still
unattended: the refresh token survives it and the server mints a new access token
on the first backup. What is *not* unattended is revocation. The doctor changing
their Google password, withdrawing the grant, or leaving the consent app in
Google's **Testing** state — where refresh tokens expire after seven days, which
is why a personal-account deployment must publish to **In production** — all end
the same way: Google answers the refresh with `invalid_grant`.

**Which is why that one error is not a generic failure.** It becomes
`DriveReauthorizationRequiredError`, and the nightly job alerts Discord as
`backup.drive_reauthorization_required` instead of `backup.failed`, naming the
command to run. A generic "backup failed" would be read as a machine problem and
someone would go looking at the server; the real fix is a person signing in
again, on the operator's machine, and replacing one line in the environment file.
The alert carries the dump's filename and nothing else — no error text, because
no error text on this path tells the operator anything the code already did. Pass
the existing `BACKUP_DRIVE_FOLDER_ID` back into the flow when re-authorizing and
it keeps the same folder rather than creating a second one beside it.

**Why the service account stays anyway.** It is the only thing that works for a
Workspace shared drive or domain-wide delegation, it costs three optional env
vars, and deleting it would strand any deployment already using it. It is a
fallback, not a default: if *any* OAuth field is set, OAuth must be complete, and
a half-configured OAuth setup disables the off-site copy loudly rather than
silently backing up as a different Drive identity. Silently falling back would
mean the dumps quietly land somewhere nobody is looking.

**Settings shows it, even though Settings cannot fix it.** The first cut left
the app out: the sign-in happens on the operator's laptop, not on either phone,
and Discord already tells the person who can act. That was wrong, and the reason
is how quiet this failure is rather than how invisible. The dump runs and
verifies before the upload is attempted, so the local copy is fine and nothing
in the clinic changes; what stops is the copy that survives the building. The
run itself does fail — `uploadOffsite` throws, so pruning and the success marker
never happen and `backup.stale` does eventually fire — but not for
`BACKUP_STALE_AFTER_HOURS`, two days by default, and the one Discord message
that goes out immediately is deduped for fifteen minutes and lands in a channel
the doctor does not read. For those two days nothing on the device the doctor
actually holds says a word.

So `backup.status` is a procedure (`modules/backup`, file-backed like `release`,
no database), and Settings draws it two ways. A **Backups row** in the CLINIC
group carries the state in its sub the way every other row on that index carries
its own answer — "Last backup today · copied off-site". A **card above the
summary** appears only for `reauthorize`, next to where the APK banner goes,
because a row's sub is the wrong weight for "the off-site copy has been dead for
three days". Doctor-only, like the rest of the CLINIC group: it is his Google
account. §1 still holds — the role hides rows, it never guards anything.

**The state had to be written down to be shown.** `runBackup` alerted and forgot;
the alert then deduped for fifteen minutes while the clinic stayed un-backed-up
for days. `offsite-state.json` sits beside the success marker and holds the
*first* run that failed this way, so the age on screen is how long the off-site
copy has been dead rather than how long ago the last attempt was. Only a real
upload clears it — an unconfigured destination also uploads nothing, and that
must not read as the grant being good again.

**The doctor can now sign in from the phone, and the reason that took a second
pass is worth keeping.** The first answer was that a phone *cannot* do it —
`drive:authorize` redirects to `127.0.0.1`, which no handset receives. That is
this script's choice, not OAuth's: an **Android** OAuth client carries no secret
at all, and the PKCE already in use is what replaces one. The browser was never
the obstacle.

The real question was §1, and it was answered rather than dodged. The refresh
token has to reach a server that read it from the environment at boot and had
nowhere to put one at runtime, and the mutation that writes it is unauthenticated
like every other — so any peer on the tailnet can point the clinic's off-site
backups at their own Drive. That is outbound and silent, unlike the reading the
tailnet already allows. **Accepted on the owner's call**, on the grounds that a
peer who can reach the API already reads every patient record, and
`BACKUP_ENCRYPTION_KEY` means what a thief collects is ciphertext whose key is
not on the clinic machine.

Two things follow from accepting it rather than pretending it away.

**The token never touches the phone.** The handset runs the consent, gets an
authorization *code*, and posts that to `backup.linkDrive`; the server does the
exchange and keeps the refresh token. A code is single-use and worthless without
the verifier that produced it, so the durable credential goes Google → server and
is never on a device that can be lost in a waiting room.

**A confirm stands in front of it.** The role is a device preference, so the
secretary can switch to the doctor's view and land on these rows, and this is the
one control in the app that changes where every future copy of the clinic goes. A
mis-tap does not lose data — it quietly starts sending it somewhere else, which
is worse for being invisible. `DriveSignInSheet` names the account in use, says
the old backups are not moved, and puts that before the button.

`drive-grant.json` sits beside the dumps, 0600, written through a rename, and
**outranks the environment**: it is the more recent statement of which Drive the
clinic uses, and the operator's pasted values are what it was before somebody
signed in again.

---

## Historical procedures are the migration write, reached from the editor

The patient editor can add work the patient had done before this system
recorded it. It does **not** get a mechanism of its own: `procedure.addHistorical`
calls `migration.service`'s existing plan and write, so an entry typed at
registration and one typed a year later land as the same row — an appointment
flagged `is_imported`, carrying planned procedures and **no visit at all**.

No visit is what the acceptance criterion "does not affect current visit
checkout" actually rests on. A visit is where money lives (§10), so a row
without one cannot be charged, owed or paid, and the day view, revenue and
statistics already exclude it by flag. Nothing about checkout had to be touched
to keep it out of checkout.

Two consequences, taken deliberately rather than worked around:

- **The branch and the cutoff still come from Settings → Clinic.** `branch_id`
  is NOT NULL and neither is a fact the desk can answer per patient. A clinic
  that has not configured the migration gets `MIGRATION_NOT_CONFIGURED` on
  save, naming the setting — which is exactly what the registration block has
  always done. Same refusal, same message, one code path.
- **A line dated after the cutoff is refused here too**
  (`IMPORTED_DATE_AFTER_CUTOFF`). Work done at this clinic since the changeover
  belongs to a visit that charges for it. Letting the editor file it as
  imported would be a way to record treatment that no total ever sees, which is
  the one thing that rule exists to prevent.

The alternative was a second, cutoff-free path for the editor. That is the
shape of mistake the `migration.service` header is already about: two ways to
record one thing is how the two stop agreeing.

Where it lands in the UI is `PatientEditScreen`, under its own eyebrow and
**not** behind the Old patient switch. That switch asks which *patient* this is,
and that question is settled once, at registration.

## The historical date picker is not `CalendarSheet`

`day/CalendarSheet` is the nearest-looking thing in the app and is the wrong
component. Its own header says so: it exists to answer "is Thursday busy", so it
fetches a month of appointments, paints a load bar per day, marks days the
branch is closed and in `book` mode refuses everything before today. Every one
of those is about a day that has not happened.

A historical date asks the opposite about a day that has: nothing was booked, no
branch was open, and the only fact is the day the paper file names.
`HistoricalDateSheet` therefore fetches nothing, carries no state but the pick,
and offers no day after today. It pages by year as well as by month, because
these dates are years back and month-at-a-time paging is how you give up.

It replaced a typed `DDMMYYYY` number-pad field, and with it a whole error
class: half a date, a 31st of February and a day in the future were each a
refusal the form had to count and explain under the row (`badOldDates`, gone). A
grid of real days can produce none of the three.

**No date is an answer, not an omission** — the file says what was done and not
always when. It is its own footer button ("The file doesn't say"), the row reads
back *Before migration* rather than showing an empty field, and the entry is
sent with `performedOn` absent rather than null. There is no design mockup for
any of this; the Open Design folder has no historical-procedure screen, so it is
built from the tokens and from the shapes `patient-edit.html` settles, the same
way `OldPatientCard` was.

---

# Corrections

Kept because deleting them lets the same mistake happen again.

## The settings module was never bare — the stand-in was

**This was written as a blocker and was wrong.** It claimed the server stored
none of the clinic identity, duration or reminder settings. The server has had
all of it the whole time:

- `settings` — `clinic_name`, `clinic_phone`, `duration_options` (int array),
  `default_duration`, `reminder_lead_hours`, `reminder_notify_at`,
  `reminder_repeat_minutes`, `reminder_template`
- `settings.get` / `settings.update`, with `updateSettingsInput` validating every
  field

**The mistake:** the cluster's existing stand-in only mirrored
`settings.schedule` / `setDay` / `clearDay`, and that was taken as evidence the
rest of the module was equally bare — instead of reading `settings.router.ts`.

**The lesson generalises.** A stand-in's surface is evidence of what the *screen*
needed, never of what the *server* has. Read the router.

Genuinely absent, and still true: nothing raises the daily notification that
`reminder_notify_at` and `reminder_repeat_minutes` describe. The pane stores a
preference no scheduler reads.

## Working hours: the schema existed

Same shape of error, found earlier. A cluster brief said the `clinic_days` schema
did not exist and to stub it. It did — `db/schema.ts`, plus
`settings.schedule` / `setDay` / `clearDay` on the router. The screen was built
against the real shapes.
