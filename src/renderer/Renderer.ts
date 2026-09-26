import { Coord, CellType, Direction, coordKey } from '../types';
import { MirrorOrientation, EmitterMode, ObstacleType } from '../types/elements';
import { LaserTraceResult } from '../types/game';
import { COLORS, RENDER } from '../constants';
import { Game } from '../models/Game';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  gridOffsetX = 0;
  gridOffsetY = 0;
  cellSize: number = RENDER.cellSize;
  previewResults: LaserTraceResult[] = [];
  selectedCell: Coord | null = null;

  clearEffects(): void {
    this.currentLaserResults = [];
    this.animatingLasers = false;
    this.particles = [];
    this.prevDestroyedSet.clear();
    this.previewResults = [];
  }

  private laserAnimProgress = 1;
  private animatingLasers = false;
  private animStartTime = 0;
  private currentLaserResults: LaserTraceResult[] = [];

  // Particle effects
  private particles: Particle[] = [];

  // Destroy animation tracking
  private prevDestroyedSet = new Set<string>();

  // Pulse animation
  private pulsePhase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
  }

  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  calcGridOffset(canvasW: number, canvasH: number, gridW: number, gridH: number): void {
    this.cellSize = Math.max(12, Math.min(RENDER.cellSize, Math.floor((canvasW - 40) / gridW), Math.floor((canvasH - 260) / gridH)));
    this.gridOffsetX = Math.round((canvasW - gridW * this.cellSize) / 2);
    this.gridOffsetY = Math.max(130, Math.round((canvasH - gridH * this.cellSize) / 2));
  }

  pixelToGrid(px: number, py: number): Coord | null {
    const col = Math.floor((px - this.gridOffsetX) / this.cellSize);
    const row = Math.floor((py - this.gridOffsetY) / this.cellSize);
    return { row, col };
  }

  gridToPixel(coord: Coord): { x: number; y: number } {
    return {
      x: this.gridOffsetX + coord.col * this.cellSize + this.cellSize / 2,
      y: this.gridOffsetY + coord.row * this.cellSize + this.cellSize / 2,
    };
  }

  startLaserAnimation(results: LaserTraceResult[]): void {
    this.currentLaserResults = results;
    this.laserAnimProgress = 0;
    this.animatingLasers = true;
    this.animStartTime = performance.now();
  }

  private spawnDestroyParticles(coord: Coord, isReinforced: boolean): void {
    const center = this.gridToPixel(coord);
    const color = isReinforced ? COLORS.obstacleReinforcedBorder : COLORS.obstacleNormalBorder;
    const count = isReinforced ? 16 : 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3;
      this.particles.push({
        x: center.x + (Math.random() - 0.5) * 20,
        y: center.y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 0.4 + Math.random() * 0.4,
        color, size: 2 + Math.random() * 3,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  render(game: Game, timestamp: number): void {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const ctx = this.ctx;
    const dt = 1 / 60;

    this.pulsePhase = (timestamp / 1000) * Math.PI * 2;

    // Laser animation progress
    if (this.animatingLasers) {
      const elapsed = timestamp - this.animStartTime;
      const totalSegments = this.currentLaserResults.reduce((s, r) => s + r.segments.length, 0);
      const duration = Math.min(1200, Math.max(300, totalSegments * 35));
      this.laserAnimProgress = Math.min(1, elapsed / duration);
      if (this.laserAnimProgress >= 1) this.animatingLasers = false;
    }

    // Check for newly destroyed obstacles → spawn particles
    const currentDestroyed = new Set<string>();
    for (const o of game.obstacles) {
      if (o.destroyed) currentDestroyed.add(coordKey(o.coord));
    }
    for (const key of currentDestroyed) {
      if (!this.prevDestroyedSet.has(key)) {
        const obs = game.obstacles.find(o => coordKey(o.coord) === key);
        if (obs) {
          this.spawnDestroyParticles(obs.coord, obs.type === ObstacleType.REINFORCED);
        }
      }
    }
    this.prevDestroyedSet = currentDestroyed;

    // Update particles
    this.updateParticles(dt);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(game);
    if (this.selectedCell && game.grid.inBounds(this.selectedCell)) {
      const p = this.gridToPixel(this.selectedCell);
      ctx.fillStyle = '#69e6d422';
      ctx.fillRect(p.x - this.cellSize / 2, p.y - this.cellSize / 2, this.cellSize, this.cellSize);
      ctx.strokeStyle = '#69e6d4'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - this.cellSize / 2 + 2, p.y - this.cellSize / 2 + 2, this.cellSize - 4, this.cellSize - 4);
    }
    this.drawElements(game, timestamp);
    this.drawPreview();
    this.drawLasers(game);
    this.drawParticles();
  }

  private drawGrid(game: Game): void {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const ox = this.gridOffsetX;
    const oy = this.gridOffsetY;

    ctx.fillStyle = '#16162a';
    ctx.fillRect(ox, oy, game.grid.width * cs, game.grid.height * cs);

    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let r = 0; r <= game.grid.height; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cs);
      ctx.lineTo(ox + game.grid.width * cs, oy + r * cs);
      ctx.stroke();
    }
    for (let c = 0; c <= game.grid.width; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cs, oy);
      ctx.lineTo(ox + c * cs, oy + game.grid.height * cs);
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.gridDot;
    for (let r = 0; r <= game.grid.height; r++) {
      for (let c = 0; c <= game.grid.width; c++) {
        ctx.beginPath();
        ctx.arc(ox + c * cs, oy + r * cs, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawElements(game: Game, timestamp: number): void {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const pad = Math.min(RENDER.elementPadding, cs * 0.16);

    // Walls
    for (let r = 0; r < game.grid.height; r++) {
      for (let c = 0; c < game.grid.width; c++) {
        if (game.grid.getCellType({ row: r, col: c }) === CellType.WALL) {
          const x = this.gridOffsetX + c * cs;
          const y = this.gridOffsetY + r * cs;
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4);
          ctx.strokeStyle = COLORS.wallBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
        }
      }
    }

    // Batteries with pulse effect
    for (const bat of game.batteries) {
      const x = this.gridOffsetX + bat.coord.col * cs;
      const y = this.gridOffsetY + bat.coord.row * cs;

      // Pulse glow when charging
      const pulseAlpha = 0.1 + 0.1 * Math.sin(this.pulsePhase + bat.coord.row);
      ctx.fillStyle = COLORS.batteryCharge;
      ctx.globalAlpha = pulseAlpha;
      ctx.fillRect(x + pad - 2, y + pad - 2, cs - pad * 2 + 4, cs - pad * 2 + 4);
      ctx.globalAlpha = 1;

      ctx.fillStyle = COLORS.batteryBg;
      ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);

      const chargeRatio = bat.currentCharge / bat.capacity;
      const barH = (cs - pad * 2 - 4) * chargeRatio;
      const barY = y + cs - pad - 2 - barH;
      ctx.fillStyle = COLORS.batteryCharge;
      ctx.fillRect(x + pad + 2, barY, cs - pad * 2 - 4, barH);

      ctx.strokeStyle = COLORS.battery;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);

      ctx.fillStyle = COLORS.battery;
      ctx.fillRect(x + cs / 2 - 6, y + pad - 3, 12, 4);

      ctx.fillStyle = COLORS.textPrimary;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${bat.currentCharge}`, x + cs / 2, y + cs / 2);
    }

    // Emitters
    for (const em of game.emitters) {
      const cx = this.gridOffsetX + em.coord.col * cs + cs / 2;
      const cy = this.gridOffsetY + em.coord.row * cs + cs / 2;
      const r = cs / 2 - pad;

      // Power mode pulse ring
      if (em.mode === EmitterMode.POWER) {
        const pulseR = r + 3 + 2 * Math.sin(this.pulsePhase * 2);
        ctx.strokeStyle = COLORS.laserPower;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.pulsePhase * 2);
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = em.mode === EmitterMode.POWER ? COLORS.laserPower : COLORS.emitter;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrow
      ctx.strokeStyle = COLORS.bg;
      ctx.lineWidth = 2;
      const arrowLen = r * 0.7;
      let ax = cx, ay = cy;
      switch (em.facing) {
        case Direction.UP: ay -= arrowLen; break;
        case Direction.DOWN: ay += arrowLen; break;
        case Direction.LEFT: ax -= arrowLen; break;
        case Direction.RIGHT: ax += arrowLen; break;
      }
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();

      const headSize = 5;
      ctx.beginPath(); ctx.fillStyle = COLORS.bg;
      switch (em.facing) {
        case Direction.UP:
          ctx.moveTo(ax, ay); ctx.lineTo(ax - headSize, ay + headSize); ctx.lineTo(ax + headSize, ay + headSize); break;
        case Direction.DOWN:
          ctx.moveTo(ax, ay); ctx.lineTo(ax - headSize, ay - headSize); ctx.lineTo(ax + headSize, ay - headSize); break;
        case Direction.LEFT:
          ctx.moveTo(ax, ay); ctx.lineTo(ax + headSize, ay - headSize); ctx.lineTo(ax + headSize, ay + headSize); break;
        case Direction.RIGHT:
          ctx.moveTo(ax, ay); ctx.lineTo(ax - headSize, ay - headSize); ctx.lineTo(ax - headSize, ay + headSize); break;
      }
      ctx.closePath(); ctx.fill();

      if (em.receivedCharge > 0) {
        ctx.fillStyle = COLORS.batteryCharge;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`+${em.receivedCharge}`, cx, cy + r + 4);
      }
    }

    // Mirrors
    for (const mir of game.mirrors) {
      const x = this.gridOffsetX + mir.coord.col * cs;
      const y = this.gridOffsetY + mir.coord.row * cs;
      const mPad = pad + Math.min(4, cs * 0.06);

      ctx.strokeStyle = COLORS.mirror;
      ctx.lineWidth = RENDER.mirrorLineWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (mir.orientation === MirrorOrientation.SLASH) {
        ctx.moveTo(x + mPad, y + cs - mPad);
        ctx.lineTo(x + cs - mPad, y + mPad);
      } else {
        ctx.moveTo(x + mPad, y + mPad);
        ctx.lineTo(x + cs - mPad, y + cs - mPad);
      }
      ctx.stroke();

      if (mir.rotatable) {
        ctx.fillStyle = COLORS.mirrorRotate;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('↻', x + cs / 2, y + cs - 2);
      }
    }

    // Obstacles
    for (const obs of game.obstacles) {
      const x = this.gridOffsetX + obs.coord.col * cs;
      const y = this.gridOffsetY + obs.coord.row * cs;

      if (obs.destroyed) {
        ctx.fillStyle = COLORS.obstacleDestroyed;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
        ctx.globalAlpha = 1;
        continue;
      }

      if (obs.type === ObstacleType.REINFORCED) {
        ctx.fillStyle = COLORS.obstacleReinforced;
        ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
        ctx.strokeStyle = COLORS.obstacleReinforcedBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad + 4, y + pad + 4, cs - pad * 2 - 8, cs - pad * 2 - 8);
        ctx.fillStyle = COLORS.obstacleReinforcedBorder;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◆', x + cs / 2, y + cs / 2);
      } else {
        ctx.fillStyle = COLORS.obstacleNormal;
        ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
        ctx.strokeStyle = COLORS.obstacleNormalBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
        ctx.strokeStyle = COLORS.obstacleNormalBorder;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const cx2 = x + cs / 2; const cy2 = y + cs / 2; const s = 6;
        ctx.moveTo(cx2 - s, cy2 - s); ctx.lineTo(cx2 + s, cy2 + s);
        ctx.moveTo(cx2 + s, cy2 - s); ctx.lineTo(cx2 - s, cy2 + s);
        ctx.stroke();
      }
    }
  }

  private drawLasers(game: Game): void {
    const ctx = this.ctx;
    const results = game.laserResults;
    if (!results.length && !this.animatingLasers) return;

    const drawResults = this.animatingLasers ? this.currentLaserResults : results;
    const totalSegments = drawResults.reduce((s, r) => s + r.segments.length, 0);
    const segmentsToShow = this.animatingLasers
      ? Math.floor(this.laserAnimProgress * totalSegments) : totalSegments;

    let segCount = 0;
    for (const result of drawResults) {
      const isPower = result.type === 'power';
      const color = isPower ? COLORS.laserPower : COLORS.laserNormal;
      const lineW = isPower ? RENDER.laserPowerWidth : RENDER.laserWidth;
      const glow = isPower ? RENDER.laserPowerGlow : RENDER.laserGlow;

      for (const seg of result.segments) {
        if (segCount >= segmentsToShow) break;
        segCount++;

        const from = this.gridToPixel(seg.start);
        const to = this.gridToPixel(seg.end);

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = lineW * 0.4;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPreview(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55;
    for (const result of this.previewResults) {
      ctx.strokeStyle = result.type === 'power' ? COLORS.laserPower : '#ffab91';
      for (const segment of result.segments) {
        const from = this.gridToPixel(segment.start);
        const to = this.gridToPixel(segment.end);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawHUD(game: Game, _canvasW: number): void {
    const ctx = this.ctx;
    const y = this.gridOffsetY - 28;

    ctx.fillStyle = COLORS.textPrimary;
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(game.levelData.name, this.gridOffsetX, y);

    ctx.textAlign = 'right';
    ctx.fillText(
      `回合 ${game.turnState.turnCount}/${game.turnState.maxTurns}`,
      this.gridOffsetX + game.grid.width * this.cellSize, y,
    );

    const remaining = game.obstacles.filter(o => !o.destroyed).length;
    const total = game.obstacles.length;
    ctx.textAlign = 'center';
    ctx.fillStyle = remaining === 0 ? COLORS.success : COLORS.textSecondary;
    ctx.fillText(
      `障碍 ${total - remaining}/${total}`,
      this.gridOffsetX + game.grid.width * this.cellSize / 2, y,
    );
  }
}
