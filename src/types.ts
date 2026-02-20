/**
 * Slide types that can be displayed on a sign
 */
export enum SlideType {
  LAST_GAME = 'lastGame',
  NEXT_GAME = 'nextGame',
  STANDINGS = 'standings',
}

/**
 * Team data displayed on a standings slide
 */
export interface StandingsSlideTeam {
  abbreviation: string;
  colors?: { primary: string; secondary: string };
  gamesBack: string;
  losses: number;
  name: string;
  rank: number;
  wins: number;
}

/**
 * A standings slide showing one division's teams
 */
export interface StandingsSlide {
  slideType: SlideType.STANDINGS;
  teams: StandingsSlideTeam[];
  title: string;
}

/**
 * Team data for a box score (last game) slide
 */
export interface BoxScoreTeam {
  abbreviation: string;
  colors?: { primary: string; secondary: string };
  errors: number;
  hits: number;
  name: string;
  runs: number;
}

/**
 * A last game slide showing a completed game's box score
 */
export interface LastGameSlide {
  awayTeam: BoxScoreTeam;
  gameDate: string;
  homeTeam: BoxScoreTeam;
  slideType: SlideType.LAST_GAME;
}

/**
 * A next game slide showing an upcoming game preview
 */
export interface NextGameSlide {
  gameDate: string;
  isHome: boolean;
  opponent: {
    abbreviation: string;
    colors?: { primary: string; secondary: string };
    name: string;
  };
  slideType: SlideType.NEXT_GAME;
  team: {
    abbreviation: string;
    colors?: { primary: string; secondary: string };
    name: string;
  };
  venue: string;
}

/**
 * Union of all possible slide types
 */
export type Slide = StandingsSlide | LastGameSlide | NextGameSlide;

/**
 * Response from the /api/external/sign/slides endpoint
 */
export interface SlidesResponse {
  generatedAt: string;
  slides: Slide[];
}

/**
 * Response from the /api/external/sign/config endpoint (v2)
 */
export interface SignExternalConfigResponse {
  payloadVersion: number;
  config: {
    display: {
      brightness: number;
      rotationIntervalSeconds: number;
    };
    schedule: {
      enabled: boolean;
      onTime: string;
      offTime: string;
      timezone: string;
    };
    content: {
      standingsDivisions: string[];
      lastGameTeamIds: string[];
      nextGameTeamIds: string[];
    };
  };
}

/**
 * Cached slides for offline fallback
 */
export interface SlidesCache {
  timestamp: string;
  slides: Slide[];
}
