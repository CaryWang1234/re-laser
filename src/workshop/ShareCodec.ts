import { LevelData } from '../types/level';
import { isLevelData } from './Schema';

const PREFIX = 'RL1';

/**
 * Encode a level to a compact shareable string.
 * Uses Base64 encoding of JSON (lightweight, no external deps).
 */
export function encodeLevel(level: LevelData): string {
  const json = JSON.stringify(level);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return `${PREFIX}-${base64}`;
}

/**
 * Decode a share code back to a LevelData object.
 */
export function decodeLevel(code: string): LevelData | null {
  try {
    if (code.length > 100000) return null;
    const trimmed = code.trim().includes('#share=') ? code.trim().split('#share=')[1] : code.trim();
    if (!trimmed.startsWith(`${PREFIX}-`)) return null;
    const base64 = trimmed.slice(PREFIX.length + 1);
    const json = decodeURIComponent(escape(atob(base64)));
    const data = JSON.parse(json) as LevelData;
    if (!isLevelData(data)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Generate a shareable URL hash for a level.
 */
export function generateShareUrl(level: LevelData): string {
  const code = encodeLevel(level);
  return `${window.location.origin}${window.location.pathname}#share=${code}`;
}

/**
 * Check if the current URL has a share code and extract it.
 */
export function extractShareFromUrl(): LevelData | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return null;
  const code = hash.slice(7);
  return decodeLevel(code);
}
