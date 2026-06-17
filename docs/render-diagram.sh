#!/usr/bin/env bash
# Render the Truss architecture diagram to a PNG from docs/architecture.drawio.
# Truss brand palette (deep wine #9f1239 on cream #faf9f6) is baked into the source.
# Usage: ./render-diagram.sh   (or `make diagram` from the repo root). Commit the PNG.
set -euo pipefail
cd "$(dirname "$0")"
DRAWIO="${DRAWIO_BIN:-/Applications/draw.io.app/Contents/MacOS/draw.io}"
SCALE="${SCALE:-2}"
[ -x "$DRAWIO" ] || { echo "draw.io CLI not found at $DRAWIO (brew install --cask drawio)"; exit 1; }
"$DRAWIO" -x -f png -s "$SCALE" -b 0 --no-sandbox -o architecture.png architecture.drawio 2>/dev/null
echo "done: docs/architecture.png"
