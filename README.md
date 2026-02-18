# MLB LED Sign

A Raspberry Pi–powered RGB LED matrix sign that displays MLB standings, driven by a server-side API. The sign is a dumb renderer — the API controls what slides are shown, in what order, and how often to refresh.

![Rendering concept](images/01-rendering.png)

---

## Hardware

| Component | Price | Link |
|-----------|-------|------|
| Raspberry Pi Zero 2W with Header | $19.80 | [Adafruit](https://www.adafruit.com/product/6008) |
| Adafruit RGB Matrix Bonnet for Raspberry Pi | $14.95 | [Adafruit](https://www.adafruit.com/product/3211) |
| 64×32 RGB LED Matrix (4mm pitch, HUB75) | $39.95 | [Adafruit](https://www.adafruit.com/product/2278) |
| USB-C → 5.5mm Barrel Jack Cable | $7.95 | [Adafruit](https://www.adafruit.com/product/5968) |
| Mini Magnet Feet for RGB LED Matrix | $2.50 | [Adafruit](https://www.adafruit.com/product/4631) |
| USB-C PD Wall Charger (5V/4A+) | ~$12 | [Amazon](https://www.amazon.com/dp/B0DBPRTG9H) |
| MicroSD Card (32GB) | ~$8 | [Amazon](https://www.amazon.com/dp/B08J4HJ98L) |

### Wiring

1. Seat the RGB Matrix Bonnet onto the Pi GPIO header.
2. Connect the HUB75 ribbon cable from the bonnet to the matrix port labeled **"IN"** (not "OUT").
3. Power via the bonnet's barrel jack using the USB-C PD charger.

> **Warning:** The Pi must **NOT** be powered via micro-USB when the matrix is attached. Do not connect or disconnect the HUB75 ribbon cable while powered.

### Hardware Config

| Setting | Value | Notes |
|---------|-------|-------|
| `hardwareMapping` | `AdafruitHat` | Do **not** use `AdafruitHatPwm` — it doesn't work with this bonnet |
| `gpioSlowdown` | `5` | Max value; controls GPIO timing for LED refresh |
| `brightness` | `35` | Keep low to reduce power draw |
| Sound module | Blacklisted | `snd_bcm2835` conflicts with GPIO timing — handled by `setup-pi.sh` |

---

## Architecture

- **TypeScript / Node.js** (CommonJS) with `rpi-led-matrix` native C++ binding
- **Server-driven slides**: API returns ordered slides with a `slideType` discriminator
- **Sign identifies itself** via `X-Sign-Id` header (loaded from `~/.sign-id` or hostname fallback)
- **Remote config**: brightness, rotation interval, and schedule are pushed from the API
- **Auto-update**: pulls latest code from GitHub on every service restart

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main loop: fetch slides, rotate display, apply remote config |
| `src/matrix.ts` | Hardware abstraction: loads `rpi-led-matrix` or falls back to console stub |
| `src/renderer.ts` | FrameBuffer + 3×5 pixel font, dispatches on `slideType` |
| `src/api.ts` | API client: `getSlides()`, `fetchSignConfig()`, with caching |
| `src/config.ts` | Config loader with env overrides, sign ID resolution |
| `src/types.ts` | Slide types, SignConfig, API response types |
| `config.json` | Runtime config (API key, brightness, gpioSlowdown, etc.) |

### Sign ID Resolution (priority order)

1. `MLB_SIGN_ID` environment variable
2. `~/.sign-id` file (service runs as root, so this is `/root/.sign-id`)
3. Falls back to `os.hostname()`

---

## Setup — New Sign

Setting up a new sign from a blank SD card takes two scripts.

### 1. Flash the SD Card

Use **Raspberry Pi Imager**:

| Setting | Value |
|---------|-------|
| OS | Raspberry Pi OS Lite (64-bit) |
| Hostname | Your choice (e.g. `dad-sign`, `mac-sign`) |
| Username | `mrandyclark` |
| SSH | Enabled (password authentication) |
| Wi-Fi | Configure SSID and password |

Insert the card, power on, wait ~60 seconds.

### 2. First-Time Setup

From your Mac:

```bash
./scripts/setup-pi.sh mrandyclark@<hostname>.local <sign-id>
```

This handles:
- System updates (`apt update && upgrade`)
- Build tools (`build-essential`, `git`, `python3`)
- Blacklists the sound module (GPIO conflict)
- Sets the sign ID (`~/.sign-id` and `/root/.sign-id`)
- Reboots the Pi

### 3. Deploy

After reboot (~30 seconds), from your Mac:

```bash
./scripts/deploy.sh mrandyclark@<hostname>.local
```

This handles:
- Node.js v20.17.0 (auto-detects armv6l, armv7l, aarch64)
- pnpm
- Clone/pull the repo
- Install dependencies
- Compile `rpi-led-matrix` native addon
- Build TypeScript
- Install and start the systemd service

Done. The sign auto-starts on boot and auto-updates from GitHub.

---

## Updating a Sign

After pushing code changes to GitHub:

```bash
./scripts/deploy.sh mrandyclark@<hostname>.local
```

This pulls latest, rebuilds, recompiles the native addon if needed, and restarts the service.

---

## Replacing a Pi

If swapping hardware (e.g. upgrading from Pi Zero W to Pi Zero 2 W) but keeping the same sign:

1. Flash a new SD card
2. Run `setup-pi.sh` with the **same sign ID**
3. Run `deploy.sh`

---

## Configuration

Runtime config via `config.json`:

| Setting | Default | Notes |
|---------|---------|-------|
| `api.baseUrl` | `https://www.spreadsontoast.com/api/external` | Must use `www.` (non-www redirects) |
| `api.timeoutSeconds` | `60` | Pi Zero W needs ~32s for HTTPS |
| `display.brightness` | `35` | 0–100 |
| `display.gpioSlowdown` | `5` | Max value is 5 |
| `display.width` | `64` | Matrix columns |
| `display.height` | `32` | Matrix rows |

Changes to `config.json` don't require a rebuild — just restart the service.

Remote config (brightness, rotation interval, schedule) is applied automatically from the API.

---

## Useful Commands

```bash
sudo systemctl status mlb-sign      # Check if running
sudo journalctl -u mlb-sign -f      # Live logs
sudo systemctl restart mlb-sign     # Restart
sudo systemctl stop mlb-sign        # Stop

# Manual test (stop service first)
cd ~/mlb-sign && sudo node dist/index.js
```

---

## Troubleshooting

- **"Illegal instruction"** — Wrong Node.js architecture. The deploy script handles this automatically.
- **Sound module conflict** — Run `setup-pi.sh` or manually blacklist: `echo "blacklist snd_bcm2835" | sudo tee /etc/modprobe.d/blacklist-snd.conf`
- **API timeout** — Ensure `api.timeoutSeconds` is at least `60`. URL must use `https://www.`
- **LED panel blank but "Hardware LED matrix: YES"** — Check ribbon cable orientation and bonnet seating.
- **Console stub mode** — `rpi-led-matrix` native addon didn't compile. Re-run `deploy.sh`.
- **Flickering** — `gpioSlowdown: 5` is maxed. Pi Zero 2 W flickers much less than original Pi Zero W.

---

## Current Signs

| Sign | Hostname | Sign ID |
|------|----------|---------|
| Dad's | `dad-sign.local` | `A556DBBC-44B4-49C3-BE2F-B73702509293` |
| Andy's | `mac-sign.local` | `26AF2B31-9B2F-4503-AE34-0441DFBBF2D1` |
