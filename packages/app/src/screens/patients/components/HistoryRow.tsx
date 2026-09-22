/**
 * One appointment in the patient's history — `patient-view.html`. Three columns:
 * the date stamp, what was done and how it went, and the money with a line under
 * it saying what the amount means.
 *
 * The row leads with the work: a record is read to answer "what did we do last
 * time", and `160826-7M69` answers nothing a person asks out loud.
 *
 * Two rows here are not visits and say so rather than borrowing a visit's
 * words. An **opening balance** is debt carried over and has a visit behind it
 * only because that is where a balance can live. An **imported** row is work the
 * old system recorded: no visit at all, so the money column is empty, and the
 * date stamp goes blank when the paper file did not say when — *Before
 * migration* is the honest answer and the cutoff date would be a made-up one.
 *
 * The appointment ref used to ride beside the status pill, on the reasoning that
 * this is the screen someone is on with the paper file open and the ref was what
 * matched one to the other. That was wrong about the paper: the book is one page
 * per patient, so there is nothing per visit to match and the ref pointed at a
 * page that does not exist. The patient's own ref is on the header instead,
 * once. The appointment ref is still in the payload, still on the day view's
 * detail sheet, and still what a reminder quotes down the phone — it just is not
 * an identifier the desk writes anywhere.
 *
 * Full-bleed on the page's own colour with a hairline under it, not a card. The
 * design draws a ledger: rows running edge to edge in one continuous tone,
 * ruled apart, so the eye runs down the money column. A white row on a grey page
 * stripes the list and turns each line into an object.
 *
 * The big number is what the desk has to act on. A visit with money still owed
 * leads with what is owed, in the due colour, and the total sits small under it
 * ("of 2,200"). It used to be the other way round, and a visit that had been
 * paid in part read as though the payment had not been taken at all. A settled
 * visit leads with its total and says "Paid in full" in green under it.
 *
 * The amount drops `EGP` — the column is money and says so once, at the top.
 * One deviation: the mock draws an amount on a no-show, because its fixture
 * carries one. Real data has no visit there and so no money; `EGP 0` under a
 * name reads as a free appointment, so that slot stays empty and only the line
 * under it is drawn.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { MoneyValue, statusLabel } from '../../../components/domain';
import { useT } from '../../../i18n';
import { border, color, radius, size, space, Text } from '../../../theme';
import type { HistoryProcedure, PatientHistoryEntry } from '../data/types';

export type HistoryRowProps = {
    entry: PatientHistoryEntry;
    /**
     * Whether this `checked_in` row heads today's arrival queue. The status is
     * the same for the chair and the waiting room, so only the queue can say
     * which. Absent means the queue is not known — still loading, or the read
     * failed — and the row says Checked in rather than guess either way.
     */
    inChair?: boolean;
    /**
     * Opens the visit behind a row that came, or the booking page for one still
     * `booked`. Absent leaves every row inert.
     */
    onOpen?: (entry: PatientHistoryEntry) => void;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type Tone = 'ink' | 'success' | 'due' | 'muted';

// The patient's words, not the schema's: what a record answers is whether they
// turned up. `booked` is a future appointment sitting in the same list.
const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
    booked: { label: 'Booked', tone: 'muted' },
    checked_in: { label: statusLabel('checked_in', false), tone: 'due' },
    awaiting_payment: { label: 'At the desk', tone: 'ink' },
    done: { label: 'Came', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'muted' },
    no_show: { label: 'No-show', tone: 'due' },
};

/** `checked_in` at the head of the queue. Everyone behind it is `STATUS.checked_in`. */
const IN_CHAIR: { label: string; tone: Tone } = { label: statusLabel('checked_in', true), tone: 'ink' };

/** `checked_in` with no queue to read: arrived, and nothing claimed about the chair. */
const CHECKED_IN: { label: string; tone: Tone } = { label: 'Checked in', tone: 'ink' };

/** Not a status the schema has — the row is `done`, and what happened is that nothing did. */
const CARRIED_OVER: { label: string; tone: Tone } = { label: 'Carried over', tone: 'muted' };

/** Work the old system recorded. It happened — somewhere else, before this app. */
const IMPORTED: { label: string; tone: Tone } = { label: 'Old record', tone: 'muted' };

export function HistoryRow({ entry, inChair, onOpen }: HistoryRowProps) {
    const t = useT();
    const { day, month } = stamp(entry.startsAt);
    const carried = entry.isOpeningBalance;
    // Debt carried over from the old system has a visit behind it, because that
    // is the only place a balance can live (§10) — but nobody sat in the chair,
    // so it says what it is instead of borrowing the words for a visit. `Came`
    // under a `done` status on a day the clinic never saw them is the record
    // telling the desk something that did not happen.
    const status = carried
        ? CARRIED_OVER
        : entry.isImported
          ? IMPORTED
          : entry.status === 'checked_in' && inChair === undefined
            ? CHECKED_IN
            : entry.status === 'checked_in' && inChair
              ? IN_CHAIR
              : STATUS[entry.status];
    const came = entry.visitId !== null;
    const due = entry.balance > 0;

    // A row is a way into what it stands for: the visit behind a row that came,
    // or the booking itself while it is still to come. One with neither — a
    // cancellation, a no-show — has nothing behind it and stays inert rather
    // than offering a tap that goes nowhere. An opening balance has a visit,
    // but an empty one with no procedures on it, so there is nothing to open
    // either.
    const openable = ((came && !carried) || entry.status === 'booked') && onOpen !== undefined;

    // An imported row's date is the cutoff only because `starts_at` is NOT
    // NULL. Drawing it would be this record telling the desk a day the work was
    // done on, which nobody knows — so the stamp says nothing and the line
    // under the row says why.
    const undated = entry.isImported && entry.dateUnknown;

    return (
        <Pressable
            accessibilityRole={openable ? 'button' : undefined}
            disabled={!openable}
            onPress={openable ? () => onOpen?.(entry) : undefined}
            style={({ pressed }) => [styles.row, pressed && openable && styles.pressed]}
            testID={`history-row-${entry.appointmentId}`}
        >
            <View style={styles.stamp}>
                {undated ? (
                    <Text variant="callout" script="mono" weight="bold" tone="muted">
                        —
                    </Text>
                ) : (
                    <>
                        <Text variant="callout" script="mono" weight="bold">
                            {day}
                        </Text>
                        <Text variant="tag" tone="muted">
                            {month}
                        </Text>
                    </>
                )}
            </View>

            <View style={styles.body}>
                {carried ? (
                    <Text variant="callout" weight="bold" numberOfLines={2}>
                        {t('Opening balance')}
                    </Text>
                ) : (
                    <Work procedures={entry.procedures} />
                )}

                <View style={styles.meta}>
                    <View style={[styles.pill, PILL[status.tone]]}>
                        <View style={[styles.pillDot, { backgroundColor: TONE_COLOR[status.tone] }]} />
                        <Text variant="tag" weight="bold" tone={status.tone === 'ink' ? 'ink' : status.tone}>
                            {t(status.label)}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.amounts}>
                {came && due ? (
                    <View style={styles.meaning}>
                        <MoneyValue
                            piastres={entry.balance}
                            variant="callout"
                            weight="bold"
                            showCurrency={false}
                            tone="due"
                        />
                        <Text variant="caption" weight="bold" tone="due">
                            {t('due')}
                        </Text>
                    </View>
                ) : came ? (
                    <MoneyValue
                        piastres={entry.chargedTotal}
                        variant="callout"
                        weight="bold"
                        showCurrency={false}
                        tone="ink"
                    />
                ) : null}
                <Meaning entry={entry} />
            </View>
        </Pressable>
    );
}

/**
 * The first procedure in full, the rest counted and set quieter beside it. Two
 * teeth and a quantity do not fit a row on a phone, and the visit screen is
 * where the whole list belongs.
 */
function Work({ procedures }: { procedures: HistoryProcedure[] }) {
    const t = useT();
    const [first, ...rest] = procedures;

    if (!first) {
        return (
            <Text variant="callout" weight="bold" tone="muted" numberOfLines={2}>
                {t('No procedures recorded')}
            </Text>
        );
    }

    return (
        <Text variant="callout" weight="bold" numberOfLines={2}>
            {first.tooth ? `${first.name} — ${first.tooth}` : first.name}
            {rest.length > 0 ? <Text variant="subhead" tone="muted">{`  +${rest.length} more`}</Text> : null}
        </Text>
    );
}

/**
 * What the number above it means, or — where there is no number — what happened
 * instead. A row still to come says nothing: it has not happened, and "Booked"
 * is already on the pill.
 */
function Meaning({ entry }: { entry: PatientHistoryEntry }) {
    const t = useT();
    // Work the old system recorded. There is no money column on it at all — no
    // visit, so nothing to charge, owe or pay — and the line under the empty
    // column is the only thing that has to say so.
    if (entry.isImported) {
        return (
            <Text variant="caption" tone="muted" style={styles.importedNote}>
                {entry.dateUnknown ? t('Before migration') : t('From the old system')}
            </Text>
        );
    }

    if (entry.visitId === null) {
        if (entry.status === 'no_show') {
            return (
                <Text variant="caption" tone="muted">
                    {t('Did not attend')}
                </Text>
            );
        }
        if (entry.status === 'cancelled') {
            return (
                <Text variant="caption" tone="muted">
                    {t('Called off')}
                </Text>
            );
        }
        return null;
    }

    if (entry.balance > 0) {
        return (
            <View style={styles.meaning}>
                <Text variant="caption" tone="muted">
                    of
                </Text>
                <MoneyValue
                    piastres={entry.chargedTotal}
                    variant="caption"
                    tone="muted"
                    showCurrency={false}
                />
            </View>
        );
    }

    return (
        <Text variant="caption" weight="medium" tone="success">
            {t('Paid in full')}
        </Text>
    );
}

function stamp(iso: string): { day: string; month: string } {
    const date = new Date(iso);
    return {
        day: String(date.getDate()).padStart(2, '0'),
        month: MONTHS[date.getMonth()] ?? '',
    };
}

const TONE_COLOR: Record<Tone, string> = {
    ink: color.ink,
    success: color.successText,
    due: color.due,
    muted: color.muted,
};

const PILL = StyleSheet.create({
    ink: { backgroundColor: color.surface2 },
    success: { backgroundColor: color.successSoft },
    due: { backgroundColor: color.dueSoft },
    muted: { backgroundColor: color.surface2 },
});

const styles = StyleSheet.create({
    pressed: { backgroundColor: color.surface2 },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingHorizontal: size.gutter,
        paddingVertical: space[2.5],
        borderBottomWidth: border.hair,
        borderBottomColor: color.line,
    },
    stamp: { width: 30, alignItems: 'center' },
    body: { flex: 1, alignItems: 'flex-start', gap: space[1] },
    // Wraps, so a long procedure name pushing the pill wide drops the ref to its
    // own line rather than squeezing it — a half-shown ref is worse than none.
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        paddingHorizontal: space[1.5],
        paddingVertical: 2,
        borderRadius: radius.full,
    },
    pillDot: { width: 5, height: 5, borderRadius: radius.full },
    amounts: { alignItems: 'flex-end', gap: space[0.5] },
    // The column is empty above it, so the note wraps to two short lines on a
    // narrow phone rather than pushing the row's body out of shape.
    importedNote: { textAlign: 'right', maxWidth: 96 },
    meaning: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
