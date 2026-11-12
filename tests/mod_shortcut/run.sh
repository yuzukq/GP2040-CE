#!/bin/sh
# Builds and runs the host unit tests for the Mod Shortcut engine.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${TMPDIR:-/tmp}/gp2040neo-mod-shortcut-test"
c++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined -I"$ROOT/headers" \
    "$ROOT/tests/mod_shortcut/test_engine.cpp" -o "$OUT"
"$OUT"
