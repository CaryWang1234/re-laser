import { allLevels } from '../src/levels/data/levels';
import { Game } from '../src/models/Game';
import { EmitterMode, MirrorOrientation } from '../src/types/elements';
import { coordKey } from '../src/types';
for (const level of allLevels) {
  const seen = new Set<string>();
  const duplicates = level.elements.filter(e => { const key = coordKey(e.coord); if(seen.has(key)) return true; seen.add(key); return false; });
  const reached = new Set<string>();
  const game = new Game(level);
  const count = game.mirrors.filter(m => m.rotatable).length;
  for(let mask = 0; mask < 2 ** count; mask++) {
    const g = new Game(level);
    g.mirrors.filter(m => m.rotatable).forEach((m,i) => m.orientation = mask & (1 << i) ? MirrorOrientation.SLASH : MirrorOrientation.BACKSLASH);
    g.emitters.forEach(e => { e.mode = EmitterMode.POWER; e.receivedCharge = 3; });
    g.fire(); g.obstacles.filter(o => o.destroyed).forEach(o => reached.add(coordKey(o.coord)));
  }
  const unreachable = game.obstacles.filter(o => !reached.has(coordKey(o.coord))).map(o => coordKey(o.coord));
  if(unreachable.length || duplicates.length) console.log(level.id, 'unreachable', unreachable.join(';'), 'duplicates', duplicates.map(e=>coordKey(e.coord)).join(';'));
}
