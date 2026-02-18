# Dad's Sign Setup Guide

Pi Zero 2 W + RGB Matrix Bonnet + 64x32 LED Matrix

## 1. Flash Raspberry Pi OS

Use **Raspberry Pi Imager** on your Mac:

1. Open Raspberry Pi Imager
2. **Device**: Raspberry Pi Zero 2 W
3. **OS**: Raspberry Pi OS (64-bit) Lite — Bookworm
4. **Storage**: Select the new SD card
5. Click **Next**, then **Edit Settings**:

### OS Customisation Settings

**General tab:**
- ✅ Set hostname: `dad-sign`
- ✅ Set username and password: `mrandyclark` / (your password)
- ✅ Configure wireless LAN: (dad's WiFi SSID + password)
- ✅ Set locale: `America/Denver` (or wherever dad is), Keyboard: `us`

**Services tab:**
- ✅ Enable SSH → Use password authentication

6. Click **Save**, then **Yes** to flash

## 2. First Boot

1. Insert SD card into the Pi, power on
2. Wait ~2 minutes for first boot + WiFi connection
3. Find it on the network:

```bash
# From your Mac:
ping dad-sign.local
```

If that doesn't work, check your router's DHCP client list for the IP.

4. SSH in:

```bash
ssh mrandyclark@dad-sign.local
```

## 3. Pi System Setup (run on the Pi via SSH)

```bash
# Update the system
sudo apt-get update && sudo apt-get upgrade -y 

# Install build tools (needed for native rpi-led-matrix compilation)
sudo apt-get install -y build-essential git python3

# Blacklist sound module (conflicts with LED matrix GPIO)
echo "blacklist snd_bcm2835" | sudo tee /etc/modprobe.d/blacklist-snd.conf
sudo reboot
```

## 4. Set the Sign ID (on the Pi via SSH)

SSH back in after reboot and set the sign ID. Since the service runs as `root`,
we write it to both the user home and root's home:

```bash
ssh mrandyclark@dad-sign.local
echo "A556DBBC-44B4-49C3-BE2F-B73702509293" > ~/.sign-id
sudo bash -c 'echo "A556DBBC-44B4-49C3-BE2F-B73702509293" > /root/.sign-id'
```

## 5. Deploy the Sign

Run the deploy script **from your Mac**:

```bash
cd ~/Projects/mlb-sign
./scripts/deploy.sh mrandyclark@dad-sign.local
```

This will:
- Install Node.js v20.17.0 (official arm64 build)
- Install pnpm
- Clone the repo
- Install dependencies
- Build TypeScript

## 6. Compile the Native LED Addon

pnpm ignores native build scripts by default, so `rpi-led-matrix` must be compiled manually:

```bash
ssh mrandyclark@dad-sign.local
cd ~/mlb-sign
sudo npx node-gyp rebuild --directory=node_modules/.pnpm/rpi-led-matrix@1.15.0/node_modules/rpi-led-matrix
```

## 7. Test It

SSH into the Pi and run manually first:

```bash
ssh mrandyclark@dad-sign.local
cd ~/mlb-sign
sudo node dist/index.js
```

You should see:
```
Configuration loaded
  Sign ID: A556DBBC-44B4-49C3-BE2F-B73702509293
  API URL: https://www.spreadsontoast.com/api/external
  Display: 64x32
  ...
```

The LED matrix should light up with standings. `Ctrl+C` to stop.

## 7. Install as a Service (auto-start on boot)

```bash
# Still on the Pi via SSH:
sudo cp ~/mlb-sign/scripts/mlb-sign.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mlb-sign
sudo systemctl start mlb-sign
```

Check it's running:
```bash
sudo systemctl status mlb-sign
sudo journalctl -u mlb-sign -f
```

## Troubleshooting

- **Can't find Pi on network**: Wait longer, or check router DHCP list
- **Deploy script hangs on Node install**: curl + tar can take a minute or two
- **pnpm install takes a while**: Native compilation of rpi-led-matrix takes a few minutes on Pi Zero 2 W
- **Matrix doesn't light up**: Check ribbon cable orientation, make sure bonnet is seated properly
- **Flickering**: `gpioSlowdown: 5` is already maxed out in config.json — Pi Zero 2 W should flicker less than the original
- **Service won't start**: Check `sudo journalctl -u mlb-sign -e` for errors
- **HTTPS timeout**: Pi Zero 2 W is much faster than original — HTTPS requests should be quick
