/**
 * BLE GATT server for WiFi management — runs at all times.
 *
 * Uses BlueZ D-Bus API via dbus-next (pure JS, no native addons).
 * Uses the low-level message handler API to avoid needing decorators.
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

// Load dbus-next at module load time (before native addons may interfere with require)
let dbus: any = null;
try {
  dbus = require('dbus-next');
} catch {
  // Not available — running on dev machine or dbus-next not installed
}

// BLE UUIDs (with dashes for D-Bus/BlueZ format)
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const SSID_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const PASSWORD_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
const COMMAND_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef3';
const WIFI_LIST_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';
const STATUS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef5';

const BLUEZ_SERVICE = 'org.bluez';
const ADAPTER_PATH = '/org/bluez/hci0';
const APP_PATH = '/com/mlbsign';
const AD_PATH = '/com/mlbsign/advertisement0';
const SVC_PATH = '/com/mlbsign/service0';

type SetupStatus = 'ready' | 'connecting' | 'success' | 'failed';

interface WifiSetupCallbacks {
  onStatusChange: (status: SetupStatus, message?: string) => void;
  onConnected: () => void;
}

// Characteristic definition
interface CharDef {
  uuid: string;
  flags: string[];
  path: string;
  onRead?: () => Buffer;
  onWrite?: (value: Buffer) => void;
  notifying: boolean;
}

/**
 * Start the BLE WiFi setup server.
 * Returns a cleanup function to stop advertising, or null if BLE isn't available.
 */
export function startWifiSetupBLE(callbacks: WifiSetupCallbacks): (() => void) | null {
  if (!dbus) {
    console.warn('[ble] dbus-next not available — BLE setup disabled');
    return null;
  }

  let bus: any = null;

  // State
  let currentSsid = '';
  let currentPassword = '';
  let currentStatus: SetupStatus = 'ready';

  function updateStatus(status: SetupStatus, message?: string): void {
    currentStatus = status;
    const statusStr = message ? `${status}:${message}` : status;
    console.log(`[ble] Status: ${statusStr}`);
    // Emit PropertiesChanged for status characteristic if notifying
    if (statusCharDef.notifying && bus) {
      try {
        const { Variant } = dbus;
        const sig = dbus.Message.newSignal(
          `${SVC_PATH}/char4`,
          'org.freedesktop.DBus.Properties',
          'PropertiesChanged',
        );
        sig.signature = 'sa{sv}as';
        sig.body = [
          'org.bluez.GattCharacteristic1',
          { Value: new Variant('ay', Buffer.from(statusStr, 'utf-8')) },
          [],
        ];
        bus.send(sig);
      } catch {
        // Non-critical — client can poll ReadValue
      }
    }
    callbacks.onStatusChange(status, message);
  }

  // --- Command handler ---
  function handleCommand(command: string): void {
    switch (command) {
      case 'connect':
        if (!currentSsid) {
          updateStatus('failed', 'No SSID provided');
          return;
        }
        updateStatus('connecting');
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
        scanWifiNetworks();
        updateStatus('ready');
        break;

      case 'reboot':
        updateStatus('ready', 'rebooting');
        setTimeout(() => {
          try { execSync('sudo reboot', { timeout: 5000 }); } catch { /* expected */ }
        }, 1000);
        break;

      default:
        console.warn(`[ble] Unknown command: "${command}"`);
        break;
    }
  }

  // --- Characteristic definitions ---
  const charDefs: CharDef[] = [
    {
      uuid: SSID_CHAR_UUID, flags: ['read', 'write', 'write-without-response'],
      path: `${SVC_PATH}/char0`, notifying: false,
      onRead: () => Buffer.from(currentSsid, 'utf-8'),
      onWrite: (v) => { currentSsid = v.toString('utf-8').trim(); console.log(`[ble] SSID set: "${currentSsid}"`); },
    },
    {
      uuid: PASSWORD_CHAR_UUID, flags: ['write', 'write-without-response'],
      path: `${SVC_PATH}/char1`, notifying: false,
      onWrite: (v) => { currentPassword = v.toString('utf-8'); console.log(`[ble] Password set (${currentPassword.length} chars)`); },
    },
    {
      uuid: COMMAND_CHAR_UUID, flags: ['write', 'write-without-response', 'notify'],
      path: `${SVC_PATH}/char2`, notifying: false,
      onWrite: (v) => { const cmd = v.toString('utf-8').trim(); console.log(`[ble] Command: "${cmd}"`); handleCommand(cmd); },
    },
    {
      uuid: WIFI_LIST_CHAR_UUID, flags: ['read'],
      path: `${SVC_PATH}/char3`, notifying: false,
      onRead: () => Buffer.from(JSON.stringify(scanWifiNetworks()), 'utf-8'),
    },
    {
      uuid: STATUS_CHAR_UUID, flags: ['read', 'notify'],
      path: `${SVC_PATH}/char4`, notifying: false,
      onRead: () => Buffer.from(currentStatus, 'utf-8'),
    },
  ];
  const statusCharDef = charDefs[4];

  // Map path → CharDef for quick lookup
  const charByPath: Record<string, CharDef> = {};
  for (const c of charDefs) charByPath[c.path] = c;

  // --- Start the D-Bus BLE server ---
  async function startServer(): Promise<void> {
    try {
      bus = dbus.systemBus();
    } catch (err: any) {
      console.warn('[ble] Cannot connect to system D-Bus — BLE setup disabled');
      console.warn('[ble]', err.message?.split('\n')[0]);
      return;
    }

    const Message = dbus.Message;
    const Variant = dbus.Variant;

    // -----------------------------------------------------------------------
    // Low-level method handler for all our D-Bus objects
    // -----------------------------------------------------------------------
    bus.addMethodHandler((msg: any) => {
      const path: string = msg.path;
      const iface: string = msg.interface;
      const member: string = msg.member;

      // --- org.freedesktop.DBus.Properties.GetAll ---
      if (iface === 'org.freedesktop.DBus.Properties' && member === 'GetAll') {
        const reqIface: string = msg.body?.[0];
        const props = getProperties(path, reqIface);
        if (props) {
          const reply = Message.newMethodReturn(msg, 'a{sv}', [props]);
          bus.send(reply);
          return true;
        }
      }

      // --- org.freedesktop.DBus.Properties.Get ---
      if (iface === 'org.freedesktop.DBus.Properties' && member === 'Get') {
        const reqIface: string = msg.body?.[0];
        const propName: string = msg.body?.[1];
        const props = getProperties(path, reqIface);
        if (props && props[propName]) {
          const reply = Message.newMethodReturn(msg, 'v', [props[propName]]);
          bus.send(reply);
          return true;
        }
      }

      // --- org.freedesktop.DBus.ObjectManager.GetManagedObjects ---
      if (iface === 'org.freedesktop.DBus.ObjectManager' && member === 'GetManagedObjects') {
        const objects = getManagedObjects();
        const reply = Message.newMethodReturn(msg, 'a{oa{sa{sv}}}', [objects]);
        bus.send(reply);
        return true;
      }

      // --- org.freedesktop.DBus.Introspectable.Introspect ---
      if (iface === 'org.freedesktop.DBus.Introspectable' && member === 'Introspect') {
        const xml = getIntrospectXml(path);
        if (xml) {
          const reply = Message.newMethodReturn(msg, 's', [xml]);
          bus.send(reply);
          return true;
        }
      }

      // --- org.bluez.LEAdvertisement1.Release ---
      if (path === AD_PATH && iface === 'org.bluez.LEAdvertisement1' && member === 'Release') {
        console.log('[ble] Advertisement released by BlueZ');
        const reply = Message.newMethodReturn(msg, '', []);
        bus.send(reply);
        return true;
      }

      // --- org.bluez.GattCharacteristic1 methods ---
      const charDef = charByPath[path];
      if (charDef && iface === 'org.bluez.GattCharacteristic1') {
        if (member === 'ReadValue') {
          if (charDef.onRead) {
            const value = charDef.onRead();
            const reply = Message.newMethodReturn(msg, 'ay', [value]);
            bus.send(reply);
          } else {
            const err = Message.newError(msg, 'org.bluez.Error.NotSupported', 'Read not supported');
            bus.send(err);
          }
          return true;
        }
        if (member === 'WriteValue') {
          if (charDef.onWrite) {
            const value = Buffer.from(msg.body?.[0] || []);
            charDef.onWrite(value);
            const reply = Message.newMethodReturn(msg, '', []);
            bus.send(reply);
          } else {
            const err = Message.newError(msg, 'org.bluez.Error.NotSupported', 'Write not supported');
            bus.send(err);
          }
          return true;
        }
        if (member === 'StartNotify') {
          charDef.notifying = true;
          const reply = Message.newMethodReturn(msg, '', []);
          bus.send(reply);
          return true;
        }
        if (member === 'StopNotify') {
          charDef.notifying = false;
          const reply = Message.newMethodReturn(msg, '', []);
          bus.send(reply);
          return true;
        }
      }

      return false; // Not handled
    });

    // -----------------------------------------------------------------------
    // Property helpers
    // -----------------------------------------------------------------------
    function getProperties(path: string, iface: string): Record<string, any> | null {
      if (path === AD_PATH && iface === 'org.bluez.LEAdvertisement1') {
        return {
          Type: new Variant('s', 'peripheral'),
          ServiceUUIDs: new Variant('as', [SERVICE_UUID]),
          LocalName: new Variant('s', 'MLB-Sign'),
          Includes: new Variant('as', ['tx-power']),
        };
      }
      if (path === SVC_PATH && iface === 'org.bluez.GattService1') {
        return {
          UUID: new Variant('s', SERVICE_UUID),
          Primary: new Variant('b', true),
          Characteristics: new Variant('ao', charDefs.map(c => c.path)),
        };
      }
      const charDef = charByPath[path];
      if (charDef && iface === 'org.bluez.GattCharacteristic1') {
        return {
          UUID: new Variant('s', charDef.uuid),
          Service: new Variant('o', SVC_PATH),
          Flags: new Variant('as', charDef.flags),
          Notifying: new Variant('b', charDef.notifying),
        };
      }
      return null;
    }

    function getManagedObjects(): Record<string, Record<string, Record<string, any>>> {
      const objects: Record<string, Record<string, Record<string, any>>> = {};
      objects[SVC_PATH] = { 'org.bluez.GattService1': getProperties(SVC_PATH, 'org.bluez.GattService1')! };
      for (const c of charDefs) {
        objects[c.path] = { 'org.bluez.GattCharacteristic1': getProperties(c.path, 'org.bluez.GattCharacteristic1')! };
      }
      return objects;
    }

    function getIntrospectXml(path: string): string | null {
      if (path === APP_PATH) {
        return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node><node name="service0"/><node name="advertisement0"/></node>`;
      }
      if (path === AD_PATH) {
        return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.bluez.LEAdvertisement1">
    <method name="Release"/>
    <property name="Type" type="s" access="read"/>
    <property name="ServiceUUIDs" type="as" access="read"/>
    <property name="LocalName" type="s" access="read"/>
    <property name="Includes" type="as" access="read"/>
  </interface>
</node>`;
      }
      if (path === SVC_PATH) {
        const charNodes = charDefs.map((_, i) => `<node name="char${i}"/>`).join('');
        return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.bluez.GattService1">
    <property name="UUID" type="s" access="read"/>
    <property name="Primary" type="b" access="read"/>
    <property name="Characteristics" type="ao" access="read"/>
  </interface>
  ${charNodes}
</node>`;
      }
      if (charByPath[path]) {
        return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.bluez.GattCharacteristic1">
    <method name="ReadValue"><arg direction="in" type="a{sv}" name="options"/><arg direction="out" type="ay"/></method>
    <method name="WriteValue"><arg direction="in" type="ay" name="value"/><arg direction="in" type="a{sv}" name="options"/></method>
    <method name="StartNotify"/>
    <method name="StopNotify"/>
    <property name="UUID" type="s" access="read"/>
    <property name="Service" type="o" access="read"/>
    <property name="Flags" type="as" access="read"/>
    <property name="Notifying" type="b" access="read"/>
  </interface>
</node>`;
      }
      return null;
    }

    // -----------------------------------------------------------------------
    // Register with BlueZ
    // -----------------------------------------------------------------------
    try {
      await bus.requestName('com.mlbsign', 0);
      console.log('[ble] D-Bus name acquired: com.mlbsign');

      console.log('[ble] Getting BlueZ proxy object...');
      const bluezObj = await bus.getProxyObject(BLUEZ_SERVICE, ADAPTER_PATH);

      // Power on adapter via bluetoothctl (handles rfkill + timing reliably)
      try {
        execSync('/usr/sbin/rfkill unblock bluetooth 2>/dev/null', { timeout: 3000 });
        execSync('/usr/bin/bluetoothctl power on 2>/dev/null', { timeout: 5000 });
        console.log('[ble] Bluetooth adapter powered on');
      } catch (powerErr: any) {
        console.warn('[ble] Power-on warning (continuing):', powerErr.message || powerErr);
      }

      const adapterProps = bluezObj.getInterface('org.freedesktop.DBus.Properties');
      const powered = await adapterProps.Get('org.bluez.Adapter1', 'Powered');
      console.log('[ble] Adapter powered:', powered?.value ?? powered);

      // Register advertisement
      console.log('[ble] Registering advertisement...');
      const adManager = bluezObj.getInterface('org.bluez.LEAdvertisingManager1');
      await adManager.RegisterAdvertisement(AD_PATH, {});
      console.log('[ble] Advertising as "MLB-Sign"');

      // Register GATT application
      console.log('[ble] Registering GATT application...');
      const gattManager = bluezObj.getInterface('org.bluez.GattManager1');
      await gattManager.RegisterApplication(APP_PATH, {});
      console.log('[ble] GATT services registered');

    } catch (err: any) {
      console.warn('[ble] Failed to start BLE server:', err.message || err);
      console.warn('[ble] Error type:', err.type || 'unknown');
      console.warn('[ble] Error text:', err.text || 'none');
      if (err.reply) console.warn('[ble] Error reply:', JSON.stringify(err.reply.body));
      if (bus) { bus.disconnect(); bus = null; }
    }
  }

  // Fire and forget — don't block the main loop
  startServer().catch((err) => {
    console.warn('[ble] BLE server startup error:', err.message || err);
  });

  // Return cleanup function
  return () => {
    console.log('[ble] Stopping BLE setup server');
    if (bus) {
      (async () => {
        try {
          const bluezObj = await bus.getProxyObject(BLUEZ_SERVICE, ADAPTER_PATH);
          const adManager = bluezObj.getInterface('org.bluez.LEAdvertisingManager1');
          await adManager.UnregisterAdvertisement(AD_PATH);
          const gattManager = bluezObj.getInterface('org.bluez.GattManager1');
          await gattManager.UnregisterApplication(APP_PATH);
        } catch { /* best effort */ }
        bus.disconnect();
        bus = null;
      })().catch(() => {});
    }
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
