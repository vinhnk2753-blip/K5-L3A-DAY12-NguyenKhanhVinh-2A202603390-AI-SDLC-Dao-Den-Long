import { describe, expect, it } from 'vitest';
import { addLeaderboardEntry, computeBenchMetrics, validatePlayerName } from '../../src/sim/leaderboard.js';

describe('Leaderboard logic (Ticket-04)', () => {
  it('validates player names: 3-12 chars [A-Za-z0-9_] plus Vietnamese accents', () => {
    expect(validatePlayerName('May_01')).toBe(true);
    expect(validatePlayerName('MinhÁnh')).toBe(true);
    expect(validatePlayerName('ab')).toBe(false);
    expect(validatePlayerName('a'.repeat(13))).toBe(false);
    expect(validatePlayerName('May 01')).toBe(false);
    expect(validatePlayerName('May!@#')).toBe(false);
  });

  it('sorts by score DESC, tie-breaks earlier achieved_at first, and keeps top 10', () => {
    let entries = [] as ReturnType<typeof addLeaderboardEntry>;
    for (let i = 0; i < 12; i++) {
      entries = addLeaderboardEntry(entries, {
        name: `Player_${i}`,
        score: i === 5 || i === 6 ? 900 : i * 50,
        nights_won: i % 4,
        achieved_at: `2026-11-20T16:00:${String(i).padStart(2, '0')}+07:00`,
        seed: 100 + i
      });
    }
    expect(entries).toHaveLength(10);
    expect(entries[0].name).toBe('Player_5'); // tied at 900, earlier timestamp wins!
    expect(entries[1].name).toBe('Player_6');
    expect(entries[2].score).toBe(550);
  });
});

describe('Benchmark metric math (Ticket-04)', () => {
  it('computes avg_fps, p1_low_fps, and frame_ms_p95 according to Ticket-04 formulas', () => {
    // 100 frames: 99 frames at 10ms, 1 frame at 20ms -> sum = 1010ms
    const dts = [...Array(99).fill(10), 20];
    const m = computeBenchMetrics(dts);
    expect(m.frames).toBe(100);
    expect(m.avg_fps).toBeCloseTo((1000 * 100) / 1010, 1);
    // k = max(1, ceil(0.01 * 100)) = 1 -> largest dt = 20ms -> p1_low_fps = 1000/20 = 50.0
    expect(m.p1_low_fps).toBe(50);
    expect(m.frame_ms_p95).toBe(10);
  });
});
