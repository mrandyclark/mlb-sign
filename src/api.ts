/**
 * API client for fetching sign slides.
 * Connects to user's custom API endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from './config';
import { SignExternalConfigResponse, Slide, SlidesCache, SlidesResponse } from './types';

export class MLBAPIClient {
  private config: Config;
  private lastFetch: Date | null = null;
  private cachedSlides: Slide[] | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  async getSlides(forceRefresh = false): Promise<Slide[]> {
    if (!forceRefresh && this.isCacheValid()) {
      console.log('Using in-memory cached slides');
      return this.cachedSlides!;
    }

    try {
      const slides = await this.fetchSlides();
      this.cachedSlides = slides;
      this.lastFetch = new Date();
      this.saveCache(slides);
      return slides;
    } catch (error) {
      console.warn('Failed to fetch from API:', error);
      return this.loadFromCache();
    }
  }

  private isCacheValid(): boolean {
    if (!this.cachedSlides || !this.lastFetch) {
      return false;
    }

    const elapsed = (Date.now() - this.lastFetch.getTime()) / 1000;
    return elapsed < this.config.api.refreshIntervalSeconds;
  }

  private async fetchSlides(): Promise<Slide[]> {
    let url = `${this.config.api.baseUrl}/sign/slides`;
    if (this.config.api.date) {
      url += `?date=${this.config.api.date}`;
    }

    const timeoutMs = this.config.api.timeoutSeconds * 1000;
    console.log(`Fetching slides from ${url}`);
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as SlidesResponse;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Slides fetched (${elapsed}s) — ${data.slides.length} slides, generated ${data.generatedAt}`);
      return data.slides;
    } catch (error: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Fetch failed after ${elapsed}s: ${error.message}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.config.api.apiKey) {
      headers['X-API-Key'] = this.config.api.apiKey;
    }
    if (this.config.signId) {
      headers['X-Sign-Id'] = this.config.signId;
    }
    return headers;
  }

  /**
   * Fetch sign-specific configuration from the API.
   * Returns null if the endpoint is unavailable or the sign has no config.
   */
  async fetchSignConfig(): Promise<SignExternalConfigResponse | null> {
    const url = `${this.config.api.baseUrl}/sign/config`;
    console.log(`Fetching sign config from ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.api.timeoutSeconds * 1000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        console.warn(`Sign config not available (${response.status})`);
        return null;
      }

      const data = await response.json() as SignExternalConfigResponse;
      console.log('Sign config received');
      return data;
    } catch (error: any) {
      console.warn(`Failed to fetch sign config: ${error.message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private saveCache(slides: Slide[]): void {
    try {
      const cacheData: SlidesCache = {
        timestamp: new Date().toISOString(),
        slides,
      };

      const cachePath = path.resolve(this.config.cacheFile);
      const tmpPath = cachePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2), { mode: 0o666 });
      fs.renameSync(tmpPath, cachePath);
      console.log(`Saved slides cache to ${cachePath}`);
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  }

  private loadFromCache(): Slide[] {
    const cachePath = path.resolve(this.config.cacheFile);

    if (!fs.existsSync(cachePath)) {
      console.warn('No cache file available');
      return [];
    }

    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      const cacheData: SlidesCache = JSON.parse(content);
      console.log(`Loaded slides from cache (timestamp: ${cacheData.timestamp})`);
      return cacheData.slides;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return [];
    }
  }
}
