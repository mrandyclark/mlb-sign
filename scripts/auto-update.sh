#!/usr/bin/env bash
#
# auto-update.sh — Check for updates and rebuild before starting the sign
#
# Called by systemd as ExecStartPre. If there are new commits on main,
# pulls and rebuilds. If anything fails, the sign starts with the last
# known good build.
#
set -euo pipefail

SIGN_DIR="/home/mrandyclark/mlb-sign"
LOG_PREFIX="[auto-update]"

cd "${SIGN_DIR}"

echo "${LOG_PREFIX} Checking for updates..."

# Make sure we can reach GitHub (5s timeout)
if ! git fetch --quiet origin main 2>/dev/null; then
  echo "${LOG_PREFIX} Cannot reach remote — skipping update"
  exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "${LOCAL}" = "${REMOTE}" ]; then
  echo "${LOG_PREFIX} Already up to date (${LOCAL:0:7})"
  exit 0
fi

echo "${LOG_PREFIX} New commits available (${LOCAL:0:7} -> ${REMOTE:0:7})"
echo "${LOG_PREFIX} Pulling..."

if ! git pull --ff-only origin main; then
  echo "${LOG_PREFIX} Pull failed — running with current version"
  exit 0
fi

echo "${LOG_PREFIX} Building..."

if ! pnpm run build; then
  echo "${LOG_PREFIX} Build failed — running with previous build"
  exit 0
fi

echo "${LOG_PREFIX} Update complete (now at ${REMOTE:0:7})"
