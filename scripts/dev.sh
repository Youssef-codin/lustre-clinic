#!/usr/bin/env bash
# `bun start` — the server and the emulator together, which is what a day's work
# needs. The server goes to the background and the emulator holds the terminal,
# because the emulator is the interactive half: expo wants the keystrokes.
#
# Arguments pass through to `emulator.sh`, so `bun start --clear` is the cure
# for a bundler cache that has gone stale.
#
# The trap is the point. Ctrl-C kills expo and the server with it; without it the
# server survives detached from any tty, and the next `bun start` fails on
# EADDRINUSE with nothing on screen to say why. It kills the whole process group
# because `bun run` is a wrapper: killing it alone leaves the actual `bun
# --watch` holding the port, which is the same failure by another route.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9]\{1,\}\).*/\1/p' .env 2>/dev/null | tail -1)
PORT="${PORT:-3000}"
log="${TMPDIR:-/tmp}/lustre-server.log"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# A leftover from a previous run is the failure this script exists to prevent,
# and it is silent: the new server exits on EADDRINUSE, the port answers anyway,
# and the app talks to whatever old build is still holding it.
if port_open "$PORT"; then
    echo "Something is already listening on :$PORT — a server from an earlier run." >&2
    echo "Stop it first:  kill -9 \$(lsof -ti :$PORT)" >&2
    exit 1
fi

# Its own session: expo owns the terminal, and a background process that reads
# from a tty it does not own is stopped by SIGTTIN. The output goes to a file so
# it is still readable — interleaved with expo's it was not.
setsid bun run --cwd packages/server dev >"$log" 2>&1 </dev/null &
server=$!

tailer=""

cleanup() {
    trap - EXIT INT TERM
    [ -n "$tailer" ] && kill "$tailer" 2>/dev/null
    # `bun --watch` does not stop on SIGTERM — it has to be killed outright, or
    # it keeps the port and the next run inherits this same problem.
    kill -- "-$server" 2>/dev/null || true
    sleep 1
    kill -9 -- "-$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# A server that dies at boot — a bad migration, a port already taken — must not
# leave the emulator running against nothing. Alive is not the test: the app
# talks to a port, so the port is what gets waited on.
echo "Starting the server on :$PORT (log: $log)…"
waited=0
until port_open "$PORT"; do
    if ! kill -0 "$server" 2>/dev/null; then
        echo "The server exited on startup. Fix that first — the app has nothing to talk to." >&2
        cat "$log" >&2
        exit 1
    fi
    if [ "$waited" -ge 30 ]; then
        echo "The server never opened :$PORT after 30s. See $log." >&2
        exit 1
    fi
    sleep 1
    waited=$((waited + 1))
done
exec 3>&- 2>/dev/null || true
echo "Server up on :$PORT. Its boot log:"
sed 's/^/[server] /' "$log"
echo

# Everything the server says from here on is prefixed and follows the terminal,
# so a request that fails mid-session is visible without opening another one.
tail -n 0 -f "$log" | sed 's/^/[server] /' &
tailer=$!

bun run --cwd packages/app emu "$@"
