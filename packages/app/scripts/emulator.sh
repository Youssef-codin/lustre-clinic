#!/usr/bin/env bash
# Build/run the app on the Android emulator — `device.sh`, without the cable.
#
#   ./emulator.sh          boot the AVD (if cold), build/install, start the bundler
#   ./emulator.sh --build  force a native rebuild first
#   ./emulator.sh --start  bundler only; the APK is already installed
#   ./emulator.sh --shot out.png  screenshot whatever is on screen and exit
#
# Why this exists next to `device.sh`: a phone drops off USB when the cable
# moves, which costs an install cycle and can kill a run mid-flight. The
# emulator does not, and it screenshots over adb without anyone holding it.
#
# The ABI trap, which looks like a broken build and is not: Gradle builds only
# the ABI of the device attached when it runs. An APK built against a 32-bit
# phone will not install on an x86_64 emulator — `INSTALL_FAILED_NO_MATCHING_ABIS`
# is that, and `--build` is the fix.
set -euo pipefail

AVD="${MAWID_AVD:-mawid_note}"
METRO_PORT="${METRO_PORT:-8081}"
API_PORT="${API_PORT:-3000}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"

# Prefer an already-exported SDK; fall back to the system-wide location.
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

mode="run"
shot=""
case "${1:-}" in
    --build) mode="build" ;;
    --start) mode="start" ;;
    --shot)
        mode="shot"
        shot="${2:-emulator.png}"
        ;;
    "") ;;
    *) echo "unknown option: $1 (expected --build, --start, --shot, or nothing)" >&2; exit 2 ;;
esac

if [ ! -d "$ANDROID_HOME" ]; then
    echo "Android SDK not found at $ANDROID_HOME. Set ANDROID_HOME." >&2
    exit 1
fi

for tool in adb emulator; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "$tool not found under $ANDROID_HOME." >&2
        echo "Install it with: sdkmanager 'platform-tools' 'emulator'" >&2
        exit 1
    fi
done

adb start-server >/dev/null 2>&1 || true

# An emulator already up is reused whatever it is running: booting a second one
# on the same AVD fails on the lock file, and a warm device is the point.
serial=$(adb devices | awk 'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1; exit}')

if [ -z "$serial" ]; then
    if ! emulator -list-avds | grep -qx "$AVD"; then
        echo "No AVD named '$AVD'. Available:" >&2
        emulator -list-avds >&2
        echo >&2
        echo "Create one in Android Studio, or point this at another with MAWID_AVD=<name>." >&2
        exit 1
    fi

    echo "Booting $AVD…"
    # Detached, and its log kept: the emulator outlives this script, so the next
    # run is a warm start, and a GPU failure is findable afterwards.
    log="${TMPDIR:-/tmp}/mawid-emulator-${AVD}.log"
    nohup emulator -avd "$AVD" -gpu auto -no-boot-anim >"$log" 2>&1 &
    disown || true

    echo "Waiting for it to come up (log: $log)…"
    waited=0
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
        if [ "$waited" -ge "$BOOT_TIMEOUT" ]; then
            echo "The emulator did not finish booting in ${BOOT_TIMEOUT}s. See $log." >&2
            exit 1
        fi
        sleep 2
        waited=$((waited + 2))
    done

    serial=$(adb devices | awk 'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1; exit}')
fi

# `expo run:android --device` matches an emulator by its AVD name, not by the
# serial `adb` reports — the serial is what a *physical* device is called and
# passing one here is "could not find device". A reused emulator is asked what
# AVD it is running rather than assumed to be ours.
avd=$(adb -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')
[ -n "$avd" ] || avd="$AVD"

echo "Emulator: $serial ($avd)"

if [ "$mode" = "shot" ]; then
    adb -s "$serial" exec-out screencap -p >"$shot"
    echo "Wrote $shot"
    exit 0
fi

# Metro so the JS bundle loads; API so tRPC calls to localhost:3000 reach us.
# The emulator has its own `10.0.2.2` route to the host, but reversing the ports
# keeps `localhost` meaning this machine on the emulator and on a phone alike —
# one address in the codebase, not two.
adb -s "$serial" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" >/dev/null
adb -s "$serial" reverse "tcp:${API_PORT}" "tcp:${API_PORT}" >/dev/null
echo "Reversed ports ${METRO_PORT} (metro) and ${API_PORT} (api) onto the emulator."

cd "$(dirname "$0")/.."

if [ "$mode" = "start" ]; then
    exec bunx expo start --dev-client --localhost --port "$METRO_PORT"
fi

args=(run:android --device "$avd" --port "$METRO_PORT")
[ "$mode" = "build" ] && args+=(--no-build-cache)

exec bunx expo "${args[@]}"
