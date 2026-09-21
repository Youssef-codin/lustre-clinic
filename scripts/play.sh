#!/usr/bin/env bash
# `bun play [tag ...] [ansible flags]` — the clinic play from anywhere in the
# repo. Tags are bare words (`bun play app releases`); anything starting with
# `-` goes to ansible-playbook as is (`bun play releases --check`). No tags
# runs the whole play.
#
# The sudo password is asked for each run (`-K`). To stop typing it, put it in a
# file outside the repo with mode 0600 and point LUSTRE_SUDO_PASSWORD_FILE at
# it; the play then reads it from there and never sees it on the command line.
set -euo pipefail

cd "$(dirname "$0")/../infra/ansible"

tags=()
flags=()
for arg in "$@"; do
    case "$arg" in
        -*) flags+=("$arg") ;;
        *) tags+=("$arg") ;;
    esac
done

if [[ -n "${LUSTRE_SUDO_PASSWORD_FILE:-}" ]]; then
    flags+=(--become-password-file "$LUSTRE_SUDO_PASSWORD_FILE")
else
    flags+=(-K)
fi

if ((${#tags[@]})); then
    flags+=(--tags "$(IFS=,; echo "${tags[*]}")")
fi

# `bun run` hands the script non-blocking stdio, which ansible refuses outright
# ("Ansible requires blocking IO on stdin/stdout/stderr"). Put it back.
python3 -c 'import os, fcntl
for fd in (0, 1, 2):
    fcntl.fcntl(fd, fcntl.F_SETFL, fcntl.fcntl(fd, fcntl.F_GETFL) & ~os.O_NONBLOCK)'

exec ansible-playbook site.yml "${flags[@]}"
