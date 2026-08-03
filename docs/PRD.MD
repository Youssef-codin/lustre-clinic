# Mawid — PRD

Clinic management app for a dental practice. Two branches, one practitioner, two users.

---

## 1. Problem

The clinic uses a paper appointment book and a WhatsApp number that is not consistently monitored. This causes three problems:

- **Appointment requests are missed.** A message arrives while the secretary is with a patient and goes unanswered. The patient books elsewhere.
- **Patients forget appointments.** Messaging every patient the day before is not practical by hand, so it does not happen.
- **Records cannot be searched.** Payments, procedure history, and patient records are on paper across two branches. Answering what a patient had done last year, or what the clinic took last month, requires reading the book.

The clinic does not need a larger system. It needs the same workflow with fewer things missed.

---

## 2. Users

**The secretary.** Primary user. Books appointments, checks patients in, takes payment, sends reminders.

Her time splits into two modes, and this affects the design:

- **A patient is at the desk.** Booking, check-in, and payment happen here. These must be fast. If any of them is slower than writing in the paper book, she will stop using the app for it.
- **A patient is with the doctor.** She is largely free during this time. Entering patient details, filling in custom questions, correcting records, and sending reminders can happen here and do not need to be fast.

Tasks should be placed accordingly: keep the desk-side flows short, and allow the record-keeping flows to be thorough.

**The doctor.** Checks his schedule between patients, reviews patient history, and reviews takings. Controls settings: prices, procedures, branches.

Both users work from phones. There is no desktop client.

---

## 3. Constraints

These are set by the client and determine the rest of the design:

**No automated WhatsApp sending.** The client does not want to risk the clinic's number being restricted. The app prompts the user, who sends the message.

**No cloud.** Data stays on a machine at the clinic. Patient records and payments are not stored on a third-party server.

**Mobile only.** Both users are on phones. No web app, no desktop.

**Paper remains available.** The clinic must be able to operate for a day if the system is down.

**One-time payment.** No subscription. Features after delivery are quoted separately.

---

## 4. What it does

### Appointments

The day view shows one branch and one day, with appointments in time order. Booked slots show the patient name and procedure. Gaps are tappable to book.

Booking requires a patient (existing, or new and entered inline), a time, a duration, and a procedure. The secretary always chooses the duration. The system does not set it automatically.

The system does not allow two appointments to overlap. This is enforced by the database rather than application code, because the consequence of a double-booking is two patients arriving for the same slot.

### Check-in and payment

The main flow requested by the client:

```
patient arrives  →  check in
                        ↓
                 confirm procedures and details
                        ↓
                 finance page — amount due
                        ↓
                 book next appointment
                        ↓
                 check out — patient pays on the way out
```

The amount is confirmed and editable at check out. For a new patient, nobody knows what work will be done until the doctor has seen them, so the price is set at that point. For a returning patient with a known plan, it can be set earlier and is simply confirmed.

The doctor writes on paper during the visit and the secretary enters it into the app afterwards, during the idle window described in §2. The app is therefore slightly behind on procedure detail, which does not block taking payment.

### Balances

A patient may pay nothing, part, or all of the amount at check out. This is normal and not an error.

A balances screen shows:

- Total outstanding across all patients
- Which patients owe money, how much, and for how long
- Charged versus collected for a chosen period

Balances are tracked per patient across visits, so someone paying part now and the rest at their next appointment shows as one running figure. Later payments are recorded against the original visit.

### Procedures and pricing

A configurable catalogue with categories and subtypes. For example, crowns split into zirconia and emax. Some procedures are priced per unit (removables, per arch) and take a quantity.

There is one automatic rule: **if any procedure was performed, the checkup fee is removed.** Everything else is manual. The secretary can change the total before confirming, and always enters the amount actually paid. Payment methods are cash, visa, instapay, or other.

Prices are recorded as they were on the day of the visit. Changing a price later does not affect past visits.

### Patients

Name, phone, date of birth, gender, plus **custom questions defined by the doctor**. He can add fields without a code change.

Each patient page shows full history: every visit, the procedures performed, and the amounts paid.

One tap opens WhatsApp with that patient's chat and a message ready to send.

### Reminders

The app builds a list of due reminders and notifies the secretary at a set time each day, 7pm by default. She taps a patient, WhatsApp opens with the message pre-filled, and she sends it. The app records who has been contacted.

**The notification repeats until the list is cleared or dismissed.** A single notification is easy to miss, and a missed notification means patients are not reminded. It stops when every reminder has been sent or skipped, or when she dismisses it for the day. It does not continue overnight.

This fits the idle window described in §2. Sending reminders is not urgent and can be done while a patient is with the doctor.

The app does not send messages itself. It removes the need to remember who to contact.

### Walk-ins

A patient can arrive without an appointment. The secretary books and checks them in as a single action, at the current time. The system still prevents overlaps, so if the doctor is with someone the walk-in goes into the next free slot.

### Missed appointments

Appointments that passed without a check-in appear on a separate screen. The secretary marks them as no-shows or reschedules them. The system does not mark them automatically.

### Settings

The doctor can edit the following in the app: procedures and prices, branches, custom questions, appointment durations, payment methods, reminder timing and wording, and clinic details.

No routine change requires a developer.

---

## 4b. Planned for v2

### Patient intake on a tablet

A new patient currently fills in a paper form which the secretary then types into the system. Instead, hand the patient a tablet running a locked-down version of the app. They fill in the questionnaire themselves, it goes straight into the system, and the secretary copies it onto paper afterwards.

The same amount of work happens, but the app holds what the patient actually wrote rather than a transcription of it.

Submissions are reviewed by the secretary before becoming patient records. She is reading them anyway in order to copy them to paper.

---

## 5. Explicitly not building

- Patients booking themselves
- Any automated messaging
- Printing
- Web or desktop access
- Multi-practitioner scheduling
- Clinical records, prescriptions, imaging
- Insurance or claims
- Logins and permissions — access is controlled by the private network

---

## 6. How it's deployed

A PC at the clinic runs the server and database. Both phones connect over a private network (Tailscale). Nothing is exposed to the internet, and no cloud account holds patient data.

The app is installed directly on their phones. Updates are delivered over the air and do not require reinstalling.

**When the server is unreachable** (power cut, reboot), the app shows today's and tomorrow's schedule from cache, read-only, with a notice. It does not report a booking as successful if it was not saved.

---

## 7. Success

- The secretary is still using it after 30 days.
- No double-bookings occur.
- Reminders are sent consistently.
- The doctor can see monthly takings without reading the paper book.
- Missed appointments appear on a screen rather than being noticed later.

---

## 8. Rollout

### Dental practice — one week

**Before day 1.** The clinic PC is set up in advance: Docker, Postgres, Tailscale, systemd, BIOS auto-power-on, and a disk check. This is a separate visit or an early morning before the clinic opens. It must not consume day 1.

Monitoring and alerting must be working before handover, not after. From day 2 the only way to know something has broken is to be told by the system.

**Day 1 — on site.** Present for the full day, watching the secretary use it with real patients.

The purpose is observation, not assistance. Where she hesitates, works around something, or reaches for the paper book is the information worth having. Stepping in to smooth things over hides exactly what needs fixing. Note it, fix it later.

**Days 2–6 — remote.** Available by phone, monitoring the server. Fixes ship over the air.

**Day 7 — on site.** Final visit, review the week, collect payment.

### Support is separate from handover

A week does not cover a power cut, a Tailscale failure, or a month end. Payment on day 7 is fine, but the support period must be written down separately, with an explicit end date. Otherwise handover and support get treated as the same thing.

## 9. Commercial

One-time build fee. No subscription, at the client's request.

Post-delivery feature requests are quoted individually. **Support terms must be agreed in writing before delivery**: what is covered, and for how long.

All clinic-specific values are data rather than code, so additional clinics run the same build without a separate version.

---

## 10. Open

1. **Will there be a second practitioner?** Currently assumed not. Determines whether appointments may overlap across branches.
