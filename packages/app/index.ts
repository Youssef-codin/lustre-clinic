// Must be first: installs the dev-client runtime (dev menu, bundler picker,
// error overlay) that replaces Expo Go in a development build.
import 'expo-dev-client';
import * as Sentry from '@sentry/react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { CRASH_REPORTS_ON, startCrashReports } from './src/reporting';

// Before the root mounts, so a crash in the first render is caught. `wrap` adds
// the boundary that records taps, named by `testID` and never by visible text.
startCrashReports();
registerRootComponent(
    CRASH_REPORTS_ON ? Sentry.wrap(App, { touchEventBoundaryProps: { labelName: 'testID' } }) : App,
);
