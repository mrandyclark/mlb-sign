/**
 * MLB LED Sign - Main Entry Point
 * 
 * Fetches MLB standings and displays them on an LED matrix.
 */

import { loadConfig } from './config';
import { MLBAPIClient } from './api';
import { Renderer } from './renderer';
import { createMatrix, isHardwareAvailable, pushFrameToMatrix, MatrixInstance } from './matrix';

async function main(): Promise<void> {
  console.log('MLB LED Sign starting...');

  const config = loadConfig();
  console.log('Configuration loaded');
  console.log(`  Sign ID: ${config.signId}`);
  console.log(`  API URL: ${config.api.baseUrl}`);
  console.log(`  Display: ${config.display.width}x${config.display.height}`);
  console.log(`  Brightness: ${config.display.brightness}%`);
  console.log(`  Divisions: ${config.divisions.join(', ')}`);

  const apiClient = new MLBAPIClient(config);
  const renderer = new Renderer(config);
  const matrix: MatrixInstance = createMatrix(config);

  console.log(`  Hardware LED matrix: ${isHardwareAvailable() ? 'YES' : 'NO (console-only mode)'}`);

  pushFrameToMatrix(matrix, renderer.renderLoading());
  console.log('Showing loading indicator...');

  let currentDivisionIndex = 0;

  let hasData = false;

  async function updateDisplay(): Promise<void> {
    try {
      const standings = await apiClient.getStandings();
      
      if (standings.length === 0) {
        console.warn('No standings data available');
        if (!hasData) {
          pushFrameToMatrix(matrix, renderer.renderStatus('NO DATA', 'WAITING'));
        }
        return;
      }

      hasData = true;

      const divisionName = config.divisions[currentDivisionIndex];
      const division = standings.find(
        (d) => d.divisionName.toLowerCase().includes(divisionName.toLowerCase())
      );

      if (!division) {
        console.warn(`Division "${divisionName}" not found in standings`);
        currentDivisionIndex = (currentDivisionIndex + 1) % config.divisions.length;
        return;
      }

      console.log(`\nDisplaying: ${division.divisionName}`);
      
      const frame = renderer.renderDivision(division);

      pushFrameToMatrix(matrix, frame);

      if (!isHardwareAvailable()) {
        console.log(renderer.toAsciiArt());
      }

      currentDivisionIndex = (currentDivisionIndex + 1) % config.divisions.length;
    } catch (error) {
      console.error('Error updating display:', error);
      if (!hasData) {
        pushFrameToMatrix(matrix, renderer.renderStatus('ERROR', 'RETRYING'));
      }
    }
  }

  await updateDisplay();

  const rotationTimer = setInterval(updateDisplay, config.display.rotationIntervalSeconds * 1000);
  rotationTimer.unref = undefined as any; // prevent unref — keep process alive

  // Explicit keepalive so Node.js never exits on its own
  const keepalive = setInterval(() => {}, 60_000);

  console.log('\nSign is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...');
    clearInterval(rotationTimer);
    clearInterval(keepalive);
    matrix.clear();
    matrix.sync();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
