# Setup Guide – MLB LED Sign

Complete setup instructions from a blank SD card to a running LED sign. This documents the exact steps used so the build can be reproduced.

---

## 1. Flash the SD Card

Use **Raspberry Pi Imager** on macOS (or Windows/Linux).

| Setting | Value |
|---------|-------|
| OS | **Raspberry Pi OS (64-bit)** recommended for Pi Zero 2 W; 32-bit for Pi Zero W |
| Hostname | `mlb-sign` |
| SSH | Enabled (password authentication) |
| Username | `mrandyclark` (or your preferred username) |
| Wi-Fi | Configure SSID and password during imaging |
| Timezone | Set to your local timezone |

> **Note:** The Pi Zero W is armv6l and only supports 32-bit OS. The Pi Zero 2 W supports both 32-bit and 64-bit.

---

## 2. First Boot

1. Insert the microSD card into the Pi.
2. Power the Pi via the bonnet's barrel jack (see [HARDWARE.md](HARDWARE.md) for wiring).
3. Wait ~60 seconds for first boot.
4. SSH in from your local machine:

```bash
ssh mrandyclark@mlb-sign.local
```

---

## 3. System Updates

```bash
sudo apt update
sudo apt upgrade -y
```

---

## 4. Install Build Tools

Required for compiling the `rpi-led-matrix` native addon:

```bash
sudo apt install -y build-essential git python3
```

---

## 5. Disable the Sound Module

The Pi's built-in sound driver conflicts with the LED matrix GPIO timing. It **must** be disabled:

```bash
sudo tee /etc/modprobe.d/blacklist-snd.conf <<< "blacklist snd_bcm2835"
sudo reboot
```

Wait ~60 seconds, then SSH back in.

---

## 6. Deploy with the Script

The easiest way to set everything up is the deploy script, run from your **local machine** (not the Pi):

```bash
./scripts/deploy.sh mrandyclark@mlb-sign.local
```

This script handles:
- Installing Node.js v20.17.0 (auto-detects armv6l, armv7l, and aarch64)
- Installing pnpm
- Cloning the repo to `~/mlb-sign`
- Installing dependencies
- Compiling the `rpi-led-matrix` native addon
- Building TypeScript
- Installing and starting the systemd service

### Manual Deploy (alternative)

If you prefer to set up manually on the Pi:

```bash
# Install Node.js (armv6l — unofficial build required for Pi Zero W)
curl -fsSL https://unofficial-builds.nodejs.org/download/release/v20.17.0/node-v20.17.0-linux-armv6l.tar.xz -o /tmp/node.tar.xz
sudo tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
rm /tmp/node.tar.xz

# Verify
node --version   # v20.17.0
npm --version

# Install pnpm
sudo npm install -g pnpm

# Clone the repo
git clone https://github.com/mrandyclark/mlb-sign.git ~/mlb-sign
cd ~/mlb-sign

# Install dependencies
pnpm install

# Build the native LED matrix addon
sudo npx node-gyp rebuild --directory=node_modules/.pnpm/rpi-led-matrix@1.15.0/node_modules/rpi-led-matrix

# Build TypeScript
pnpm run build
```

> **Important:** The `rpi-led-matrix` native addon must be compiled on the Pi. This takes several minutes on the Pi Zero. If `pnpm install` shows a warning about ignored build scripts, run `pnpm approve-builds` or use the `node-gyp rebuild` command above.

---

## 7. Verify

The deploy script automatically installs and starts the systemd service. Check it's running:

```bash
ssh mrandyclark@mlb-sign.local
sudo systemctl status mlb-sign
sudo journalctl -u mlb-sign -f      # Live logs
```

You should see "LOADING" on the LED panel, then standings after a few seconds.

To test manually instead (e.g. for debugging):

```bash
sudo systemctl stop mlb-sign
cd ~/mlb-sign
sudo node dist/index.js
```

`sudo` is required for GPIO access. Press `Ctrl+C` to stop.

### Useful service commands

```bash
sudo systemctl status mlb-sign      # Check if running
sudo journalctl -u mlb-sign -f      # Live logs
sudo systemctl restart mlb-sign     # Restart after config changes
sudo systemctl stop mlb-sign        # Stop the sign
```

---

## 8. Updating the Sign

After pushing code changes to GitHub, re-run the deploy script from your Mac:

```bash
./scripts/deploy.sh mrandyclark@mlb-sign.local
```

This pulls the latest code, rebuilds, and restarts the service automatically.

The service also runs `auto-update.sh` on every restart, which pulls from GitHub before starting.

---

## Configuration

The sign is configured via `config.json` in the project root:

| Setting | Default | Notes |
|---------|---------|-------|
| `api.baseUrl` | `https://www.spreadsontoast.com/api/external` | Must use `www.` subdomain (non-www redirects) |
| `api.timeoutSeconds` | `60` | Pi Zero takes ~32s for HTTPS requests |
| `display.brightness` | `35` | 0–100, keep low to reduce flicker |
| `display.gpioSlowdown` | `5` | Max value is 5; controls GPIO timing |
| `display.rotationIntervalSeconds` | `10` | Time between division rotations |
| `divisions` | All 6 MLB divisions | Which divisions to cycle through |

Changes to `config.json` don't require a rebuild — just restart the service.

---

## Troubleshooting

### "Illegal instruction" when running `node`
Node.js was installed for the wrong architecture. The Pi Zero W is armv6l and requires the unofficial build from `unofficial-builds.nodejs.org`. Remove the broken install and reinstall:
```bash
sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx
# Then follow the Node.js install steps above
```

### Sound module conflict
If you see `snd_bcm2835: found that the Pi sound module is loaded`, the sound driver wasn't blacklisted. See Step 5.

### API timeout
The Pi Zero's WiFi + TLS is slow (~32s per request). Ensure `api.timeoutSeconds` is at least `60`. The API URL must use `https://www.` — the non-www domain returns a 307 redirect that can cause hangs.

### LED panel is blank but software says "Hardware LED matrix: YES"
Check the `hardwareMapping` in `src/matrix.ts`. Use `AdafruitHat` (not `AdafruitHatPwm`) for the Adafruit RGB Matrix Bonnet.

### Flickering
Some flickering is expected on the Pi Zero due to its single-core CPU. `gpioSlowdown: 5` is the maximum. Upgrading to a Pi Zero 2 W should reduce flickering significantly.

### Cache permission error (EACCES)
This is handled automatically — the app deletes and recreates the cache file with open permissions. If it persists, remove the old file:
```bash
sudo rm ~/mlb-sign/standings_cache.json
```

---

## New Sign Quick Setup

If you've already done this once and just need to set up a new sign (or re-flash an existing one), it's two commands after flashing.

### 1. Flash & boot

Flash **Raspberry Pi OS (64-bit) Lite** with Raspberry Pi Imager. Set hostname, username, WiFi, and enable SSH. Insert card, power on, wait ~60 seconds.

### 2. First-time setup (from your Mac)

```bash
./scripts/setup-pi.sh mrandyclark@<hostname>.local <sign-id>
```

This handles system updates, build tools, sound module blacklist, sign ID, and reboots the Pi.

### 3. Deploy (from your Mac, after reboot)

```bash
./scripts/deploy.sh mrandyclark@<hostname>.local
```

This handles Node.js, pnpm, repo, dependencies, native addon compilation, TypeScript build, and systemd service.

Done. The sign will auto-start on boot and auto-update from GitHub.

---

## Replacing a Pi (same sign)

If you're swapping the Pi (e.g. upgrading from Pi Zero W to Pi Zero 2 W) but keeping the same sign:

1. Flash a new SD card
2. Follow the **New Sign Quick Setup** above with the **same sign ID**

The deploy script handles everything — native addon compilation, service install, etc.

---

## Setup Checklist (per sign)

- [ ] SD card flashed with Raspberry Pi OS (64-bit for Pi Zero 2 W)
- [ ] SSH access verified
- [ ] `setup-pi.sh` run (updates, build tools, sound blacklist, sign ID, reboot)
- [ ] `deploy.sh` run (Node.js, pnpm, repo, deps, native addon, build, service)
- [ ] Sign displaying standings on LED matrix
