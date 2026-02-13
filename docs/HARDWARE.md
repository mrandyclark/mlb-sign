# Hardware Setup – MLB LED Sign

Physical hardware configuration for the MLB LED Sign. Reference for how everything is wired and powered.

---

## Core Components

| Component | Link |
|-----------|------|
| Raspberry Pi Zero WH (with pre-soldered header) | [Adafruit](https://www.adafruit.com/product/3708) |
| Adafruit RGB Matrix Bonnet (for Raspberry Pi) | [Adafruit](https://www.adafruit.com/product/3211) |
| Adafruit 64×32 RGB LED Matrix (5mm pitch, HUB75) | [Adafruit](https://www.adafruit.com/product/2277) |
| HUB75 16-pin ribbon cable | [Amazon](https://www.amazon.com/dp/B07FZWH9S6?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1) |
| USB-C PD wall charger | [Amazon](https://www.amazon.com/dp/B0DBPRTG9H?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1) |
| USB-C → 5.5mm barrel power cable | [Adafruit](https://www.adafruit.com/product/5968) |
| MicroSD card (32GB) | [Amazon](https://www.amazon.com/dp/B08J4HJ98L?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1) |

> **Upgrade note:** The Pi Zero W (armv6l, single-core) works but has some display flickering due to limited CPU. A **Pi Zero 2 WH** ([Adafruit](https://www.adafruit.com/product/6008)) is a drop-in replacement with a quad-core CPU that should eliminate flickering.

---

## Power Architecture

- The LED matrix is powered through the RGB Matrix Bonnet.
- The RGB Matrix Bonnet also provides power to the Raspberry Pi through the GPIO header.
- **The Raspberry Pi must NOT be powered via micro-USB when the LED matrix is attached.**
- Power should be supplied using a wall-powered USB-C PD charger capable of approximately 5V at 4–5A.

---

## Wiring

1. Seat the RGB Matrix Bonnet fully onto the Raspberry Pi GPIO header.
2. Connect the HUB75 ribbon cable:
   - One end to the HUB75 connector on the Matrix Bonnet
   - The other end to the LED matrix port labeled **"IN"** (not "OUT")
3. Verify the ribbon cable orientation is correct (pin 1 alignment).

---

## Bring-Up Checklist

- [x] Bonnet is fully seated on the Pi
- [x] HUB75 ribbon cable connected to matrix IN
- [x] Power connected to the bonnet's barrel jack
- [x] Pi is NOT powered via micro-USB
- [x] Brightness kept low for first power-on
- [x] Sign displays standings correctly

---

## Software Configuration for Hardware

These settings in the codebase must match the physical hardware:

| Setting | Value | Notes |
|---------|-------|-------|
| `hardwareMapping` | `AdafruitHat` | In `src/matrix.ts`. Do **not** use `AdafruitHatPwm` — it doesn't work with this bonnet. |
| `gpioSlowdown` | `5` | In `config.json`. Max value is 5. Controls GPIO timing for the LED refresh. |
| `brightness` | `35` | In `config.json`. Keep low to reduce flicker and power draw. |
| Sound module | Blacklisted | `/etc/modprobe.d/blacklist-snd.conf` — the `snd_bcm2835` driver conflicts with GPIO timing. |

---

## Notes and Gotchas

> **Warning:** Do not connect or disconnect the HUB75 ribbon cable while the system is powered.

- The LED matrix draws significantly more current than the Raspberry Pi alone.
- Keep brightness low during initial testing to avoid brownouts or resets.
- The Pi Zero W's single-core CPU causes some visible flickering on the LED panel. This is a hardware limitation — upgrading to a Pi Zero 2 W is the recommended fix.
- The `AdafruitHatPwm` hardware mapping does not work with this bonnet — use `AdafruitHat` instead.
