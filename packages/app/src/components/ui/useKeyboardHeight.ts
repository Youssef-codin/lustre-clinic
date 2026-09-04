/**
 * Height of the software keyboard, or 0 when it is down. iOS fires
 * `keyboardWillShow` one frame before the keyboard moves, so a sheet can travel
 * with it. Android has no `will` events and resizes the window
 * (`softwareKeyboardLayoutMode: resize`), so here the value is a *fact about the
 * keyboard* — useful for deciding whether to hide a footer — and never a distance
 * anything should be translated by: the resize already moved the sheet, and
 * adding the height again would push it a keyboard clear of the keyboard.
 */
// biome-ignore lint/style/noRestrictedImports: subscribes to the native `Keyboard` show/hide events; React has no other way to hear the keyboard move
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const show = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates.height));
        const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

        return () => {
            show.remove();
            hide.remove();
        };
    }, []);

    return height;
}
