import { BatteryData, EmitterData, EmitterMode, MirrorData, MirrorOrientation, ObstacleData, ObstacleType } from '../types/elements';
import { LaserTraceResult } from '../types/game';
import { coordKey, CellType } from '../types';
import { RULES } from '../constants';
import { Grid } from './grid';
import { simulateElectricity } from './electricity';
import { traceLaser, TraceContext } from './laser';
import { checkWin, checkLose } from './rules';
import { ConverterData, SensorData, GateData } from '../types/elements';
import { ElementPlacement } from '../types/level';

export interface CircuitState {
  converters: ConverterData[];
  sensors: SensorData[];
  gates: GateData[];
  elements: ElementPlacement[];
}

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
  circuit?: CircuitState,
): LaserTraceResult[] {
  // Signals sampled at the start of a turn; light cannot feed back in the same turn.
  for (const gate of circuit?.gates || []) {
    const sources = circuit!.sensors.filter(s => s.channel === gate.channel);
    const active = sources.length > 0 && sources.every(s => s.active);
    gate.open = gate.inverted ? !active : active;
  }
  simulateElectricity(grid, batteries, emitters, circuit?.converters);

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

  const ctx: TraceContext = { grid, mirrorOrientations, obstacleTypes, destroyedObstacles: destroyedSet,
    devices: new Map((circuit?.elements || []).map(e => [coordKey(e.coord), e])),
    openGates: new Set((circuit?.gates || []).filter(g => g.open).map(g => coordKey(g.coord))),
    converterHits: new Map(), litSensors: new Set() };

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

  for (const converter of circuit?.converters || []) {
    converter.currentCharge = Math.min(converter.capacity, converter.currentCharge + (ctx.converterHits!.get(coordKey(converter.coord)) || 0));
  }
  for (const sensor of circuit?.sensors || []) {
    sensor.active = (sensor.latched && sensor.active) || ctx.litSensors!.has(coordKey(sensor.coord));
  }
  turnState.turnCount++;

  return results;
}

export function checkGameResult(
  obstacles: ObstacleData[],
  turnState: TurnState,
  sensors: SensorData[] = [],
): 'WIN' | 'LOSE' | null {
  if ((obstacles.length > 0 || sensors.length > 0) && checkWin(obstacles) && sensors.every(s => s.active)) return 'WIN';
  if (turnState.turnCount >= turnState.maxTurns) return 'LOSE';
  return null;
}
