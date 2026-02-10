# Setup Guide – MLB LED Sign

This document records the exact software setup steps used to bring up the MLB LED Sign on a Raspberry Pi Zero 2 W. It exists so the project can be reproduced later without guesswork.

---

## Operating System

**Raspberry Pi OS (64-bit)**

Installed using Raspberry Pi Imager on macOS.

The system is configured to run headless (no monitor or keyboard).

---

## Imager Customization Settings

| Setting | Value |
|---------|-------|
| Hostname | `mlb-sign` |
| SSH | Enabled (password authentication) |
| Wi-Fi | Configured during image creation (SSID and password) |
| Timezone | Set to local timezone |
| Raspberry Pi Connect | Disabled |

---

## First Boot and Access

1. Insert the microSD card into the Raspberry Pi.
2. Power the Pi using a USB power source (Pi only; LED matrix not attached).
3. Wait approximately 60 seconds for first boot to complete.
4. Connect via SSH from another machine:

```bash
ssh <user>@mlb-sign.local
```

**Successful login confirms:**

- Wi-Fi connectivity
- SSH access
- SD card integrity

---

## System Updates

After first login, update the system packages:

```bash
sudo apt update
sudo apt upgrade -y
```

> **Note:** On first boot, apt may be temporarily locked by background services (for example, packagekit). Waiting briefly typically resolves this.

---

## Python Environment

Raspberry Pi OS uses a managed system Python environment. Project dependencies are installed in a virtual environment.

---

## Project Directory

The project lives at:

```
/home/<user>/mlb-sign
```

---

## Creating the Virtual Environment

```bash
sudo apt install -y git python3-pip python3-venv

mkdir -p ~/mlb-sign
cd ~/mlb-sign
python3 -m venv .venv
source .venv/bin/activate
```

---

## Installing Python Dependencies

Upgrade pip inside the virtual environment:

```bash
pip install --upgrade pip
```

Install required packages:

```bash
pip install pillow requests
```

These libraries are used for:

- **Pillow** – Image and text rendering
- **Requests** – HTTP requests to the MLB standings API

---

## Resuming Work Later

To work on the project in a new session:

```bash
cd ~/mlb-sign
source .venv/bin/activate
```

---

## Current Setup Status

- [x] Operating system installed and updated
- [x] SSH verified over Wi-Fi
- [x] Python virtual environment created
- [x] Project dependencies installed
- [ ] System ready for LED matrix hardware bring-up
