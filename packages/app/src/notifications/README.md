# `notifications/`

The daily reminder nudge — SPEC §11, `PRODUCT.md:96`:

> **Reminders** are a daily notification (19:00 default) that **repeats until the
> list is cleared or dismissed**, and stops overnight.

`settings.reminder_notify_at` and `settings.reminder_repeat_minutes` had been
saved, read back and drawn since the settings cluster came off fixtures. Nothing
raised them. This is the thing that does.

```tsx
useReminderNudges();          // once, in the shell
const rearm = useRearmReminderNudges();   // after a write that moves the list
```

## The three files

| | |
|---|---|
| [`schedule.ts`](./schedule.ts) | **When it fires.** Pure — no `expo-notifications`, no `react-native`. This is the part [`schedule.test.ts`](./schedule.test.ts) covers. |
| [`notifications.ts`](./notifications.ts) | The platform: permission, the Android channel, arming the instants `schedule` returns. |
| [`useReminderNudges.ts`](./useReminderNudges.ts) | Keeps what is armed matching what the server says. |

## Local, not push

A server push needs a device registry and a push service, which is a lot of new
machinery for one notification — and it is dead exactly when the clinic PC is
off, which is when the desk most needs telling that the list is still there. The
pane already frames both settings as being about *this phone* ("Notify me at",
not "notify the clinic"), so each user is nudged about their own list.

The cost is that both phones buzz. That is probably right — each user clears
their own list — and if it turns out to be wrong the fix is a per-device toggle,
not a server.

## One arm path

`armNudges` is always cancel-then-schedule, and the effect in
`useReminderNudges` is its only caller. Nothing arms directly — a second path is
how a phone ends up with two series layered over each other, each buzzing on its
own half-hour.

A reminder marked sent or skipped, or a day dismissed, feeds it by invalidating
the two queries the hook reads. **Foregrounding does both**: it invalidates, and
it bumps a counter in the effect's dependencies. That second half is not
redundant — whether the OS still refuses notifications, what the wall clock says
and which day it is are not in the query answers, so a refetch that comes back
identical would move no dependency and re-arm nothing. Without it, a user who
enables notifications in Android settings and returns stays unarmed, and a
process alive at midnight never gets the new day's series.

## What it deliberately does not do

- **No count in the body.** A nudge is armed hours before it fires and the list
  can move on the other phone in between, so "3 reminders" goes stale into a
  wrong number. "Reminders are waiting to be sent" cannot be wrong by one.
- **No patient data**, ever (§17). A notification shows on a lock screen in a
  waiting room.
- **Today only.** Tomorrow's series is not armed, because the pending count is
  only known as of the last time the app was open and a nudge about a day-old
  list is a nudge about nothing. The foreground re-arm covers the real case: the
  day view is opened every clinic morning.
- **No prompt loop.** Permission is asked for on the first arm — a few seconds
  into the first launch, since the shell arms as soon as the queries answer — and
  a denial is final for the session. The way back is the warning in Settings →
  Reminders, not a prompt on every foreground.

## The two stop conditions

**The list is empty.** `pendingCount` of zero plans nothing, which cancels.

**Dismissed for the day.** `reminder_dismissed_on` and `reminder.dismissToday`
were both built before this and consulted by nothing. `planNudges` consults the
flag; the day view's reminders tab is what sets it — "Not today", beside "Skip
all" and deliberately not the same thing. Skip all says the messages are never
going out. Not today leaves every reminder pending and only quiets the nudge, and
because the flag is a calendar date, tomorrow arms again on its own.

## The nudges are inexact, on purpose

Android batches them: `dumpsys alarm` shows each one with a `window=+1h`. Exact
alarms need `SCHEDULE_EXACT_ALARM`, which is a Play Store-restricted permission
with its own grant flow, and this is a nudge that some messages are still
waiting — not an alarm clock. A 19:00 nudge that lands at 19:12 has lost nothing.

## Overnight is midnight

The series runs from the notify time to the end of that calendar day and stops. A
nudge at 02:00 about a list nobody can act on until the clinic opens is the thing
the setting exists to prevent.

The series is also capped (`MAX_NUDGES`). The pane allows 06:00 every 15 minutes,
which is 72 alarms for one fact; the cap is about the platform's scheduling
limits, not a product rule.

## When the OS says no

A setting that cannot take effect has to admit it, or the pane has the same
defect the scheduler just fixed one layer out: "Notify me at 6:00 PM" saves,
reads back, and the phone stays silent. `useNotificationsAllowed` is what
Settings → Reminders draws its warning from, and it re-reads on foreground
because the way this gets fixed is the user leaving for Android settings and
coming back.

## Checking it without waiting until 19:00

The pane steps **Notify me at** in whole hours, so it cannot be set to two
minutes from now. Read what is armed instead:

```
adb shell dumpsys alarm | grep "expo.modules.notifications" -B1
adb shell dumpsys alarm | grep -o "2026-08-27 [0-9:]*"
```

With reminders pending and the defaults, that is ten entries at 19:00 through
23:30 and nothing after. Tapping **Not today** on the reminders tab, or marking
the last reminder sent, leaves none.

`expo-notifications` is native, so a dev client built before it was added will
not have it — `bun emu:build`, not `bun emu`.

---

# "Coming to the desk"

The other notification here, and the opposite of the nudge in every way that
matters: it is about one patient, it is raised by the other phone, and it has to
arrive now.

```tsx
useVisitCompletedNotices(roleReady ? role : null);   // once, in the shell
```

## What raises it

The doctor tapping **Finish** — `appointment.awaitPayment`, `checked_in →
awaiting_payment`. Not `visit.checkOut`: that is the desk taking the money, and
telling the desk about its own tap is noise. The server broadcasts
`visit:completed` with the appointment's ID and nothing else (§13); the desk
phone asks `appointment.byId` for the name.

| | |
|---|---|
| [`visitNotice.ts`](./visitNotice.ts) | **Whether** an event is announced here. Pure, and tested. |
| [`notifications.ts`](./notifications.ts) | Posting it, on its own high-importance channel. |
| [`useVisitCompletedNotices.ts`](./useVisitCompletedNotices.ts) | The subscription, the name, and the foreground service. |

## One completion, one notice

The server announces the transition once — `awaitPayment`'s conditional UPDATE
is the write that decides, so a repeated tap is a 422 and no event. The cursor in
`api/serverEvents.ts` drops a replayed frame it has already applied. And the
notice is posted under `lustre.visit.completed.<appointmentId>`, so even a second
post could only redraw the first.

A completion replayed more than ten minutes late (`NOTICE_MAX_AGE_MS`) refreshes
the day view and does not buzz: that patient has paid and gone.

## What it shows

The patient's name, and that the doctor is finished. That is the least that lets
the desk act on it, and the one place this folder breaks "no patient data". The
channel is `PRIVATE`, so a locked phone shows that a notice arrived and not
whose. When the name cannot be fetched the notice still goes, as "A patient is
coming to the desk".

## In the background: the foreground service

Android 15+ cuts a backgrounded app's network within seconds — on the emulator,
`/ws` closed eleven seconds after HOME and `dumpsys netpolicy` showed
`blocked=APP_BACKGROUND`. No push service stands in for it here, by design
(PRODUCT.md: no third party), so the desk phone runs a foreground service,
`modules/lustre-listener`, while it is the secretary's:

- It keeps the process in `procState=FGS`, which Android leaves on the network —
  through forced deep Doze with the screen off, checked on the emulator.
- It holds a headless JS task open, which keeps JS timers firing, so the
  socket's reconnect backoff and the batched tRPC link work in the background.
  RN's `HeadlessJsTaskService` would too, but it holds a wake lock for as long
  as the task runs, and this one runs all day.
- The price is the ongoing "Listening for the doctor" notification, on a silent
  channel of its own.

It runs only on the secretary's phone, only with notifications allowed, and not
in demo mode. Android only lets it start from the foreground, so every return to
the app asks again — which is also how allowing notifications in Android
settings takes effect. Swiping the app away ends it with the app.

It is native, so an OTA update cannot bring it: the runtime fingerprint changes
and a new APK is needed. `requireOptionalNativeModule` keeps the JS safe on a
build without it.

## Checking it

```
adb shell dumpsys activity services com.lustre.clinic.dev | grep isForeground
adb shell dumpsys notification --noredact | grep "coming to the desk"
adb shell dumpsys netpolicy | grep "UID=<app uid>"     # procState=FGS, effective=NONE
```

Finish a visit from the other phone (or `appointment.awaitPayment` by curl) with
the desk phone on the home screen.

---

# Finish from the shade

The doctor's half, and the same foreground service. While someone is in the
chair, the doctor's phone carries an ongoing notice — "Mariam is in the chair" —
with a **Finish visit** action that works with the app in the background.

```tsx
useVisitFinishAction(roleReady ? role : null);   // once, in the shell
```

| | |
|---|---|
| [`visitAction.ts`](./visitAction.ts) | **Which visit**, what the notice shows of the patient, and which failures are reported. Pure, and tested. |
| [`useVisitFinishAction.ts`](./useVisitFinishAction.ts) | Keeps the notice on the chair, and does the finish. |
| `modules/lustre-listener` | The notice itself, its action, and the network it needs. |

## What Finish does

`appointment.awaitPayment`, the same write as **Finish** on the day screen:
`checked_in → awaiting_payment`, the next patient is seated, and the desk is
told. No payment is recorded — that is the desk's job.

The visit is the chair as `DoctorDayScreen` reads it (`chair.ts`), on the branch
holding most of the day. It is re-read on every `/ws` change to appointments or
visits and on every foreground, so a finish on the screen, or a patient checked
in by the desk, moves the notice with it.

## One tap, one finish

- The service takes the button off the notification before JS hears of the tap
  ("Finishing the visit…"), so there is nothing left to tap twice.
- A tap for a visit the notice no longer shows is dropped natively.
- JS holds a visit it is finishing and does not send it again.
- The server's conditional UPDATE refuses a second one anyway.

A refusal because the visit had already left the chair (`INVALID_STATUS_TRANSITION`,
`NOT_FOUND`) is not a failure — it was finished some other way. Anything else is
posted as "The visit was not finished" on its own channel, with no name in it,
and the button comes back on the ongoing notice.

## What it shows

The first name, and nothing else. It sits in the shade of a phone left on a
desk; the first name is enough for the doctor to be sure which visit the button
ends. The lock screen shows "A visit is in progress" instead.

## When it is up

Only on the doctor's phone, with notifications allowed, outside demo mode — and
all day, not only while someone is in the chair. With the chair empty it reads
"Listening for patients" and has no button; it is kept up so the socket is, and
a check-in reaches the phone in the background (below). Android only lets the
service start from the foreground, so it comes up when the app is opened; in the
background it is only redrawn.

## Checking it

```
adb shell dumpsys notification --noredact | grep -A3 "in the chair"
adb shell cmd statusbar expand-notifications     # then tap Finish visit
```

Open the app as the doctor with someone checked in, press HOME, and finish from
the shade. The desk phone (or `appointment.byDate`) shows the visit at the desk.

---

# "Checked in"

The doctor's phone is told when the desk checks a patient in, foreground or not.

```tsx
useArrivalNotices(roleReady ? role : null);   // once, in the shell
```

The server broadcasts `appointment:checked_in` with the appointment's ID from
`visit.checkIn`, and from `appointment.walkIn` once its transaction has
committed — a walk-in checks in inside that transaction, where the doctor's
phone asking for the name would find nothing yet. The phone asks
`appointment.byId` for the name and posts "{name} has checked in" on its own
high-importance, private channel, under `lustre.visit.arrived.<appointmentId>`.
The rule (`arrivalToAnnounce` in `visitNotice.ts`) is the completion's mirror:
doctor only, and nothing for an arrival replayed more than ten minutes late.

It needs the foreground service above to be running, which is why that now runs
all day on the doctor's phone.
