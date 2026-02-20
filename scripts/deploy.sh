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

FORCE_REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE_REBUILD=true ;;
  esac
done

# First non-flag argument is the target
TARGET="${1:-mrandyclark@mlb-sign.local}"
if [ "$TARGET" = "--force" ]; then
  TARGET="${2:-mrandyclark@mlb-sign.local}"
fi
REMOTE_USER="${TARGET%%@*}"
REMOTE_DIR="/home/${REMOTE_USER}/mlb-sign"
REPO_URL="https://github.com/mrandyclark/mlb-sign.git"

# ---------------------------------------------------------------------------
# SSH multiplexing — reuse a single connection to avoid repeated passwords
# ---------------------------------------------------------------------------
SSH_CONTROL="/tmp/mlb-sign-deploy-ssh-$$"

cleanup() {
  ssh -o ControlPath="${SSH_CONTROL}" -O exit "${TARGET}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Deploying mlb-sign to ${TARGET}"
echo ""
echo "Opening SSH connection (you'll enter your password once)..."
ssh -o ConnectTimeout=10 -o ControlMaster=yes -o ControlPath="${SSH_CONTROL}" -o ControlPersist=300 -fN "${TARGET}"
echo "Connected."
echo ""

# ---------------------------------------------------------------------------
# Helper: run a command on the Pi via the shared SSH connection
# ---------------------------------------------------------------------------
remote() {
  ssh -o ControlPath="${SSH_CONTROL}" "${TARGET}" "$@"
}

# ---------------------------------------------------------------------------
# Step 1: Install Node.js if missing or broken
# ---------------------------------------------------------------------------
NODE_VERSION="v20.17.0"

echo "--- Step 1: Checking Node.js on Pi ---"

# Detect architecture
PI_ARCH=$(remote "uname -m")
echo "Pi architecture: ${PI_ARCH}"

if [ "${PI_ARCH}" = "armv6l" ]; then
  NODE_DISTRO="linux-armv6l"
  NODE_URL="https://unofficial-builds.nodejs.org/download/release/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
elif [ "${PI_ARCH}" = "aarch64" ]; then
  NODE_DISTRO="linux-arm64"
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
else
  NODE_DISTRO="linux-armv7l"
  NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_DISTRO}.tar.xz"
fi

NODE_TARBALL="node-${NODE_VERSION}-${NODE_DISTRO}.tar.xz"

# Check if node works (not just exists — it might be the wrong arch)
if remote "node --version >/dev/null 2>&1"; then
  INSTALLED_VERSION=$(remote "node --version")
  echo "Node.js already installed: ${INSTALLED_VERSION}"
else
  echo "Installing Node.js ${NODE_VERSION} (${NODE_DISTRO})..."
  echo "  URL: ${NODE_URL}"
  # Remove any broken previous install first
  remote "sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx"
  remote "curl -fsSL '${NODE_URL}' -o /tmp/${NODE_TARBALL} \
    && sudo tar -xJf /tmp/${NODE_TARBALL} -C /usr/local --strip-components=1 \
    && rm /tmp/${NODE_TARBALL}"
  INSTALLED_VERSION=$(remote "node --version")
  echo "Node.js installed: ${INSTALLED_VERSION}"
fi

# Install pnpm if missing
echo ""
if remote "command -v pnpm >/dev/null 2>&1"; then
  echo "pnpm already installed: $(remote 'pnpm --version')"
else
  echo "Installing pnpm..."
  remote "sudo npm install -g pnpm"
  echo "pnpm installed: $(remote 'pnpm --version')"
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
remote "cd ${REMOTE_DIR} && pnpm install"

# ---------------------------------------------------------------------------
# Step 5: Compile rpi-led-matrix native addon (skip if already built)
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 5: Checking rpi-led-matrix native addon ---"
RPI_LED_DIR="node_modules/.pnpm/rpi-led-matrix@1.15.0/node_modules/rpi-led-matrix"
ADDON_PATH="${RPI_LED_DIR}/build/Release/rpi-led-matrix.node"
if [ "$FORCE_REBUILD" = false ] && remote "test -f ${REMOTE_DIR}/${ADDON_PATH}"; then
  echo "Native addon already compiled — skipping. (Use --force to recompile)"
elif remote "test -f ${REMOTE_DIR}/${RPI_LED_DIR}/binding.gyp"; then
  echo "Compiling native addon (this takes a few minutes)..."
  remote "cd ${REMOTE_DIR} && sudo npx node-gyp rebuild --directory=${RPI_LED_DIR}"
  echo "Native addon compiled."
else
  echo "rpi-led-matrix not found — skipping native compile (dev machine?)"
fi

# ---------------------------------------------------------------------------
# Step 6: Build TypeScript
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 6: Building ---"
remote "cd ${REMOTE_DIR} && pnpm run build"

# ---------------------------------------------------------------------------
# Step 7: Install and start systemd service
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 7: Installing systemd service ---"
remote "sudo cp ${REMOTE_DIR}/scripts/mlb-sign.service /etc/systemd/system/"
remote "sudo systemctl daemon-reload"
remote "sudo systemctl enable mlb-sign"

if remote "sudo systemctl is-active mlb-sign >/dev/null 2>&1"; then
  echo "Service already running — restarting..."
  remote "sudo systemctl restart mlb-sign"
else
  echo "Starting service..."
  remote "sudo systemctl start mlb-sign"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploy complete! Sign is running."
echo ""
echo "Useful commands:"
echo "  ssh ${TARGET}"
echo "  sudo systemctl status mlb-sign      # Check status"
echo "  sudo journalctl -u mlb-sign -f      # Live logs"
echo "  sudo systemctl restart mlb-sign     # Restart"
