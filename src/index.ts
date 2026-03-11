/**
 * MLB LED Sign - Main Entry Point
 * 
 * Fetches slides from the API and displays them on an LED matrix.
 */

import { loadConfig } from './config';
import { MLBAPIClient } from './api';
import { Renderer } from './renderer';
import { createMatrix, isHardwareAvailable, pushFrameToMatrix, MatrixInstance } from './matrix';
import { SignExternalConfigResponse, Slide } from './types';
import { needsWifiSetup } from './wifi';
import { startWifiSetupBLE } from './wifi-setup';

const PAYLOAD_VERSION = 3;

/**
 * Wait for WiFi to be configured via BLE before continuing.
 * Shows setup screen on the LED matrix and blocks until WiFi connects.
 */
function waitForWifiSetup(renderer: Renderer, matrix: MatrixInstance): Promise<void> {
  return new Promise((resolve) => {
    console.log('No WiFi configured — waiting for BLE setup...');
    pushFrameToMatrix(matrix, renderer.renderSetupMode('waiting'));

    if (!isHardwareAvailable()) {
      console.log(renderer.toAsciiArt());
    }

    const cleanup = startWifiSetupBLE({
      onStatusChange: (status, message) => {
        const renderStatus = status === 'ready' ? 'waiting' : status as 'waiting' | 'connecting' | 'success' | 'failed';
        pushFrameToMatrix(matrix, renderer.renderSetupMode(renderStatus));
      },
      onConnected: () => {
        console.log('WiFi configured via BLE — continuing to main loop');
        pushFrameToMatrix(matrix, renderer.renderSetupMode('success'));

        // Show success screen briefly, then stop this BLE instance
        // (the always-on BLE will start right after)
        setTimeout(() => {
          if (cleanup) cleanup();
          resolve();
        }, 3000);
      },
    });

    if (!cleanup) {
      // BLE not available (dev machine) — skip
      console.warn('[setup] BLE not available — skipping WiFi setup wait');
      resolve();
    }
  });
}

async function main(): Promise<void> {
  console.log('MLB LED Sign starting...');

  const config = loadConfig();
  console.log('Configuration loaded');
  console.log(`  Sign ID: ${config.signId}`);
  console.log(`  API URL: ${config.api.baseUrl}`);
  console.log(`  Display: ${config.display.width}x${config.display.height}`);
  console.log(`  Brightness: ${config.display.brightness}%`);

  const apiClient = new MLBAPIClient(config);
  const renderer = new Renderer(config);
  const matrix: MatrixInstance = createMatrix(config);

  console.log(`  Hardware LED matrix: ${isHardwareAvailable() ? 'YES' : 'NO (console-only mode)'}`);

  // If no WiFi is configured at all, block until BLE setup provides credentials
  if (needsWifiSetup()) {
    await waitForWifiSetup(renderer, matrix);
  }

  // Always start BLE in the background so WiFi can be managed at any time
  const bleCleanup = startWifiSetupBLE({
    onStatusChange: (status, message) => {
      console.log(`[ble] WiFi status: ${status}${message ? ` (${message})` : ''}`);
    },
    onConnected: () => {
      console.log('[ble] WiFi credentials updated — sign will use new network');
    },
  });
  if (bleCleanup) {
    console.log('BLE WiFi management running in background');
  }

  pushFrameToMatrix(matrix, renderer.renderLoading());
  console.log('Showing loading indicator...');

  let slides: Slide[] = [];
  let currentSlideIndex = 0;
  let hasData = false;
  let lastFrame: ReturnType<typeof renderer.renderLoading> | null = null;
  let rotationIntervalMs = config.display.rotationIntervalSeconds * 1000;

  function applySignConfig(response: SignExternalConfigResponse): void {
    // Check payload version — if the server expects a newer version, log a warning
    if (response.payloadVersion !== PAYLOAD_VERSION) {
      console.warn(`⚠ Payload version mismatch: sign=${PAYLOAD_VERSION}, server=${response.payloadVersion}. Consider updating the sign software.`);
    }

    const { display, schedule } = response.config;

    if (display.brightness !== undefined) {
      config.display.brightness = display.brightness;
      matrix.brightness(display.brightness);
      console.log(`  Brightness updated: ${display.brightness}%`);
    }
    if (display.rotationIntervalSeconds !== undefined) {
      config.display.rotationIntervalSeconds = display.rotationIntervalSeconds;
      rotationIntervalMs = display.rotationIntervalSeconds * 1000;
      console.log(`  Rotation interval updated: ${display.rotationIntervalSeconds}s`);
    }
    if (schedule) {
      if (schedule.enabled !== undefined) config.schedule.enabled = schedule.enabled;
      if (schedule.onTime !== undefined) config.schedule.onTime = schedule.onTime;
      if (schedule.offTime !== undefined) config.schedule.offTime = schedule.offTime;
      if (schedule.timezone !== undefined) config.schedule.timezone = schedule.timezone;
      console.log(`  Schedule updated: ${config.schedule.enabled ? `${config.schedule.onTime}-${config.schedule.offTime} ${config.schedule.timezone}` : 'disabled'}`);
    }
  }

  async function fetchSlides(): Promise<void> {
    try {
      slides = await apiClient.getSlides();

      if (slides.length === 0) {
        console.warn('No slides available');
        if (!hasData) {
          lastFrame = renderer.renderStatus('OFFLINE', 'RETRYING');
          pushFrameToMatrix(matrix, lastFrame);
        }
        return;
      }

      hasData = true;
      console.log(`Got ${slides.length} slides`);

      // Fetch and apply remote config alongside slides
      const signConfig = await apiClient.fetchSignConfig();
      if (signConfig) {
        applySignConfig(signConfig);
      }
    } catch (error) {
      console.error('Error fetching slides:', error);
      if (!hasData) {
        lastFrame = renderer.renderStatus('OFFLINE', 'RETRYING');
        pushFrameToMatrix(matrix, lastFrame);
      }
    }
  }

  function showNextSlide(): void {
    if (slides.length === 0) return;

    const slide = slides[currentSlideIndex];
    console.log(`\nDisplaying slide ${currentSlideIndex + 1}/${slides.length}: ${slide.slideType}${('title' in slide) ? ` — ${slide.title}` : ''}`);

    const frame = renderer.renderSlide(slide);
    lastFrame = frame;
    pushFrameToMatrix(matrix, frame);

    if (!isHardwareAvailable()) {
      console.log(renderer.toAsciiArt());
    }

    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
  }

  // Initial fetch
  try {
    await fetchSlides();
    showNextSlide();
  } catch (error) {
    console.error('Initial fetch failed (will retry):', error);
    lastFrame = renderer.renderStatus('OFFLINE', 'RETRYING');
    pushFrameToMatrix(matrix, lastFrame);
  }

  // Rotate slides on display timer (restarts if rotation interval changes via remote config)
  let rotationTimer = setInterval(showNextSlide, rotationIntervalMs);
  rotationTimer.unref = undefined as any; // prevent unref — keep process alive

  // Refresh slides from API periodically, and restart rotation timer if interval changed
  let lastRotationIntervalMs = rotationIntervalMs;
  const refreshTimer = setInterval(async () => {
    await fetchSlides();
    if (rotationIntervalMs !== lastRotationIntervalMs) {
      clearInterval(rotationTimer);
      rotationTimer = setInterval(showNextSlide, rotationIntervalMs);
      rotationTimer.unref = undefined as any;
      lastRotationIntervalMs = rotationIntervalMs;
      console.log(`Rotation timer restarted: ${rotationIntervalMs / 1000}s`);
    }
  }, config.api.refreshIntervalSeconds * 1000);
  refreshTimer.unref = undefined as any;

  // Watchdog: re-push the last frame every 60s to recover from display dropouts
  const watchdog = setInterval(() => {
    if (lastFrame) {
      pushFrameToMatrix(matrix, lastFrame);
    }
  }, 60_000);

  console.log('\nSign is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...');
    clearInterval(rotationTimer);
    clearInterval(refreshTimer);
    clearInterval(watchdog);
    if (bleCleanup) bleCleanup();
    matrix.clear();
    matrix.sync();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception (keeping alive):', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (keeping alive):', reason);
});

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  // Do NOT call process.exit — let systemd restart us
});
