# MLB LED Sign

A Raspberry Pi–powered LED matrix sign that displays MLB standings (division rank and wins/losses), updating automatically from an API.

This repository acts as both the project codebase and a build log, so the setup can be reproduced later (including building a second unit).

![Rendering concept](images/01-rendering.png)

---

## Project Overview

The goal of this project is to build a clean, scoreboard-style LED sign with a physical, finished feel (wood enclosure planned). The initial version is a desk-scale prototype that can later scale into a larger wall or garage display.

**Key goals:**

- Display MLB standings grouped by division
- Show division rank and W–L record
- White text on black background (classic scoreboard look)
- Automatic daily updates from an API
- Optional rotation between divisions
- Optional scheduled on/off times
- Reproducible build for additional units

---

## Hardware Summary

**Core hardware for the prototype:**

- Raspberry Pi Zero 2 W
- Adafruit RGB Matrix Bonnet
- Adafruit 64×32 RGB LED Matrix (5mm pitch, HUB75)
- HUB75 ribbon cable
- USB-C PD wall charger
- USB-C → 5.5mm barrel power cable

> **Important power note:** The LED matrix is powered through the RGB Matrix Bonnet, which also powers the Raspberry Pi. The Pi must **NOT** be powered via micro-USB when the matrix is attached.

---

## Software Summary

- **Raspberry Pi OS (32-bit)** — required for Pi Zero W (armv6l)
- **Node.js v20.17.0** — unofficial armv6l build
- **TypeScript / pnpm** — compiled to CommonJS
- **`rpi-led-matrix`** — native C++ binding for the LED matrix
- Headless configuration (no monitor or keyboard)
- SSH access enabled

---

## Documentation

Detailed setup and hardware notes live in the `docs/` directory:

### [`docs/SETUP.md`](docs/SETUP.md)

- Complete setup from blank SD card to running sign
- Node.js installation, deploy script, systemd service
- Configuration reference and troubleshooting

### [`docs/HARDWARE.md`](docs/HARDWARE.md)

- Component list with purchase links
- Power architecture and wiring
- Software settings that must match hardware
- Gotchas and upgrade notes

---

## Current Status

- [x] Raspberry Pi OS installed and updated
- [x] SSH access verified
- [x] Hardware wired and tested
- [x] TypeScript codebase: API client, renderer, config, caching
- [x] LED matrix hardware integration (`rpi-led-matrix`)
- [x] First live render on the sign
- [x] Team colors from API with min brightness floor
- [x] Right-aligned records, loading indicator
- [x] Deploy script with SSH multiplexing
- [x] Systemd service file for auto-start on boot

---

## Quick Start

From your local machine:

```bash
./scripts/deploy.sh mrandyclark@mlb-sign.local
```

Then on the Pi:

```bash
# Test manually
sudo node dist/index.js

# Or install as a boot service
sudo cp scripts/mlb-sign.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mlb-sign
sudo systemctl start mlb-sign
```

See [`docs/SETUP.md`](docs/SETUP.md) for full instructions from a blank SD card.

---

## Planned Next Steps

- [ ] Upgrade to Pi Zero 2 WH (reduce flickering)
- [ ] Scheduled on/off times
- [ ] Enclosure build
- [ ] Remote config / OTA updates

---

## Notes

This project intentionally prioritizes clarity and repeatability over cleverness. All non-obvious setup steps are documented so future builds can follow the same path without re-discovering details.
