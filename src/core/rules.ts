import { ObstacleData } from '../types/elements';

export function checkWin(obstacles: ObstacleData[]): boolean {
  return obstacles.every(o => o.destroyed);
}

export function checkLose(turnCount: number, maxTurns: number, obstacles: ObstacleData[]): boolean {
  if (turnCount >= maxTurns && !checkWin(obstacles)) {
    return true;
  }
  return false;
}
