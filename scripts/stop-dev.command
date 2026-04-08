#!/usr/bin/env bash
# =============================================================================
# stop-dev.command
# Double-click this file in Finder to stop the Multi-Agent Simulation servers.
# =============================================================================

set -euo pipefail

# -- Logo display -------------------------------------------------------------
print_logo() {
    local subtitle="${1:-}"
    local C='\033[36m'    # Cyan
    local B='\033[1;34m'  # Bold blue
    local W='\033[1;37m'  # Bold white
    local D='\033[2;37m'  # Dim white
    local R='\033[0m'     # Reset

    echo ""
    echo -e "${B}  __  __       _ _   _        _                    _${R}"
    echo -e "${B} |  \/  |_   _| | |_(_)      / \   __ _  ___ _ __ | |_${R}"
    echo -e "${C} | |\/| | | | | | __| |___  / _ \ / _\` |/ _ \ '_ \| __|${R}"
    echo -e "${C} | |  | | |_| | | |_| |___ / ___ \ (_| |  __/ | | | |_${R}"
    echo -e "${B} |_|  |_|\__,_|_|\__|_|   /_/   \_\__, |\___|_| |_|\__|${R}"
    echo -e "${B}                                   |___/                ${R}"
    if [ -n "$subtitle" ]; then
        echo -e "${D}  ----------------------------------------${R}"
        echo -e "${W}    $subtitle${R}"
    fi
    echo ""
}

print_logo "Stop Servers"

STOPPED_SOMETHING=false

# -- Stop backend (port 6400) ------------------------------------------------
echo "Checking backend server (port 6400)..."
PIDS_6400=$(lsof -ti :6400 2>/dev/null || true)
if [ -n "$PIDS_6400" ]; then
    echo "$PIDS_6400" | xargs kill -9 2>/dev/null || true
    echo "  Backend server stopped."
    STOPPED_SOMETHING=true
else
    echo "  No backend server running."
fi

# -- Stop frontend (port 5173) -----------------------------------------------
echo "Checking frontend server (port 5173)..."
PIDS_5173=$(lsof -ti :5173 2>/dev/null || true)
if [ -n "$PIDS_5173" ]; then
    echo "$PIDS_5173" | xargs kill -9 2>/dev/null || true
    echo "  Frontend server stopped."
    STOPPED_SOMETHING=true
else
    echo "  No frontend server running."
fi

# -- Summary ------------------------------------------------------------------
echo ""
if [ "$STOPPED_SOMETHING" = true ]; then
    echo "All servers have been stopped."
else
    echo "No servers were running."
fi
echo ""
read -n 1 -s -r -p "Press any key to close..."
