import { COLORS } from './constants';
import { Screen, GameResult } from './types/game';
import { Direction, coordKey, CellType, Coord } from './types';
import { EmitterMode, MirrorOrientation, ObstacleType } from './types/elements';
import { LevelData, CustomLevelData, ElementPlacement } from './types/level';
import { GameState } from './state/GameState';
import { Renderer } from './renderer/Renderer';
import { allLevels, chaptersMeta } from './levels/data/levels';
import { StorageAdapter } from './workshop/StorageAdapter';
import { encodeLevel, decodeLevel, extractShareFromUrl } from './workshop/ShareCodec';
import { solveLevel } from './workshop/Solver';
import { Game } from './models/Game';
import './style.css';
import { deviceInfo } from './renderer/DeviceInfo';
import { isLevelData } from './workshop/Schema';

class App {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private state: GameState;
  private animFrame = 0;
  private uiLayer: HTMLDivElement;
  private workshop: StorageAdapter;
  private executing = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private previewEnabled = false;
  private feedback = '';
  private selected: Coord = { row: 0, col: 0 };
  private audio: AudioContext | null = null;
  private soundEnabled = true;

  // Editor state
  private editorTool: ElementPlacement['type'] | 'erase' | null = null;
  private editorElements: ElementPlacement[] = [];
  private editorChannel = 'A';
  private testingEditor = false;
  private editorGridW = 8;
  private editorGridH = 6;
  private editorMaxTurns = 10;
  private editorPar = 5;
  private editorLevelName = '';
  private editingLevelId: string | null = null;

  constructor() {
    this.state = new GameState();
    this.workshop = new StorageAdapter();

    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '激光棋盘：方向键选择，Enter 操作，空格执行，Z 撤销');
    document.getElementById('app')!.appendChild(this.canvas);

    this.uiLayer = document.createElement('div');
    this.uiLayer.id = 'ui-layer';
    this.uiLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    document.getElementById('app')!.appendChild(this.uiLayer);

    this.renderer = new Renderer(this.canvas);

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Check for share URL
    const sharedLevel = extractShareFromUrl();
    if (sharedLevel) {
      this.state.loadLevel(sharedLevel);
      this.resize();
      this.showScreen('PLAYING');
    } else {
      this.showScreen('MENU');
    }

    this.loop(performance.now());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    if (this.state.game) {
      const g = this.state.game;
      if (this.state.currentScreen === 'EDITOR') {
        const toolbar = this.uiLayer.querySelector('.editor-tools');
        this.renderer.boardTop = Math.max(130, (toolbar?.getBoundingClientRect().bottom || 90) + 48);
        this.renderer.boardBottom = 30;
      }
      this.renderer.calcGridOffset(w, h, g.grid.width, g.grid.height);
      const view = this.uiLayer.querySelector<HTMLElement>('.view-controls');
      if (view) view.style.top = (this.renderer.boardTop + 4) + 'px';
    }
  }

  private setupEvents(): void {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input,textarea,select') || this.uiLayer.querySelector('[role="dialog"]')) return;
      if (this.state.currentScreen !== 'PLAYING') return;
      const key = e.key.toLowerCase();
      if (key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); this.executeTurn(); }
      if (key === 'z' && !e.ctrlKey && !e.metaKey) this.undo();
      if (key === 'r') this.restart();
      if (key === 'p') this.togglePreview();
      if (key === 'h' || key === '?') this.showHelp();
      if (e.key === 'Escape') this.leaveGame();
      if (key === '+' || key === '=') this.renderer.zoomBy(1.25);
      if (key === '-') this.renderer.zoomBy(.8);
      if (key === '0') this.renderer.resetView();
      if (e.key.startsWith('Arrow') && this.state.game) {
        e.preventDefault();
        const grid = this.state.game.grid;
        this.selected.row = Math.max(0, Math.min(grid.height - 1, this.selected.row + (key === 'arrowdown' ? 1 : key === 'arrowup' ? -1 : 0)));
        this.selected.col = Math.max(0, Math.min(grid.width - 1, this.selected.col + (key === 'arrowright' ? 1 : key === 'arrowleft' ? -1 : 0)));
        this.renderer.selectedCell = { ...this.selected }; this.canvas.focus();
      }
      if (e.key === 'Enter' && e.target === this.canvas) { e.preventDefault(); this.interact(this.selected); }
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.state.currentScreen !== 'PLAYING' || !this.state.game) return;
      const c = this.renderer.pixelToGrid(e.offsetX, e.offsetY);
      const interactive = c && (this.state.game.mirrors.some(m => coordKey(m.coord) === coordKey(c) && m.rotatable) || this.state.game.emitters.some(m => coordKey(m.coord) === coordKey(c)));
      this.canvas.style.cursor = interactive ? 'pointer' : 'default';
    });
    this.canvas.style.touchAction = 'none';
    const pointers = new Map<number, {x:number;y:number}>();
    let start = {x:0,y:0}, last = start, moved = false, pinched = false, pinchDistance = 0;
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); this.canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { start=last={x:e.clientX,y:e.clientY}; moved=false; pinched=false; }
      else { pinched=true; const p=[...pointers.values()]; pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y); }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size===2) {
        const p=[...pointers.values()]; const distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
        if(pinchDistance>0) this.renderer.zoomBy(distance/pinchDistance); pinchDistance=distance; return;
      }
      if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>6) moved=true;
      if(moved) this.renderer.panBy(e.clientX-last.x,e.clientY-last.y);
      last={x:e.clientX,y:e.clientY};
    });
    this.canvas.addEventListener('pointerup', e => {
      if(pointers.has(e.pointerId) && !moved && !pinched) this.handleCanvasClick(e);
      pointers.delete(e.pointerId);
    });
    this.canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); moved=true; });
    this.canvas.addEventListener('wheel', e => {
      if(!['PLAYING','EDITOR'].includes(this.state.currentScreen)) return;
      e.preventDefault(); this.renderer.zoomBy(e.deltaY<0?1.15:1/1.15);
    }, {passive:false});
  }

  private handleCanvasClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (py < this.renderer.boardTop || py > window.innerHeight - this.renderer.boardBottom) return;

    if (this.state.currentScreen === 'PLAYING' && this.state.game) {
      const coord = this.renderer.pixelToGrid(px, py);
      if (!coord || !this.state.game.grid.inBounds(coord)) return;
      this.interact(coord);
    } else if (this.state.currentScreen === 'EDITOR') {
      this.handleEditorClick(px, py);
    }
  }

  private handleEditorClick(px: number, py: number): void {
    if (!this.editorTool) return;
    const coord = this.renderer.pixelToGrid(px, py);
    if (!coord || coord.row < 0 || coord.row >= this.editorGridH || coord.col < 0 || coord.col >= this.editorGridW) return;

    const key = coordKey(coord);
    const existing = this.editorElements.find(el => coordKey(el.coord) === key);
    if (existing && existing.type === this.editorTool) {
      if (existing.type === 'mirror') existing.orientation = existing.orientation === MirrorOrientation.SLASH ? MirrorOrientation.BACKSLASH : MirrorOrientation.SLASH;
      if (existing.type === 'sensor') { existing.latched=!existing.latched; existing.channel=this.editorChannel; }
      if (existing.type === 'gate') { existing.inverted=!existing.inverted; existing.channel=this.editorChannel; }
      if (existing.type === 'portal') existing.channel=this.editorChannel;
      if (existing.type === 'emitter' || existing.type === 'diode') {
        const directions = [Direction.RIGHT, Direction.DOWN, Direction.LEFT, Direction.UP];
        existing.facing = directions[(directions.indexOf(existing.facing) + 1) % 4];
      }
      if (existing.type === 'obstacle') existing.obstacleType = existing.obstacleType === ObstacleType.NORMAL ? ObstacleType.REINFORCED : ObstacleType.NORMAL;
      this.renderEditorPreview(); return;
    }
    // Remove existing element at this position
    this.editorElements = this.editorElements.filter(el => coordKey(el.coord) !== key);

    // Add new element based on tool
    switch (this.editorTool) {
      case 'converter': this.editorElements.push({type:'converter',coord,capacity:9}); break;
      case 'wire': case 'splitter': this.editorElements.push({type:this.editorTool,coord}); break;
      case 'sensor': this.editorElements.push({type:'sensor',coord,channel:this.editorChannel,latched:false}); break;
      case 'gate': this.editorElements.push({type:'gate',coord,channel:this.editorChannel,inverted:false}); break;
      case 'portal': this.editorElements.push({type:'portal',coord,channel:this.editorChannel}); break;
      case 'diode': this.editorElements.push({type:'diode',coord,facing:Direction.RIGHT}); break;
      case 'battery':
        this.editorElements.push({ type: 'battery', coord, capacity: 5 });
        break;
      case 'emitter':
        this.editorElements.push({ type: 'emitter', coord, facing: Direction.RIGHT, initialMode: EmitterMode.NORMAL });
        break;
      case 'mirror':
        this.editorElements.push({ type: 'mirror', coord, orientation: MirrorOrientation.SLASH, rotatable: true });
        break;
      case 'obstacle':
        this.editorElements.push({ type: 'obstacle', coord, obstacleType: ObstacleType.NORMAL });
        break;
      case 'wall':
        this.editorElements.push({ type: 'wall', coord });
        break;
    }

    // Re-render editor
    this.renderEditorPreview();
  }

  private renderEditorPreview(): void {
    // Create a temporary game to render the preview
    const tempLevel: LevelData = {
      id: 'editor-preview',
      name: this.editorLevelName || '编辑器预览',
      chapter: 0, order: 0,
      gridWidth: this.editorGridW,
      gridHeight: this.editorGridH,
      maxTurns: this.editorMaxTurns,
      par: this.editorPar,
      elements: this.editorElements,
    };

    this.state.game = new Game(tempLevel);
    this.renderer.boardTop=Math.max(130,(this.uiLayer.querySelector('.editor-tools')?.getBoundingClientRect().bottom || 90)+48);
    this.renderer.boardBottom=30;
    this.renderer.calcGridOffset(window.innerWidth, window.innerHeight, this.editorGridW, this.editorGridH);
    this.uiLayer.querySelector('.view-controls')?.remove(); this.viewControls();
  }

  private showScreen(screen: Screen): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null; this.executing = false;
    this.renderer.previewResults = [];
    this.state.goToScreen(screen);
    this.uiLayer.replaceChildren();

    switch (screen) {
      case 'MENU': this.renderMenu(); break;
      case 'LEVEL_SELECT': this.renderLevelSelect(); break;
      case 'PLAYING': this.renderGameUI(); break;
      case 'RESULT': this.renderResult(); break;
      case 'WORKSHOP': this.renderWorkshop(); break;
      case 'EDITOR': this.renderEditor(); break;
    }
  }

  private renderMenu(): void {
    const home = document.createElement('div'); home.className = 'home';
    home.innerHTML = `<div class="home-top"><div class="brand">RE<b>—</b>LASER / 光路实验室</div><div class="eyebrow" style="margin:0">THINK. REFLECT. SOLVE.</div></div>
      <div class="hero"><div><div class="eyebrow">一束光，无限可能</div><h1>改变方向。<br><strong>点亮答案。</strong></h1><p>将光转化为电，让信号唤醒巨构回路。<br>分光、传送、蓄能与同步，挑战 42 道谜题。</p><div class="home-actions"></div><div class="home-stats"></div></div>
      <div class="beam-art" aria-hidden="true"><svg viewBox="0 0 360 360"><defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#304453"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="5"/></filter></defs><rect width="360" height="360" rx="10" fill="url(#grid)"/><path d="M30 270H150V90H270V210" fill="none" stroke="#79ead1" stroke-width="8" filter="url(#glow)"/><path d="M30 270H150V90H270V210" fill="none" stroke="#79ead1" stroke-width="3"/><g stroke="#e8edff" stroke-width="6" stroke-linecap="round"><path d="M132 288l36-36M132 72l36 36M252 72l36 36"/></g><circle cx="30" cy="270" r="15" fill="#79ead1"/><path d="M25 263l12 7-12 7" fill="#19372f"/><rect x="251" y="191" width="38" height="38" rx="6" fill="#653d47" stroke="#ff9d96" stroke-width="2"/><path d="M262 202l16 16m0-16l-16 16" stroke="#ff9d96" stroke-width="2"/><g fill="#647991"><circle cx="30" cy="30" r="3"/><circle cx="330" cy="330" r="3"/></g></svg></div></div>
      <div class="home-footer"><span>01 / 旋转镜面，规划路线</span><span>02 / 蓄积能量，击破装甲</span><span>03 / 挑战三星，创造自己的关卡</span></div>`;
    const next = allLevels.find(l => !this.state.getBestStars(l.id)) || allLevels[0];
    const cleared = allLevels.filter(l => this.state.getBestStars(l.id) > 0).length;
    const start = this.createButton(cleared ? '继续挑战 →' : '开始第一束光 →', () => this.startLevel(next)); start.className = 'primary';
    home.querySelector('.home-actions')!.append(start, this.createButton('选择关卡', () => this.showScreen('LEVEL_SELECT')), this.createButton('玩法说明', () => this.showHelp()));
    home.querySelector('.home-stats')!.innerHTML = `<div><strong>${cleared} / ${allLevels.length}</strong>已完成关卡</div><div><strong>${allLevels.reduce((n,l) => n + this.state.getBestStars(l.id), 0)}</strong>收集星星</div><div><strong>${String(chaptersMeta.length).padStart(2,'0')}</strong>主题章节</div>`;
    home.querySelector('.home-actions')!.append(this.createButton('新：光电实验室',()=>this.startLevel(allLevels.find(l=>l.id==='ch5-01')!)),this.createButton('巨构回路挑战 →',()=>this.startLevel(allLevels.find(l=>l.id==='ch6-01')!)));
    home.querySelector('.home-footer')!.append(this.createButton('创意工坊', () => this.showScreen('WORKSHOP')), this.createButton('导入关卡', () => this.showImportDialog()));
    this.uiLayer.append(home);
  }

  private interact(coord: Coord): void {
    const game = this.state.game;
    if (!game || this.executing || game.result) return;
    this.selected = { ...coord }; this.renderer.selectedCell = { ...coord };
    if (game.rotateMirror(coord)) { this.feedback = '镜面已旋转。调整不消耗回合。'; this.playTone(460); }
    else if (game.toggleEmitterMode(coord)) {
      const em = game.emitters.find(e => coordKey(e.coord) === coordKey(coord))!;
      this.feedback = em.mode === EmitterMode.POWER ? '强力模式：蓄满 3 点能量后发射，可击破蓝色装甲。' : '普通模式：消耗 1 点能量，可连续击穿红色目标。';
      this.playTone(380);
    } else {
      this.feedback = deviceInfo(game,coord);
    }
    this.renderGameUI();
  }

  private undo(): void {
    if (this.executing || !this.state.game?.undo()) return;
    this.renderer.clearEffects(); this.feedback = '已撤销，电量和目标也已恢复。'; this.renderGameUI();
  }

  private restart(): void {
    if (this.state.currentLevel) this.startLevel(this.state.currentLevel,this.testingEditor);
  }

  private leaveGame(): void {
    if(this.testingEditor) { this.showScreen('EDITOR'); this.renderEditorPreview(); }
    else this.showScreen(this.state.currentLevel?.chapter ? 'LEVEL_SELECT' : 'WORKSHOP');
  }

  private viewControls(): void {
    const view=document.createElement('div'); view.className='view-controls';
    view.style.top=(this.renderer.boardTop+4)+'px';
    for(const [text,action] of [['＋',()=>this.renderer.zoomBy(1.25)],['−',()=>this.renderer.zoomBy(.8)],['全图',()=>this.renderer.resetView()]] as const) view.append(this.createButton(text,action));
    this.uiLayer.append(view);
  }

  private refreshPreview(): void {
    this.renderer.previewResults = this.previewEnabled && !this.executing && this.state.game ? this.state.game.preview() : [];
  }

  private togglePreview(): void {
    if (this.executing) return;
    this.previewEnabled = !this.previewEnabled;
    this.feedback = this.previewEnabled ? '虚线显示下一回合实际光路；能量不足时没有光束。预览不消耗回合。' : '已关闭光路预览。';
    this.renderGameUI();
  }

  private playTone(frequency: number): void {
    if (!this.soundEnabled) return;
    try {
      this.audio ||= new AudioContext();
      void this.audio.resume().catch(() => {});
      const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency / 2, this.audio.currentTime + .14);
      gain.gain.setValueAtTime(.045, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.audio.currentTime + .18);
      oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* Audio is optional. */ }
  }

  private showHelp(): void {
    if (this.executing) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div'); overlay.className = 'dialog-backdrop';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '玩法说明');
    const card = document.createElement('div'); card.className = 'help-card';
    card.innerHTML = '<h2>让每一束光都有方向</h2><p>目标：在回合上限内清除所有红色和蓝色方块。回合越少，星级越高。</p><p>↻ 点击可旋转镜面切换 / 与 ＼，固定镜没有旋转标记。调整镜面不消耗回合。</p><p>⚡ 每次执行，电池提供能量。点击圆形发射器切换模式：普通光消耗 1 点；强光消耗 3 点，可以击破蓝色装甲。能量不足会保留并继续蓄积。</p><p>◎ 光路预览显示下一回合的真实结果。撤销可以恢复每一步，包括发射和蓄能，放心尝试。</p><p>键盘：空格执行 · Z 撤销 · R 重试 · P 预览。方向键选格，Enter 旋转或切换模式。</p>';
    const advanced=document.createElement('div');
    advanced.innerHTML='<p><b>光电元件</b>：ϟ 转电器吸收光（普通 +1 / 强光 +3），下回合沿金色导线供电。△ 散射器分成前、左、右三路，保留强度。</p><p><b>信号与开关</b>：单圈传感器每回合需重新点亮；双圈具有永久记忆。同字母传感器全部点亮，下一回合光闸开启。! 标记为反相：条件不成立时开启。</p><p><b>通关条件</b>：清除所有障碍，并在同一回合激活全部传感器。成对紫色传送门保留方向；单向光阀仅允许箭头方向通过。</p><p><b>大棋盘</b>：滚轮、双指或 + / − 缩放，拖动平移；全图按钮或 0 键复位。点选任何元件可查看状态。</p>';
    card.append(advanced);
    const sound = this.createButton(this.soundEnabled ? '音效：开' : '音效：关', () => { this.soundEnabled = !this.soundEnabled; sound.textContent = this.soundEnabled ? '音效：开' : '音效：关'; });
    const close = () => { overlay.remove(); previousFocus?.focus(); };
    const done = this.createButton('明白了，开始思考', close); done.className = 'primary'; done.style.marginLeft = '12px';
    card.append(sound, done); overlay.append(card); this.uiLayer.append(overlay); done.focus();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === done ? sound : done).focus(); }
    });
  }

  private showImportDialog(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:100;';

    const dialog = document.createElement('div');
    dialog.style.cssText = `background:${COLORS.uiPanel};border:1px solid ${COLORS.uiPanelBorder};border-radius:8px;padding:24px;max-width:400px;width:90%;`;

    const titleEl = document.createElement('div');
    titleEl.textContent = '导入分享关卡';
    titleEl.style.cssText = `font-size:16px;color:${COLORS.textPrimary};margin-bottom:16px;`;
    dialog.appendChild(titleEl);

    const input = document.createElement('textarea');
    input.placeholder = '粘贴分享码 (RL1-...)';
    input.style.cssText = `width:100%;height:80px;background:${COLORS.bg};border:1px solid ${COLORS.uiPanelBorder};color:${COLORS.textPrimary};padding:8px;border-radius:4px;font-size:12px;resize:none;font-family:monospace;`;
    dialog.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';

    const cancelBtn = this.createButton('取消', () => overlay.remove());
    btnRow.appendChild(cancelBtn);

    const importActionBtn = this.createButton('导入', () => {
      const level = decodeLevel(input.value);
      if (level) {
        this.state.loadLevel(level);
        this.resize();
        overlay.remove();
        this.showScreen('PLAYING');
      } else {
        input.style.borderColor = COLORS.danger;
      }
    });
    importActionBtn.style.cssText += `background:${COLORS.laserNormal};color:#fff;border:none;`;
    btnRow.appendChild(importActionBtn);

    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.uiLayer.appendChild(overlay);
  }

  private renderLevelSelect(): void {
    const panel = this.createPanel();
    panel.style.cssText += 'pointer-events:auto;overflow-y:auto;padding:30px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:30px;';

    const backBtn = this.createButton('← 返回', () => this.showScreen('MENU'));
    backBtn.style.fontSize = '14px';
    header.appendChild(backBtn);

    const titleEl = document.createElement('div');
    titleEl.textContent = '选择关卡';
    titleEl.style.cssText = `font-size:20px;color:${COLORS.textPrimary};`;
    header.appendChild(titleEl);
    header.appendChild(document.createElement('div'));
    panel.appendChild(header);

    for (const chapter of chaptersMeta) {
      const chapterDiv = document.createElement('div');
      chapterDiv.style.marginBottom = '24px';

      const chapterTitle = document.createElement('div');
      chapterTitle.textContent = chapter.name;
      chapterTitle.style.cssText = `font-size:14px;color:${COLORS.textSecondary};margin-bottom:12px;letter-spacing:4px;`;
      chapterDiv.appendChild(chapterTitle);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;';

      for (const level of chapter.levels) {
        grid.appendChild(this.createLevelButton(level));
      }

      chapterDiv.appendChild(grid);
      panel.appendChild(chapterDiv);
    }

    const summary = document.createElement('div'); summary.className = 'level-summary';
    summary.textContent = `已完成 ${allLevels.filter(l => this.state.getBestStars(l.id)).length} / ${allLevels.length} 关 · ★ ${allLevels.reduce((n,l) => n + this.state.getBestStars(l.id), 0)} / ${allLevels.length * 3} · 所有关卡均可自由挑战`;
    header.after(summary);
    this.uiLayer.appendChild(panel);
  }

  private createLevelButton(level: LevelData): HTMLButtonElement {
    const btn = document.createElement('button');
    const stars = this.state.getBestStars(level.id);
    const cleared = stars > 0;

    btn.style.cssText = `
      background:${cleared ? '#2a2a4e' : COLORS.uiButton};border:1px solid ${COLORS.uiPanelBorder};
      color:${COLORS.textPrimary};padding:12px 8px;border-radius:6px;cursor:pointer;text-align:center;
    `;

    const numDiv = document.createElement('div');
    numDiv.style.cssText = `font-size:12px;color:${COLORS.textSecondary}`;
    numDiv.textContent = `${level.chapter}-${level.order}`;
    btn.appendChild(numDiv);

    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:13px;margin:4px 0';
    nameDiv.textContent = level.name;
    btn.title = `${level.gridWidth}×${level.gridHeight} · ${level.elements.length} 个元件 · 三星 ${level.par} 回合`;
    btn.appendChild(nameDiv);

    const starsDiv = document.createElement('div');
    starsDiv.style.fontSize = '14px';
    starsDiv.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    btn.appendChild(starsDiv);

    btn.addEventListener('mouseenter', () => { btn.style.background = COLORS.uiButtonHover; });
    btn.addEventListener('mouseleave', () => { btn.style.background = cleared ? '#2a2a4e' : COLORS.uiButton; });
    btn.addEventListener('click', () => this.startLevel(level));

    return btn;
  }

  private startLevel(level: LevelData, fromEditor = false): void {
    this.testingEditor=fromEditor; this.renderer.boardTop=130; this.renderer.boardBottom=160; this.renderer.resetView();
    this.renderer.clearEffects(); this.renderer.selectedCell = null;
    this.feedback = ''; this.previewEnabled = false; this.selected = { row: 0, col: 0 };
    this.state.loadLevel(level);
    this.resize();
    this.showScreen('PLAYING');
  }

  private renderGameUI(): void {
    const game = this.state.game!;
    this.uiLayer.replaceChildren();
    const header = document.createElement('div'); header.className = 'game-header';
    const title = document.createElement('div');
    const chapter = document.createElement('div'); chapter.className = 'game-sub';
    chapter.textContent = game.levelData.chapter ? `CHAPTER 0${game.levelData.chapter} / ${String(game.levelData.order).padStart(2, '0')}` : 'WORKSHOP / 创意关卡';
    const name = document.createElement('div'); name.className = 'game-title'; name.textContent = game.levelData.name;
    title.append(chapter, name); header.append(title);
    const meters = document.createElement('div'); meters.className = 'game-meters';
    for (const [value, label] of [[`${game.turnState.turnCount}/${game.turnState.maxTurns}`, '使用回合'], [`${game.obstacles.filter(o => o.destroyed).length}/${game.obstacles.length}`, '清除目标'], [`≤ ${game.levelData.par}`, '三星目标'], ...(game.sensors.length ? [[`${game.sensors.filter(s=>s.active).length}/${game.sensors.length}`, '传感器']] : [])]) {
      const meter = document.createElement('div'); const strong = document.createElement('b'); strong.textContent = value;
      meter.append(strong, document.createTextNode(label)); meters.append(meter);
    }
    header.append(meters); this.uiLayer.append(header);
    const hint = document.createElement('div'); hint.className = 'game-hint';
    hint.textContent = game.levelData.hint || '清除全部障碍，并同时激活所有传感器。点选元件查看规则，拖动与缩放查看大棋盘。'; this.uiLayer.append(hint);
    const dock = document.createElement('div'); dock.className = 'game-dock';
    const feedback = document.createElement('div'); feedback.className = 'game-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    feedback.textContent = this.feedback || '调整不消耗回合，准备好后执行。可以随时撤销。'; dock.append(feedback);
    const controls = document.createElement('div'); controls.className = 'game-controls';
    const fire = this.createButton(this.executing ? '光束运行中…' : '⚡ 执行回合', () => this.executeTurn()); fire.className = 'primary'; fire.disabled = this.executing;
    const undo = this.createButton('↶ 撤销', () => this.undo()); undo.disabled = this.executing || !game.canUndo;
    const preview = this.createButton(this.previewEnabled ? '◉ 预览开' : '◎ 光路预览', () => this.togglePreview()); preview.disabled = this.executing; preview.setAttribute('aria-pressed', String(this.previewEnabled));
    controls.append(fire, undo, preview, this.createButton('↻ 重试', () => this.restart()), this.createButton('?', () => this.showHelp()), this.createButton(this.testingEditor?'返回编辑器':'退出', () => this.leaveGame()));
    dock.append(controls);
    const help = document.createElement('div'); help.className = 'game-help'; help.textContent = 'SPACE 执行 · Z 撤销 · P 预览 · 滚轮/双指缩放 · 拖动平移 · 0 全图'; dock.append(help);
    this.uiLayer.append(dock); this.refreshPreview(); this.viewControls();
  }

  private executeTurn(): void {
    if (this.executing || this.state.currentScreen !== 'PLAYING' || !this.state.game || this.state.game.result !== null) return;
    const game = this.state.game; this.executing = true; this.renderer.previewResults = [];
    const results = game.fire(); this.renderer.startLaserAnimation(results);
    const totalSegs = results.reduce((s, r) => s + r.segments.length, 0);
    const delay = Math.min(1200, Math.max(300, totalSegs * 35)) + 180;
    const destroyed = results.reduce((sum, result) => sum + result.destroyedObstacles.length, 0);
    this.feedback = destroyed ? `命中！清除了 ${destroyed} 个目标。` : results.length ? '光束没有击中目标，试试调整镜面或切换强力模式。' : `正在蓄能：${game.emitters.map(e => `${e.receivedCharge}/${e.mode === EmitterMode.POWER ? 3 : 1}`).join(' · ')}。执行下一回合继续充电。`;
    if(game.sensors.length) this.feedback += ` 传感器 ${game.sensors.filter(s=>s.active).length}/${game.sensors.length}；光闸按上一回合信号工作。`;
    this.playTone(destroyed ? 660 : results.length ? 330 : 220); this.renderGameUI();
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.state.game !== game || this.state.currentScreen !== 'PLAYING') return;
      this.executing = false;
      if (game.result) { this.playTone(game.result === 'WIN' ? 880 : 160); this.state.handleResult(game.result); this.showScreen('RESULT'); }
      else this.renderGameUI();
    }, delay);
  }

  private renderResult(): void {
    const game = this.state.game!;
    const level = this.state.currentLevel!;
    const isWin = game.result === 'WIN';
    const stars = isWin ? this.state.getStars(level.id, game.turnState.turnCount, level.par) : 0;
    const record = this.state.getRecord(level.id);

    const panel = this.createPanel();
    panel.style.cssText += 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;pointer-events:auto;';

    const titleEl = document.createElement('div');
    titleEl.textContent = isWin ? '通关成功！' : '回合耗尽';
    titleEl.style.cssText = `font-size:28px;font-weight:600;color:${isWin ? COLORS.success : COLORS.danger};`;
    panel.appendChild(titleEl);

    const starsEl = document.createElement('div');
    starsEl.style.cssText = `font-size:36px;margin:8px 0;color:${COLORS.starFilled};`;
    starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    panel.appendChild(starsEl);

    const statsEl = document.createElement('div');
    statsEl.style.cssText = `color:${COLORS.textSecondary};font-size:14px;text-align:center;line-height:2;`;
    const line1 = document.createElement('div');
    line1.textContent = `使用回合: ${game.turnState.turnCount} / ${level.maxTurns}`;
    statsEl.appendChild(line1);
    const line2 = document.createElement('div');
    line2.textContent = `标准回合: ${level.par}`;
    statsEl.appendChild(line2);
    if (record) {
      const line3 = document.createElement('div');
      line3.textContent = `最高分: ${record.bestScore}`;
      statsEl.appendChild(line3);
    }
    panel.appendChild(statsEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;justify-content:center;';

    if (!isWin) {
      const retryBtn = this.createButton('重新尝试', () => this.startLevel(level, this.testingEditor));
      retryBtn.style.cssText += `background:${COLORS.laserNormal};color:#fff;padding:10px 28px;border:none;`;
      btnRow.appendChild(retryBtn);
    } else {
      const currentIdx = allLevels.findIndex(l => l.id === level.id);
      if (currentIdx >= 0 && currentIdx < allLevels.length - 1) {
        const nextBtn = this.createButton('下一关 →', () => this.startLevel(allLevels[currentIdx + 1]));
        nextBtn.style.cssText += `background:${COLORS.success};color:#fff;padding:10px 28px;border:none;`;
        btnRow.appendChild(nextBtn);
      }
    }

    if (isWin) btnRow.appendChild(this.createButton('再挑战一次', () => this.startLevel(level, this.testingEditor)));
    if (!isWin && game.canUndo) btnRow.appendChild(this.createButton('撤销最后一步', () => { game.undo(); this.renderer.clearEffects(); this.feedback = '已回到上一步，换个思路再试。'; this.showScreen('PLAYING'); }));
    if(this.testingEditor) btnRow.append(this.createButton('返回编辑器',()=>this.leaveGame()));
    const backBtn = this.createButton('关卡选择', () => this.showScreen('LEVEL_SELECT'));
    btnRow.appendChild(backBtn);
    panel.appendChild(btnRow);

    this.uiLayer.appendChild(panel);
  }

  // ── Workshop ──

  private renderWorkshop(): void {
    const panel = this.createPanel();
    panel.style.cssText += 'pointer-events:auto;overflow-y:auto;padding:30px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;';

    const backBtn = this.createButton('← 返回', () => this.showScreen('MENU'));
    header.appendChild(backBtn);

    const titleEl = document.createElement('div');
    titleEl.textContent = '创意工坊';
    titleEl.style.cssText = `font-size:20px;color:${COLORS.textPrimary};`;
    header.appendChild(titleEl);

    const newBtn = this.createButton('+ 新建关卡', () => this.openEditor());
    newBtn.style.cssText += `background:${COLORS.laserNormal};color:#fff;border:none;`;
    header.appendChild(newBtn);
    panel.appendChild(header);

    // Storage usage
    const usage = this.workshop.getUsage();
    const usageEl = document.createElement('div');
    usageEl.style.cssText = `font-size:12px;color:${COLORS.textSecondary};margin-bottom:16px;`;
    usageEl.textContent = `存储使用: ${(usage.used / 1024).toFixed(1)}KB / ${(usage.total / 1024 / 1024).toFixed(0)}MB`;
    panel.appendChild(usageEl);

    // Level list
    const levels = this.workshop.list();
    if (levels.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `text-align:center;color:${COLORS.textSecondary};padding:40px;font-size:14px;`;
      empty.textContent = '还没有自定义关卡，点击"新建关卡"开始创作吧！';
      panel.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;';

      for (const level of levels) {
        grid.appendChild(this.createWorkshopLevelCard(level));
      }
      panel.appendChild(grid);
    }

    this.uiLayer.appendChild(panel);
  }

  private createWorkshopLevelCard(level: CustomLevelData): HTMLDivElement {
    const card = document.createElement('div');
    card.style.cssText = `background:${COLORS.uiButton};border:1px solid ${COLORS.uiPanelBorder};border-radius:6px;padding:12px;`;

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-size:14px;color:${COLORS.textPrimary};margin-bottom:4px;`;
    nameEl.textContent = level.name || '未命名关卡';
    card.appendChild(nameEl);

    const infoEl = document.createElement('div');
    infoEl.style.cssText = `font-size:11px;color:${COLORS.textSecondary};margin-bottom:8px;`;
    infoEl.textContent = `${level.gridWidth}×${level.gridHeight} · ${level.elements.length} 元素 · ${level.maxTurns} 回合`;
    card.appendChild(infoEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const playBtn = this.createButton('游玩', () => this.startLevel(level));
    playBtn.style.cssText += 'font-size:11px;padding:4px 10px;';
    btnRow.appendChild(playBtn);

    const editBtn = this.createButton('编辑', () => this.openEditor(level));
    editBtn.style.cssText += 'font-size:11px;padding:4px 10px;';
    btnRow.appendChild(editBtn);

    const shareBtn = this.createButton('分享', () => {
      const code = encodeLevel(level);
      navigator.clipboard.writeText(code).then(() => {
        shareBtn.textContent = '已复制!';
        setTimeout(() => { shareBtn.textContent = '分享'; }, 1500);
      }).catch(() => {
        prompt('复制分享码:', code);
      });
    });
    shareBtn.style.cssText += 'font-size:11px;padding:4px 10px;';
    btnRow.appendChild(shareBtn);

    const deleteBtn = this.createButton('删除', () => {
      if (confirm(`确定删除"${level.name}"？`)) {
        this.workshop.delete(level.id);
        this.showScreen('WORKSHOP');
      }
    });
    deleteBtn.style.cssText += `font-size:11px;padding:4px 10px;color:${COLORS.danger};`;
    btnRow.appendChild(deleteBtn);

    card.appendChild(btnRow);
    return card;
  }

  // ── Editor ──

  private openEditor(existingLevel?: CustomLevelData): void {
    if (existingLevel) {
      this.editorElements = existingLevel.elements.map(el => ({ ...el, coord: { ...el.coord } }));
      this.editorGridW = existingLevel.gridWidth;
      this.editorGridH = existingLevel.gridHeight;
      this.editorMaxTurns = existingLevel.maxTurns;
      this.editorPar = existingLevel.par;
      this.editorLevelName = existingLevel.name;
      this.editingLevelId = existingLevel.id;
    } else {
      this.editorElements = [];
      this.editorGridW = 8;
      this.editorGridH = 6;
      this.editorMaxTurns = 10;
      this.editorPar = 5;
      this.editorLevelName = '';
      this.editingLevelId = null;
    }

    this.renderer.resetView();
    this.editorTool = 'battery';
    this.state.goToScreen('EDITOR');
    this.renderEditor();
    this.renderEditorPreview();
  }

  private renderEditor(): void {
    this.uiLayer.replaceChildren();

    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:flex;flex-direction:column;';

    // Toolbar
    const toolbar = document.createElement('div'); toolbar.className='editor-tools';
    toolbar.style.cssText = `background:${COLORS.uiPanel};border-bottom:1px solid ${COLORS.uiPanelBorder};padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;

    const backBtn = this.createButton('← 返回', () => this.showScreen('WORKSHOP'));
    backBtn.style.fontSize = '12px';
    toolbar.appendChild(backBtn);

    const separator = document.createElement('div');
    separator.style.cssText = 'width:1px;height:24px;background:#3a3a5e;margin:0 4px;';
    toolbar.appendChild(separator);

    toolbar.style.pointerEvents = 'auto';

    // Tool buttons
    const tools: { label: string; tool: ElementPlacement['type'] | 'erase' }[] = [
      { label: '⌫ 擦除', tool: 'erase' },
      { label: 'ϟ 转电器', tool: 'converter' }, { label: '─ 导线', tool: 'wire' },
      { label: '△ 散射器', tool: 'splitter' }, { label: '◎ 传感器', tool: 'sensor' },
      { label: '▥ 自动开关', tool: 'gate' }, { label: '◉ 传送门', tool: 'portal' }, { label: '▷ 单向光阀', tool: 'diode' },
      { label: '🔋 电池', tool: 'battery' },
      { label: '📡 发射器', tool: 'emitter' },
      { label: '🪞 镜子', tool: 'mirror' },
      { label: '🧱 障碍', tool: 'obstacle' },
      { label: '⬛ 墙壁', tool: 'wall' },
    ];

    for (const t of tools) {
      const btn = this.createButton(t.label, () => {
        this.editorTool = this.editorTool === t.tool ? null : t.tool;
        this.updateToolHighlight(toolbar);
      });
      btn.style.cssText += 'font-size:11px;padding:4px 8px;';
      btn.dataset.tool = t.tool;
      if (this.editorTool === t.tool) {
        btn.style.background = COLORS.laserNormal;
        btn.style.color = '#fff';
      }
      toolbar.appendChild(btn);
    }

    const separator2 = document.createElement('div');
    separator2.style.cssText = 'width:1px;height:24px;background:#3a3a5e;margin:0 4px;';
    toolbar.appendChild(separator2);

    const channelLabel=document.createElement('label'); channelLabel.textContent='通道 ';
    const channel=document.createElement('select'); channel.setAttribute('aria-label','元件信号通道');
    for(const value of ['A','B','C','D','P','Z']) { const option=document.createElement('option');option.value=option.textContent=value;channel.append(option); }
    channel.value=this.editorChannel;channel.onchange=()=>{this.editorChannel=channel.value;};channelLabel.append(channel);toolbar.append(channelLabel);
    const dimensions=document.createElement('select'); dimensions.setAttribute('aria-label','棋盘尺寸');
    const sizes=[...new Set([this.editorGridW+'×'+this.editorGridH,'8×6','12×10','16×12','20×16'])];
    for(const size of sizes){const option=document.createElement('option');option.value=option.textContent=size;dimensions.append(option);}
    dimensions.onchange=()=>{
      const [w,h]=dimensions.value.split('×').map(Number);
      if(this.editorElements.some(e=>e.coord.col>=w || e.coord.row>=h)){alert('请先擦除新边界之外的元件，再缩小棋盘。');dimensions.value=this.editorGridW+'×'+this.editorGridH;return;}
      this.editorGridW=w;this.editorGridH=h;this.renderer.resetView();this.renderEditorPreview();
    };toolbar.append(dimensions);
    for(const [label,key] of [['回合上限','editorMaxTurns'],['三星回合','editorPar']] as const){
      const field=document.createElement('label');field.textContent=label+' ';const input=document.createElement('input');input.type='number';input.min='1';input.max='100';input.value=String(this[key]);input.style.width='52px';input.setAttribute('aria-label',label);
      input.onchange=()=>{this[key]=Math.max(1,Math.min(100,Math.round(Number(input.value)||1)));input.value=String(this[key]);this.renderEditorPreview();};field.append(input);toolbar.append(field);
    }
    toolbar.append(this.createButton('试玩',()=>{const level=this.buildEditorLevel();if(level)this.startLevel(level,true);}));
    // Clear button
    const clearBtn = this.createButton('清空', () => {
      this.editorElements = [];
      this.renderEditorPreview();
    });
    clearBtn.style.cssText += 'font-size:11px;padding:4px 8px;';
    toolbar.appendChild(clearBtn);

    // Validate button
    const validateBtn = this.createButton('验证', () => {
      const level = this.buildEditorLevel();
      if (!level) return;
      validateBtn.textContent = '验证中...';
      setTimeout(() => {
        const verdict = solveLevel(level); const solvable = verdict === 'solvable';
        validateBtn.textContent = solvable ? '✓ 可解' : verdict === 'unknown' ? '搜索未完成，请试玩' : '✗ 无解';
        validateBtn.style.background = solvable ? COLORS.success : verdict === 'unknown' ? COLORS.textHighlight : COLORS.danger;
        validateBtn.style.color = '#fff';
        setTimeout(() => {
          validateBtn.textContent = '验证';
          validateBtn.style.background = COLORS.uiButton;
          validateBtn.style.color = COLORS.uiButtonText;
        }, 2000);
      }, 50);
    });
    validateBtn.style.cssText += 'font-size:11px;padding:4px 8px;';
    toolbar.appendChild(validateBtn);

    // Save button
    const saveBtn = this.createButton('保存', () => {
      const name = prompt('关卡名称:', this.editorLevelName);
      if (name === null) return;
      this.editorLevelName = name;
      const level = this.buildEditorLevel();
      if (!level) return;
      const customLevel: CustomLevelData = {
        ...level,
        name: this.editorLevelName,
        author: '玩家',
        createdAt: this.editingLevelId ? (this.workshop.load_level(this.editingLevelId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now(),
        playCount: 0,
        clearCount: 0,
        rating: 0,
        tags: [],
      };
      this.workshop.save(customLevel);
      this.showScreen('WORKSHOP');
    });
    saveBtn.style.cssText += `font-size:11px;padding:4px 12px;background:${COLORS.success};color:#fff;border:none;`;
    toolbar.appendChild(saveBtn);

    const tip = document.createElement('div');
    tip.textContent = '重复点选：发射器/光阀转向，传感器切换记忆，光闸切换反相。通道匹配才能联动；同通道传送门需恰好两扇。';
    tip.style.cssText = 'padding:8px 16px;color:#a1abc3;font-size:12px;line-height:1.6;';
    panel.appendChild(toolbar); panel.appendChild(tip);

    // Canvas area (the game canvas renders behind this)
    const canvasArea = document.createElement('div');
    canvasArea.style.cssText = 'flex:1;position:relative;';
    panel.appendChild(canvasArea);

    this.uiLayer.appendChild(panel);
  }

  private updateToolHighlight(toolbar: HTMLElement): void {
    const buttons = toolbar.querySelectorAll('button[data-tool]');
    buttons.forEach((btn) => {
      const htmlBtn = btn as HTMLButtonElement;
      const tool = htmlBtn.dataset.tool;
      if (tool === this.editorTool) {
        htmlBtn.style.background = COLORS.laserNormal;
        htmlBtn.style.color = '#fff';
      } else {
        htmlBtn.style.background = COLORS.uiButton;
        htmlBtn.style.color = COLORS.uiButtonText;
      }
    });
  }

  private buildEditorLevel(): LevelData | null {
    const hasBattery = this.editorElements.some(e => e.type === 'battery');
    const hasEmitter = this.editorElements.some(e => e.type === 'emitter');
    const hasObstacle = this.editorElements.some(e => e.type === 'obstacle' || e.type === 'sensor');

    if (!hasBattery || !hasEmitter || !hasObstacle) {
      alert('关卡需要电池、发射器，以及至少一个障碍或传感器目标');
      return null;
    }

    const level: LevelData = {
      id: this.editingLevelId || `custom-${Date.now()}`,
      name: this.editorLevelName || '自定义关卡',
      chapter: 0,
      order: 0,
      gridWidth: this.editorGridW,
      gridHeight: this.editorGridH,
      maxTurns: this.editorMaxTurns,
      par: this.editorPar,
      elements: this.editorElements.map(e=>({...e,coord:{...e.coord}})),
    };
    if(!isLevelData(level)){alert('检查关卡设置：三星回合不能超过上限；同通道传送门必须恰好两扇；每道光闸需要同通道传感器。');return null;}
    return level;
  }

  // ── UI Helpers ──

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;background:rgba(26,26,46,0.95);overflow:auto;';
    return panel;
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background:${COLORS.uiButton};border:1px solid ${COLORS.uiPanelBorder};
      color:${COLORS.uiButtonText};padding:8px 20px;border-radius:4px;
      cursor:pointer;font-size:14px;
    `;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private loop = (timestamp: number): void => {
    this.animFrame = requestAnimationFrame(this.loop);

    if ((this.state.currentScreen === 'PLAYING' || this.state.currentScreen === 'EDITOR') && this.state.game) {
      this.renderer.render(this.state.game, timestamp);
    } else {
      const ctx = this.canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    }
  };
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});
