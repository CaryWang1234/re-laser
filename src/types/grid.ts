export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export interface Coord {
  row: number;
  col: number;
}

export enum CellType {
  EMPTY = 'EMPTY',
  WALL = 'WALL',
  BATTERY = 'BATTERY',
  EMITTER = 'EMITTER',
  MIRROR = 'MIRROR',
  FIXED_MIRROR = 'FIXED_MIRROR',
  OBSTACLE = 'OBSTACLE',
  REINFORCED_OBSTACLE = 'REINFORCED_OBSTACLE',
  WIRE = 'WIRE',
  CONVERTER = 'CONVERTER',
  SPLITTER = 'SPLITTER',
  SENSOR = 'SENSOR',
  GATE = 'GATE',
  PORTAL = 'PORTAL',
  DIODE = 'DIODE',
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function coordKey(c: Coord): string {
  return `${c.row},${c.col}`;
}

export function getNeighbor(coord: Coord, dir: Direction): Coord {
  switch (dir) {
    case Direction.UP: return { row: coord.row - 1, col: coord.col };
    case Direction.DOWN: return { row: coord.row + 1, col: coord.col };
    case Direction.LEFT: return { row: coord.row, col: coord.col - 1 };
    case Direction.RIGHT: return { row: coord.row, col: coord.col + 1 };
  }
}

export function getOpposite(dir: Direction): Direction {
  switch (dir) {
    case Direction.UP: return Direction.DOWN;
    case Direction.DOWN: return Direction.UP;
    case Direction.LEFT: return Direction.RIGHT;
    case Direction.RIGHT: return Direction.LEFT;
  }
}

export const ALL_DIRECTIONS: Direction[] = [
  Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT,
];
