#!/usr/bin/env bash
#
# setup-pi.sh — First-time setup for a new MLB Sign Pi
#
# Usage:
#   ./scripts/setup-pi.sh <user@host> <sign-id>
#
# Example:
#   ./scripts/setup-pi.sh mrandyclark@dad-sign.local A556DBBC-44B4-49C3-BE2F-B73702509293
#
# What this does:
#   1. Updates the system (apt update/upgrade)
#   2. Installs build tools (build-essential, git, python3)
#   3. Blacklists the sound module (conflicts with LED matrix GPIO)
#   4. Sets the sign ID (~/.sign-id and /root/.sign-id)
#   5. Reboots the Pi
#
# After reboot, run: ./scripts/deploy.sh <user@host>
#
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <user@host> <sign-id>"
  echo ""
  echo "Example:"
  echo "  $0 mrandyclark@dad-sign.local A556DBBC-44B4-49C3-BE2F-B73702509293"
  exit 1
fi

TARGET="$1"
SIGN_ID="$2"
REMOTE_USER="${TARGET%%@*}"

# ---------------------------------------------------------------------------
# SSH multiplexing — reuse a single connection to avoid repeated passwords
# ---------------------------------------------------------------------------
SSH_CONTROL="/tmp/mlb-sign-setup-ssh-$$"

cleanup() {
  ssh -o ControlPath="${SSH_CONTROL}" -O exit "${TARGET}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Setting up new MLB Sign Pi: ${TARGET}"
echo "    Sign ID: ${SIGN_ID}"
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
# Step 1: System updates
# ---------------------------------------------------------------------------
echo "--- Step 1: Updating system ---"
remote "sudo apt-get update && sudo apt-get upgrade -y"

# ---------------------------------------------------------------------------
# Step 2: Install build tools
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 2: Installing build tools ---"
remote "sudo apt-get install -y build-essential git python3"

# ---------------------------------------------------------------------------
# Step 3: Blacklist sound module
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 3: Blacklisting sound module ---"
if remote "test -f /etc/modprobe.d/blacklist-snd.conf"; then
  echo "Already blacklisted."
else
  remote "echo 'blacklist snd_bcm2835' | sudo tee /etc/modprobe.d/blacklist-snd.conf"
  echo "Sound module blacklisted."
fi

# ---------------------------------------------------------------------------
# Step 4: Set sign ID
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 4: Setting sign ID ---"
remote "echo '${SIGN_ID}' > /home/${REMOTE_USER}/.sign-id"
remote "sudo bash -c 'echo \"${SIGN_ID}\" > /root/.sign-id'"
echo "Sign ID set: ${SIGN_ID}"

# ---------------------------------------------------------------------------
# Step 5: Reboot
# ---------------------------------------------------------------------------
echo ""
echo "--- Step 5: Rebooting ---"
echo "The Pi will reboot now. Wait ~30 seconds, then run:"
echo ""
echo "  ./scripts/deploy.sh ${TARGET}"
echo ""
remote "sudo reboot" || true
