import assert from 'node:assert/strict';
import { allLevels } from '../src/levels/data/levels';
import { Game } from '../src/models/Game';
import { EmitterMode, MirrorOrientation } from '../src/types/elements';
import { isLevelData } from '../src/workshop/Schema';
import { solveLevel } from '../src/workshop/Solver';
import { encodeLevel, decodeLevel } from '../src/workshop/ShareCodec';
import { CellType } from '../src/types';
import { writeFileSync } from 'node:fs';

const power = new Game(allLevels.find(l => l.id === 'ch1-05')!);
power.toggleEmitterMode(power.emitters[0].coord);
assert.equal(power.emitters[0].mode, EmitterMode.POWER);
const before = power.snapshot();
assert.deepEqual(power.preview(), []);
assert.equal(power.snapshot(), before, 'preview must not mutate live state');
power.fire(); assert.equal(power.emitters[0].receivedCharge, 1);
power.fire(); assert.equal(power.emitters[0].receivedCharge, 2);
const charged = power.snapshot();
assert.ok(power.preview().some(r => r.destroyedObstacles.length > 0));
assert.equal(power.snapshot(), charged);
power.fire(); assert.equal(power.result, 'WIN');
assert.equal(power.emitters[0].receivedCharge, 0);
power.undo(); assert.equal(power.snapshot(), charged, 'undo restores complete turn');
assert.equal(power.grid.getCellType(power.obstacles[0].coord), CellType.REINFORCED_OBSTACLE);
power.reset(); assert.equal(power.canUndo, false); assert.equal(power.emitters[0].mode, EmitterMode.NORMAL);

const first = new Game(allLevels[0]);
const segments = first.fire()[0].segments;
assert.equal(segments[0].start.col, 1);
for (let i = 1; i < segments.length; i++) assert.deepEqual(segments[i].start, segments[i - 1].end, 'laser path must be continuous');
assert.equal(first.result, 'WIN'); first.undo(); assert.equal(first.result, null); assert.equal(first.obstacles[0].destroyed, false);
const mirrorGame = new Game(allLevels[2]); const original = mirrorGame.snapshot();
mirrorGame.rotateMirror(mirrorGame.mirrors[0].coord); mirrorGame.undo(); assert.equal(mirrorGame.snapshot(), original);
const lost = new Game({...allLevels[4], maxTurns:1}); lost.fire(); assert.equal(lost.result, 'LOSE'); lost.undo(); assert.equal(lost.result, null);

assert.equal(solveLevel(allLevels[4]), 'solvable', 'solver must accumulate charge');
assert.equal(solveLevel({...allLevels[4],maxTurns:2,par:2}), 'unsolvable');
assert.equal(solveLevel(allLevels[4],0), 'unknown', 'budget exhaustion is not proof of impossibility');
assert.deepEqual(decodeLevel(encodeLevel(allLevels[0])), allLevels[0]);
assert.equal(decodeLevel(encodeLevel({...allLevels[0],gridWidth:1e9})), null);
assert.equal(decodeLevel(encodeLevel({...allLevels[0],elements:[...allLevels[0].elements,allLevels[0].elements[0]]})), null);
assert.equal(decodeLevel('not a level'),null);

const solutions: Record<string, number[]> = {};
for (const level of allLevels) {
  assert.ok(isLevelData(level), `${level.id}: invalid or overlapping elements`);
  const game = new Game(level);
  const mirrorCount = game.mirrors.filter(m => m.rotatable).length;
  const choices = mirrorCount + game.emitters.length;
  const actions: number[] = [];
  const trial = new Game(level);
  while (!game.result) {
    let bestScore = -Infinity; let bestMask = 0;
    const snapshot = game.snapshot();
    for(let mask = 0; mask < 2 ** choices; mask++) {
      trial.restore(snapshot);
      apply(trial, mask);
      trial.fire(false);
      const score = trial.obstacles.filter(o => o.destroyed).length * 100 + trial.emitters.reduce((s,e)=>s+e.receivedCharge,0);
      if(score > bestScore) { bestScore = score; bestMask = mask; }
    }
    apply(game,bestMask); game.fire(); actions.push(bestMask);
  }
  assert.equal(game.result, 'WIN', `${level.id}: no winning replay within turn limit`);
  assert.ok(actions.length <= level.par, `${level.id}: three stars must be achievable`);
  solutions[level.id] = actions;
  console.log(`${level.id}: WIN in ${game.turnState.turnCount} turns (par ${level.par})`);
}
function apply(game: Game, mask: number) {
  const mirrors = game.mirrors.filter(m => m.rotatable);
  mirrors.forEach((m,i) => m.orientation = mask & (1<<i) ? MirrorOrientation.SLASH : MirrorOrientation.BACKSLASH);
  game.emitters.forEach((e,i) => e.mode = mask & (1<<(i+mirrors.length)) ? EmitterMode.POWER : EmitterMode.NORMAL);
}
writeFileSync('.checks/solutions.json', JSON.stringify(solutions,null,2));
console.log('PASS: all 30 levels have replayable wins; charging, preview, undo, laser continuity, solver and import checks passed.');
