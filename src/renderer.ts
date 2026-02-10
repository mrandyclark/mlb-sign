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

export class Renderer {
  private config: Config;
  private frameBuffer: FrameBuffer;

  constructor(config: Config) {
    this.config = config;
    this.frameBuffer = new FrameBuffer(config.display.width, config.display.height);
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

    let x = 1;
    x = this.drawText(rankStr, x, y, 255, 255, 255);
    x += 2;
    x = this.drawText(abbr, x, y, 255, 255, 255);
    x += 2;
    this.drawText(record, x, y, 200, 200, 200);
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
