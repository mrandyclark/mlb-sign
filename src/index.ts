/**
 * MLB LED Sign - Main Entry Point
 * 
 * Fetches slides from the API and displays them on an LED matrix.
 */

import { loadConfig } from './config';
import { MLBAPIClient } from './api';
import { Renderer } from './renderer';
import { createMatrix, isHardwareAvailable, pushFrameToMatrix, MatrixInstance } from './matrix';
import { Slide } from './types';

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

  // Rotate slides on display timer
  const rotationTimer = setInterval(showNextSlide, config.display.rotationIntervalSeconds * 1000);
  rotationTimer.unref = undefined as any; // prevent unref — keep process alive

  // Refresh slides from API periodically
  const refreshTimer = setInterval(fetchSlides, config.api.refreshIntervalSeconds * 1000);
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
