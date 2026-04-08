#!/usr/bin/env bash
# =============================================================================
# build-app-bundle.sh
# Generate a macOS .app bundle wrapping a shell script with a custom icon.
#
# Usage: build-app-bundle.sh <name> <script_path> <icon_icns> <output_dir>
#   name        - Bundle display name (e.g. "DevAll Launch")
#   script_path - Path to the .command script to wrap (relative to project root)
#   icon_icns   - Path to the .icns icon file
#   output_dir  - Directory where the .app bundle will be placed
# =============================================================================

set -euo pipefail

BUNDLE_NAME="${1:-}"
SCRIPT_PATH="${2:-}"
ICON_PATH="${3:-}"
OUTPUT_DIR="${4:-}"

if [ -z "$BUNDLE_NAME" ] || [ -z "$SCRIPT_PATH" ] || [ -z "$ICON_PATH" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Usage: $0 <name> <script_path> <icon_icns> <output_dir>"
    exit 1
fi

if [ "$(uname)" != "Darwin" ]; then
    echo "ERROR: This script requires macOS."
    exit 1
fi

if [ ! -f "$ICON_PATH" ]; then
    echo "ERROR: Icon file not found: $ICON_PATH"
    exit 1
fi

SCRIPT_FILENAME="$(basename "$SCRIPT_PATH")"

case "$SCRIPT_FILENAME" in
    launch-dev.command) BUNDLE_ID="com.devall.launcher.devlaunch" ;;
    stop-dev.command)   BUNDLE_ID="com.devall.launcher.devstop" ;;
    *)                  BUNDLE_ID="com.devall.launcher.$(echo "$SCRIPT_FILENAME" | sed 's/[^a-zA-Z0-9]//g')" ;;
esac

BUNDLE_DIR="${OUTPUT_DIR}/${BUNDLE_NAME}.app"
CONTENTS_DIR="${BUNDLE_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

rm -rf "$BUNDLE_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cat > "${CONTENTS_DIR}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>${BUNDLE_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${BUNDLE_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${BUNDLE_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

WRAPPER="${MACOS_DIR}/${BUNDLE_NAME}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cat > "$WRAPPER" <<WRAPPER_HEADER
#!/usr/bin/env bash
PROJECT_ROOT="${PROJECT_ROOT}"
WRAPPER_NAME="${BUNDLE_NAME}"
WRAPPER_HEADER
cat >> "$WRAPPER" <<'WRAPPER_BODY'

SCRIPT="scripts/launch-dev.command"
case "$WRAPPER_NAME" in
    "DevAll Stop") SCRIPT="scripts/stop-dev.command" ;;
esac

if [ -f "$PROJECT_ROOT/$SCRIPT" ]; then
    open -a Terminal "$PROJECT_ROOT/$SCRIPT"
else
    echo "ERROR: Script not found: $PROJECT_ROOT/$SCRIPT"
    echo "The .app bundle may have been moved. Re-run: make install-launcher"
    echo ""
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
fi
WRAPPER_BODY

chmod +x "$WRAPPER"

cp "$ICON_PATH" "${RESOURCES_DIR}/icon.icns"

echo "Created: ${BUNDLE_DIR}"
