#!/usr/bin/env sh
# macOS uses the same Docker commands as Linux.
exec "$(dirname "$0")/stop-linux.sh" "$@"
