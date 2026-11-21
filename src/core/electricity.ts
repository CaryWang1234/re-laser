import { Coord, coordKey, ALL_DIRECTIONS, Direction, CellType } from '../types';
import { BatteryData, EmitterData, ConverterData } from '../types/elements';
import { Grid } from './grid';
import { RULES } from '../constants';

export function simulateElectricity(
  grid: Grid,
  batteries: BatteryData[],
  emitters: EmitterData[],
  converters: ConverterData[] = [],
): void {
  for (const e of emitters) {
    e.hasFired = false;
  }

  const emitterMap = new Map<string, EmitterData>();
  for (const e of emitters) {
    emitterMap.set(coordKey(e.coord), e);
  }

  const sources = [...batteries, ...converters];
  const batteryCoords = new Set(sources.map(b => coordKey(b.coord)));

  for (const battery of sources) {
    if (batteries.includes(battery)) battery.currentCharge = Math.min(battery.capacity, battery.currentCharge + RULES.chargePerTurn);

    const visited = new Set<string>();
    const queue: Coord[] = [battery.coord];
    visited.add(coordKey(battery.coord));

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const dir of ALL_DIRECTIONS) {
        const dr = dir === Direction.UP ? -1 : dir === Direction.DOWN ? 1 : 0;
        const dc = dir === Direction.LEFT ? -1 : dir === Direction.RIGHT ? 1 : 0;
        const neighbor: Coord = { row: current.row + dr, col: current.col + dc };
        const key = coordKey(neighbor);

        if (visited.has(key)) continue;
        visited.add(key);
        if (!grid.inBounds(neighbor)) continue;

        const cellType = grid.getCellType(neighbor);

        if (cellType === CellType.EMITTER) {
          const emitter = emitterMap.get(key);
          if (emitter && battery.currentCharge > 0) {
            emitter.receivedCharge += 1;
            battery.currentCharge -= 1;
          }
        } else if (cellType === CellType.WIRE || batteryCoords.has(key)) {
          queue.push(neighbor);
        }
      }
    }
  }
}
