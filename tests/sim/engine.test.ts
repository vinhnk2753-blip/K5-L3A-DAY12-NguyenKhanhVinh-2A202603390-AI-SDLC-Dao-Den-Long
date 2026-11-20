import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE1_TUNING } from '../../src/sim/config.js';
import { createSimulation, runSimulation } from '../../src/sim/engine.js';
import type { InputFrame, ScenarioConfig } from '../../src/sim/types.js';

describe('Contract sync', () => {
  it('matches game.contract.json tuning exactly', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.0');
    expect(contract.tuning).toEqual(PHASE1_TUNING);
  });
});

describe('Simulation core (Phase 1)', () => {
  it('creates tick 0 snapshot from scenario without emitting events or awarding score', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [1, 0, 2], carried: 4, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 5]],
      shades: [{ id: 'S1', pos: [10, 0, 0] }],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, deposited: 8 }],
      time_left_s: 120
    };
    const sim = createSimulation({ seed: 1, night: 1, scenario });
    const snap = sim.getSnapshot();
    expect(snap.tick).toBe(0);
    expect(snap.sim_tick).toBe(0);
    expect(snap.state).toBe('playing');
    expect(snap.score).toBe(0);
    expect(snap.time_left_s).toBe(120);
    expect(snap.player.pos).toEqual([1, 0, 2]);
    expect(snap.player.carried).toBe(4);
    expect(snap.player.flames).toBe(2);
    expect(snap.lanterns.find((l) => l.id === 'L1')?.lit).toBe(true);
    expect(snap.motes_active).toBe(1);
    expect(snap.shades).toHaveLength(1);
    expect(sim.drainEvents()).toEqual([]);
  });

  it('moves according to cam_yaw_deg and normalizes move vectors > 1', () => {
    const baseScenario: ScenarioConfig = {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    };

    // Move +Z with yaw 0 for 60 ticks (1s) -> z = player_speed (6.5)
    const r1 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 0 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    const last1 = r1.snapshots[r1.snapshots.length - 1];
    expect(last1.player.pos[0]).toBeCloseTo(0, 2);
    expect(last1.player.pos[2]).toBeCloseTo(PHASE1_TUNING.player_speed, 2);

    // Move [0, 1] with yaw 90 deg -> x' = sin(90) = +1, z' = cos(90) = 0 -> moves +X
    const r2 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    const last2 = r2.snapshots[r2.snapshots.length - 1];
    expect(last2.player.pos[0]).toBeCloseTo(PHASE1_TUNING.player_speed, 2);
    expect(last2.player.pos[2]).toBeCloseTo(0, 2);

    // Diagonal [1, 1] normalized -> total distance in 1s equals player_speed, not sqrt(2)*player_speed
    const r3 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 0 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    const last3 = r3.snapshots[r3.snapshots.length - 1];
    const dist = Math.hypot(last3.player.pos[0], last3.player.pos[2]);
    expect(dist).toBeCloseTo(PHASE1_TUNING.player_speed, 2);
  });

  it('jumps on false->true edge when grounded and lands back on Y=0', () => {
    const scenario: ScenarioConfig = { random_motes: false, random_shades: false, motes: [], shades: [] };
    const frames: InputFrame[] = [
      { tick: 0, jump: true },
      { tick: 1, jump: false },
      { tick: 10, jump: true }, // mid-air jump should be ignored
      { tick: 11, jump: false }
    ];
    const res = runSimulation({ seed: 1, night: 1, scenario, inputs: { frames }, ticks: 60, snapshotEvery: 1 });
    const peakY = Math.max(...res.snapshots.map((s) => s.player.pos[1]));
    expect(peakY).toBeGreaterThan(1.1);
    expect(peakY).toBeLessThan(1.3);
    expect(res.snapshots[res.snapshots.length - 1].player.pos[1]).toBe(0);
  });

  it('picks up motes up to carry_capacity, deposits on interact, lights all lanterns, and wins', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 7, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 2]],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 4], deposited: 0, lit: false },
        { id: 'L2', lit: true, deposited: 8 },
        { id: 'L3', lit: true, deposited: 8 },
        { id: 'L4', lit: true, deposited: 8 },
        { id: 'L5', lit: true, deposited: 8 }
      ],
      time_left_s: 100
    };

    const frames: InputFrame[] = [
      { tick: 0, move: [0, 1] },
      { tick: 35, move: [0, 0], interact: true },
      { tick: 36, interact: false }
    ];
    const res = runSimulation({ seed: 7, night: 1, scenario, inputs: { frames }, ticks: 120, snapshotEvery: 10 });

    expect(res.events.some((e) => e.name === 'mote_picked' && e.data.carried === 8)).toBe(true);
    expect(res.events.some((e) => e.name === 'deposit' && e.data.lantern_id === 'L1' && e.data.amount === 8)).toBe(true);
    expect(res.events.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1')).toBe(true);
    const go = res.events.find((e) => e.name === 'game_over');
    expect(go).toBeDefined();
    expect(go?.data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(res.end.state).toBe('won');
    // Score: 8*10 (deposit) + 100 (lantern) + floor(time_left)*2 + 3*50
    expect(res.end.score).toBe(80 + 100 + 99 * 2 + 150);
  });

  it('pulses to stun and push nearby shades, consumes pulse_cost, and enforces cooldown', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [
        { id: 'S1', pos: [3, 0, 0] },
        { id: 'S2', pos: [20, 0, 0] }
      ]
    };
    const frames: InputFrame[] = [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
      { tick: 5, pulse: true }, // on cooldown -> ignored
      { tick: 6, pulse: false }
    ];
    const res = runSimulation({ seed: 2, night: 1, scenario, inputs: { frames }, ticks: 30, snapshotEvery: 1 });

    const pulseEvents = res.events.filter((e) => e.name === 'pulse');
    expect(pulseEvents).toHaveLength(1);
    expect(pulseEvents[0].tick).toBe(1);
    expect(pulseEvents[0].data.stunned_ids).toEqual(['S1']);

    const snap1 = res.snapshots[1];
    expect(snap1.player.carried).toBe(3);
    expect(snap1.score).toBe(PHASE1_TUNING.score.per_stun);
    expect(snap1.shades.find((s) => s.id === 'S1')?.state).toBe('stunned');

    // After 15 ticks of push, S1 should have moved +4.0m along +X (from 3 to 7)
    const snap20 = res.snapshots[20];
    const s1 = snap20.shades.find((s) => s.id === 'S1');
    expect(s1?.pos[0]).toBeCloseTo(7.0, 1);
    expect(s1?.state).toBe('stunned');
  });

  it('handles shade hit: loses flame, drops half motes, grants invuln, and loses at 0 flames', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 5, flames: 1 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [1.5, 0, 0] }]
    };
    const res = runSimulation({ seed: 3, night: 1, scenario, ticks: 60, snapshotEvery: 10 });
    const hit = res.events.find((e) => e.name === 'player_hit');
    expect(hit).toBeDefined();
    expect(hit?.data).toEqual({ by: 'shade', flames: 0, dropped: 2 });
    const go = res.events.find((e) => e.name === 'game_over');
    expect(go?.data).toEqual({ result: 'lost', reason: 'no_flames' });
    expect(res.end.state).toBe('lost');
  });

  it('blocks shades outside lit lantern safe_radius', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, deposited: 8 }],
      shades: [{ id: 'S1', pos: [0, 0, 16] }] // 9m away -> chases toward player at (0,0,25)
    };
    const res = runSimulation({ seed: 4, night: 1, scenario, ticks: 180, snapshotEvery: 10 });
    expect(res.events.filter((e) => e.name === 'player_hit')).toHaveLength(0);
    for (const snap of res.snapshots) {
      const s1 = snap.shades[0];
      const dist = Math.hypot(s1.pos[0] - 0, s1.pos[2] - 25);
      expect(dist).toBeGreaterThanOrEqual(PHASE1_TUNING.safe_radius - 0.02);
    }
  });

  it('ends with dawn loss when time runs out', () => {
    const scenario: ScenarioConfig = {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 1
    };
    const res = runSimulation({ seed: 5, night: 1, scenario, ticks: 120, snapshotEvery: 10 });
    const go = res.events.find((e) => e.name === 'game_over');
    expect(go?.tick).toBe(60);
    expect(go?.data).toEqual({ result: 'lost', reason: 'dawn' });
    expect(res.end).toEqual({ type: 'end', ticks: 60, state: 'lost', score: 0 });
  });

  it('is strictly deterministic for identical seeds', () => {
    const a = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    const b = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    expect(a).toEqual(b);
  });
});
