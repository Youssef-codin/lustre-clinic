import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the software keyboard, or 0 when it is down.
 *
 * iOS fires `keyboardWillShow` one frame before the keyboard moves, so a sheet
 * can travel with it. Android has no `will` events — it fires `keyboardDidShow`
 * after the fact, and because `softwareKeyboardLayoutMode` is `resize` the window
 * has already shrunk by then. So on Android this is a *fact about the keyboard*,
 * useful for deciding whether to hide a footer, and not a distance anything
 * should be translated by: the resize already moved it, and adding the height
 * again would push the sheet a keyboard clear of the keyboard.
 */
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
