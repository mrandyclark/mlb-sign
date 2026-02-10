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
    const url = `${this.config.api.baseUrl}/standings`;
    
    console.log(`Fetching standings from ${url}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.api.timeoutSeconds * 1000);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return this.parseStandings(data);
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
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
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
