/**
 * `RouterOutput` is what comes off the wire, so every `timestamptz` is already
 * a string there — JSON has no date type and there is no transformer on either
 * side. The handlers work in `Date`, because the services they mirror do and
 * because comparing two instants is most of what they do.
 *
 * `Dated<T>` is the bridge, and it points the checking the right way round: a
 * handler is annotated with `Dated<RouterOutput[…]>`, so TypeScript still
 * verifies every field name, every union and every nullability against the
 * server's own contract, and the only thing it relaxes is the representation of
 * the instants that `link.ts` serializes on the way out.
 *
 * Date fields are recognized by name, which is why they are listed rather than
 * inferred: from the wire's side a timestamp and a calendar date are both
 * `string`, and they are not the same thing. `patients.birthDate`,
 * `settings.reminderNotifyAt` and `reminderDismissedOn` are deliberately
 * absent — those really are strings on both sides.
 */
type DateKey =
    | 'createdAt'
    | 'updatedAt'
    | 'startsAt'
    | 'paidAt'
    | 'dueAt'
    | 'sentAt'
    | 'checkedInAt'
    | 'inChairAt'
    | 'pricedAt'
    | 'completedAt'
    | 'oldestUnpaidAt'
    | 'from'
    | 'to';

type AsDate<T> = null extends T ? Date | null : Date;

export type Dated<T> = T extends Date
    ? T
    : T extends (infer U)[]
      ? Dated<U>[]
      : T extends object
        ? { [K in keyof T]: K extends DateKey ? AsDate<T[K]> : Dated<T[K]> }
        : T;
