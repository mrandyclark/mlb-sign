/**
 * WiFi connectivity detection and configuration helpers.
 *
 * Uses NetworkManager (nmcli) which is the default on Raspberry Pi OS Bookworm+.
 * Falls back gracefully on dev machines where nmcli isn't available.
 */

import { execSync } from 'child_process';

/**
 * Check if the Pi has internet connectivity by attempting to reach a DNS server.
 * Returns true if we can reach the internet, false otherwise.
 */
export function hasInternetConnectivity(): boolean {
  try {
    // Quick DNS lookup + TCP connect to Google's DNS — fast and reliable
    execSync('ping -c 1 -W 3 8.8.8.8', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any WiFi network is configured in NetworkManager.
 */
export function hasConfiguredWifi(): boolean {
  try {
    const output = execSync('nmcli -t -f NAME,TYPE connection show', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return output.split('\n').some(line => line.includes(':802-11-wireless'));
  } catch {
    return false;
  }
}

/**
 * Scan for available WiFi networks. Returns a list of SSIDs.
 */
export function scanWifiNetworks(): string[] {
  try {
    const output = execSync('nmcli -t -f SSID device wifi list --rescan yes', {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const ssids = output
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    // Deduplicate
    return [...new Set(ssids)];
  } catch {
    return [];
  }
}

/**
 * Configure WiFi using NetworkManager (nmcli).
 * Creates a new connection profile and activates it.
 *
 * Returns true on success, false on failure.
 */
export function configureWifi(ssid: string, password: string): boolean {
  try {
    // Delete any existing connection with this SSID first
    try {
      execSync(`nmcli connection delete "${ssid}"`, { stdio: 'ignore', timeout: 10000 });
    } catch {
      // Connection didn't exist — that's fine
    }

    // Create and activate the new connection
    execSync(
      `nmcli device wifi connect "${ssid}" password "${password}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    console.log(`[wifi] Successfully connected to "${ssid}"`);
    return true;
  } catch (error) {
    console.error(`[wifi] Failed to connect to "${ssid}":`, error);
    return false;
  }
}

/**
 * Check if WiFi setup mode is needed.
 *
 * Only enters setup mode if there is NO WiFi connection configured at all.
 * If WiFi is configured but temporarily unreachable (router reboot, etc.),
 * we skip setup mode and let the normal retry loop handle it.
 */
export function needsWifiSetup(): boolean {
  // On dev machines (no nmcli), skip setup mode
  try {
    execSync('which nmcli', { stdio: 'ignore', timeout: 2000 });
  } catch {
    console.log('[wifi] nmcli not found — skipping WiFi setup check (dev machine)');
    return false;
  }

  // If WiFi is already configured, don't enter setup mode even if the
  // network is temporarily unreachable — the normal main loop will retry.
  // Retry a few times because NetworkManager may not be ready right after boot.
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (hasConfiguredWifi()) {
      console.log('[wifi] WiFi already configured — skipping setup mode');
      if (!hasInternetConnectivity()) {
        console.log('[wifi] Note: no internet yet, but WiFi is configured. Main loop will retry.');
      }
      return false;
    }
    if (attempt < 5) {
      console.log(`[wifi] No WiFi found (attempt ${attempt}/5) — retrying in 3s...`);
      execSync('sleep 3');
    }
  }

  // No WiFi configured at all — setup mode is needed
  console.log('[wifi] No WiFi configured — setup mode needed');
  return true;
}
