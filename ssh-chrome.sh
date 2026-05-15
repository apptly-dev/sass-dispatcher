#!/bin/sh
#
# ssh-chrome.sh — pair-driving Chrome for chrome-devtools-mcp.
#
# Opens a visible browser on the remote host's display and
# tunnels its DevTools endpoint back through SSH. The human
# drives the browser; Claude observes via chrome-devtools-mcp
# connected at http://127.0.0.1:$((PORT+100)).
#
# Usage:   ./ssh-chrome.sh [PORT] [HOST] [BROWSER]
# Stop:    Ctrl-C in this terminal.
#
# Defaults:
#   PORT     9237  (host side — chrome's --remote-debugging-port)
#   HOST     172.17.0.1  (Docker bridge gateway)
#   BROWSER  google-chrome
#
# The container-side listener uses PORT+100 (e.g. 9337 when
# PORT=9237). Keeping the local port distinct from the remote
# one avoids collisions with VS Code Remote's port auto-forward.
# `.mcp.json` must point at PORT+100.
#
# Chrome's debug server binds IPv4 loopback (`127.0.0.1`) when
# nothing else holds the port. `--remote-debugging-address` has
# been removed upstream for security, so chrome's bind family is
# whatever it picks on its own. The asymmetric port choice keeps
# the host port clear, so chrome reliably lands on v4.
#
# Requires SSH access to $HOST with $BROWSER installed and a
# usable DISPLAY=:0.

set -eu

PORT=${1:-9237}
HOST=${2:-172.17.0.1}
BROWSER=${3:-google-chrome}

LOCAL_PORT=$((PORT + 100))

exec ssh -tt -L "$LOCAL_PORT:127.0.0.1:$PORT" "$HOST" \
  "exec env DISPLAY=:0 '$BROWSER' \
    --remote-debugging-port=$PORT \
    --user-data-dir=\$XDG_RUNTIME_DIR/chrome-debug-$PORT \
    --no-first-run \
    --no-default-browser-check"
