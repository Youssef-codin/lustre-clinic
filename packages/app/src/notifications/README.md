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
