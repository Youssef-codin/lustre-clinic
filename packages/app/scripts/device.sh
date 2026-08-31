#!/usr/bin/env bash
# Build/run the app on a USB-connected Android phone as a *development build*.
#
# Expo Go can't host this project (its bundled runtime lags SDK 57), so the
# phone gets a real APK built from the native project that `expo prebuild`
# generates from app.json. That APK embeds expo-dev-client, which gives us the
# same reload/dev-menu loop Expo Go would have.
#
#   ./device.sh          build (if needed), install, launch, start the bundler
#   ./device.sh --build  force a native rebuild first
#   ./device.sh --start  bundler only; APK already on the phone
#
# `adb reverse` tunnels Metro and the API over the cable, so on-device
# `localhost` means this machine — no LAN IP anywhere in the codebase, and it
# works on mobile data or a foreign network.
set -euo pipefail

METRO_PORT="${METRO_PORT:-8081}"
API_PORT="${API_PORT:-3000}"

# Prefer an already-exported SDK; fall back to the system-wide location.
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

mode="run"
case "${1:-}" in
    --build) mode="build" ;;
    --start) mode="start" ;;
    "") ;;
    *) echo "unknown option: $1 (expected --build, --start, or nothing)" >&2; exit 2 ;;
esac

if [ ! -d "$ANDROID_HOME" ]; then
    echo "Android SDK not found at $ANDROID_HOME. Set ANDROID_HOME." >&2
    exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found in $ANDROID_HOME/platform-tools." >&2
    echo "Install it with: sdkmanager 'platform-tools'" >&2
    exit 1
fi

adb start-server >/dev/null 2>&1 || true

serial=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -z "$serial" ]; then
    echo "No authorized Android device found. Check that:" >&2
    echo "  1. USB debugging is on (Settings > Developer options)." >&2
    echo "  2. The cable is plugged in and set to file transfer, not charge-only." >&2
    echo "  3. You accepted the 'Allow USB debugging' prompt on the phone." >&2
    echo >&2
    adb devices -l >&2
    exit 1
fi
echo "Device: $serial"

# gradle.properties pins `reactNativeArchitectures` to x86_64, because the
# emulator is the everyday target and building all four ABIs is what made a
# 16 GB machine thrash. A phone is not x86_64, and an APK without its slice is
# `INSTALL_FAILED_NO_MATCHING_ABIS` — so ask the phone what it is and override.
#
# `ORG_GRADLE_PROJECT_<name>` is a Gradle property set from the environment,
# which is the only lever here: `expo run:android` has no flag to forward one.
abi=$(adb -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')
if [ -n "$abi" ]; then
    export ORG_GRADLE_PROJECT_reactNativeArchitectures="$abi"
    echo "Building for $abi (this device's ABI)."
fi

# Metro so the JS bundle loads; API so tRPC calls to localhost:3000 reach us.
adb -s "$serial" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" >/dev/null
adb -s "$serial" reverse "tcp:${API_PORT}" "tcp:${API_PORT}" >/dev/null
echo "Reversed ports ${METRO_PORT} (metro) and ${API_PORT} (api) onto the device."

cd "$(dirname "$0")/.."

if [ "$mode" = "start" ]; then
    exec bunx expo start --dev-client --localhost --port "$METRO_PORT"
fi

# `--device` matches the name Expo gives a device, which for a USB phone is its
# `model:` field — not the adb serial (`AndroidDeviceManager.resolveFromNameAsync`
# compares against `getDevicesAsync()`, and that reads `model:` out of
# `adb devices -l`). Passing the serial fails every physical device with
# "Could not find device with name". Everything above is adb, which only knows
# the serial, so both are kept. An emulator is named for its AVD instead, but
# `emulator.sh` is the path for those; fall back to the serial rather than
# guessing wrong.
case "$serial" in
    emulator-*) name="$serial" ;;
    *) name=$(adb devices -l | awk -v s="$serial" '$1 == s {
            for (i = 2; i <= NF; i++) if ($i ~ /^model:/) { sub(/^model:/, "", $i); print $i; exit }
        }') ;;
esac

# `expo run:android` prebuilds the native project when missing, builds the debug
# APK with Gradle, installs it over adb, and then starts the bundler.
args=(run:android --device "${name:-$serial}" --port "$METRO_PORT")
[ "$mode" = "build" ] && args+=(--no-build-cache)

exec bunx expo "${args[@]}"
