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

describe('Input & Scenario validation', () => {
  it('rejects non-increasing frame ticks and invalid move vectors', () => {
    expect(() => validateInputs({ frames: [{ tick: 10 }, { tick: 10 }] })).toThrow();
    expect(() => validateInputs({ frames: [{ tick: 10 }, { tick: 5 }] })).toThrow();
    expect(() => validateInputs({ frames: [{ tick: 0, move: [1.5, 0] }] })).toThrow();
    expect(() => validateInputs({ frames: 'bad' })).toThrow();
  });

  it('accepts valid inputs and scenario', () => {
    const inp = validateInputs({
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
        { tick: 60, move: [0, 0], interact: true }
      ]
    });
    expect(inp.frames).toHaveLength(2);

    const scen = validateScenario({
      player: { pos: [0, 0, 0], carried: 2, flames: 3 },
      random_motes: false,
      motes: [[0, 0, 5]]
    });
    expect(scen.random_motes).toBe(false);
  });
});

describe('Headless CLI contract v1.0', () => {
  it('runs a scenario, emits valid JSONL, and exits 0 identically across two runs', () => {
    const scenPath = path.join(tmpDir, 'scen.json');
    const inPath = path.join(tmpDir, 'in.json');
    const out1 = path.join(tmpDir, 'out1.jsonl');
    const out2 = path.join(tmpDir, 'out2.jsonl');

    writeFileSync(
      scenPath,
      JSON.stringify({
        player: { pos: [0, 0, 0], carried: 7, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [[0, 0, 2]],
        shades: [],
        lanterns: [
          { id: 'L1', pos: [0, 0, 4], deposited: 0 },
          { id: 'L2', lit: true, deposited: 8 },
          { id: 'L3', lit: true, deposited: 8 },
          { id: 'L4', lit: true, deposited: 8 },
          { id: 'L5', lit: true, deposited: 8 }
        ],
        time_left_s: 120
      })
    );
    writeFileSync(
      inPath,
      JSON.stringify({
        frames: [
          { tick: 0, move: [0, 1] },
          { tick: 35, move: [0, 0], interact: true },
          { tick: 36, interact: false }
        ]
      })
    );

    execFileSync(process.execPath, [cliPath, '--seed', '42', '--night', '1', '--scenario', scenPath, '--inputs', inPath, '--ticks', '200', '--out', out1, '--snapshot-every', '10']);
    execFileSync(process.execPath, [cliPath, '--seed', '42', '--night', '1', '--scenario', scenPath, '--inputs', inPath, '--ticks', '200', '--out', out2, '--snapshot-every', '10']);

    const text1 = readFileSync(out1, 'utf8');
    const text2 = readFileSync(out2, 'utf8');
    expect(text1).toBe(text2);

    const lines = text1.trim().split(/\r?\n/).map((l) => JSON.parse(l));
    expect(lines[0].type).toBe('snapshot');
    expect(lines[0].tick).toBe(0);
    const end = lines[lines.length - 1];
    expect(end.type).toBe('end');
    expect(end.state).toBe('won');
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
