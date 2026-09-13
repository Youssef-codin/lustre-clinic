#!/usr/bin/env bash
# Build/run the app on Waydroid — `emulator.sh` for agents.
#
#   ./waydroid.sh          start the session (if down), then the bundler —
#                          building and installing first only if the APK isn't
#                          there yet
#   ./waydroid.sh --build  force a native rebuild first
#   ./waydroid.sh --release  build and install the release APK, no bundler
#   ./waydroid.sh --start  bundler only; the APK is already installed
#   ./waydroid.sh --shot out.png  screenshot whatever is on screen and exit
#   ./waydroid.sh --stop   stop the session and give the memory back
#
# Why this exists next to `emulator.sh`: the emulator is a VM with its guest RAM
# reserved up front — 4 GB whatever the AVD asks for, on this machine — and two
# agents each booting one is what takes a 16 GB desktop down. Waydroid is
# Android in an LXC container on the host kernel: it uses what Android uses and
# nothing more, and it runs without a window, which is all an agent needs.
#
# One session serves every worktree. Each agent reverses its own Metro port, but
# there is one com.lustre.clinic on the device: whoever installed or reloaded
# last is what the screen shows. Screenshot straight after your own reload.
#
# Setup, once, as root:
#   pacman -S waydroid && waydroid init && systemctl enable --now waydroid-container
set -euo pipefail

METRO_PORT="${METRO_PORT:-8081}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-120}"

# The port the server actually binds, read from the same .env it reads — see
# the note in `emulator.sh` on why a wrong guess here is invisible.
env_file="$(dirname "$0")/../../../.env"
env_port=$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$env_file" 2>/dev/null | tail -1)
API_PORT="${API_PORT:-${env_port:-3000}}"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

mode="run"
shot=""
while [ $# -gt 0 ]; do
    case "$1" in
        --build) mode="build" ;;
        --release) mode="release" ;;
        --start) mode="start" ;;
        --stop) mode="stop" ;;
        --shot)
            mode="shot"
            shot="${2:-waydroid.png}"
            if [ $# -gt 1 ]; then shift; fi
            ;;
        *) echo "unknown option: $1 (expected --build, --release, --start, --shot, --stop, or nothing)" >&2; exit 2 ;;
    esac
    shift
done

if ! command -v waydroid >/dev/null 2>&1; then
    echo "waydroid is not installed. Once, as root:" >&2
    echo "  pacman -S waydroid && waydroid init && systemctl enable --now waydroid-container" >&2
    exit 1
fi

if [ "$mode" = "stop" ]; then
    waydroid session stop
    echo "Waydroid session stopped."
    exit 0
fi

if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found in $ANDROID_HOME/platform-tools." >&2
    exit 1
fi

status_field() { waydroid status 2>/dev/null | awk -F':[[:space:]]*' -v k="$1" '$1 == k {print $2; exit}'; }

# Asked of systemd, not `waydroid status`: that prints no Container line at all
# while the session is stopped, which is exactly when this check runs.
if ! systemctl is-active --quiet waydroid-container; then
    echo "The Waydroid container is not running. As root:" >&2
    echo "  systemctl enable --now waydroid-container" >&2
    exit 1
fi

if [ "$(status_field Session)" != "RUNNING" ]; then
    echo "Starting the Waydroid session…"
    # Detached, and its log kept: the session outlives this script, so the next
    # run — or the next agent — finds Android already up.
    log="${TMPDIR:-/tmp}/lustre-waydroid.log"
    setsid nohup waydroid session start >"$log" 2>&1 </dev/null &
    disown || true
fi

adb start-server >/dev/null 2>&1 || true

# The session reports RUNNING before Android has booted, and the IP appears
# before adbd listens, so boot_completed over adb is the only test that means
# the device can take an install.
echo "Waiting for Android to boot…"
waited=0
serial=""
until [ -n "$serial" ] && [ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    if [ "$waited" -ge "$BOOT_TIMEOUT" ]; then
        # No IP means Android booted and never got a DHCP lease — a host
        # firewall dropping the bridge's traffic, not a boot failure. ufw with
        # its default DROP does exactly this, and says nothing.
        if [ -z "$serial" ]; then
            echo "Waydroid has no IP address after ${BOOT_TIMEOUT}s: its DHCP request is being dropped." >&2
            echo "With ufw, once, as root:" >&2
            echo "  ufw allow in on waydroid0 && ufw route allow in on waydroid0 && ufw route allow out on waydroid0" >&2
            exit 1
        fi
        echo "Waydroid did not finish booting in ${BOOT_TIMEOUT}s. See ${TMPDIR:-/tmp}/lustre-waydroid.log and \`waydroid log\`." >&2
        exit 1
    fi
    ip=$(status_field "IP address")
    if [ -n "$ip" ] && [ "$ip" != "UNKNOWN" ]; then
        serial="$ip:5555"
        adb connect "$serial" >/dev/null 2>&1 || true
        # Unauthorized never becomes authorized by waiting: the prompt is on a
        # screen nobody has open. Android's data directory is owned by this
        # user, so the key is written where adbd reads it and the connection
        # retried — no window, no root.
        if adb devices | awk -v s="$serial" '$1 == s && $2 == "unauthorized" {f=1} END {exit !f}'; then
            keys="$HOME/.local/share/waydroid/data/misc/adb/adb_keys"
            if [ -f "$HOME/.android/adbkey.pub" ] && ! grep -qxFf "$HOME/.android/adbkey.pub" "$keys" 2>/dev/null; then
                echo "Authorizing this machine's adb key on Waydroid…"
                cat "$HOME/.android/adbkey.pub" >>"$keys"
                chmod 640 "$keys"
                adb disconnect "$serial" >/dev/null 2>&1 || true
                continue
            fi
            echo "Waydroid refused this machine's adb key, and it is already in $keys." >&2
            echo "Try \`adb kill-server\`, or \`waydroid show-full-ui\` and accept the prompt." >&2
            exit 1
        fi
    fi
    sleep 2
    waited=$((waited + 2))
done

echo "Waydroid: $serial"

# A phone, not a desktop window: Waydroid defaults to the size of the Wayland
# output at density 180, which renders every screen at half size. The size is a
# session property and only takes on the next start; the density applies now.
if [ "$(waydroid prop get persist.waydroid.width 2>/dev/null)" != "1080" ]; then
    waydroid prop set persist.waydroid.width 1080
    waydroid prop set persist.waydroid.height 2400
    echo "Set the screen to 1080×2400; it takes effect on the next \`--stop\` and start."
fi
waydroid prop set persist.waydroid.suspend false
adb -s "$serial" shell wm density 420 >/dev/null

if [ "$mode" = "shot" ]; then
    adb -s "$serial" exec-out screencap -p >"$shot"
    echo "Wrote $shot"
    exit 0
fi

# Waydroid is x86_64, which is what gradle.properties pins; asked rather than
# assumed, the same as the other two scripts.
abi=$(adb -s "$serial" shell getprop ro.product.cpu.abi 2>/dev/null | tr -d '\r')
if [ -n "$abi" ]; then
    export ORG_GRADLE_PROJECT_reactNativeArchitectures="$abi"
fi

# adb reverse works over a TCP connection as it does over USB, so `localhost`
# on the device still means this machine.
if [ "$mode" != "release" ]; then
    adb -s "$serial" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" >/dev/null
fi
adb -s "$serial" reverse "tcp:${API_PORT}" "tcp:${API_PORT}" >/dev/null
echo "Reversed ports ${METRO_PORT} (metro) and ${API_PORT} (api) onto Waydroid."

cd "$(dirname "$0")/.."

if [ "$mode" = "run" ]; then
    if adb -s "$serial" shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx 'package:com.lustre.clinic'; then
        echo "com.lustre.clinic is already installed — starting the bundler only."
        echo "Use --build if you changed anything native."
        mode="start"
    else
        echo "com.lustre.clinic is not installed on $serial — building it."
    fi
fi

# Release as `device.sh` does it, and for its reason: `expo run:android
# --variant release` launches the dev client against Metro, not the embedded
# bundle.
if [ "$mode" = "release" ]; then
    apk="android/app/build/outputs/apk/release/app-release.apk"
    (cd android && ./gradlew assembleRelease)
    adb -s "$serial" install -r "$apk"
    adb -s "$serial" shell am start -S -n com.lustre.clinic/.MainActivity
    echo "Launched com.lustre.clinic (release, embedded bundle)."
    exit 0
fi

if [ "$mode" = "start" ]; then
    exec bunx expo start --dev-client --localhost --port "$METRO_PORT"
fi

# Expo names a network device by its `model:` field, not the adb serial — the
# same trap `device.sh` documents for a USB phone.
name=$(adb devices -l | awk -v s="$serial" '$1 == s {
    for (i = 2; i <= NF; i++) if ($i ~ /^model:/) { sub(/^model:/, "", $i); print $i; exit }
}')

args=(run:android --device "${name:-$serial}" --port "$METRO_PORT")
[ "$mode" = "build" ] && args+=(--no-build-cache)

exec bunx expo "${args[@]}"
