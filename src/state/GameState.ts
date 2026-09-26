import { Screen, GameResult, LevelRecord } from '../types';
import { STORAGE } from '../constants';
import { Game } from '../models/Game';
import { LevelData } from '../types/level';

export class GameState {
  currentScreen: Screen = 'MENU';
  game: Game | null = null;
  currentLevel: LevelData | null = null;
  records: Map<string, LevelRecord> = new Map();

  constructor() {
    this.loadRecords();
  }

  loadLevel(level: LevelData): void {
    this.currentLevel = level;
    this.game = new Game(level);
    this.currentScreen = 'PLAYING';
  }

  resetLevel(): void {
    if (this.game) this.game.reset();
  }

  handleResult(result: GameResult): void {
    if (!this.game || !this.currentLevel) return;
    if (result === 'WIN') {
      this.saveRecord(this.currentLevel.id, this.game.turnState.turnCount);
    }
  }

  goToScreen(screen: Screen): void {
    this.currentScreen = screen;
  }

  getRecord(levelId: string): LevelRecord | undefined {
    return this.records.get(levelId);
  }

  getStars(levelId: string, turns: number, par: number): number {
    if (turns <= par) return 3;
    if (turns <= Math.ceil(par * 1.5)) return 2;
    return 1;
  }

  getBestStars(levelId: string): number {
    const rec = this.records.get(levelId);
    return rec ? rec.bestStars : 0;
  }

  private saveRecord(levelId: string, turns: number): void {
    const level = this.currentLevel!;
    const stars = this.getStars(levelId, turns, level.par);
    const existing = this.records.get(levelId);
    const now = Date.now();
    const score = this.calcScore(turns, level.maxTurns, stars);

    if (existing) {
      existing.bestScore = Math.max(existing.bestScore, score);
      existing.bestStars = Math.max(existing.bestStars, stars);
      existing.bestTurns = Math.min(existing.bestTurns, turns);
      existing.clearCount++;
      existing.lastClearedAt = now;
    } else {
      this.records.set(levelId, {
        levelId, bestScore: score, bestStars: stars, bestTurns: turns,
        clearCount: 1, firstClearedAt: now, lastClearedAt: now,
      });
    }
    this.persistRecords();
  }

  private calcScore(turns: number, maxTurns: number, stars: number): number {
    let score = 1000;
    score += Math.max(0, (maxTurns - turns) * 50);
    if (stars === 3) score += 500;
    return score;
  }

  private loadRecords(): void {
    try {
      const raw = localStorage.getItem(STORAGE.records);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, LevelRecord>;
        for (const [k, v] of Object.entries(data)) this.records.set(k, v);
      }
    } catch { /* ignore */ }
  }

  private persistRecords(): void {
    const obj: Record<string, LevelRecord> = {};
    for (const [k, v] of this.records) obj[k] = v;
    try { localStorage.setItem(STORAGE.records, JSON.stringify(obj)); } catch { /* Keep progress in memory if storage is unavailable. */ }
  }
}
