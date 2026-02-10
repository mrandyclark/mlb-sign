/**
 * Core data types for MLB standings.
 */

export interface TeamStanding {
  teamName: string;
  teamAbbreviation: string;
  divisionRank: number;
  wins: number;
  losses: number;
  gamesBack: string;
  divisionName: string;
  leagueName: string;
}

export interface DivisionStandings {
  divisionName: string;
  leagueName: string;
  teams: TeamStanding[];
}

export interface StandingsCache {
  timestamp: string;
  standings: DivisionStandings[];
}
