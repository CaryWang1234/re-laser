import { LevelData, ElementPlacement as E } from '../../types/level';
import { Direction as D } from '../../types/grid';
import { EmitterMode as Mode, MirrorOrientation as M, ObstacleType as O } from '../../types/elements';
const at = (row:number,col:number) => ({row,col});
const battery = (r:number,c:number):E => ({type:'battery',coord:at(r,c),capacity:12});
const emitter = (r:number,c:number,facing=D.RIGHT):E => ({type:'emitter',coord:at(r,c),facing,initialMode:Mode.NORMAL});
const mirror = (r:number,c:number,orientation=M.BACKSLASH):E => ({type:'mirror',coord:at(r,c),orientation,rotatable:true});
const converter = (r:number,c:number):E => ({type:'converter',coord:at(r,c),capacity:9});
const split = (r:number,c:number):E => ({type:'splitter',coord:at(r,c)});
const sensor = (r:number,c:number,channel='Z',latched=false):E => ({type:'sensor',coord:at(r,c),channel,latched});
const gate = (r:number,c:number,channel='A',inverted=false):E => ({type:'gate',coord:at(r,c),channel,inverted});
const target = (r:number,c:number,power=false):E => ({type:'obstacle',coord:at(r,c),obstacleType:power?O.REINFORCED:O.NORMAL});
const portal = (r:number,c:number,channel='P'):E => ({type:'portal',coord:at(r,c),channel});
const diode = (r:number,c:number,facing=D.RIGHT):E => ({type:'diode',coord:at(r,c),facing});
const wire = (r:number,from:number,to:number):E[] => Array.from({length:to-from+1},(_,i)=>({type:'wire',coord:at(r,from+i)}));
const walls = (...coords:number[][]):E[] => coords.map(([r,c])=>({type:'wall',coord:at(r,c)}));
const level = (chapter:number,order:number,name:string,w:number,h:number,par:number,hint:string,elements:E[]):LevelData => ({
  id:`ch${chapter}-${String(order).padStart(2,'0')}`,chapter,order,name,gridWidth:w,gridHeight:h,par,maxTurns:par+10,hint,elements,
});
export const chapter5: LevelData[] = [
  level(5,1,'光电接力',12,10,2,'ϟ 转电器吸收普通光 +1、强光 +3；下一回合沿金色导线供电。清除目标并点亮圆形传感器。',[
    battery(4,0),emitter(4,1),mirror(4,5),converter(1,5),...wire(1,6,8),emitter(1,9,D.DOWN),target(4,9),target(7,9),sensor(8,9),...walls([3,6],[4,6],[5,6],[6,6],[7,6]),
  ]),
  level(5,2,'三路同光',13,11,1,'△ 散射器保留强度，向前、向左、向右分出三路。所有瞬时传感器必须在同一回合被照亮。',[
    battery(5,0),emitter(5,1),split(5,5),mirror(2,5,M.SLASH),mirror(8,5,M.SLASH),target(5,10),sensor(5,11,'A'),target(2,3),sensor(2,1,'B'),target(8,9),sensor(8,11,'C'),...walls([3,8],[4,8],[6,8],[7,8],[9,3]),
  ]),
  level(5,3,'延迟一拍',13,10,2,'同字母传感器控制自动开关。传感器亮起后，光闸在下一回合开启。',[
    battery(4,0),emitter(4,1),split(4,4),sensor(1,4,'A'),gate(4,7,'A'),target(4,9),sensor(4,11,'Z'),diode(2,4,D.UP),...walls([2,7],[3,7],[5,7],[6,7],[7,7]),
  ]),
  level(5,4,'蓄能中继',14,10,4,'为右侧发射器持续供光，再用强力模式穿透装甲；切换模式不会丢失已蓄能量。',[
    battery(4,0),emitter(4,1),mirror(4,5),converter(1,5),...wire(1,6,8),emitter(1,9,D.DOWN),target(4,9,true),target(7,9),sensor(8,9),...walls([2,7],[3,7],[4,7],[5,7],[6,7]),
  ]),
  level(5,5,'折叠空间',14,10,1,'紫色同字母传送门成对连接，出门方向保持不变。▷ 单向光阀只允许箭头方向通过。',[
    battery(5,0),emitter(5,1),mirror(5,4),portal(2,4),portal(2,9),mirror(0,9),diode(0,10),target(0,11),sensor(0,12),...walls([0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7]),
  ]),
  level(5,6,'记忆的方向',14,12,2,'双圈传感器点亮后永久保持。先留下开门信号，再把同一束光转向另一条路线。',[
    battery(5,0),emitter(5,1),mirror(5,5),sensor(1,5,'A',true),gate(9,5,'A'),target(10,5),sensor(11,5,'Z'),...walls([4,3],[4,4],[4,6],[4,7],[7,3],[7,4],[7,6],[7,7]),
  ]),
];
export const chapter6: LevelData[] = [
  level(6,1,'双区启动协议',18,14,7,'先启动 A，再将供光切到 B 区；两个记忆信号就绪后，回到上方电路蓄积强光。',[
    battery(6,0),emitter(6,1),mirror(6,5),converter(2,5),...wire(2,6,9),emitter(2,10,D.DOWN),sensor(5,10,'A',true),gate(8,10,'B'),target(11,10,true),sensor(12,10,'Z'),converter(10,5),...wire(10,6,9),emitter(10,10),gate(10,12,'A'),sensor(10,15,'B',true),...walls([4,7],[5,7],[6,7],[7,7],[8,7],[4,13],[5,13],[6,13],[7,13]),
  ]),
  level(6,2,'同步窗口',18,14,6,'A 必须持续照亮，三路终端必须同时在线。先用强光给转电器存一批电，再切换主光路维持 A。',[
    battery(6,0),emitter(6,1),mirror(6,5),sensor(2,5,'A'),converter(10,5),...wire(10,6,9),emitter(10,10,D.UP),split(6,10),gate(6,8,'A'),sensor(6,7,'Z'),diode(6,12),target(6,14,true),sensor(6,16,'C'),sensor(2,10,'B'),...walls([4,7],[4,8],[4,9],[8,7],[8,8],[8,9],[9,13]),
  ]),
  level(6,3,'双钥逻辑',20,14,4,'同字母传感器采用全部亮起逻辑。分光驱动两把钥匙，同时给中央转电器供能。',[
    battery(6,0),emitter(6,1),split(6,5),mirror(2,5,M.SLASH),sensor(2,2,'A'),mirror(11,5,M.SLASH),mirror(11,10,M.BACKSLASH),sensor(8,10,'A'),converter(6,8),...wire(6,9,12),emitter(6,13),gate(6,15,'A'),target(6,17,true),sensor(6,18,'Z'),...walls([3,7],[4,7],[5,7],[7,7],[8,7],[9,7],[10,7],[4,15],[5,15],[7,15],[8,15]),
  ]),
  level(6,4,'远端供能站',20,14,5,'跨越传送门后仍需等待开门，再给远端供能站充电。输出端的装甲只能由强激光击破。',[
    battery(6,0),emitter(6,1),mirror(6,5),sensor(2,5,'A',true),portal(0,5),portal(10,12),gate(8,12,'A'),converter(6,12),...wire(6,13,16),emitter(6,17,D.DOWN),mirror(11,17,M.SLASH),target(11,18,true),sensor(11,19,'Z'),...walls([0,9],[1,9],[2,9],[3,9],[4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9]),
  ]),
  level(6,5,'反相时钟',20,14,6,'!A 在上一回合 A 熄灭时开门。让远端强光穿门的这一回合才点亮 A，完成终端同步。',[
    battery(6,0),emitter(6,1),mirror(6,5),sensor(2,5,'A'),converter(10,5),...wire(10,6,12),emitter(10,13,D.UP),gate(7,13,'A',true),sensor(4,13,'B',true),mirror(2,13,M.BACKSLASH),target(2,16,true),sensor(2,18,'Z'),...walls([3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[3,16],[4,16],[5,16],[6,16]),
  ]),
  level(6,6,'光电核心 · 重启',20,16,10,'A 解锁远端 B；B 放行主干；第一轮分光留下 C 的记忆；第二轮强光同步点亮两个终端。',[
    battery(7,0),emitter(7,1),mirror(7,5),converter(2,5),...wire(2,6,11),emitter(2,12,D.DOWN),sensor(5,12,'A',true),gate(8,12,'B'),split(11,12),target(14,12,true),sensor(15,12,'Z'),gate(11,9,'C'),target(11,8,true),sensor(11,7,'Y'),mirror(11,17,M.BACKSLASH),target(9,17,true),sensor(8,17,'C',true),converter(12,5),...wire(12,6,8),emitter(12,9),gate(12,11,'A'),portal(12,14),portal(4,17),sensor(4,19,'B',true),...walls([4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[5,15],[6,15],[7,15],[8,15],[9,15],[13,8],[13,9],[13,10]),
  ]),
];
