/**
 * Renderer for LED matrix display.
 * Generates images for division standings using canvas-like drawing.
 * 
 * Note: On the Pi, this will interface with rpi-rgb-led-matrix.
 * For development/testing, we generate images that can be previewed.
 */

import { Config } from './config';
import { DivisionStandings, TeamStanding } from './types';

export interface RenderOptions {
  width: number;
  height: number;
  brightness: number;
}

export interface Pixel {
  r: number;
  g: number;
  b: number;
}

export class FrameBuffer {
  readonly width: number;
  readonly height: number;
  private pixels: Pixel[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Array(width * height).fill(null).map(() => ({ r: 0, g: 0, b: 0 }));
  }

  setPixel(x: number, y: number, r: number, g: number, b: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = y * this.width + x;
    this.pixels[idx] = { r, g, b };
  }

  getPixel(x: number, y: number): Pixel {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return { r: 0, g: 0, b: 0 };
    }
    return this.pixels[y * this.width + x];
  }

  clear(): void {
    for (let i = 0; i < this.pixels.length; i++) {
      this.pixels[i] = { r: 0, g: 0, b: 0 };
    }
  }

  fill(r: number, g: number, b: number): void {
    for (let i = 0; i < this.pixels.length; i++) {
      this.pixels[i] = { r, g, b };
    }
  }

  getPixels(): Pixel[] {
    return this.pixels;
  }
}

const FONT_3X5: Record<string, number[][]> = {
  '0': [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  '2': [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  '3': [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
  '4': [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '6': [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  '8': [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  '9': [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
  'A': [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  'B': [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  'C': [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  'D': [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  'E': [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  'F': [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,0,0]],
  'G': [[0,1,1],[1,0,0],[1,0,1],[1,0,1],[0,1,1]],
  'H': [[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  'I': [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  'J': [[0,0,1],[0,0,1],[0,0,1],[1,0,1],[0,1,0]],
  'K': [[1,0,1],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  'L': [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  'M': [[1,0,1],[1,1,1],[1,0,1],[1,0,1],[1,0,1]],
  'N': [[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  'O': [[0,1,0],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  'P': [[1,1,0],[1,0,1],[1,1,0],[1,0,0],[1,0,0]],
  'Q': [[0,1,0],[1,0,1],[1,0,1],[1,1,1],[0,1,1]],
  'R': [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  'S': [[0,1,1],[1,0,0],[0,1,0],[0,0,1],[1,1,0]],
  'T': [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  'U': [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  'V': [[1,0,1],[1,0,1],[1,0,1],[0,1,0],[0,1,0]],
  'W': [[1,0,1],[1,0,1],[1,0,1],[1,1,1],[1,0,1]],
  'X': [[1,0,1],[1,0,1],[0,1,0],[1,0,1],[1,0,1]],
  'Y': [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
  'Z': [[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
  '-': [[0,0,0],[0,0,0],[1,1,1],[0,0,0],[0,0,0]],
  ' ': [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
  '.': [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,1,0]],
};

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16) || 0,
    g: parseInt(clean.substring(2, 4), 16) || 0,
    b: parseInt(clean.substring(4, 6), 16) || 0,
  };
}

function colorBrightness(c: { r: number; g: number; b: number }): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function ensureMinBrightness(c: { r: number; g: number; b: number }, minBrightness: number): { r: number; g: number; b: number } {
  const brightness = colorBrightness(c);
  if (brightness >= minBrightness) return c;
  if (brightness === 0) return { r: minBrightness, g: minBrightness, b: minBrightness };
  const scale = minBrightness / brightness;
  return {
    r: Math.min(255, Math.round(c.r * scale)),
    g: Math.min(255, Math.round(c.g * scale)),
    b: Math.min(255, Math.round(c.b * scale)),
  };
}

export class Renderer {
  private config: Config;
  private frameBuffer: FrameBuffer;

  constructor(config: Config) {
    this.config = config;
    this.frameBuffer = new FrameBuffer(config.display.width, config.display.height);
  }

  renderLoading(): FrameBuffer {
    this.frameBuffer.clear();
    const text = 'LOADING';
    const w = this.textWidth(text);
    const x = Math.floor((this.config.display.width - w) / 2);
    const y = Math.floor((this.config.display.height - 5) / 2);
    this.drawText(text, x, y, 100, 100, 100);
    return this.frameBuffer;
  }

  renderDivision(division: DivisionStandings): FrameBuffer {
    this.frameBuffer.clear();

    const lineHeight = 6;
    let y = 1;

    for (const team of division.teams.slice(0, 5)) {
      this.renderTeamLine(team, y);
      y += lineHeight;
    }

    return this.frameBuffer;
  }

  private renderTeamLine(team: TeamStanding, y: number): void {
    const rankStr = `${team.divisionRank}`;
    const abbr = team.teamAbbreviation.toUpperCase();
    const record = `${team.wins}-${team.losses}`;

    const MIN_BRIGHTNESS = 40;
    let abbrColor = { r: 255, g: 255, b: 255 };
    if (team.colors) {
      const primary = parseHexColor(team.colors.primary);
      const secondary = parseHexColor(team.colors.secondary);
      abbrColor = colorBrightness(primary) >= MIN_BRIGHTNESS
        ? primary
        : colorBrightness(secondary) >= MIN_BRIGHTNESS
          ? secondary
          : ensureMinBrightness(primary.r + primary.g + primary.b > 0 ? primary : secondary, MIN_BRIGHTNESS);
    }

    const recordWidth = this.textWidth(record);
    const recordX = this.config.display.width - recordWidth - 1;

    let x = 1;
    x = this.drawText(rankStr, x, y, 255, 255, 255);
    x += 2;
    this.drawText(abbr, x, y, abbrColor.r, abbrColor.g, abbrColor.b);
    this.drawText(record, recordX, y, 200, 200, 200);
  }

  private textWidth(text: string): number {
    let w = 0;
    for (const char of text.toUpperCase()) {
      const glyph = FONT_3X5[char];
      if (glyph) {
        w += glyph[0].length + 1;
      } else {
        w += 4;
      }
    }
    return w > 0 ? w - 1 : 0;
  }

  private drawText(text: string, startX: number, startY: number, r: number, g: number, b: number): number {
    let x = startX;

    for (const char of text.toUpperCase()) {
      const glyph = FONT_3X5[char];
      if (glyph) {
        for (let row = 0; row < glyph.length; row++) {
          for (let col = 0; col < glyph[row].length; col++) {
            if (glyph[row][col]) {
              this.frameBuffer.setPixel(x + col, startY + row, r, g, b);
            }
          }
        }
        x += glyph[0].length + 1;
      } else {
        x += 4;
      }
    }

    return x;
  }

  getFrameBuffer(): FrameBuffer {
    return this.frameBuffer;
  }

  toAsciiArt(): string {
    const lines: string[] = [];
    
    for (let y = 0; y < this.frameBuffer.height; y++) {
      let line = '';
      for (let x = 0; x < this.frameBuffer.width; x++) {
        const pixel = this.frameBuffer.getPixel(x, y);
        const brightness = (pixel.r + pixel.g + pixel.b) / 3;
        line += brightness > 128 ? '█' : brightness > 0 ? '▒' : ' ';
      }
      lines.push(line);
    }
    
    return lines.join('\n');
  }
}
