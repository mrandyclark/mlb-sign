/**
 * Slide types that can be displayed on a sign
 */
export enum SlideType {
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
 * Union of all possible slide types
 * Add new slide interfaces here as they are created
 */
export type Slide = StandingsSlide;

/**
 * Response from the /api/external/sign/slides endpoint
 */
export interface SlidesResponse {
  generatedAt: string;
  slides: Slide[];
}

/**
 * Cached slides for offline fallback
 */
export interface SlidesCache {
  timestamp: string;
  slides: Slide[];
}
