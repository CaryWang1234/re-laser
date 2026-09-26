import { Game } from '../models/Game';
import { LevelData } from '../types/level';
import { EmitterMode, MirrorOrientation } from '../types/elements';

export type SolveResult = 'solvable' | 'unsolvable' | 'unknown';

/** Uses the real game rules. A budget limit is never reported as proof of failure. */
export function solveLevel(level: LevelData, maxTransitions = 30000): SolveResult {
  const initial = new Game(level);
  if (!initial.obstacles.length || !initial.emitters.length) return 'unsolvable';
  const mirrors = initial.mirrors.filter(m => m.rotatable).length;
  const choices = mirrors + initial.emitters.length;
  if (choices > 12) return 'unknown';
  const queue = [initial.snapshot()];
  const visited = new Set<string>();
  const game = new Game(level);
  const started = Date.now();
  let transitions = 0;
  for (let head = 0; head < queue.length; head++) {
    for (let mask = 0; mask < 2 ** choices; mask++) {
      if (++transitions > maxTransitions || Date.now() - started > 1200) return 'unknown';
      game.restore(queue[head]);
      game.mirrors.filter(m => m.rotatable).forEach((m, i) => {
        m.orientation = mask & (1 << i) ? MirrorOrientation.SLASH : MirrorOrientation.BACKSLASH;
      });
      game.emitters.forEach((e, i) => {
        e.mode = mask & (1 << (i + mirrors)) ? EmitterMode.POWER : EmitterMode.NORMAL;
      });
      game.fire(false);
      if (game.result === 'WIN') return 'solvable';
      if (game.result === 'LOSE') continue;
      // Mirror orientations and modes can be freely changed before the next turn.
      const key = JSON.stringify([game.obstacles.map(o => o.destroyed), game.batteries.map(b => b.currentCharge), game.emitters.map(e => e.receivedCharge)]);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(game.snapshot());
    }
  }
  return 'unsolvable';
}
