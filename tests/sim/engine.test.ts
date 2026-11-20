import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../src/sim/config.js';
import { createSimulation, runSimulation } from '../../src/sim/engine.js';
import type { InputFrame, ScenarioConfig } from '../../src/sim/types.js';

/**
 * Phase 1 Regression Suite — updated for Ticket-02 standardized constants:
 * - PHASE1_TUNING replaced by STANDARD_TUNING (player_speed 6.5->6.0, lantern_cost 8->10,
 *   pickup_radius 1.2->1.0, interact_radius 2.2->2.0, night1_duration_s 240->300, fall_enabled false->true).
 * - Reason: Ticket-02 Part 1 mandates standardized tuning across all submissions while keeping
 *   all Phase 1 gameplay behaviors passing regression.
 */
describe('Contract v1.1 sync', () => {
  it('matches game.contract.json tuning exactly', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.1');
    expect(contract.tuning).toEqual(STANDARD_TUNING);
  });
});

describe('Simulation core — Phase 1 Regression with Standardized Constants', () => {
  it('creates tick 0 snapshot from scenario without emitting events or awarding score', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [1, 0, 2], carried: 4, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 5]],
      shades: [{ id: 'S1', pos: [10, 0, 0] }],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, deposited: 10 }],
      time_left_s: 120
    };
    const sim = createSimulation({ seed: 1, night: 1, scenario });
    const snap = sim.getSnapshot();
    expect(snap.tick).toBe(0);
    expect(snap.sim_tick).toBe(0);
    expect(snap.night).toBe(1);
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
    expect(last1.player.pos[2]).toBeCloseTo(STANDARD_TUNING.player_speed, 2);

    const r2 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    const last2 = r2.snapshots[r2.snapshots.length - 1];
    expect(last2.player.pos[0]).toBeCloseTo(STANDARD_TUNING.player_speed, 2);
    expect(last2.player.pos[2]).toBeCloseTo(0, 2);

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
    expect(dist).toBeCloseTo(STANDARD_TUNING.player_speed, 2);
  });

  it('jumps on false->true edge when grounded and lands back on Y=0', () => {
    const scenario: ScenarioConfig = { random_motes: false, random_shades: false, motes: [], shades: [] };
    const frames: InputFrame[] = [
      { tick: 0, jump: true },
      { tick: 1, jump: false },
      { tick: 10, jump: true },
      { tick: 11, jump: false }
    ];
    const res = runSimulation({ seed: 1, night: 1, scenario, inputs: { frames }, ticks: 60, snapshotEvery: 1 });
    const peakY = Math.max(...res.snapshots.map((s) => s.player.pos[1]));
    expect(peakY).toBeGreaterThan(1.1);
    expect(peakY).toBeLessThan(1.3);
    expect(res.snapshots[res.snapshots.length - 1].player.pos[1]).toBe(0);
    expect(res.snapshots[res.snapshots.length - 1].player.grounded).toBe(true);
  });

  it('picks up motes, deposits 10 into final lantern, lights all 5, and wins with exact score', () => {
    // Updated lantern_cost 8 -> 10 per Ticket-02 Part 1
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 9, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 2]],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 4], deposited: 0, lit: false },
        { id: 'L2', lit: true, deposited: 10 },
        { id: 'L3', lit: true, deposited: 10 },
        { id: 'L4', lit: true, deposited: 10 },
        { id: 'L5', lit: true, deposited: 10 }
      ],
      time_left_s: 100
    };

    const frames: InputFrame[] = [
      { tick: 0, move: [0, 1] },
      { tick: 35, move: [0, 0], interact: true },
      { tick: 36, interact: false }
    ];
    const res = runSimulation({ seed: 7, night: 1, scenario, inputs: { frames }, ticks: 120, snapshotEvery: 10 });

    expect(res.events.some((e) => e.name === 'mote_picked' && e.data.carried === 10)).toBe(true);
    expect(res.events.some((e) => e.name === 'deposit' && e.data.lantern_id === 'L1' && e.data.amount === 10)).toBe(true);
    expect(res.events.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1')).toBe(true);
    const go = res.events.find((e) => e.name === 'game_over');
    expect(go?.data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(res.end.state).toBe('won');
    // Score: 10*10 + 100 + 99*2 + 3*50 = 548
    expect(res.end.score).toBe(100 + 100 + 99 * 2 + 150);
  });

  it('pulses to stun and push nearby shades (3D from player.y+0.8), enforces cooldown', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [
        { id: 'S1', pos: [3, 1, 0] },
        { id: 'S2', pos: [20, 1, 0] }
      ]
    };
    const frames: InputFrame[] = [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
      { tick: 5, pulse: true },
      { tick: 6, pulse: false }
    ];
    const res = runSimulation({ seed: 2, night: 1, scenario, inputs: { frames }, ticks: 30, snapshotEvery: 1 });

    const pulseEvents = res.events.filter((e) => e.name === 'pulse');
    expect(pulseEvents).toHaveLength(1);
    expect(pulseEvents[0].data.stunned_ids).toEqual(['S1']);

    const snap20 = res.snapshots[20];
    const s1 = snap20.shades.find((s) => s.id === 'S1');
    expect(s1?.pos[0]).toBeCloseTo(7.0, 1);
    expect(s1?.state).toBe('stunned');
  });

  it('handles shade hit: loses flame, drops floor(carried/2), and loses at 0 flames', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 5, flames: 1 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [1.5, 1, 0] }]
    };
    const res = runSimulation({ seed: 3, night: 1, scenario, ticks: 60, snapshotEvery: 10 });
    const hit = res.events.find((e) => e.name === 'player_hit');
    expect(hit?.data).toEqual({ by: 'shade', flames: 0, dropped: 2 });
    const go = res.events.find((e) => e.name === 'game_over');
    expect(go?.data).toEqual({ result: 'lost', reason: 'no_flames' });
    expect(res.end.state).toBe('lost');
  });

  it('blocks shades outside lit lantern safe_radius (6m)', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, deposited: 10 }],
      shades: [{ id: 'S1', pos: [0, 1, 16] }]
    };
    const res = runSimulation({ seed: 4, night: 1, scenario, ticks: 180, snapshotEvery: 10 });
    expect(res.events.filter((e) => e.name === 'player_hit')).toHaveLength(0);
    for (const snap of res.snapshots) {
      const s1 = snap.shades[0];
      expect(Math.hypot(s1.pos[0], s1.pos[2] - 25)).toBeGreaterThanOrEqual(STANDARD_TUNING.safe_radius - 0.02);
    }
  });

  it('ends with dawn loss when time runs out, but all_lit wins even on exact dawn tick', () => {
    const lossRes = runSimulation({
      seed: 5,
      night: 1,
      scenario: { random_motes: false, random_shades: false, motes: [], shades: [], time_left_s: 1 },
      ticks: 120,
      snapshotEvery: 10
    });
    expect(lossRes.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'lost', reason: 'dawn' });
    expect(lossRes.end.ticks).toBe(60);

    // Light final lantern on the exact tick timer hits 0 -> still won!
    const winOnLastTick = runSimulation({
      seed: 5,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 25], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true, deposited: 10 },
          { id: 'L3', lit: true, deposited: 10 },
          { id: 'L4', lit: true, deposited: 10 },
          { id: 'L5', lit: true, deposited: 10 }
        ],
        time_left_s: 1 / 60
      },
      inputs: { frames: [{ tick: 0, interact: true }] },
      ticks: 5,
      snapshotEvery: 1
    });
    expect(winOnLastTick.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'won', reason: 'all_lit' });
  });

  it('is strictly deterministic for identical seeds', () => {
    const a = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    const b = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    expect(a).toEqual(b);
  });
});
