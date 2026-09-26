/**
 * Opening and closing time: a row that shows the time, and a wheel in a sheet
 * of its own to change it.
 *
 * The platform dialog this replaces drew its AM/PM from the OS locale, so an
 * English phone showing the Arabic layout said PM where the row behind it said
 * م, and nothing could override it. It was also the app's only native module of
 * its kind. The wheel (`TimeWheel`) is plain JS, and its meridiem comes from
 * the same `clock12` as the row.
 *
 * The wheel's sheet is mounted per pick and stacks on the day editor's
 * (`Sheet`'s `stackBehavior="push"`), so the form stays up and dimmed behind it
 * and Cancel, the backdrop or Back reveal it untouched. It is not a second face
 * of the editor's sheet swapped in place — that is what the first wheel did,
 * and a drag down then dismissed the sheet while `visible` stayed true, so the
 * form bounced straight back in. `dragFromBody={false}` because a column scroll
 * and a sheet dismiss are the same downward drag and the sheet otherwise wins
 * it; the handle and the backdrop still close it.
 *
 * All sixty minutes: a clinic opening at 09:45 can say so. That was the
 * complaint against the half-hour `Select` before the platform dialog, and
 * rounding the wheel to quarters would bring it back.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { formatClock12 } from '../../../components/domain';
import { Button, Chevron, Field, Sheet } from '../../../components/ui';
import { useLocale, useT } from '../../../i18n';
import { color, radius, size, space, Text } from '../../../theme';
import { TimeWheel } from './TimeWheel';

export type TimePickerFieldProps = {
    label: string;
    /** Minutes since midnight. */
    value: number;
    onChange: (minutes: number) => void;
    hint?: string;
    error?: string;
    disabled?: boolean;
    testID?: string;
};

export function TimePickerField({
    label,
    value,
    onChange,
    hint,
    error,
    disabled = false,
    testID,
}: TimePickerFieldProps) {
    const locale = useLocale();
    const t = useT();
    const shown = formatClock12(value, locale);

    /** What the wheel reads now; `null` while no wheel is up. */
    const [draft, setDraft] = useState<number | null>(null);

    function set() {
        if (draft !== null) onChange(draft);
        setDraft(null);
    }

    return (
        <>
            <Field label={label} hint={hint} error={error}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(label)}
                    accessibilityValue={{ text: shown }}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => setDraft(value)}
                    testID={testID}
                    style={({ pressed }) => [
                        styles.control,
                        error ? styles.errored : null,
                        pressed && styles.pressed,
                        disabled && styles.disabled,
                    ]}
                >
                    <Text variant="body" numberOfLines={1} style={styles.value}>
                        {shown}
                    </Text>
                    <Chevron direction="down" />
                </Pressable>
            </Field>

            {draft !== null ? (
                <Sheet
                    visible
                    onClose={() => setDraft(null)}
                    dragFromBody={false}
                    scrollBody={false}
                    title={label}
                    subtitle={formatClock12(draft, locale)}
                    testID="time-wheel-sheet"
                    footer={
                        <>
                            <Button label="Set" block onPress={set} testID="time-wheel-set" />
                            <Button label="Cancel" variant="ghost" block onPress={() => setDraft(null)} />
                        </>
                    }
                >
                    <TimeWheel value={draft} onChange={setDraft} />
                </Sheet>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    control: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    value: { flex: 1 },
    errored: { borderColor: color.danger },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.32 },
});
