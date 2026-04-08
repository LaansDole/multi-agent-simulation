#!/usr/bin/env bash
# =============================================================================
# build-icon.sh
# Convert a source PNG into a macOS .icns icon file using sips and iconutil.
#
# Usage: build-icon.sh <source.png> <output.icns>
# =============================================================================

set -euo pipefail

SOURCE_PNG="${1:-}"
OUTPUT_ICNS="${2:-}"

if [ -z "$SOURCE_PNG" ] || [ -z "$OUTPUT_ICNS" ]; then
    echo "Usage: $0 <source.png> <output.icns>"
    exit 1
fi

if [ "$(uname)" != "Darwin" ]; then
    echo "ERROR: This script requires macOS (uses sips and iconutil)."
    exit 1
fi

if [ ! -f "$SOURCE_PNG" ]; then
    echo "ERROR: Source file not found: $SOURCE_PNG"
    exit 1
fi

ICONSET_DIR="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET_DIR"

SIPS_ARGS=(-s format png --resampleWidth)

sips "${SIPS_ARGS[@]}" 16   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_16x16.png"         >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 32   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_16x16@2x.png"      >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 32   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_32x32.png"         >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 64   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_32x32@2x.png"      >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 128  "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_128x128.png"       >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 256  "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_128x128@2x.png"    >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 256  "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_256x256.png"       >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 512  "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_256x256@2x.png"    >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 512  "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_512x512.png"       >/dev/null 2>&1
sips "${SIPS_ARGS[@]}" 1024 "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_512x512@2x.png"    >/dev/null 2>&1

OUTPUT_DIR="$(dirname "$OUTPUT_ICNS")"
mkdir -p "$OUTPUT_DIR"

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

rm -rf "$(dirname "$ICONSET_DIR")"

echo "Created: $OUTPUT_ICNS"
