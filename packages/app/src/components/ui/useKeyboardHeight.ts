/**
 * Height of the software keyboard, or 0 when it is down. iOS fires
 * `keyboardWillShow` one frame before the keyboard moves, so a sheet can travel
 * with it; Android has no `will` events and reports the keyboard once it is
 * already there.
 *
 * **On Android this is a distance you are expected to move things by.** It used
 * to be the opposite — the note here said the window resize had already moved
 * the sheet and adding the height again would push it a keyboard clear of the
 * keyboard. That was true under `softwareKeyboardLayoutMode: resize`, and it
 * stopped being true when `edgeToEdgeEnabled` arrived as the Expo SDK 54+
 * default: the app is now laid out behind the system bars *and* behind the IME,
 * `adjustResize` resizes nothing, and anything anchored to the bottom of the
 * window stays exactly where it was with the keyboard drawn over it. That is
 * what put the payment sheet's amount field underneath the keys.
 *
 * `ui/Sheet` is the caller that matters, and it takes `Math.max` of this and the
 * bottom safe-area inset rather than the sum — the keyboard is drawn over the
 * navigation bar, so clearing both would clear one of them twice.
 */
// biome-ignore lint/style/noRestrictedImports: subscribes to the native `Keyboard` show/hide events; React has no other way to hear the keyboard move
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        // Android has no `will` events, iOS has them one frame early for the
        // interactive travel. Listening to both covers the modal case: a
        // `BottomSheetModal` is a separate window and on some devices the
        // `DidShow` never reaches JS while `WillShow` does, and vice versa.
        const showWill = Keyboard.addListener('keyboardWillShow', (event) =>
            setHeight(event.endCoordinates.height),
        );
        const showDid = Keyboard.addListener('keyboardDidShow', (event) =>
            setHeight(event.endCoordinates.height),
        );
        const hideWill = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
        const hideDid = Keyboard.addListener('keyboardDidHide', () => setHeight(0));

        return () => {
            showWill.remove();
            showDid.remove();
            hideWill.remove();
            hideDid.remove();
        };
    }, []);

    return height;
}
