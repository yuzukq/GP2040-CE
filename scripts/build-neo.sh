#!/bin/sh
# gp2040-neo: builds the web configurator and the firmware (.uf2).
#
#   scripts/build-neo.sh [BOARD]     (default BOARD: Pico, see configs/)
#
# Dependencies are kept in .deps/ (git-ignored):
#   .deps/pico-sdk        pico-sdk 2.3.1 (same version as upstream CI)
#   .deps/arm-toolchain   Arm GNU Toolchain (arm-none-eabi)
# They are downloaded on the first run.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOARD="${1:-Pico}"
DEPS="$ROOT/.deps"
TOOLCHAIN_URL="https://developer.arm.com/-/media/Files/downloads/gnu/15.2.rel1/binrel/arm-gnu-toolchain-15.2.rel1-x86_64-arm-none-eabi.tar.xz"

mkdir -p "$DEPS"
if [ ! -d "$DEPS/pico-sdk" ]; then
    git clone --depth 1 -b 2.3.1 https://github.com/raspberrypi/pico-sdk.git "$DEPS/pico-sdk"
    git -C "$DEPS/pico-sdk" submodule update --init --depth 1
fi
if [ ! -x "$DEPS/arm-toolchain/bin/arm-none-eabi-gcc" ]; then
    mkdir -p "$DEPS/arm-toolchain"
    curl -fL "$TOOLCHAIN_URL" | tar -xJ -C "$DEPS/arm-toolchain" --strip-components=1
fi
git -C "$ROOT" submodule update --init --depth 1

echo "== unit tests"
"$ROOT/tests/mod_shortcut/run.sh"
node --test "$ROOT/tests/mod_shortcut/*.test.ts"

echo "== web configurator"
cd "$ROOT/www"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run build

echo "== firmware ($BOARD)"
cd "$ROOT"
export PATH="$DEPS/arm-toolchain/bin:$PATH"
export PICO_SDK_PATH="$DEPS/pico-sdk"
export GP2040_BOARDCONFIG="$BOARD"
export SKIP_WEBBUILD=TRUE   # built above
cmake -B "build-$BOARD" -DCMAKE_BUILD_TYPE=Release
cmake --build "build-$BOARD" --parallel "$(nproc)"
ls -1 "build-$BOARD"/*.uf2
