import { round1 } from './rng.js';

export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

export interface BenchMetrics {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
}

const NAME_RE = /^[\p{L}0-9_]{3,12}$/u;

export function validatePlayerName(name: string): boolean {
  return NAME_RE.test(name);
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.achieved_at);
      const tb = Date.parse(b.achieved_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .slice(0, 10);
}

export function addLeaderboardEntry(entries: LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  if (!validatePlayerName(entry.name)) {
    throw new Error('Tên phải dài 3–12 ký tự (chữ, số hoặc dấu gạch dưới _).');
  }
  const clean: LeaderboardEntry = {
    name: entry.name,
    score: Math.max(0, Math.floor(entry.score)),
    nights_won: Math.max(0, Math.min(3, Math.floor(entry.nights_won))),
    achieved_at: entry.achieved_at,
    seed: Math.floor(entry.seed)
  };
  return sortLeaderboard([...entries, clean]);
}

export function formatIsoWithLocalOffset(date: Date = new Date()): string {
  const pad = (n: number): string => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const tzMin = -date.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(tzMin) / 60));
  const mm = pad(Math.abs(tzMin) % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hh}:${mm}`
  );
}

export function computeBenchMetrics(dtsMs: number[]): BenchMetrics {
  const valid = dtsMs.filter((d) => Number.isFinite(d) && d > 0);
  const n = valid.length;
  if (n === 0) {
    return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  }

  let sum = 0;
  for (let i = 0; i < n; i++) sum += valid[i];
  const avgFps = (1000 * n) / sum;

  const sortedAsc = [...valid].sort((a, b) => a - b);
  const p95Idx = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
  const frameMsP95 = sortedAsc[p95Idx];

  const k = Math.max(1, Math.ceil(0.01 * n));
  let worstSum = 0;
  for (let i = n - k; i < n; i++) {
    worstSum += sortedAsc[i];
  }
  const p1LowFps = 1000 / (worstSum / k);

  return {
    frames: n,
    avg_fps: round1(avgFps),
    p1_low_fps: round1(p1LowFps),
    frame_ms_p95: round1(frameMsP95)
  };
}
