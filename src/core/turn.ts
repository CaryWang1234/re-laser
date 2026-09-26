import { BatteryData, EmitterData, EmitterMode, MirrorData, MirrorOrientation, ObstacleData, ObstacleType } from '../types/elements';
import { LaserTraceResult } from '../types/game';
import { coordKey, CellType } from '../types';
import { RULES } from '../constants';
import { Grid } from './grid';
import { simulateElectricity } from './electricity';
import { traceLaser, TraceContext } from './laser';
import { checkWin, checkLose } from './rules';

export type TurnPhase = 'PLAYER_ACTION' | 'EXECUTING' | 'DONE';

export interface TurnState {
  turnCount: number;
  maxTurns: number;
  phase: TurnPhase;
}

export function executeTurn(
  grid: Grid,
  batteries: BatteryData[],
  emitters: EmitterData[],
  mirrors: MirrorData[],
  obstacles: ObstacleData[],
  turnState: TurnState,
): LaserTraceResult[] {
  simulateElectricity(grid, batteries, emitters);

  const mirrorOrientations = new Map<string, MirrorOrientation>();
  for (const m of mirrors) {
    mirrorOrientations.set(coordKey(m.coord), m.orientation);
  }

  const obstacleTypes = new Map<string, ObstacleType>();
  for (const o of obstacles) {
    obstacleTypes.set(coordKey(o.coord), o.type);
  }

  const destroyedSet = new Set<string>();
  for (const o of obstacles) {
    if (o.destroyed) destroyedSet.add(coordKey(o.coord));
  }

  const ctx: TraceContext = { grid, mirrorOrientations, obstacleTypes, destroyedObstacles: destroyedSet };

  const results: LaserTraceResult[] = [];

  for (const emitter of emitters) {
    if (emitter.receivedCharge <= 0) continue;

    const cost = emitter.mode === EmitterMode.POWER ? RULES.powerLaserCost : RULES.normalLaserCost;
    if (emitter.receivedCharge < cost) continue;

    emitter.receivedCharge -= cost;
    emitter.hasFired = true;

    const laserType = emitter.mode === EmitterMode.POWER ? 'power' : 'normal';
    const result = traceLaser(emitter.coord, emitter.facing, laserType, ctx);
    result.emitterId = emitter.id;
    results.push(result);
  }

  for (const o of obstacles) {
    if (destroyedSet.has(coordKey(o.coord))) {
      o.destroyed = true;
      grid.setCellType(o.coord, CellType.EMPTY);
    }
  }

  turnState.turnCount++;

  return results;
}

export function checkGameResult(
  obstacles: ObstacleData[],
  turnState: TurnState,
): 'WIN' | 'LOSE' | null {
  if (checkWin(obstacles)) return 'WIN';
  if (checkLose(turnState.turnCount, turnState.maxTurns, obstacles)) return 'LOSE';
  return null;
}
