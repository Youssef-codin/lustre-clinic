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
 * **It is measured from the bottom of the window, navigation bar included.**
 * React Native's Android root view reports `ime - systemBars` (`ReactRootView`),
 * which is the keyboard *above* the navigation bar. The keyboard is drawn over
 * that bar, so a bar pinned to the window's bottom edge needs the bar's inset on
 * top of what the event says. Without it every confirm button stopped one
 * navigation bar short — flush against the keys on a gesture phone, 24dp under
 * them on a three-button one.
 *
 * `ui/Sheet` takes `Math.max` of this and the bottom inset rather than the sum,
 * since this already contains the inset while the keyboard is up.
 */
// biome-ignore lint/style/noRestrictedImports: subscribes to the native `Keyboard` show/hide events; React has no other way to hear the keyboard move
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);
    const insets = useSafeAreaInsets();

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

    // iOS reports the keyboard from the bottom of the screen already.
    if (height === 0 || Platform.OS !== 'android') return height;
    return height + insets.bottom;
}
