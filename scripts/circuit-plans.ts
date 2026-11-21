import { Game } from '../src/models/Game';
import { EmitterMode, MirrorOrientation } from '../src/types/elements';
export type Edit = [number,number,'/'|'\\'|'P'|'N'];
export const circuitPlans: Record<string, Edit[][]> = {
  'ch5-01': [[[4,5,'/']],[]],
  'ch5-02': [[[2,5,'\\'],[8,5,'\\']]],
  'ch5-03': [[],[]],
  'ch5-04': [[[4,5,'/'],[1,9,'P']],[],[],[]],
  'ch5-05': [[[5,4,'/'],[0,9,'/']]],
  'ch5-06': [[[5,5,'/']],[[5,5,'\\']]],
  'ch6-01': [[[6,5,'/']],[],[[6,5,'\\'],[2,10,'P']],[],[[6,5,'/']],[],[]],
  'ch6-02': [[[6,5,'\\'],[6,1,'P'],[10,10,'P']],[],[],[[6,5,'/'],[6,1,'N']],[],[]],
  'ch6-03': [[[2,5,'\\'],[11,5,'\\'],[11,10,'/'],[6,13,'P']],[],[],[]],
  'ch6-04': [[[6,5,'/'],[11,17,'\\'],[6,17,'P']],[],[],[],[]],
  'ch6-05': [[[6,5,'\\'],[2,13,'/'],[6,1,'P'],[10,13,'P']],[],[],[[6,1,'N']],[],[[6,5,'/']]],
  'ch6-06': [[[7,5,'/'],[11,17,'/']],[],[[7,5,'\\'],[2,12,'P']],[],[[7,5,'/']],[],[],[],[],[]],
};
export function applyEdits(game:Game, edits:Edit[]):void {
  for(const [row,col,value] of edits) {
    if(value==='/' || value==='\\') {
      const m=game.mirrors.find(m=>m.coord.row===row && m.coord.col===col);
      if(!m) throw Error(`Missing mirror ${row},${col}`);
      const desired=value==='/'?MirrorOrientation.SLASH:MirrorOrientation.BACKSLASH;
      if(m.orientation!==desired) game.rotateMirror(m.coord);
    } else {
      const e=game.emitters.find(e=>e.coord.row===row && e.coord.col===col);
      if(!e) throw Error(`Missing emitter ${row},${col}`);
      const desired=value==='P'?EmitterMode.POWER:EmitterMode.NORMAL;
      if(e.mode!==desired) game.toggleEmitterMode(e.coord);
    }
  }
}
