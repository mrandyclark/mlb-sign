#!/usr/bin/env bash
#
# deploy.sh — Deploy mlb-sign to the Raspberry Pi
#
# Usage:
#   ./scripts/deploy.sh [user@host]
#
# Default target: pi@mlb-sign.local
#
# What this does:
#   1. Ensures Node.js is installed on the Pi
#   2. Clones or pulls the repo
#   3. Installs dependencies (rpi-led-matrix compiles natively on the Pi)
#   4. Builds the TypeScript
#   5. Optionally runs a quick test
#
set -euo pipefail

TARGET="${1:-mrandyclark@mlb-sign.local}"
REMOTE_USER="${TARGET%%@*}"
REMOTE_DIR="/home/${REMOTE_USER}/mlb-sign"
REPO_URL="https://github.com/mrandyclark/mlb-sign.git"

echo "==> Deploying mlb-sign to ${TARGET}"
echo ""

# ---------------------------------------------------------------------------
# Helper: run a command on the Pi via SSH
# ---------------------------------------------------------------------------
remote() {
  ssh -o ConnectTimeout=10 "${TARGET}" "$@"
}

# ---------------------------------------------------------------------------
# Step 1: Install Node.js if missing
# ---------------------------------------------------------------------------
NODE_VERSION="v20.17.0"
NODE_DISTRO="linux-armv7l"
NODE_TARBALL="node-${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}"

echo "--- Step 1: Checking Node.js on Pi ---"
if remote "command -v node >/dev/null 2>&1"; then
  INSTALLED_VERSION=$(remote "node --version")
  echo "Node.js already installed: ${INSTALLED_VERSION}"
else
  echo "Installing Node.js ${NODE_VERSION} (armv7l) from nodejs.org..."
  remote "curl -fsSL ${NODE_URL} -o /tmp/${NODE_TARBALL} \
    && sudo tar -xJf /tmp/${NODE_TARBALL} -C /usr/local --strip-components=1 \
    && rm /tmp/${NODE_TARBALL}"
  echo "Node.js installed: $(remote 'node --version')"
fi

# ---------------------------------------------------------------------------
# Step 2: Install build tools (needed for native addons like rpi-led-matrix)
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 2: Ensuring build tools ---"
remote "sudo apt-get install -y --no-install-recommends build-essential git python3 2>/dev/null || true"

# ---------------------------------------------------------------------------
# Step 3: Clone or pull the repo
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 3: Syncing repository ---"
if remote "test -d ${REMOTE_DIR}/.git"; then
  echo "Repo exists, pulling latest..."
  remote "cd ${REMOTE_DIR} && git pull --ff-only"
else
  echo "Cloning repo..."
  remote "git clone ${REPO_URL} ${REMOTE_DIR}"
fi

# ---------------------------------------------------------------------------
# Step 4: Install dependencies
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 4: Installing dependencies ---"
remote "cd ${REMOTE_DIR} && npm install"

# ---------------------------------------------------------------------------
# Step 5: Build TypeScript
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 5: Building ---"
remote "cd ${REMOTE_DIR} && npm run build"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploy complete!"
echo ""
echo "To run the sign manually:"
echo "  ssh ${TARGET}"
echo "  cd ${REMOTE_DIR}"
echo "  sudo node dist/index.js"
echo ""
echo "Note: sudo is required for GPIO access on the LED matrix."
echo ""
echo "To install as a systemd service (auto-start on boot):"
echo "  ssh ${TARGET}"
echo "  sudo cp ${REMOTE_DIR}/scripts/mlb-sign.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable mlb-sign"
echo "  sudo systemctl start mlb-sign"
