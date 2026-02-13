/**
 * Configuration management for MLB LED Sign.
 * Loads settings from a JSON config file with environment variable overrides.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ScheduleConfig {
  enabled: boolean;
  onTime: string;
  offTime: string;
  timezone: string;
}

export interface DisplayConfig {
  brightness: number;
  rotationIntervalSeconds: number;
  width: number;
  height: number;
  gpioSlowdown?: number;
}

export interface APIConfig {
  baseUrl: string;
  apiKey: string;
  refreshIntervalSeconds: number;
  timeoutSeconds: number;
  date?: string;
}

export interface Config {
  api: APIConfig;
  display: DisplayConfig;
  schedule: ScheduleConfig;
  divisions: string[];
  cacheFile: string;
}

const DEFAULT_CONFIG: Config = {
  api: {
    baseUrl: 'http://localhost:3000/api/external',
    apiKey: '',
    refreshIntervalSeconds: 3600,
    timeoutSeconds: 30,
  },
  display: {
    brightness: 50,
    rotationIntervalSeconds: 10,
    width: 64,
    height: 32,
    gpioSlowdown: 4,
  },
  schedule: {
    enabled: false,
    onTime: '07:00',
    offTime: '23:00',
    timezone: 'America/Los_Angeles',
  },
  divisions: ['AL West'],
  cacheFile: 'standings_cache.json',
};

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}

function applyEnvOverrides(config: Config): Config {
  if (process.env.MLB_SIGN_API_URL) {
    config.api.baseUrl = process.env.MLB_SIGN_API_URL;
  }
  
  if (process.env.MLB_SIGN_BRIGHTNESS) {
    config.display.brightness = parseInt(process.env.MLB_SIGN_BRIGHTNESS, 10);
  }
  
  if (process.env.MLB_SIGN_REFRESH_INTERVAL) {
    config.api.refreshIntervalSeconds = parseInt(process.env.MLB_SIGN_REFRESH_INTERVAL, 10);
  }
  
  if (process.env.MLB_SIGN_TIMEZONE) {
    config.schedule.timezone = process.env.MLB_SIGN_TIMEZONE;
  }
  
  return config;
}

export function loadConfig(configPath?: string): Config {
  const defaultPath = path.join(__dirname, '..', 'config.json');
  const filePath = configPath || defaultPath;
  
  let fileConfig: Partial<Config> = {};
  
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileConfig = JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load config from ${filePath}:`, error);
    }
  }
  
  const config = deepMerge(DEFAULT_CONFIG, fileConfig);
  return applyEnvOverrides(config);
}
