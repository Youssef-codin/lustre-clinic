# Changelog

What changed for the clinic in each release. Versions match the release tags
(`vX.Y.Z`). A patch is an over-the-air update that applies the next time the
app opens. A minor version is a new APK, or an over-the-air update the phones
download and restart into straight away. Dev-track tags (`dev-v*`) are not
listed.

## [Unreleased]

## [1.7.0] - 2026-09-27

### Added

- Phone roles by QR code. An admin makes a code in Settings → Phones & role codes, and the phone that scans it (Settings → Scan a role code) gets that role; switching roles in Settings is gone. The first admin code is printed by the server (`grant admin`). Codes work once, for 30 minutes, and the admin can withdraw them, which shuts out the phone that used one. Phones without a code keep working until the admin turns on "Every phone needs a role code". A code can also be scanned with any phone's camera: it opens a page on the clinic server with the app to download and an Open in Lustre button that hands the app the code, so a new phone gets the app and its role from one scan. A newly installed Lustre opens on "Scan your role code" and does nothing else until it has one; phones that already had Lustre keep working as before. When a phone scans a new code, its old one stops working. Withdrawing a phone's code shuts it out straight away. The admin's list only shows codes still waiting and phones using theirs: withdrawn and replaced codes, and codes left unused for 30 minutes, are deleted. Lustre is no longer included in the phone's Google backup, so a phone set up from a backup has to be given a code like any new phone. Needs the new APK, for the camera.
- Settings → Reminders has a "Ring like an alarm" switch, off unless you turn it on. When it's on, this phone's daily reminder rings like an alarm clock: it keeps ringing and vibrating at the alarm volume, even on silent, and fills the lock screen until you tap Snooze or Open reminders. Open reminders goes straight to the list of who to remind. It rings again at the next "Repeat every" until the list is cleared.

### Changed

- The doctor's phone no longer shows payments, balances, the Money tab, or what past visits cost, and the server refuses them to it. The doctor still prices the visit in front of them and checks the patient out, but can't reopen a finished visit. The admin's phone can switch between the doctor's day and the desk's day in Settings, and keeps everything either way.
- Only the admin can change how the clinic is set up: procedures and prices, patient fields, branches, working hours, clinic details and the backups link. The server refuses them to other phones.
- Reminders are only on the secretary's phone. The doctor's and the admin's phones no longer show the Reminders setting or the daily reminder notification.
- The daily reminder checks with the clinic computer just before it goes off, and stays quiet if the list has already been cleared or dismissed for the day, even from the other phone. Tapping it opens the list of who to remind.
- Settings → About opens a page with the version, APK and update details, which used to sit under Settings → App. The language switch is now on the Settings page itself, so it takes one tap, and Settings → App shows only the server connection.
- Once Google Drive is linked, tapping Backups in Settings opens a page showing whether backups are up to date, when the last one ran, and which Google account the copy goes to, with a Change account button. Until Drive is linked, it still opens the sign-in.
- The warnings about the phone's time zone or clock being wrong, and about notifications being off, can be closed with the X. They come back after 4 hours if the problem hasn't been fixed. The time warning no longer tells you to turn on automatic date and time, which set some phones an hour out.

## [1.6.3] - 2026-09-27

### Changed

- Updates arrive without closing the app. The phone downloads a new version quietly while it's open and switches to it the next time you come back to the app: from WhatsApp, from the lock screen, or opening it again after swiping it away. An update that finishes downloading within seconds of opening the app is switched to straight away, instead of waiting for the next time. An update that finishes downloading within seconds of opening the app is switched to straight away, instead of waiting for the next time.

## [1.6.2] - 2026-09-27

### Added

- Swiping left or right on the calendar moves to the next or previous month, the same way the arrows do, in Arabic as well as English.
- Reminder messages can name the appointment's branch (`{{branch}}`) and quote its reference (`{{ref}}`).

### Changed

- The appointment sheet is redesigned: the patient's number instead of the booking code, a lab panel with a Mark lab arrived button, and big Reschedule, No-show and Cancel buttons.
- More icons across the app: payment methods, action buttons, menu items and empty screens. Lab work still out is a small flask on the day list.
- Less repeated text: fewer hints and notes in booking, payments, settings and setup, and visit totals show once.

### Fixed

- In Arabic, the screens, sheets, toasts and messages that still showed English are now in Arabic, and so is the daily reminders notification.
- In Arabic, phone numbers keep the + in front, lines that start with a patient's name or a procedure read right to left, and "before this" and "after this" point the right way.
- Counts in Arabic read correctly: "4 أيام", not "4 يوم".
- The language setting's note says what it changes. It no longer mentions printed receipts or a per-patient language.
- Reminder messages built from the Settings chips reached patients with `{name}`, `{time}` and the like still in them. The chips now insert tokens the reminder fills in, messages already saved the old way are filled in too, and the preview shows exactly what the patient will get.
- The closed-day message points to Settings → Working hours, the screen's real name.
- The Lustre logo in the Settings header no longer reads backwards in Arabic.

## [1.6.1] - 2026-09-26

### Changed

- The app switches to a downloaded update by itself when it's opened again after being away for 5 minutes or more, and looks for new updates then too. Closing and reopening it is no longer needed.

## [1.6.0] - 2026-09-26

### Added

- Searching for a patient who isn't registered offers to register the typed name or number.
- A booking can be marked as needing lab work. The day shows "Lab pending" until it's marked back, and its reminder warns while the lab work isn't back.
- The clinic chooses in Settings whether a patient's age and gender are required.
- When the doctor finishes a visit, the app asks whether to edit its procedures before sending the patient to the desk.
- Tapping the Next-up card opens the appointment, with cancel, no-show and reschedule.
- The day warns when the phone is blocking the app's notifications, with a button to the app's Android settings.
- A bigger update shows a download screen and restarts the app by itself, instead of waiting for the app to be closed and opened again.

### Changed

- What an old patient owes no longer needs a cutoff date and branch set first. It's dated on the day they're registered.

### Removed

- Previous procedures can no longer be added from the patient editor or when registering an old patient. Past work is entered as an old visit from the patient record, at any time.
- The "Old patients" cutoff date and branch in Settings → Clinic.

### Fixed

- A price changed while booking or rescheduling is kept, and billed at check-in, instead of going back to the catalogue price.
- Patients saved with an age of 0 now have no age.
- Each "Report a problem" now reaches the operator as its own alert, not only the first one.
- A phone whose clock is wrong still gets check-in and "coming to the desk" notifications, and its timers, wait counters and today's date follow the clinic's clock.
- A backup that is cut off or fails its check is never kept as a good copy.

## [1.5.1] - 2026-09-24

### Added

- The app warns when a phone's clock or time zone doesn't match the clinic's, with a button to Android's date and time settings.

### Fixed

- The booking flow, the empty day and the calendar's day summary are now in Arabic.
- WhatsApp opens in the regular app when a branch hasn't picked one.

## [1.5.0] - 2026-09-24

### Added

- The secretary is notified when the doctor finishes a visit.
- The doctor is notified when a patient checks in.
- The doctor can finish a visit from the notification, without opening the app.
- Each branch chooses whether reminders open WhatsApp or WhatsApp Business.
- Checkout shows the discount on the amount due, as a percentage of the procedure total, and each discounted procedure shows its usual price.
- Add and edit patient notes from the patient editor.
- Booking and old-visit steps animate between each other. Toasts swipe away more smoothly.
- The phones stay in sync live: the day and patients screens update as the other phone makes changes, and a phone that reconnects catches up on what it missed.

### Changed

- Checkout no longer has a discount field. It shows a read-only hint instead.
- Times follow the app's language by default.
- Removed the "legacy" badge from the patient header.

### Fixed

- The visit screen, the money page's "Outstanding" and the discount's minus sign are correct in Arabic.
- Latin patient names stay at the start of the row in Arabic.

## [1.4.1] - 2026-09-23

### Added

- Follow-ups for previous procedures entered on a patient.

## [1.4.0] - 2026-09-23

### Added

- Record a visit that happened on a day already past.
- Add a patient's previous procedures from the patient editor, with a date picker.
- Several patients can share one phone number.
- A patient's number can be corrected from the record editor.
- Edit the visit note from the visit screen.

### Changed

- A patient's age is required.

### Fixed

- A second tap on any save button no longer sends the save twice.
- A tap opens exactly one pane, whatever opened it.

## [1.3.4] - 2026-09-22

### Fixed

- Tapping a number field selects its value, including planned procedure prices.

## [1.3.3] - 2026-09-22

### Fixed

- The patient record, the tab strip, the chair readout and the payment confirmation display correctly in Arabic.
- The keyboard closes when a patient is opened from search.

## [1.3.2] - 2026-09-22

### Added

- Delete a visit, a payment or a patient.

### Fixed

- Handing over the chair works when a visit has been deleted.

## [1.3.1] - 2026-09-22

### Fixed

- A booked row on the patient record opens its booking page.
- The day, money and settings screens are fully in Arabic.

## [1.3.0] - 2026-09-22

### Added

- A banner on the home screen announces a new version. It can be dismissed.

## [1.2.0] - 2026-09-22

### Added

- Arabic throughout the app, with a localized time wheel.
- Backups to the doctor's own Google Drive, linked from the phone, with an alert when Drive needs a new sign-in.
- An old patient keeps the number on their paper file.

### Changed

- Changing the reminder lead time moves reminders that are already booked.

## [1.1.0] - 2026-09-21

No changes for the clinic.

## [1.0.0] - 2026-09-20

The first release at the clinic.

- The day view: booking, walk-ins, check-in, the chair and checkout, for two branches.
- Patients: registration, search, the record and its visit history.
- Procedures and prices from the clinic's catalogue, with partial payments and balances.
- Daily reminders that open WhatsApp for each patient.
- Settings for working hours, branches, procedures and reminders.
- Runs on the clinic's own server over Tailscale, with over-the-air updates.

[Unreleased]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.6.3...v1.7.0
[1.6.3]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.3.4...v1.4.0
[1.3.4]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Youssef-codin/lustre-clinic/releases/tag/v1.0.0
