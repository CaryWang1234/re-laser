import { LevelData } from '../types/level';
import { solveLevel } from './Solver';
/** Compatibility helper: only a proven solution returns true. */
export function validateLevel(level: LevelData): boolean {
  return solveLevel(level) === 'solvable';
}
