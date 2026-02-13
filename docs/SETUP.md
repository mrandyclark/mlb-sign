# Setup Guide – MLB LED Sign

Complete setup instructions from a blank SD card to a running LED sign. This documents the exact steps used so the build can be reproduced.

---

## 1. Flash the SD Card

Use **Raspberry Pi Imager** on macOS (or Windows/Linux).

| Setting | Value |
|---------|-------|
| OS | **Raspberry Pi OS (32-bit)** — required for Pi Zero W (armv6l) |
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
- Installing Node.js v20.17.0 (auto-detects armv6l vs armv7l architecture)
- Installing pnpm
- Cloning the repo to `~/mlb-sign`
- Installing dependencies
- Building TypeScript

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

## 7. Test the Sign

```bash
cd ~/mlb-sign
sudo node dist/index.js
```

You should see:
1. "LOADING" on the LED panel
2. After ~30 seconds (API fetch), standings appear
3. Divisions rotate every 10 seconds

`sudo` is required for GPIO access to drive the LED matrix.

Press `Ctrl+C` to stop.

---

## 8. Install as a Boot Service

To auto-start the sign on power-on:

```bash
sudo cp ~/mlb-sign/scripts/mlb-sign.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mlb-sign
sudo systemctl start mlb-sign
```

After this, the sign starts automatically whenever the Pi boots. Unplug and replug — it just works.

### Useful service commands

```bash
sudo systemctl status mlb-sign      # Check if running
sudo journalctl -u mlb-sign -f      # Live logs
sudo systemctl restart mlb-sign     # Restart after config changes
sudo systemctl stop mlb-sign        # Stop the sign
```

---

## 9. Updating the Sign

After pushing code changes to GitHub:

```bash
# Option A: Run the deploy script from your local machine
./scripts/deploy.sh mrandyclark@mlb-sign.local

# Option B: Update manually on the Pi
ssh mrandyclark@mlb-sign.local
cd ~/mlb-sign && git pull && pnpm run build
sudo systemctl restart mlb-sign
```

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

## Setup Checklist

- [x] SD card flashed with Raspberry Pi OS (32-bit)
- [x] SSH access verified
- [x] System updated
- [x] Build tools installed
- [x] Sound module blacklisted
- [x] Node.js v20.17.0 installed (armv6l)
- [x] pnpm installed
- [x] Repo cloned and built
- [x] `rpi-led-matrix` native addon compiled
- [x] Sign tested manually (`sudo node dist/index.js`)
- [x] Systemd service enabled for auto-start
