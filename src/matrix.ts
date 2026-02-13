/**
 * Hardware abstraction for the RGB LED matrix.
 *
 * On the Raspberry Pi, this loads `rpi-led-matrix` and drives the real hardware.
 * On dev machines (macOS/Linux without the native addon), it falls back to a
 * no-op stub so the rest of the codebase can run and be tested without hardware.
 */

import { Config } from './config';
import { FrameBuffer } from './renderer';

// ---------------------------------------------------------------------------
// Interfaces that mirror the subset of rpi-led-matrix we actually use
// ---------------------------------------------------------------------------

export interface MatrixInstance {
  brightness(b: number): MatrixInstance;
  clear(): MatrixInstance;
  fgColor(color: { r: number; g: number; b: number } | number): MatrixInstance;
  setPixel(x: number, y: number): MatrixInstance;
  sync(): void;
  width(): number;
  height(): number;
}

// ---------------------------------------------------------------------------
// Try to load the native module; fall back gracefully
// ---------------------------------------------------------------------------

let LedMatrix: any = null;
let GpioMapping: any = null;

try {
  const nativeModule = require('rpi-led-matrix');
  LedMatrix = nativeModule.LedMatrix;
  GpioMapping = nativeModule.GpioMapping;
} catch {
  // Native module not available — running on a dev machine
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isHardwareAvailable(): boolean {
  return LedMatrix !== null;
}

/**
 * Create a real or stub matrix instance based on the current environment.
 */
export function createMatrix(config: Config): MatrixInstance {
  if (LedMatrix) {
    return createRealMatrix(config);
  }

  console.warn('[matrix] rpi-led-matrix not available — using console-only stub');
  return createStubMatrix(config);
}

// ---------------------------------------------------------------------------
// Real hardware matrix
// ---------------------------------------------------------------------------

function createRealMatrix(config: Config): MatrixInstance {
  const matrixOptions = {
    ...LedMatrix.defaultMatrixOptions(),
    rows: config.display.height,
    cols: config.display.width,
    chainLength: 1,
    hardwareMapping: GpioMapping.AdafruitHat,
    brightness: config.display.brightness,
  };

  const runtimeOptions = {
    ...LedMatrix.defaultRuntimeOptions(),
    gpioSlowdown: config.display.gpioSlowdown ?? 4,
  };

  console.log('[matrix] Initializing real LED matrix');
  console.log(`  rows=${matrixOptions.rows} cols=${matrixOptions.cols}`);
  console.log(`  brightness=${matrixOptions.brightness}`);
  console.log(`  gpioSlowdown=${runtimeOptions.gpioSlowdown}`);

  const matrix = new LedMatrix(matrixOptions, runtimeOptions);
  return matrix as MatrixInstance;
}

// ---------------------------------------------------------------------------
// Stub matrix (dev / testing)
// ---------------------------------------------------------------------------

function createStubMatrix(config: Config): MatrixInstance {
  const w = config.display.width;
  const h = config.display.height;

  const stub: MatrixInstance = {
    brightness(_b: number) { return stub; },
    clear() { return stub; },
    fgColor(_color: { r: number; g: number; b: number }) { return stub; },
    setPixel(_x: number, _y: number) { return stub; },
    sync() { /* no-op */ },
    width() { return w; },
    height() { return h; },
  };

  return stub;
}

// ---------------------------------------------------------------------------
// Helper: push a FrameBuffer to the matrix
// ---------------------------------------------------------------------------

/**
 * Writes every pixel from a FrameBuffer to the matrix and calls sync().
 */
export function pushFrameToMatrix(matrix: MatrixInstance, frame: FrameBuffer): void {
  matrix.clear();

  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const pixel = frame.getPixel(x, y);
      if (pixel.r > 0 || pixel.g > 0 || pixel.b > 0) {
        const colorHex = (pixel.r << 16) | (pixel.g << 8) | pixel.b;
        matrix
          .fgColor(colorHex)
          .setPixel(x, y);
      }
    }
  }

  matrix.sync();
}
