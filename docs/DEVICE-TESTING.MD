# Testing on a real Android phone

**Expo Go is not usable for this project** — its bundled runtime lags Expo
SDK 57, and it can never load a custom native module anyway. The phone runs a
**development build** instead: a real debug APK built from this project, with
`expo-dev-client` embedded so we keep the fast reload loop.

The native `android/` directory is *generated* from `app.json` by
`expo prebuild` and is gitignored. Don't edit it — change `app.json` (or a
config plugin) and let it regenerate.

## One-time setup

### This machine

The Android SDK lives at `/opt/android-sdk` and is user-owned, so nothing here
needs sudo. Required components: `platform-tools` (adb), `build-tools;36.0.0`,
`platforms;android-36`, and a JDK (21 is installed and fine for RN 0.86).

Put these in your shell rc so `adb` and Gradle find the SDK outside the scripts:

```sh
export ANDROID_HOME=/opt/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

### The phone

1. **Settings → About phone → tap "Build number" 7 times.**
2. **Settings → System → Developer options → USB debugging → on.**
3. Also enable **Install via USB** / disable "verify apps over USB" if your
   vendor ROM has it (Xiaomi, Oppo, Vivo) — otherwise the install step fails.
4. Plug in with a data-capable cable, set USB mode to *File transfer*, accept
   the "Allow USB debugging" prompt, then check:

   ```sh
   adb devices     # serial listed as `device`, not `unauthorized` or `offline`
   ```

## Daily use

```sh
bun dev        # terminal 1 — API server
bun app        # terminal 2 — build, install, launch, start Metro
```

`bun app` runs `packages/app/scripts/device.sh`, which:

1. points `ANDROID_HOME` at the SDK,
2. verifies an authorized device is attached,
3. `adb reverse`s **8081** (Metro) and **3000** (API) over the cable,
4. runs `expo run:android`, which prebuilds if needed, builds the debug APK
   with Gradle, installs it, and starts the bundler.

The first build takes several minutes. After that, JS changes need no rebuild —
save and the app reloads.

| Command | When |
| --- | --- |
| `bun app` | Normal loop. Reuses the Gradle cache. |
| `bun app:build` | After changing `app.json`, adding a native dependency, or when the build cache is suspect. |
| `bun run --cwd packages/app device:start` | APK already installed and unchanged; just want the bundler. Fastest. |

### Why USB rather than Wi-Fi

Ports are tunnelled over the cable, so on-device `localhost` **is** this
machine. That makes `http://localhost:3000` the correct API base URL on device
and on the emulator, keeps any LAN IP out of the codebase, and keeps working
when the phone is on mobile data or another network. It also means the server
never has to bind anything but loopback — which matches the deployment posture
in SPEC §12, where the clinic machine listens only on Tailscale.

If you must go wireless, pair over Wi-Fi debugging (`adb pair`) and everything
above still applies — the reverses ride the adb connection, not the cable.

## Logs and the dev menu

- JS logs stream into the Metro terminal.
- Native logs: `bun run --cwd packages/app device:logs`.
- Dev menu: shake the phone, or `adb shell input keyevent 82`.
- Reload: `r` in the Metro terminal.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `unauthorized` in `adb devices` | Developer options → *Revoke USB debugging authorisations*, replug, accept the prompt. |
| `INSTALL_FAILED_USER_RESTRICTED` | Vendor ROM blocking USB installs — enable "Install via USB" in Developer options. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | A different build signed with another key is installed: `adb uninstall com.mawid.clinic`, then `bun app`. |
| Bundle won't load / infinite splash | `adb reverse --list`; some phones drop reverses on unplug. Re-run `bun app`. |
| API calls fail, bundle loads fine | Server isn't running, or it's on another port — `API_PORT=xxxx bun app`. |
| Gradle can't find the SDK | `ANDROID_HOME` unset in that shell — see the export block above. |
| Native build errors after a dependency bump | `rm -rf packages/app/android` and `bun app` to regenerate from `app.json`. |
