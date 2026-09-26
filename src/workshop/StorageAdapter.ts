import { CustomLevelData } from '../types/level';
import { WorkshopStorage } from '../types/game';
import { STORAGE } from '../constants';

const DEFAULT_STORAGE: WorkshopStorage = {
  version: 1,
  levels: {},
  metadata: { totalLevels: 0, lastModified: Date.now() },
};

export class StorageAdapter {
  private data: WorkshopStorage;

  constructor() {
    this.data = this.load();
  }

  save(level: CustomLevelData): void {
    this.data.levels[level.id] = level;
    this.data.metadata.totalLevels = Object.keys(this.data.levels).length;
    this.data.metadata.lastModified = Date.now();
    this.persist();
  }

  load_level(id: string): CustomLevelData | null {
    return this.data.levels[id] || null;
  }

  delete(id: string): void {
    delete this.data.levels[id];
    this.data.metadata.totalLevels = Object.keys(this.data.levels).length;
    this.data.metadata.lastModified = Date.now();
    this.persist();
  }

  list(): CustomLevelData[] {
    return Object.values(this.data.levels).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getUsage(): { used: number; total: number } {
    let raw = '';
    try { raw = localStorage.getItem(STORAGE.workshop) || ''; } catch { /* unavailable */ }
    return { used: raw.length, total: 5 * 1024 * 1024 };
  }

  private load(): WorkshopStorage {
    try {
      const raw = localStorage.getItem(STORAGE.workshop);
      if (raw) {
        const parsed = JSON.parse(raw) as WorkshopStorage;
        if (parsed.version === 1) return parsed;
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_STORAGE, levels: {}, metadata: { ...DEFAULT_STORAGE.metadata } };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE.workshop, JSON.stringify(this.data));
    } catch {
      console.warn('Workshop storage full');
    }
  }
}
