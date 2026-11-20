import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmpDir = path.resolve(process.cwd(), 'tmp', 'phase4-cli-test');
const soakCli = path.resolve(process.cwd(), 'dist-cli', 'cli', 'soak.js');
const runCli = path.resolve(process.cwd(), 'dist-cli', 'cli', 'run.js');

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 4 CLIs — Soak Test & Leaderboard Export', () => {
  it('runs soak test for 3 nights with 0 crashes, valid JSON, and bounded memory', () => {
    const out = path.join(tmpDir, 'soak-3.json');
    execFileSync(
      process.execPath,
      ['--expose-gc', '--max-semi-space-size=2', '--no-concurrent-recompilation', '--v8-pool-size=1', soakCli, '--seed', '7', '--nights', '3', '--out', out],
      { stdio: 'pipe' }
    );
    const data = JSON.parse(readFileSync(out, 'utf8'));
    expect(data.nights).toBe(3);
    expect(data.crashes).toBe(0);
    expect(data.results).toHaveLength(3);
    expect(data.mem_start_mb).toBeGreaterThan(0);
    expect(data.mem_end_mb).toBeLessThanOrEqual(data.mem_start_mb * 1.2);
    expect(typeof data.duration_s).toBe('number');
  });

  it('exports sorted top-10 leaderboard via --export-leaderboard', () => {
    const storePath = path.join(tmpDir, 'lb-store.json');
    const outPath = path.join(tmpDir, 'lb-out.json');
    writeFileSync(
      storePath,
      JSON.stringify({
        entries: [
          { name: 'Bob_02', score: 500, nights_won: 1, achieved_at: '2026-11-20T16:10:00+07:00', seed: 2 },
          { name: 'May_01', score: 1200, nights_won: 3, achieved_at: '2026-11-20T16:05:00+07:00', seed: 1 }
        ]
      })
    );

    execFileSync(process.execPath, [runCli, '--export-leaderboard', outPath], {
      env: { ...process.env, DAO_DEN_LONG_LEADERBOARD_PATH: storePath },
      stdio: 'pipe'
    });
    const exported = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(exported.entries).toHaveLength(2);
    expect(exported.entries[0].name).toBe('May_01');
    expect(exported.entries[1].name).toBe('Bob_02');
  });
});
