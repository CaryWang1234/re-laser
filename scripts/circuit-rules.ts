import assert from 'node:assert/strict';
import { Game } from '../src/models/Game';
import { allLevels } from '../src/levels/data/levels';
import { applyEdits } from './circuit-plans';
import { isLevelData } from '../src/workshop/Schema';
import { CellType, Direction } from '../src/types';
import { Grid } from '../src/core/grid';
import { traceLaser } from '../src/core/laser';

const game = (id:string) => new Game(allLevels.find(l=>l.id===id)!);
const relay=game('ch5-01'); applyEdits(relay,[[4,5,'/']]); relay.fire();
assert.equal(relay.converters[0].currentCharge,1);
assert.equal(relay.emitters[1].hasFired,false,'conversion must not power an emitter in the same turn');
relay.fire(); assert.equal(relay.emitters[1].hasFired,true);

const delay=game('ch5-03'); delay.fire();
assert.equal(delay.sensors[0].active,true); assert.equal(delay.gates[0].open,false);
assert.equal(delay.obstacles[0].destroyed,false,'gate must not react in the illuminating turn');
delay.fire(); assert.equal(delay.result,'WIN'); assert.equal(delay.gates[0].open,true);

const memory=game('ch5-06'); applyEdits(memory,[[5,5,'/']]); memory.fire();
applyEdits(memory,[[5,5,'\\']]); memory.fire(); assert.equal(memory.sensors[0].active,true);
const pulse=game('ch5-06'); pulse.sensors[0].latched=false;
applyEdits(pulse,[[5,5,'/']]); pulse.fire(); applyEdits(pulse,[[5,5,'\\']]); pulse.fire();
assert.equal(pulse.sensors[0].active,false,'instant sensors must extinguish when not illuminated');
assert.equal(pulse.result,null,'destroyed targets alone must not win while a sensor is off');

const logic=game('ch6-03'); applyEdits(logic,[[2,5,'\\']]); logic.fire(); logic.fire();
assert.equal(logic.sensors.filter(s=>s.channel==='A'&&s.active).length,1);
assert.equal(logic.gates[0].open,false,'all same-channel sensors must be active');
const inverse=game('ch6-05'); inverse.fire(); assert.equal(inverse.gates[0].open,true);

const portal=game('ch5-05'); applyEdits(portal,[[5,4,'/'],[0,9,'/']]); portal.fire(); assert.equal(portal.result,'WIN');
const blocked=game('ch5-05'); applyEdits(blocked,[[5,4,'/'],[0,9,'/']]);
const valve=blocked.levelData.elements.map(e=>e.type==='diode'?{...e,facing:Direction.LEFT}:e);
const reversed=new Game({...blocked.levelData,elements:valve}); applyEdits(reversed,[[5,4,'/'],[0,9,'/']]); reversed.fire();
assert.equal(reversed.obstacles[0].destroyed,false,'one-way valve must stop reverse light');
assert.ok(!isLevelData({...portal.levelData,elements:portal.levelData.elements.filter(e=>!(e.type==='portal'&&e.coord.col===9))}));

const grid=new Grid(8,8);
for(const coord of [{row:2,col:2},{row:2,col:5},{row:5,col:2},{row:5,col:5}]) grid.setCellType(coord,CellType.SPLITTER);
const trace=traceLaser({row:2,col:0},Direction.RIGHT,'power',{grid,mirrorOrientations:new Map(),obstacleTypes:new Map(),destroyedObstacles:new Set()});
assert.ok(trace.segments.length<=8*8*4+32,'splitter cycles must terminate within finite cell/direction states');
console.log('PASS circuit rules: delayed conversion, delayed gates, AND/inverse logic, sensor memory, portal direction, one-way valves, splitter cycles.');
