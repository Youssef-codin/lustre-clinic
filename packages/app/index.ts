// Must be first: installs the dev-client runtime (dev menu, bundler picker,
// error overlay) that replaces Expo Go in a development build.
import 'expo-dev-client';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
