import { Coord, Direction } from './grid';
import { EmitterMode, MirrorOrientation, ObstacleType } from './elements';

export type ElementPlacement =
  | { type: 'battery'; coord: Coord; capacity: number }
  | { type: 'emitter'; coord: Coord; facing: Direction; initialMode: EmitterMode }
  | { type: 'mirror'; coord: Coord; orientation: MirrorOrientation; rotatable: boolean }
  | { type: 'obstacle'; coord: Coord; obstacleType: ObstacleType }
  | { type: 'wall'; coord: Coord };

export interface LevelData {
  id: string;
  name: string;
  chapter: number;
  order: number;
  gridWidth: number;
  gridHeight: number;
  maxTurns: number;
  par: number;
  elements: ElementPlacement[];
  hint?: string;
}

export interface CustomLevelData extends LevelData {
  author: string;
  createdAt: number;
  updatedAt: number;
  playCount: number;
  clearCount: number;
  rating: number;
  tags: string[];
}
