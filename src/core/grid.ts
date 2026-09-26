import { Coord, CellType, ALL_DIRECTIONS, Direction } from '../types';

export class Grid {
  readonly width: number;
  readonly height: number;
  private cells: CellType[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => CellType.EMPTY)
    );
  }

  inBounds(coord: Coord): boolean {
    return coord.row >= 0 && coord.row < this.height &&
           coord.col >= 0 && coord.col < this.width;
  }

  getCellType(coord: Coord): CellType {
    if (!this.inBounds(coord)) return CellType.WALL;
    return this.cells[coord.row][coord.col];
  }

  setCellType(coord: Coord, type: CellType): void {
    if (!this.inBounds(coord)) return;
    this.cells[coord.row][coord.col] = type;
  }

  getNeighbors(coord: Coord): { coord: Coord; direction: Direction }[] {
    return ALL_DIRECTIONS
      .map(dir => ({ coord: { row: coord.row + (dir === Direction.UP ? -1 : dir === Direction.DOWN ? 1 : 0), col: coord.col + (dir === Direction.LEFT ? -1 : dir === Direction.RIGHT ? 1 : 0) }, direction: dir }))
      .filter(({ coord: c }) => this.inBounds(c));
  }

  clone(): Grid {
    const g = new Grid(this.width, this.height);
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        g.cells[r][c] = this.cells[r][c];
      }
    }
    return g;
  }
}
