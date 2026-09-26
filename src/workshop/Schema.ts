import { LevelData } from '../types/level';
import { Direction } from '../types/grid';
import { EmitterMode, MirrorOrientation, ObstacleType } from '../types/elements';

export function isLevelData(value: unknown): value is LevelData {
  if (!value || typeof value !== 'object') return false;
  const d = value as LevelData;
  const int = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  if (typeof d.id !== 'string' || !d.id || d.id.length > 120 || typeof d.name !== 'string' || d.name.length > 120) return false;
  if (!int(d.gridWidth, 2, 20) || !int(d.gridHeight, 2, 20) || !int(d.maxTurns, 1, 100) || !int(d.par, 1, d.maxTurns)) return false;
  if (!int(d.chapter, 0, 100) || !int(d.order, 0, 100) || (d.hint !== undefined && (typeof d.hint !== 'string' || d.hint.length > 500))) return false;
  if (!Array.isArray(d.elements) || d.elements.length > d.gridWidth * d.gridHeight) return false;
  const occupied = new Set<string>();
  for (const e of d.elements) {
    if (!e || !e.coord || !int(e.coord.row, 0, d.gridHeight - 1) || !int(e.coord.col, 0, d.gridWidth - 1)) return false;
    const key = `${e.coord.row},${e.coord.col}`;
    if (occupied.has(key)) return false;
    occupied.add(key);
    switch (e.type) {
      case 'battery': if (!int(e.capacity, 1, 100)) return false; break;
      case 'emitter': if (!Object.values(Direction).includes(e.facing) || !Object.values(EmitterMode).includes(e.initialMode)) return false; break;
      case 'mirror': if (!Object.values(MirrorOrientation).includes(e.orientation) || typeof e.rotatable !== 'boolean') return false; break;
      case 'obstacle': if (!Object.values(ObstacleType).includes(e.obstacleType)) return false; break;
      case 'wall': break;
      default: return false;
    }
  }
  return ['battery', 'emitter', 'obstacle'].every(type => d.elements.some(e => e.type === type));
}
