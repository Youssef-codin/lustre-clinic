// The daily reminder nudge (SPEC §11, `PRODUCT.md:96`), the desk's "coming to
// the desk" notice, the doctor's Finish action and "checked in" notice (README). The barrel is the
// only entry point; `schedule`, `visitNotice` and `visitAction` are imported by
// their own paths where their rules are tested, because they are the only
// files here with no `expo-notifications` in them.

export { useArrivalNotices } from './useArrivalNotices';
export { useNotificationsAllowed } from './useNotificationsAllowed';
export { useRearmReminderNudges, useReminderNudges } from './useReminderNudges';
export { useVisitCompletedNotices } from './useVisitCompletedNotices';
export { useVisitFinishAction } from './useVisitFinishAction';
