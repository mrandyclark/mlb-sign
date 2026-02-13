/**
 * API client for fetching MLB standings data.
 * Connects to user's custom API endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from './config';
import { DivisionStandings, StandingsCache, TeamStanding } from './types';

export class MLBAPIClient {
  private config: Config;
  private lastFetch: Date | null = null;
  private cachedStandings: DivisionStandings[] | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  async getStandings(forceRefresh = false): Promise<DivisionStandings[]> {
    if (!forceRefresh && this.isCacheValid()) {
      console.log('Using in-memory cached standings');
      return this.cachedStandings!;
    }

    try {
      const standings = await this.fetchFromAPI();
      this.cachedStandings = standings;
      this.lastFetch = new Date();
      this.saveCache(standings);
      return standings;
    } catch (error) {
      console.warn('Failed to fetch from API:', error);
      return this.loadFromCache();
    }
  }

  private isCacheValid(): boolean {
    if (!this.cachedStandings || !this.lastFetch) {
      return false;
    }

    const elapsed = (Date.now() - this.lastFetch.getTime()) / 1000;
    return elapsed < this.config.api.refreshIntervalSeconds;
  }

  private async fetchFromAPI(): Promise<DivisionStandings[]> {
    let url = `${this.config.api.baseUrl}/mlb-standings`;
    if (this.config.api.date) {
      url += `?date=${this.config.api.date}`;
    }

    const timeoutMs = this.config.api.timeoutSeconds * 1000;
    console.log(`Fetching standings from ${url}`);
    const startTime = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      if (this.config.api.apiKey) {
        headers['X-API-Key'] = this.config.api.apiKey;
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Standings fetched (${elapsed}s)`);
      return this.parseStandings(data);
    } catch (error: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Fetch failed after ${elapsed}s: ${error.message}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse API response into DivisionStandings.
   *
   * Expected API response format:
   * {
   *   "divisions": [
   *     {
   *       "name": "AL West",
   *       "league": "American League",
   *       "teams": [
   *         {
   *           "name": "Houston Astros",
   *           "abbreviation": "HOU",
   *           "rank": 1,
   *           "wins": 90,
   *           "losses": 72,
   *           "gamesBack": "-"
   *         }
   *       ]
   *     }
   *   ]
   * }
   */
  private parseStandings(data: any): DivisionStandings[] {
    const divisions: DivisionStandings[] = [];

    for (const div of data.divisions || []) {
      const teams: TeamStanding[] = (div.teams || []).map((team: any) => ({
        teamName: team.name,
        teamAbbreviation: team.abbreviation,
        divisionRank: team.rank,
        wins: team.wins,
        losses: team.losses,
        gamesBack: team.gamesBack || '-',
        divisionName: div.name,
        leagueName: div.league,
        colors: team.colors ? { primary: team.colors.primary, secondary: team.colors.secondary } : undefined,
      }));

      teams.sort((a, b) => a.divisionRank - b.divisionRank);

      divisions.push({
        divisionName: div.name,
        leagueName: div.league,
        teams,
      });
    }

    return divisions;
  }

  private saveCache(standings: DivisionStandings[]): void {
    try {
      const cacheData: StandingsCache = {
        timestamp: new Date().toISOString(),
        standings,
      };

      const cachePath = path.resolve(this.config.cacheFile);
      try { fs.unlinkSync(cachePath); } catch { /* file may not exist */ }
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), { mode: 0o666 });
      console.log(`Saved standings cache to ${cachePath}`);
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  }

  private loadFromCache(): DivisionStandings[] {
    const cachePath = path.resolve(this.config.cacheFile);

    if (!fs.existsSync(cachePath)) {
      console.warn('No cache file available');
      return [];
    }

    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      const cacheData: StandingsCache = JSON.parse(content);
      console.log(`Loaded standings from cache (timestamp: ${cacheData.timestamp})`);
      return cacheData.standings;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return [];
    }
  }

  getDivision(divisionName: string): DivisionStandings | undefined {
    const standings = this.cachedStandings || [];

    return standings.find(
      (div) => div.divisionName.toLowerCase().includes(divisionName.toLowerCase())
    );
  }
}
