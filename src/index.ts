/**
 * MLB LED Sign - Main Entry Point
 * 
 * Fetches slides from the API and displays them on an LED matrix.
 */

import { loadConfig } from './config';
import { MLBAPIClient } from './api';
import { Renderer } from './renderer';
import { createMatrix, isHardwareAvailable, pushFrameToMatrix, MatrixInstance } from './matrix';
import { SignConfig, Slide } from './types';

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

  pushFrameToMatrix(matrix, renderer.renderLoading());
  console.log('Showing loading indicator...');

  let slides: Slide[] = [];
  let currentSlideIndex = 0;
  let hasData = false;
  let lastFrame: ReturnType<typeof renderer.renderLoading> | null = null;
  let rotationIntervalMs = config.display.rotationIntervalSeconds * 1000;

  function applySignConfig(signConfig: SignConfig): void {
    if (signConfig.display?.brightness !== undefined) {
      config.display.brightness = signConfig.display.brightness;
      matrix.brightness(signConfig.display.brightness);
      console.log(`  Brightness updated: ${signConfig.display.brightness}%`);
    }
    if (signConfig.display?.rotationIntervalSeconds !== undefined) {
      config.display.rotationIntervalSeconds = signConfig.display.rotationIntervalSeconds;
      rotationIntervalMs = signConfig.display.rotationIntervalSeconds * 1000;
      console.log(`  Rotation interval updated: ${signConfig.display.rotationIntervalSeconds}s`);
    }
    if (signConfig.schedule) {
      if (signConfig.schedule.enabled !== undefined) config.schedule.enabled = signConfig.schedule.enabled;
      if (signConfig.schedule.onTime !== undefined) config.schedule.onTime = signConfig.schedule.onTime;
      if (signConfig.schedule.offTime !== undefined) config.schedule.offTime = signConfig.schedule.offTime;
      if (signConfig.schedule.timezone !== undefined) config.schedule.timezone = signConfig.schedule.timezone;
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
