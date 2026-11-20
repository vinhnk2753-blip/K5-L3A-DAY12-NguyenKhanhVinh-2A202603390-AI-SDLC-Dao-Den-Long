import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateInputs, validateScenario } from '../../src/sim/validation.js';

const tmpDir = path.resolve(process.cwd(), 'tmp', 'cli-test');
const cliPath = path.resolve(process.cwd(), 'dist-cli', 'cli', 'headless.js');

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Input & Scenario validation (Contract v1.1)', () => {
  it('rejects non-increasing frame ticks and invalid move vectors', () => {
    expect(() => validateInputs({ frames: [{ tick: 10 }, { tick: 10 }] })).toThrow();
    expect(() => validateInputs({ frames: [{ tick: 10 }, { tick: 5 }] })).toThrow();
    expect(() => validateInputs({ frames: [{ tick: 0, move: [1.5, 0] }] })).toThrow();
    expect(() => validateInputs({ frames: 'bad' })).toThrow();
  });

  it('accepts valid v1.1 inputs (dash, pause) and scenario fields', () => {
    const inp = validateInputs({
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0, dash: true },
        { tick: 10, pause: true }
      ]
    });
    expect(inp.frames).toHaveLength(2);

    const scen = validateScenario({
      player: { pos: [0, 0, 0], carried: 2, flames: 3, invuln_ticks: 30, dash_cd_ticks: 0, pulse_cd_ticks: 0, charm_ticks: 100 },
      random_motes: false,
      random_drifters: false,
      wind_enabled: true,
      shades: [{ id: 'S1', pos: [10, 1, 0], state: 'stunned', state_ticks_left: 60 }],
      drifters: [{ id: 'D1', pos: [5, 1.2, 5], state: 'idle', stolen: 0 }],
      charms: [{ id: 'C1', pos: [35, 0, 0], available: true, respawn_s: 0 }]
    });
    expect(scen.wind_enabled).toBe(true);
  });
});

describe('Headless CLI Contract v1.1', () => {
  it('runs Night 1, 2, 3 cleanly with v1.1 snapshots and deterministic output', () => {
    for (const night of [1, 2, 3]) {
      const out1 = path.join(tmpDir, `n${night}-1.jsonl`);
      const out2 = path.join(tmpDir, `n${night}-2.jsonl`);
      execFileSync(process.execPath, [cliPath, '--seed', '42', '--night', String(night), '--ticks', '180', '--out', out1, '--snapshot-every', '30']);
      execFileSync(process.execPath, [cliPath, '--seed', '42', '--night', String(night), '--ticks', '180', '--out', out2, '--snapshot-every', '30']);

      const text1 = readFileSync(out1, 'utf8');
      const text2 = readFileSync(out2, 'utf8');
      expect(text1).toBe(text2);

      const lines = text1.trim().split(/\r?\n/).map((l) => JSON.parse(l));
      expect(lines[0].type).toBe('snapshot');
      expect(lines[0].tick).toBe(0);
      expect(lines[0].night).toBe(night);
      expect(lines[0].wind).toEqual({ active: false, dir_deg: 0 });
      expect(Array.isArray(lines[0].motes)).toBe(true);
      expect(Array.isArray(lines[0].drifters)).toBe(true);
      expect(Array.isArray(lines[0].charms)).toBe(true);
      expect(lines[1]).toEqual({ type: 'event', tick: 0, name: 'night_start', data: { night } });
      const end = lines[lines.length - 1];
      expect(end.type).toBe('end');
    }
  });

  it('exits with code 2 when inputs file has invalid JSON or non-increasing ticks', () => {
    const badPath = path.join(tmpDir, 'bad-ticks.json');
    const outPath = path.join(tmpDir, 'bad-out.jsonl');
    writeFileSync(badPath, JSON.stringify({ frames: [{ tick: 5 }, { tick: 5 }] }));

    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [cliPath, '--seed', '1', '--night', '1', '--inputs', badPath, '--ticks', '10', '--out', outPath], {
        stdio: 'pipe'
      });
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: Buffer };
      status = e.status ?? 0;
      stderr = e.stderr?.toString('utf8') ?? '';
    }
    expect(status).toBe(2);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
