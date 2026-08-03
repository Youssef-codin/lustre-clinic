// Must be first: installs the dev-client runtime (dev menu, bundler picker,
// error overlay) that replaces Expo Go in a development build.
import 'expo-dev-client';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
