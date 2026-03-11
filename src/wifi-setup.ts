/**
 * BLE GATT server for WiFi management — runs at all times.
 *
 * The sign always advertises a BLE service so WiFi credentials can be
 * configured or changed at any time from the Web Bluetooth UI, not just
 * on first boot.
 *
 * BLE Service UUID: 12345678-1234-5678-1234-56789abcdef0
 *   - SSID Characteristic:     12345678-1234-5678-1234-56789abcdef1 (read/write)
 *   - Password Characteristic: 12345678-1234-5678-1234-56789abcdef2 (write)
 *   - Command Characteristic:  12345678-1234-5678-1234-56789abcdef3 (write/notify)
 *   - WiFi List Characteristic: 12345678-1234-5678-1234-56789abcdef4 (read)
 *   - Status Characteristic:   12345678-1234-5678-1234-56789abcdef5 (read/notify)
 *
 * Command values:
 *   "connect"  — apply WiFi credentials and attempt to connect
 *   "scan"     — rescan for WiFi networks
 *   "reboot"   — reboot the Pi
 *
 * Status values:
 *   "ready"       — waiting for credentials
 *   "connecting"  — attempting to connect to WiFi
 *   "success"     — connected successfully
 *   "failed"      — connection failed, try again
 */

import { configureWifi, scanWifiNetworks } from './wifi';
import { execSync } from 'child_process';

// BLE UUIDs (must be lowercase, no dashes for bleno)
const SERVICE_UUID = '1234567812345678123456789abcdef0';
const SSID_CHAR_UUID = '1234567812345678123456789abcdef1';
const PASSWORD_CHAR_UUID = '1234567812345678123456789abcdef2';
const COMMAND_CHAR_UUID = '1234567812345678123456789abcdef3';
const WIFI_LIST_CHAR_UUID = '1234567812345678123456789abcdef4';
const STATUS_CHAR_UUID = '1234567812345678123456789abcdef5';

type SetupStatus = 'ready' | 'connecting' | 'success' | 'failed';

interface WifiSetupCallbacks {
  onStatusChange: (status: SetupStatus, message?: string) => void;
  onConnected: () => void;
}

let bleno: any = null;

/**
 * Try to load bleno. Returns false if not available (dev machine).
 */
function loadBleno(): boolean {
  try {
    bleno = require('@abandonware/bleno');
    return true;
  } catch {
    console.warn('[ble] @abandonware/bleno not available — BLE setup disabled');
    return false;
  }
}

/**
 * Start the BLE WiFi setup server.
 * Returns a cleanup function to stop advertising, or null if BLE isn't available.
 */
export function startWifiSetupBLE(callbacks: WifiSetupCallbacks): (() => void) | null {
  if (!loadBleno()) return null;

  const BlenoPrimaryService = bleno.PrimaryService;
  const BlenoCharacteristic = bleno.Characteristic;

  let currentSsid = '';
  let currentPassword = '';
  let currentStatus: SetupStatus = 'ready';
  let statusNotifyCallback: ((data: Buffer) => void) | null = null;
  let commandNotifyCallback: ((data: Buffer) => void) | null = null;

  function updateStatus(status: SetupStatus, message?: string): void {
    currentStatus = status;
    const statusStr = message ? `${status}:${message}` : status;
    console.log(`[ble] Status: ${statusStr}`);
    if (statusNotifyCallback) {
      statusNotifyCallback(Buffer.from(statusStr, 'utf-8'));
    }
    callbacks.onStatusChange(status, message);
  }

  // --- SSID Characteristic (read/write) ---
  const ssidCharacteristic = new BlenoCharacteristic({
    uuid: SSID_CHAR_UUID,
    properties: ['read', 'write', 'writeWithoutResponse'],
    onReadRequest: (offset: number, callback: (result: number, data?: Buffer) => void) => {
      callback(BlenoCharacteristic.RESULT_SUCCESS, Buffer.from(currentSsid, 'utf-8'));
    },
    onWriteRequest: (data: Buffer, offset: number, withoutResponse: boolean, callback: (result: number) => void) => {
      currentSsid = data.toString('utf-8').trim();
      console.log(`[ble] SSID set: "${currentSsid}"`);
      callback(BlenoCharacteristic.RESULT_SUCCESS);
    },
  });

  // --- Password Characteristic (write only) ---
  const passwordCharacteristic = new BlenoCharacteristic({
    uuid: PASSWORD_CHAR_UUID,
    properties: ['write', 'writeWithoutResponse'],
    onWriteRequest: (data: Buffer, offset: number, withoutResponse: boolean, callback: (result: number) => void) => {
      currentPassword = data.toString('utf-8');
      console.log(`[ble] Password set (${currentPassword.length} chars)`);
      callback(BlenoCharacteristic.RESULT_SUCCESS);
    },
  });

  // --- Command Characteristic (write/notify) ---
  const commandCharacteristic = new BlenoCharacteristic({
    uuid: COMMAND_CHAR_UUID,
    properties: ['write', 'writeWithoutResponse', 'notify'],
    onWriteRequest: (data: Buffer, offset: number, withoutResponse: boolean, callback: (result: number) => void) => {
      const command = data.toString('utf-8').trim();
      console.log(`[ble] Command received: "${command}"`);
      callback(BlenoCharacteristic.RESULT_SUCCESS);

      handleCommand(command);
    },
    onSubscribe: (maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
      commandNotifyCallback = updateValueCallback;
    },
    onUnsubscribe: () => {
      commandNotifyCallback = null;
    },
  });

  // --- WiFi List Characteristic (read) ---
  const wifiListCharacteristic = new BlenoCharacteristic({
    uuid: WIFI_LIST_CHAR_UUID,
    properties: ['read'],
    onReadRequest: (offset: number, callback: (result: number, data?: Buffer) => void) => {
      const networks = scanWifiNetworks();
      const json = JSON.stringify(networks);
      const data = Buffer.from(json, 'utf-8');
      // BLE has a max characteristic size — chunk if needed, but most WiFi lists fit
      callback(BlenoCharacteristic.RESULT_SUCCESS, data.subarray(offset));
    },
  });

  // --- Status Characteristic (read/notify) ---
  const statusCharacteristic = new BlenoCharacteristic({
    uuid: STATUS_CHAR_UUID,
    properties: ['read', 'notify'],
    onReadRequest: (offset: number, callback: (result: number, data?: Buffer) => void) => {
      callback(BlenoCharacteristic.RESULT_SUCCESS, Buffer.from(currentStatus, 'utf-8'));
    },
    onSubscribe: (maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
      statusNotifyCallback = updateValueCallback;
    },
    onUnsubscribe: () => {
      statusNotifyCallback = null;
    },
  });

  // --- Command handler ---
  async function handleCommand(command: string): Promise<void> {
    switch (command) {
      case 'connect':
        if (!currentSsid) {
          updateStatus('failed', 'No SSID provided');
          return;
        }
        updateStatus('connecting');

        // Run WiFi config in next tick so the BLE response can be sent first
        setTimeout(() => {
          const success = configureWifi(currentSsid, currentPassword);
          if (success) {
            updateStatus('success');
            callbacks.onConnected();
          } else {
            updateStatus('failed', 'Could not connect to WiFi');
          }
        }, 500);
        break;

      case 'scan':
        updateStatus('ready', 'scanning');
        // Trigger a rescan — next read of wifiList will have fresh results
        scanWifiNetworks();
        updateStatus('ready');
        break;

      case 'reboot':
        updateStatus('ready', 'rebooting');
        setTimeout(() => {
          try {
            execSync('sudo reboot', { timeout: 5000 });
          } catch {
            // Expected — the command won't return
          }
        }, 1000);
        break;

      default:
        console.warn(`[ble] Unknown command: "${command}"`);
        break;
    }
  }

  // --- BLE Service ---
  const wifiService = new BlenoPrimaryService({
    uuid: SERVICE_UUID,
    characteristics: [
      ssidCharacteristic,
      passwordCharacteristic,
      commandCharacteristic,
      wifiListCharacteristic,
      statusCharacteristic,
    ],
  });

  // --- Start advertising when Bluetooth is ready ---
  bleno.on('stateChange', (state: string) => {
    console.log(`[ble] Adapter state: ${state}`);
    if (state === 'poweredOn') {
      bleno.startAdvertising('MLB-Sign', [SERVICE_UUID], (err: Error | null) => {
        if (err) {
          console.error('[ble] Failed to start advertising:', err);
        } else {
          console.log('[ble] Advertising as "MLB-Sign"');
        }
      });
    } else {
      bleno.stopAdvertising();
    }
  });

  bleno.on('advertisingStart', (err: Error | null) => {
    if (err) {
      console.error('[ble] Advertising error:', err);
      return;
    }
    bleno.setServices([wifiService], (err2: Error | null) => {
      if (err2) {
        console.error('[ble] Failed to set services:', err2);
      } else {
        console.log('[ble] GATT services registered');
      }
    });
  });

  bleno.on('accept', (clientAddress: string) => {
    console.log(`[ble] Client connected: ${clientAddress}`);
  });

  bleno.on('disconnect', (clientAddress: string) => {
    console.log(`[ble] Client disconnected: ${clientAddress}`);
  });

  // Return cleanup function
  return () => {
    console.log('[ble] Stopping BLE setup server');
    bleno.stopAdvertising();
    bleno.disconnect();
  };
}

// Re-export UUIDs for use in documentation / web client
export const BLE_UUIDS = {
  service: '12345678-1234-5678-1234-56789abcdef0',
  ssid: '12345678-1234-5678-1234-56789abcdef1',
  password: '12345678-1234-5678-1234-56789abcdef2',
  command: '12345678-1234-5678-1234-56789abcdef3',
  wifiList: '12345678-1234-5678-1234-56789abcdef4',
  status: '12345678-1234-5678-1234-56789abcdef5',
} as const;
