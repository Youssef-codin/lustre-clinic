#!/usr/bin/env bash
# Build/run the app on the Android emulator — `device.sh`, without the cable.
#
#   ./emulator.sh          boot the AVD (if cold), then the bundler — building
#                          and installing first only if the APK isn't there yet
#   ./emulator.sh --build  force a native rebuild first
#   ./emulator.sh --release  build and install the release APK, no bundler —
#                          the only way to time anything, since dev builds run
#                          Reanimated and the new architecture unoptimised
#   ./emulator.sh --start  bundler only; the APK is already installed
#   ./emulator.sh --clear  drop Metro's caches first; combines with the above
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

AVD="${LUSTRE_AVD:-lustre_note}"
METRO_PORT="${METRO_PORT:-8081}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"

# The port the server actually binds, read from the same .env it reads, because
# a reverse for the wrong port is invisible: the app just reports the clinic
# server did not answer, and nothing in adb says why.
env_file="$(dirname "$0")/../../../.env"
env_port=$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$env_file" 2>/dev/null | tail -1)
API_PORT="${API_PORT:-${env_port:-3000}}"

# Prefer an already-exported SDK; fall back to the system-wide location.
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

mode="run"
shot=""
clear_cache=""
while [ $# -gt 0 ]; do
    case "$1" in
        --build) mode="build" ;;
        --release) mode="release" ;;
        --start) mode="start" ;;
        --clear) clear_cache="1" ;;
        --shot)
            mode="shot"
            shot="${2:-emulator.png}"
            if [ $# -gt 1 ]; then shift; fi
            ;;
        *) echo "unknown option: $1 (expected --build, --release, --start, --clear, --shot, or nothing)" >&2; exit 2 ;;
    esac
    shift
done

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
        echo "Create one in Android Studio, or point this at another with LUSTRE_AVD=<name>." >&2
        exit 1
    fi

    echo "Booting $AVD…"
    # Detached, and its log kept: the emulator outlives this script, so the next
    # run is a warm start, and a GPU failure is findable afterwards.
    log="${TMPDIR:-/tmp}/lustre-emulator-${AVD}.log"
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

# One ABI, the one this emulator actually runs — see the note in
# gradle.properties. Derived rather than assumed so an arm64 AVD (an Apple
# Silicon host, say) builds for itself instead of for the x86_64 default.
abi=$(adb -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')
if [ -n "$abi" ]; then
    export ORG_GRADLE_PROJECT_reactNativeArchitectures="$abi"
fi

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

# Metro keys its transform cache by file contents, but a crashed or killed
# bundler can leave an entry behind that no longer matches what is on disk —
# which reads as a syntax error in a file that parses fine, pointing at lines
# the editor does not have. `--clear` is the way out. `expo run:android` has no
# such flag, so the caches are removed by hand and both modes get the same fix.
if [ -n "$clear_cache" ]; then
    echo "Clearing Metro's caches…"
    rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* \
        ../../node_modules/.cache .expo/web/cache 2>/dev/null || true
fi

# The default used to be a full `run:android` every time — a Gradle build on
# every start, even when nothing native had changed. That build is the
# expensive half of this script by a wide margin, and on a 16 GB machine it is
# the half that takes the desktop down with it.
#
# So the default is now conditional: if the APK is already on the device, the
# bundler alone is what a JS change needs. `--build` still forces a rebuild, and
# a missing APK falls through to one — the check is for the routine case, not a
# way to end up with a bundler and nothing to attach it to.
#
# Native changes (a new native dependency, an app.json edit that touches the
# native project) still need `--build`. Nothing here can detect those.
if [ "$mode" = "run" ]; then
    if adb -s "$serial" shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx 'package:com.lustre.clinic'; then
        echo "com.lustre.clinic is already installed — starting the bundler only."
        echo "Use --build if you changed anything native."
        mode="start"
    else
        echo "com.lustre.clinic is not installed on $serial — building it."
    fi
fi

# A release APK carries its own bundle, so there is no Metro to start and no
# `--dev-client` to attach: the app is installed and runs on its own. It is
# signed with the debug keystore (`android/app/build.gradle` points the release
# signing config at it), which is fine for a device in reach and not for
# anything that leaves this machine.
if [ "$mode" = "release" ]; then
    exec bunx expo run:android --device "$avd" --variant release
fi

if [ "$mode" = "start" ]; then
    args=(start --dev-client --localhost --port "$METRO_PORT")
    [ -n "$clear_cache" ] && args+=(--clear)
    exec bunx expo "${args[@]}"
fi

args=(run:android --device "$avd" --port "$METRO_PORT")
[ "$mode" = "build" ] && args+=(--no-build-cache)

exec bunx expo "${args[@]}"
