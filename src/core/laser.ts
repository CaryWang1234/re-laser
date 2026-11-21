import { Coord, Direction, coordKey, CellType, getNeighbor, getOpposite, ALL_DIRECTIONS } from '../types';
import { MirrorOrientation, ObstacleType } from '../types/elements';
import { ElementPlacement } from '../types/level';
import { LaserSegment, LaserTraceResult } from '../types/game';
import { Grid } from './grid';

const REFLECTION: Record<MirrorOrientation, Record<Direction, Direction>> = {
  [MirrorOrientation.SLASH]: { UP: Direction.RIGHT, DOWN: Direction.LEFT, LEFT: Direction.DOWN, RIGHT: Direction.UP },
  [MirrorOrientation.BACKSLASH]: { UP: Direction.LEFT, DOWN: Direction.RIGHT, LEFT: Direction.UP, RIGHT: Direction.DOWN },
};
export interface TraceContext {
  grid: Grid;
  mirrorOrientations: Map<string, MirrorOrientation>;
  obstacleTypes: Map<string, ObstacleType>;
  destroyedObstacles: Set<string>;
  devices?: Map<string, ElementPlacement>;
  openGates?: Set<string>;
  converterHits?: Map<string, number>;
  litSensors?: Set<string>;
}

/** Iterative branching trace. Each cell/direction is visited once per emitter, so loops terminate. */
export function traceLaser(startCoord: Coord, direction: Direction, laserType: 'normal' | 'power', ctx: TraceContext): LaserTraceResult {
  const segments: LaserSegment[] = [];
  const destroyed: string[] = [];
  const visited = new Set<string>();
  const charged = new Set<string>();
  const beams = [{ coord: startCoord, dir: direction }];
  for (let index = 0; index < beams.length; index++) {
    let { coord: current, dir } = beams[index];
    while (true) {
      const next = getNeighbor(current, dir);
      const key = coordKey(next);
      const stateKey = `${key}:${dir}`;
      if (visited.has(stateKey)) break;
      visited.add(stateKey);
      segments.push({ start: current, end: next });
      if (!ctx.grid.inBounds(next)) break;
      const cell = ctx.grid.getCellType(next);
      const device = ctx.devices?.get(key);
      if (cell === CellType.WALL || (cell === CellType.GATE && !ctx.openGates?.has(key))) break;
      if (cell === CellType.DIODE && device?.type === 'diode' && device.facing !== dir) break;
      if (cell === CellType.CONVERTER) {
        if (!charged.has(key)) {
          charged.add(key);
          ctx.converterHits?.set(key, (ctx.converterHits.get(key) || 0) + (laserType === 'power' ? 3 : 1));
        }
        break;
      }
      if (cell === CellType.SENSOR) ctx.litSensors?.add(key);
      if (cell === CellType.PORTAL && device?.type === 'portal') {
        const partner = [...(ctx.devices?.values() || [])].find(e => e.type === 'portal' && e.channel === device.channel && coordKey(e.coord) !== key);
        if (!partner) break;
        // Teleportation preserves direction and has no fake segment across the board.
        current = partner.coord;
        continue;
      }
      if (cell === CellType.SPLITTER) {
        for (const branch of ALL_DIRECTIONS) {
          if (branch !== getOpposite(dir) && branch !== dir) beams.push({ coord: next, dir: branch });
        }
      }
      if (cell === CellType.MIRROR || cell === CellType.FIXED_MIRROR) {
        const orientation = ctx.mirrorOrientations.get(key);
        if (orientation) dir = REFLECTION[orientation][dir];
      }
      if ((cell === CellType.OBSTACLE || cell === CellType.REINFORCED_OBSTACLE) && !ctx.destroyedObstacles.has(key)) {
        const reinforced = ctx.obstacleTypes.get(key) === ObstacleType.REINFORCED || cell === CellType.REINFORCED_OBSTACLE;
        if (reinforced && laserType !== 'power') break;
        ctx.destroyedObstacles.add(key); destroyed.push(key);
      }
      current = next;
    }
  }
  return { segments, destroyedObstacles: destroyed, emitterId: '', type: laserType };
}
