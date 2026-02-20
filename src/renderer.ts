/**
 * Renderer for LED matrix display.
 * Generates images for division standings using canvas-like drawing.
 * 
 * Note: On the Pi, this will interface with rpi-rgb-led-matrix.
 * For development/testing, we generate images that can be previewed.
 */

import { Config } from './config';
import { LastGameSlide, NextGameSlide, Slide, SlideType, StandingsSlide, StandingsSlideTeam } from './types';

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
  ':': [[0,0,0],[0,1,0],[0,0,0],[0,1,0],[0,0,0]],
  '/': [[0,0,1],[0,0,1],[0,1,0],[1,0,0],[1,0,0]],
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

  renderStatus(line1: string, line2?: string): FrameBuffer {
    this.frameBuffer.clear();
    const w1 = this.textWidth(line1);
    const x1 = Math.floor((this.config.display.width - w1) / 2);
    const y1 = line2
      ? Math.floor((this.config.display.height - 12) / 2)
      : Math.floor((this.config.display.height - 5) / 2);
    this.drawText(line1, x1, y1, 200, 50, 50);
    if (line2) {
      const w2 = this.textWidth(line2);
      const x2 = Math.floor((this.config.display.width - w2) / 2);
      this.drawText(line2, x2, y1 + 7, 150, 150, 150);
    }
    return this.frameBuffer;
  }

  renderSlide(slide: Slide): FrameBuffer {
    switch (slide.slideType) {
      case SlideType.STANDINGS:
        return this.renderStandingsSlide(slide);
      case SlideType.LAST_GAME:
        return this.renderLastGameSlide(slide);
      case SlideType.NEXT_GAME:
        return this.renderNextGameSlide(slide);
      default:
        console.warn(`Unknown slide type: ${(slide as any).slideType}`);
        return this.renderStatus('UNKNOWN', 'SLIDE');
    }
  }

  private renderStandingsSlide(slide: StandingsSlide): FrameBuffer {
    this.frameBuffer.clear();

    const lineHeight = 6;
    let y = 1;

    for (const team of slide.teams.slice(0, 5)) {
      this.renderTeamLine(team, y);
      y += lineHeight;
    }

    return this.frameBuffer;
  }

  private getTeamColor(colors?: { primary: string; secondary: string }): { r: number; g: number; b: number } {
    const MIN_BRIGHTNESS = 70;
    if (!colors) return { r: 255, g: 255, b: 255 };
    const primary = parseHexColor(colors.primary);
    const secondary = parseHexColor(colors.secondary);
    if (colorBrightness(primary) >= MIN_BRIGHTNESS) return primary;
    if (colorBrightness(secondary) >= MIN_BRIGHTNESS) return secondary;
    return ensureMinBrightness(primary.r + primary.g + primary.b > 0 ? primary : secondary, MIN_BRIGHTNESS);
  }

  private renderLastGameSlide(slide: LastGameSlide): FrameBuffer {
    this.frameBuffer.clear();

    // Column layout:
    //   Team col: x=1..teamColEnd  | H col | R col | E col
    const teamColEnd = 20;
    const colW = 14;
    const col1 = teamColEnd + 1;             // H column start
    const col2 = col1 + colW;                // R column start
    const col3 = col2 + colW;                // E column start
    const tableRight = col3 + colW;          // right edge

    // Row positions (vertically centered in 32px)
    const labelY = 1;                        // "FINAL" top label
    const headerY = 8;                       // H / R / E headers
    const hLine1 = headerY + 6;             // line below header
    const awayY = hLine1 + 2;               // away team data
    const hLine2 = awayY + 6;               // line between teams
    const homeY = hLine2 + 2;               // home team data

    const gridColor = { r: 60, g: 60, b: 60 };
    const headerColor = { r: 120, g: 120, b: 120 };

    // Top row: game date (left) and FINAL (right)
    const dateStr = this.formatGameDate(slide.gameDate);
    this.drawText(dateStr, 1, labelY, 120, 120, 120);
    const finalLabel = 'FINAL';
    const finalW = this.textWidth(finalLabel);
    this.drawText(finalLabel, tableRight - finalW, labelY, 80, 80, 80);

    // Column headers (H, R, E)
    this.drawTextCentered('H', col1, col1 + colW, headerY, headerColor.r, headerColor.g, headerColor.b);
    this.drawTextCentered('R', col2, col2 + colW, headerY, headerColor.r, headerColor.g, headerColor.b);
    this.drawTextCentered('E', col3, col3 + colW, headerY, headerColor.r, headerColor.g, headerColor.b);

    // Horizontal line below header
    this.drawHLine(1, tableRight - 1, hLine1, gridColor.r, gridColor.g, gridColor.b);

    // Away team row
    const awayColor = this.getTeamColor(slide.awayTeam.colors);
    this.drawText(slide.awayTeam.abbreviation, 1, awayY, awayColor.r, awayColor.g, awayColor.b);
    this.drawTextCentered(`${slide.awayTeam.hits}`, col1, col1 + colW, awayY, 255, 255, 255);
    this.drawTextCentered(`${slide.awayTeam.runs}`, col2, col2 + colW, awayY, 255, 255, 255);
    this.drawTextCentered(`${slide.awayTeam.errors}`, col3, col3 + colW, awayY, 255, 255, 255);

    // Horizontal line between away and home
    this.drawHLine(1, tableRight - 1, hLine2, gridColor.r, gridColor.g, gridColor.b);

    // Home team row
    const homeColor = this.getTeamColor(slide.homeTeam.colors);
    this.drawText(slide.homeTeam.abbreviation, 1, homeY, homeColor.r, homeColor.g, homeColor.b);
    this.drawTextCentered(`${slide.homeTeam.hits}`, col1, col1 + colW, homeY, 255, 255, 255);
    this.drawTextCentered(`${slide.homeTeam.runs}`, col2, col2 + colW, homeY, 255, 255, 255);
    this.drawTextCentered(`${slide.homeTeam.errors}`, col3, col3 + colW, homeY, 255, 255, 255);

    // Vertical grid lines spanning header through home row
    const vTop = headerY - 1;
    const vBottom = homeY + 5;
    this.drawVLine(col1 - 1, vTop, vBottom, gridColor.r, gridColor.g, gridColor.b);
    this.drawVLine(col2 - 1, vTop, vBottom, gridColor.r, gridColor.g, gridColor.b);
    this.drawVLine(col3 - 1, vTop, vBottom, gridColor.r, gridColor.g, gridColor.b);

    return this.frameBuffer;
  }

  private drawHLine(x1: number, x2: number, y: number, r: number, g: number, b: number): void {
    for (let x = x1; x <= x2; x++) {
      this.frameBuffer.setPixel(x, y, r, g, b);
    }
  }

  private drawVLine(x: number, y1: number, y2: number, r: number, g: number, b: number): void {
    for (let y = y1; y <= y2; y++) {
      this.frameBuffer.setPixel(x, y, r, g, b);
    }
  }

  private drawTextCentered(text: string, colStart: number, colEnd: number, y: number, r: number, g: number, b: number): void {
    const tw = this.textWidth(text);
    const x = colStart + Math.floor((colEnd - colStart - tw) / 2);
    this.drawText(text, x, y, r, g, b);
  }

  private renderNextGameSlide(slide: NextGameSlide): FrameBuffer {
    this.frameBuffer.clear();
    const w = this.config.display.width;

    // Row 1 (y=1): "CIN NEXT"
    const teamColor = this.getTeamColor(slide.team.colors);
    let x = 1;
    x = this.drawText(slide.team.abbreviation, x, 1, teamColor.r, teamColor.g, teamColor.b);
    x += 2;
    this.drawText('NEXT', x, 1, 100, 100, 100);

    // Row 2 (y=8): "AT LAD" or "VS LAD"
    const prefix = slide.isHome ? 'VS' : 'AT';
    const oppColor = this.getTeamColor(slide.opponent.colors);
    let x2 = 1;
    x2 = this.drawText(prefix, x2, 8, 150, 150, 150);
    x2 += 2;
    this.drawText(slide.opponent.abbreviation, x2, 8, oppColor.r, oppColor.g, oppColor.b);

    // Row 3 (y=16): Time in sign's timezone
    const timeStr = this.formatGameTime(slide.gameDate);
    const timeW = this.textWidth(timeStr);
    this.drawText(timeStr, Math.floor((w - timeW) / 2), 16, 200, 200, 200);

    // Row 4 (y=24): Date (M/D)
    const dateStr = this.formatGameDate(slide.gameDate);
    const dateW = this.textWidth(dateStr);
    this.drawText(dateStr, Math.floor((w - dateW) / 2), 24, 150, 150, 150);

    return this.frameBuffer;
  }

  private formatGameTime(isoDate: string): string {
    const tz = this.config.schedule.timezone || 'America/Denver';
    const date = new Date(isoDate);
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).formatToParts(date);

    let hour = '';
    let minute = '';
    let dayPeriod = '';
    for (const p of parts) {
      if (p.type === 'hour') hour = p.value;
      if (p.type === 'minute') minute = p.value;
      if (p.type === 'dayPeriod') dayPeriod = p.value.toUpperCase();
    }

    const tzAbbr = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: tz,
    }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value || '';

    return `${hour}:${minute} ${dayPeriod}${tzAbbr ? ' ' + tzAbbr : ''}`;
  }

  private formatGameDate(isoDate: string): string {
    const tz = this.config.schedule.timezone || 'America/Denver';
    const date = new Date(isoDate);
    const parts = new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      timeZone: tz,
    }).formatToParts(date);

    let month = '';
    let day = '';
    for (const p of parts) {
      if (p.type === 'month') month = p.value;
      if (p.type === 'day') day = p.value;
    }
    return `${month}/${day}`;
  }

  private renderTeamLine(team: StandingsSlideTeam, y: number): void {
    const rankStr = `${team.rank}`;
    const abbr = team.abbreviation.toUpperCase();
    const record = `${team.wins}-${team.losses}`;

    const abbrColor = this.getTeamColor(team.colors);


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
