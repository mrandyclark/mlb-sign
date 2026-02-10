# Hardware Setup – MLB LED Sign

This document describes the physical hardware configuration for the MLB LED Sign prototype. It is intended to be a simple reference for how everything is wired and powered.

---

## Core Components

- Raspberry Pi Zero 2 W
- Adafruit RGB Matrix Bonnet (for Raspberry Pi)
- Adafruit 64×32 RGB LED Matrix (5mm pitch, HUB75)
- HUB75 16-pin ribbon cable
- USB-C PD wall charger
- USB-C → 5.5mm barrel power cable (Adafruit)

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

## Initial Bring-Up Checklist

- [ ] Bonnet is fully seated on the Pi
- [ ] HUB75 ribbon cable connected to matrix IN
- [ ] Power connected to the bonnet's barrel jack
- [ ] Pi is NOT powered via micro-USB
- [ ] Brightness will be kept low for first power-on

---

## Notes and Gotchas

> **Warning:** Do not connect or disconnect the HUB75 ribbon cable while the system is powered.

- The LED matrix draws significantly more current than the Raspberry Pi alone.
- Keep brightness low during initial testing to avoid brownouts or resets.
