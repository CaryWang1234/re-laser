import { Game } from '../models/Game';
import { CellType, Direction, coordKey } from '../types';

export function drawCircuits(ctx: CanvasRenderingContext2D, game: Game, size: number, ox: number, oy: number): void {
  const conductive = [CellType.WIRE, CellType.BATTERY, CellType.CONVERTER, CellType.EMITTER];
  for (const el of game.levelData.elements) {
    const x = ox + (el.coord.col + .5) * size, y = oy + (el.coord.row + .5) * size;
    const r = size * .32;
    ctx.save(); ctx.translate(x,y); ctx.lineWidth = Math.max(1.5,size * .045);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${Math.max(9,size*.25)}px system-ui`;
    const square = (fill: string, stroke: string) => { ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(-r,-r,r*2,r*2);ctx.strokeRect(-r,-r,r*2,r*2); };
    const label = (text: string, color: string) => {ctx.fillStyle=color;ctx.fillText(text,0,0);};
    switch (el.type) {
      case 'wire': {
        ctx.strokeStyle='#c59a4e'; ctx.lineWidth=Math.max(2,size*.07);
        for (const {coord} of game.grid.getNeighbors(el.coord)) {
          if (!conductive.includes(game.grid.getCellType(coord))) continue;
          ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo((coord.col-el.coord.col)*size/2,(coord.row-el.coord.row)*size/2);ctx.stroke();
        }
        ctx.fillStyle='#e5bf71';ctx.fillRect(-2,-2,4,4);break;
      }
      case 'converter': {
        const converter=game.converters.find(c=>coordKey(c.coord)===coordKey(el.coord));
        square('#3e3023','#ffd479'); label(`ϟ${converter?.currentCharge || 0}`,'#ffe6ad'); break;
      }
      case 'splitter':
        ctx.strokeStyle='#64deff';ctx.fillStyle='#193847';ctx.beginPath();
        ctx.moveTo(0,-r);ctx.lineTo(r,r*.8);ctx.lineTo(-r,r*.8);ctx.closePath();ctx.fill();ctx.stroke();
        label('⋔','#b4f3ff');break;
      case 'sensor': {
        const active=game.sensors.find(s=>coordKey(s.coord)===coordKey(el.coord))?.active;
        ctx.strokeStyle=active?'#8affaf':'#bd879b';ctx.fillStyle=active?'#214b39':'#342a39';
        ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
        if(el.latched){ctx.beginPath();ctx.arc(0,0,r*.8,0,Math.PI*2);ctx.stroke();}
        label(el.channel,active?'#acffca':'#e8bdcb');break;
      }
      case 'gate': {
        const open=game.gates.find(g=>coordKey(g.coord)===coordKey(el.coord))?.open;
        ctx.strokeStyle=open?'#79ead1':'#ff9778'; ctx.fillStyle=open?'#15372c':'#492b28';
        ctx.fillRect(-r,-r,r*2,r*2);ctx.strokeRect(-r,-r,r*2,r*2);
        if(!open){ctx.beginPath();ctx.moveTo(-r,-r);ctx.lineTo(r,r);ctx.moveTo(r,-r);ctx.lineTo(-r,r);ctx.stroke();}
        ctx.font=`bold ${Math.max(8,size*.2)}px system-ui`;ctx.fillStyle='#fff';ctx.fillText((el.inverted?'!':'')+el.channel,0,-r-size*.1);break;
      }
      case 'portal':
        ctx.strokeStyle='#c299ff';ctx.fillStyle='#302349';ctx.beginPath();ctx.ellipse(0,0,r*.65,r,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        label(el.channel,'#e5d2ff');break;
      case 'diode': {
        ctx.rotate(({RIGHT:0,DOWN:Math.PI/2,LEFT:Math.PI,UP:-Math.PI/2})[el.facing]);
        ctx.fillStyle='#334d59';ctx.strokeStyle='#a1d6e4';ctx.beginPath();ctx.moveTo(-r,-r);ctx.lineTo(r,0);ctx.lineTo(-r,r);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(r,-r);ctx.lineTo(r,r);ctx.stroke();break;
      }
    }
    ctx.restore();
  }
}
