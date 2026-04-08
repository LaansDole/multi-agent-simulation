#!/usr/bin/env bash
# =============================================================================
# launch-dev.command
# Double-click this file in Finder to start the Multi-Agent Simulation platform.
# It launches the backend (port 6400), frontend (port 5173), and opens your browser.
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

# -- Resolve project root (works for both direct execution and symlinks) ------
SCRIPT_PATH="${BASH_SOURCE[0]}"
# Resolve symlinks to find the real script location
while [ -L "$SCRIPT_PATH" ]; do
    SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_PATH")" && pwd)"
    SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
    # Handle relative symlink targets
    [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT_PATH")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# -- PATH setup for Finder launches (Terminal inherits shell profile) ---------
# When launched via Finder double-click, PATH may not include Homebrew or
# user-installed tools. Source common profile files to pick up uv, node, etc.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
if [ -f "$HOME/.zprofile" ]; then
    source "$HOME/.zprofile" 2>/dev/null || true
fi
if [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc" 2>/dev/null || true
fi

# -- Prerequisite checks ------------------------------------------------------
print_logo "Dev Launcher"
echo "Project: $PROJECT_ROOT"
echo ""

if ! command -v uv &>/dev/null; then
    echo "ERROR: 'uv' is not installed or not in your PATH."
    echo ""
    echo "Install it with:"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo ""
    echo "Then re-run this launcher."
    echo ""
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "ERROR: 'node' (Node.js) is not installed or not in your PATH."
    echo ""
    echo "Install it with:"
    echo "  brew install node"
    echo "  or visit https://nodejs.org/"
    echo ""
    echo "Then re-run this launcher."
    echo ""
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
fi

echo "Prerequisites OK (uv: $(uv --version 2>/dev/null || echo 'unknown'), node: $(node --version 2>/dev/null || echo 'unknown'))"
echo ""

# -- Stop any already-running servers ----------------------------------------
echo "Checking for existing servers..."
PIDS_6400=$(lsof -ti :6400 2>/dev/null || true)
if [ -n "$PIDS_6400" ]; then
    echo "$PIDS_6400" | xargs kill -9 2>/dev/null || true
    echo "  Stopped existing process on port 6400"
fi
PIDS_5173=$(lsof -ti :5173 2>/dev/null || true)
if [ -n "$PIDS_5173" ]; then
    echo "$PIDS_5173" | xargs kill -9 2>/dev/null || true
    echo "  Stopped existing process on port 5173"
fi

# -- Start backend server in background --------------------------------------
echo ""
echo "Starting backend server on port 6400..."
cd "$PROJECT_ROOT"
uv run python server_main.py --port 6400 &
BACKEND_PID=$!

# -- Wait for backend to become healthy ---------------------------------------
echo "Waiting for backend to become ready..."
READY=false
for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:6400/api/workflows" >/dev/null 2>&1; then
        READY=true
        break
    fi
    sleep 1
done

if [ "$READY" = false ]; then
    echo ""
    echo "ERROR: Backend did not become reachable within 30 seconds."
    echo "Check the output above for errors."
    echo ""
    kill $BACKEND_PID 2>/dev/null || true
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
fi

echo "Backend is ready!"
echo ""

# -- Open browser -------------------------------------------------------------
echo "Opening browser at http://localhost:5173 ..."
open "http://localhost:5173" 2>/dev/null || true

# -- Start frontend dev server (foreground) -----------------------------------
echo "Starting frontend dev server on port 5173..."
echo "--------------------------------------------"
echo "  Close this window to stop both servers."
echo "--------------------------------------------"
echo ""
cd "$PROJECT_ROOT/frontend"
npx cross-env VITE_API_BASE_URL=http://localhost:6400 npm run dev
