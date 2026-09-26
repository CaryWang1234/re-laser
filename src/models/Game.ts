import { Coord, CellType, coordKey } from '../types';
import {
  BatteryData, EmitterData, EmitterMode,
  MirrorData, MirrorOrientation,
  ObstacleData, ObstacleType,
} from '../types/elements';
import { LevelData, ElementPlacement } from '../types/level';
import { LaserTraceResult, GameResult } from '../types/game';
import { Grid } from '../core/grid';
import { executeTurn, checkGameResult, TurnState } from '../core/turn';

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

export class Game {
  grid: Grid;
  batteries: BatteryData[] = [];
  emitters: EmitterData[] = [];
  mirrors: MirrorData[] = [];
  obstacles: ObstacleData[] = [];
  turnState: TurnState;
  laserResults: LaserTraceResult[] = [];
  result: GameResult = null;
  levelData: LevelData;
  private history: string[] = [];

  get canUndo(): boolean { return this.history.length > 0; }

  snapshot(): string {
    return JSON.stringify({ batteries: this.batteries, emitters: this.emitters,
      mirrors: this.mirrors, obstacles: this.obstacles, turnState: this.turnState,
      laserResults: this.laserResults, result: this.result });
  }

  restore(snapshot: string): void {
    const data = JSON.parse(snapshot);
    this.grid = new Grid(this.levelData.gridWidth, this.levelData.gridHeight);
    this.batteries = []; this.emitters = []; this.mirrors = []; this.obstacles = [];
    this.loadElements(this.levelData.elements);
    Object.assign(this, data);
    for (const obstacle of this.obstacles) {
      if (obstacle.destroyed) this.grid.setCellType(obstacle.coord, CellType.EMPTY);
    }
  }

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.restore(previous);
    return true;
  }

  preview(): LaserTraceResult[] {
    const copy = new Game(this.levelData);
    copy.restore(this.snapshot());
    return copy.fire(false);
  }

  constructor(level: LevelData) {
    this.levelData = level;
    this.grid = new Grid(level.gridWidth, level.gridHeight);
    this.turnState = {
      turnCount: 0,
      maxTurns: level.maxTurns,
      phase: 'PLAYER_ACTION',
    };
    this.loadElements(level.elements);
  }

  private loadElements(elements: ElementPlacement[]): void {
    for (const el of elements) {
      switch (el.type) {
        case 'battery': {
          this.batteries.push({
            id: genId('bat'), coord: el.coord, capacity: el.capacity, currentCharge: 0,
          });
          this.grid.setCellType(el.coord, CellType.BATTERY);
          break;
        }
        case 'emitter': {
          this.emitters.push({
            id: genId('emt'), coord: el.coord, mode: el.initialMode,
            facing: el.facing, receivedCharge: 0, hasFired: false,
          });
          this.grid.setCellType(el.coord, CellType.EMITTER);
          break;
        }
        case 'mirror': {
          this.mirrors.push({
            id: genId('mir'), coord: el.coord, orientation: el.orientation, rotatable: el.rotatable,
          });
          this.grid.setCellType(el.coord, el.rotatable ? CellType.MIRROR : CellType.FIXED_MIRROR);
          break;
        }
        case 'obstacle': {
          this.obstacles.push({
            id: genId('obs'), coord: el.coord, type: el.obstacleType, destroyed: false,
          });
          this.grid.setCellType(el.coord,
            el.obstacleType === ObstacleType.REINFORCED ? CellType.REINFORCED_OBSTACLE : CellType.OBSTACLE);
          break;
        }
        case 'wall': {
          this.grid.setCellType(el.coord, CellType.WALL);
          break;
        }
      }
    }
  }

  rotateMirror(coord: Coord): boolean {
    if (this.result !== null) return false;
    const mirror = this.mirrors.find(m => coordKey(m.coord) === coordKey(coord) && m.rotatable);
    if (!mirror) return false;
    this.history.push(this.snapshot());
    this.laserResults = [];
    mirror.orientation = mirror.orientation === MirrorOrientation.SLASH
      ? MirrorOrientation.BACKSLASH : MirrorOrientation.SLASH;
    return true;
  }

  toggleEmitterMode(coord: Coord): boolean {
    if (this.result !== null) return false;
    const emitter = this.emitters.find(e => coordKey(e.coord) === coordKey(coord));
    if (!emitter) return false;
    this.history.push(this.snapshot());
    this.laserResults = [];
    emitter.mode = emitter.mode === EmitterMode.NORMAL ? EmitterMode.POWER : EmitterMode.NORMAL;
    return true;
  }

  fire(recordHistory = true): LaserTraceResult[] {
    if (this.result !== null || this.turnState.phase !== 'PLAYER_ACTION') return [];

    if (recordHistory) this.history.push(this.snapshot());

    this.laserResults = executeTurn(
      this.grid, this.batteries, this.emitters, this.mirrors, this.obstacles, this.turnState,
    );

    this.result = checkGameResult(this.obstacles, this.turnState);
    this.turnState.phase = this.result === null ? 'PLAYER_ACTION' : 'DONE';

    return this.laserResults;
  }

  reset(): void {
    this.history = [];
    nextId = 1;
    this.grid = new Grid(this.levelData.gridWidth, this.levelData.gridHeight);
    this.batteries = [];
    this.emitters = [];
    this.mirrors = [];
    this.obstacles = [];
    this.laserResults = [];
    this.result = null;
    this.turnState = { turnCount: 0, maxTurns: this.levelData.maxTurns, phase: 'PLAYER_ACTION' };
    this.loadElements(this.levelData.elements);
  }

  getElementAt(coord: Coord) {
    const key = coordKey(coord);
    return (
      this.batteries.find(b => coordKey(b.coord) === key) ||
      this.emitters.find(e => coordKey(e.coord) === key) ||
      this.mirrors.find(m => coordKey(m.coord) === key) ||
      this.obstacles.find(o => coordKey(o.coord) === key) ||
      null
    );
  }
}
