import { Coord, Direction } from './grid';

export interface BatteryData {
  id: string;
  coord: Coord;
  capacity: number;
  currentCharge: number;
}

export enum EmitterMode {
  NORMAL = 'NORMAL',
  POWER = 'POWER',
}

export interface EmitterData {
  id: string;
  coord: Coord;
  mode: EmitterMode;
  facing: Direction;
  receivedCharge: number;
  hasFired: boolean;
}

export enum MirrorOrientation {
  SLASH = '/',
  BACKSLASH = '\\',
}

export interface MirrorData {
  id: string;
  coord: Coord;
  orientation: MirrorOrientation;
  rotatable: boolean;
}

export enum ObstacleType {
  NORMAL = 'NORMAL',
  REINFORCED = 'REINFORCED',
}

export interface ObstacleData {
  id: string;
  coord: Coord;
  type: ObstacleType;
  destroyed: boolean;
}

export interface WallData {
  coord: Coord;
}

export type GameElement =
  | { kind: 'battery'; data: BatteryData }
  | { kind: 'emitter'; data: EmitterData }
  | { kind: 'mirror'; data: MirrorData }
  | { kind: 'obstacle'; data: ObstacleData }
  | { kind: 'wall'; data: WallData };
