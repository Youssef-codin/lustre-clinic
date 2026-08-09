import { useRef, useState } from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { TextVariant } from '../../theme';
import { color, containsArabic, font, size, space, Text, type } from '../../theme';
import { Placeholder } from './Placeholder';

export type InlineEditorProps = {
    value: string;
    /** Called on commit — blur or the return key — never per keystroke. */
    onCommit: (value: string) => void;
    placeholder?: string;
    /** The variant the *displayed* value uses; the input matches it. */
    variant?: TextVariant;
    keyboardType?: KeyboardTypeOptions;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
};

/**
 * Tap a value, it becomes an input in place; blur or Return commits, Escape
 * reverts (§4.2). Used for the prices on the procedures list, where opening a
 * form to change one number is the wrong weight of interaction.
 *
 * The draft is local until commit, so an abandoned edit never reaches the caller
 * and never reaches the server.
 */
export function InlineEditor({
    value,
    onCommit,
    placeholder,
    variant = 'body',
    keyboardType,
    disabled = false,
    accessibilityLabel,
    testID,
}: InlineEditorProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    // Set when Escape reverts, so the blur that follows does not commit the draft
    // the user just abandoned.
    const abandoned = useRef(false);

    function begin() {
        setDraft(value);
        abandoned.current = false;
        setEditing(true);
    }

    function commit() {
        setEditing(false);
        if (abandoned.current) return;
        if (draft !== value) onCommit(draft);
    }

    function revert() {
        abandoned.current = true;
        setDraft(value);
        setEditing(false);
    }

    if (!editing) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? value}
                accessibilityHint="Double tap to edit"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={begin}
                testID={testID}
                style={({ pressed }) => [
                    styles.display,
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                ]}
            >
                <Text variant={variant} tone={value ? 'ink' : 'muted'}>
                    {value || placeholder || ''}
                </Text>
            </Pressable>
        );
    }

    return (
        <View style={styles.editing}>
            <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onBlur={commit}
                onSubmitEditing={commit}
                onKeyPress={(event) => {
                    if (event.nativeEvent.key === 'Escape') revert();
                }}
                keyboardType={keyboardType}
                returnKeyType="done"
                accessibilityLabel={accessibilityLabel ?? placeholder}
                style={[
                    type[variant],
                    styles.input,
                    { fontFamily: containsArabic(draft) ? font.arabic.regular : font.sans.regular },
                ]}
            />
            <Placeholder text={placeholder} visible={!draft} variant={variant} />
        </View>
    );
}

const styles = StyleSheet.create({
    display: { justifyContent: 'center', minHeight: size.row, paddingHorizontal: space[1] },
    editing: { justifyContent: 'center', minHeight: size.row },
    input: {
        color: color.ink,
        paddingHorizontal: space[1],
        paddingVertical: space[1],
        borderBottomWidth: 1.5,
        borderBottomColor: color.ink,
    },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.32 },
});
