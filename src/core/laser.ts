import { Coord, Direction, coordKey, CellType } from '../types';
import { MirrorOrientation, ObstacleType } from '../types/elements';
import { LaserSegment, LaserTraceResult } from '../types/game';
import { Grid } from './grid';
import { RULES } from '../constants';

const REFLECTION_MAP: Record<MirrorOrientation, Record<Direction, Direction>> = {
  [MirrorOrientation.SLASH]: {
    [Direction.RIGHT]: Direction.UP,
    [Direction.LEFT]: Direction.DOWN,
    [Direction.UP]: Direction.RIGHT,
    [Direction.DOWN]: Direction.LEFT,
  },
  [MirrorOrientation.BACKSLASH]: {
    [Direction.RIGHT]: Direction.DOWN,
    [Direction.LEFT]: Direction.UP,
    [Direction.UP]: Direction.LEFT,
    [Direction.DOWN]: Direction.RIGHT,
  },
};

export interface TraceContext {
  grid: Grid;
  mirrorOrientations: Map<string, MirrorOrientation>;
  obstacleTypes: Map<string, ObstacleType>;
  destroyedObstacles: Set<string>;
}

export function traceLaser(
  startCoord: Coord,
  direction: Direction,
  laserType: 'normal' | 'power',
  ctx: TraceContext,
): LaserTraceResult {
  const segments: LaserSegment[] = [];
  const destroyed: string[] = [];
  const visited = new Set<string>();

  let current = startCoord;
  let dir = direction;
  let steps = 0;

  while (steps < RULES.maxLaserSteps) {
    steps++;
    const dr = dir === Direction.UP ? -1 : dir === Direction.DOWN ? 1 : 0;
    const dc = dir === Direction.LEFT ? -1 : dir === Direction.RIGHT ? 1 : 0;
    const next: Coord = { row: current.row + dr, col: current.col + dc };
    const stateKey = `${coordKey(next)},${dir}`;

    if (visited.has(stateKey)) break;
    visited.add(stateKey);

    if (!ctx.grid.inBounds(next)) {
      segments.push({ start: current, end: next });
      break;
    }

    // Record every traversed cell, including empty space between interactions.
    segments.push({ start: current, end: next });

    const cellType = ctx.grid.getCellType(next);
    const cellKey = coordKey(next);

    switch (cellType) {
      case CellType.EMPTY:
      case CellType.BATTERY:
      case CellType.EMITTER:
        current = next;
        break;

      case CellType.WALL:
        return { segments, destroyedObstacles: destroyed, emitterId: '', type: laserType };

      case CellType.MIRROR:
      case CellType.FIXED_MIRROR: {
        const orientation = ctx.mirrorOrientations.get(cellKey);
        if (orientation) {
          dir = REFLECTION_MAP[orientation][dir];
        }
        current = next;
        break;
      }

      case CellType.OBSTACLE:
      case CellType.REINFORCED_OBSTACLE: {
        const obsType = ctx.obstacleTypes.get(cellKey);
        const isReinforced = obsType === ObstacleType.REINFORCED ||
                             cellType === CellType.REINFORCED_OBSTACLE;
        const alreadyDestroyed = ctx.destroyedObstacles.has(cellKey);

        if (alreadyDestroyed) {
          current = next;
          break;
        }

        if (laserType === 'power' || !isReinforced) {
          ctx.destroyedObstacles.add(cellKey);
          destroyed.push(cellKey);
          current = next;
        } else {
          return { segments, destroyedObstacles: destroyed, emitterId: '', type: laserType };
        }
        break;
      }

      default:
        current = next;
        break;
    }
  }

  return { segments, destroyedObstacles: destroyed, emitterId: '', type: laserType };
}
