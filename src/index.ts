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

  async function updateDisplay(): Promise<void> {
    try {
      const standings = await apiClient.getStandings();
      
      if (standings.length === 0) {
        console.warn('No standings data available');
        return;
      }

      const divisionName = config.divisions[currentDivisionIndex];
      const division = standings.find(
        (d) => d.divisionName.toLowerCase().includes(divisionName.toLowerCase())
      );

      if (!division) {
        console.warn(`Division "${divisionName}" not found in standings`);
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
    }
  }

  await updateDisplay();

  setInterval(updateDisplay, config.display.rotationIntervalSeconds * 1000);

  console.log('\nSign is running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
