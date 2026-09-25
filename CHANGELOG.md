# Changelog

What changed for the clinic in each release. Versions match the release tags
(`vX.Y.Z`). A patch is an over-the-air update that applies the next time the
app opens. A minor version is a new APK, or an over-the-air update the phones
download and restart into straight away. Dev-track tags (`dev-v*`) are not
listed.

## [Unreleased]

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

[Unreleased]: https://github.com/Youssef-codin/lustre-clinic/compare/v1.6.0...HEAD
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
