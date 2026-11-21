import { Game } from '../models/Game';
import { Coord, coordKey } from '../types';
export function deviceInfo(game:Game, coord:Coord):string {
  const key=coordKey(coord);
  const device=game.levelData.elements.find(e=>coordKey(e.coord)===key);
  if(!device) return '空白格。滚轮或 + / − 缩放，拖动棋盘平移。';
  switch(device.type) {
    case 'converter': {const c=game.converters.find(c=>coordKey(c.coord)===key)!;return `转电器：储能 ${c.currentCharge}/${c.capacity}。吸收普通光 +1、强光 +3，下回合通过相连导线供电。`;}
    case 'splitter': return '散射器：光束向前、向左、向右分成三路，强度不变。';
    case 'sensor': {const s=game.sensors.find(s=>coordKey(s.coord)===key)!;return `${device.channel} ${device.latched?'记忆':'瞬时'}传感器：${s.active?'已激活':'未激活'}。${device.latched?'激活后永久保持。':'每回合需重新照亮。'}同字母传感器全部激活，下一回合才开启光闸。`;}
    case 'gate': return `${device.inverted?'反相':'自动'}开关 ${device.channel}：${device.inverted?'上一回合对应信号未全部激活时开启。':'上一回合所有同字母传感器激活时开启。'}${game.gates.find(g=>coordKey(g.coord)===key)?.open?'本回合已开。':'本回合关闭。'}`;
    case 'wire': return '导线：连接电池、转电器与发射器，沿上下左右传电，光束可以穿过。';
    case 'portal': return `传送门 ${device.channel}：光从另一扇同字母门离开，方向与强度保持不变。`;
    case 'diode': return '单向光阀：仅允许箭头所指方向的光穿过，其他方向被阻挡。';
    case 'mirror': return '固定镜面：不能旋转，请调整其他光路。';
    case 'battery': return '电池：每回合产生 1 点能量，沿相连电池和导线供给发射器。';
    case 'obstacle': return device.obstacleType==='REINFORCED'?'装甲目标：需要强激光。':'普通目标：任意激光均可击穿。';
    case 'wall': return '墙壁：阻挡所有激光，也不能传电。';
    default:return '';
  }
}
