import { Coord } from './grid';

export type Screen = 'MENU' | 'LEVEL_SELECT' | 'PLAYING' | 'RESULT' | 'WORKSHOP' | 'EDITOR';

export type GamePhase = 'IDLE' | 'CHARGING' | 'DISCHARGING' | 'FIRING' | 'RESOLVING' | 'ANIMATING';

export type GameResult = 'WIN' | 'LOSE' | null;

export interface LaserSegment {
  start: Coord;
  end: Coord;
}

export interface LaserTraceResult {
  segments: LaserSegment[];
  destroyedObstacles: string[];
  emitterId: string;
  type: 'normal' | 'power';
}

export interface LevelRecord {
  levelId: string;
  bestScore: number;
  bestStars: number;
  bestTurns: number;
  clearCount: number;
  firstClearedAt: number;
  lastClearedAt: number;
}

export interface WorkshopStorage {
  version: 1;
  levels: Record<string, import('./level').CustomLevelData>;
  metadata: {
    totalLevels: number;
    lastModified: number;
  };
}
