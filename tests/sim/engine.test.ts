import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../src/sim/config.js';
import { createSimulation, runSimulation } from '../../src/sim/engine.js';
import type { InputFrame, ScenarioConfig } from '../../src/sim/types.js';

/**
 * Phase 1-2 Regression Suite — updated for Ticket-03 ("Đèn cạn dầu", Contract v1.2, ADR-001):
 * - Replaced early win ("all_lit") test: Ticket-03 removes early win on lighting all lanterns;
 *   lighting the 5th lantern keeps state="playing" and emits lantern_lit {relight: false} with
 *   new scoring (+5/mote, +100 first light). Win is now evaluated at dawn ("dawn_survived").
 * - Updated dawn win test: reaching dawn with >= 3/5 lit lanterns wins with reason="dawn_survived".
 * - All non-replaced Phase 1-2 mechanics (movement, yaw, jump, pulse, shade hit, safe zone >=30 fuel,
 *   determinism) remain strictly verified.
 */
describe('Contract v1.2 sync', () => {
  it('matches game.contract.json tuning exactly', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.2');
    expect(contract.tuning).toEqual(STANDARD_TUNING);
  });
});

describe('Simulation core — Phase 1-2 Regression under Contract v1.2', () => {
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
    expect(snap.player.capacity).toBe(10); // pre-lit scenario lantern does NOT increase capacity
    const l1 = snap.lanterns.find((l) => l.id === 'L1');
    expect(l1?.lit).toBe(true);
    expect(l1?.fuel).toBe(100); // default fuel=100 when scenario sets lit:true without fuel
    expect(sim.drainEvents()).toEqual([]);
  });

  it('moves according to cam_yaw_deg and normalizes move vectors > 1', () => {
    const baseScenario: ScenarioConfig = { random_motes: false, random_shades: false, motes: [], shades: [] };

    const r1 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 0 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    expect(r1.snapshots[r1.snapshots.length - 1].player.pos[2]).toBeCloseTo(STANDARD_TUNING.player_speed, 2);

    const r2 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    expect(r2.snapshots[r2.snapshots.length - 1].player.pos[0]).toBeCloseTo(STANDARD_TUNING.player_speed, 2);

    const r3 = runSimulation({
      seed: 1,
      night: 1,
      scenario: baseScenario,
      inputs: { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 0 }] },
      ticks: 60,
      snapshotEvery: 60
    });
    const last3 = r3.snapshots[r3.snapshots.length - 1];
    expect(Math.hypot(last3.player.pos[0], last3.player.pos[2])).toBeCloseTo(STANDARD_TUNING.player_speed, 2);
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

  it('lights all 5 lanterns with +5/mote +100 first light and does NOT end early (replaces old all_lit rule per Ticket-03)', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 9, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 2]],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 4], deposited: 0, lit: false },
        { id: 'L2', lit: true, fuel: 100 },
        { id: 'L3', lit: true, fuel: 100 },
        { id: 'L4', lit: true, fuel: 100 },
        { id: 'L5', lit: true, fuel: 100 }
      ],
      time_left_s: 100
    };

    const frames: InputFrame[] = [
      { tick: 0, move: [0, 1] },
      { tick: 35, move: [0, 0], interact: true },
      { tick: 36, interact: false }
    ];
    const res = runSimulation({ seed: 7, night: 1, scenario, inputs: { frames }, ticks: 60, snapshotEvery: 10 });

    expect(res.events.some((e) => e.name === 'mote_picked' && e.data.carried === 10)).toBe(true);
    expect(res.events.some((e) => e.name === 'deposit' && e.data.lantern_id === 'L1' && e.data.amount === 10)).toBe(true);
    expect(res.events.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1' && e.data.relight === false)).toBe(true);
    // Ticket-03: no early win! Still playing after lighting all 5 lanterns
    expect(res.events.find((e) => e.name === 'game_over')).toBeUndefined();
    expect(res.end.state).toBe('playing');
    // New scoring: 10 * 5 + 100 = 150
    expect(res.end.score).toBe(150);
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

    const s1 = res.snapshots[20].shades.find((s) => s.id === 'S1');
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
    expect(res.events.find((e) => e.name === 'player_hit')?.data).toEqual({ by: 'shade', flames: 0, dropped: 2 });
    expect(res.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'lost', reason: 'no_flames' });
    expect(res.end.state).toBe('lost');
  });

  it('blocks shades outside lit lantern safe_radius (6m) while fuel >= 30', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 100 }],
      shades: [{ id: 'S1', pos: [0, 1, 16] }]
    };
    const res = runSimulation({ seed: 4, night: 1, scenario, ticks: 180, snapshotEvery: 10 });
    expect(res.events.filter((e) => e.name === 'player_hit')).toHaveLength(0);
    for (const snap of res.snapshots) {
      const s1 = snap.shades[0];
      expect(Math.hypot(s1.pos[0], s1.pos[2] - 25)).toBeGreaterThanOrEqual(STANDARD_TUNING.safe_radius - 0.02);
    }
  });

  it('ends with dawn loss when < 60% lit at dawn, and dawn_survived win when >= 60% lit at dawn (Ticket-03)', () => {
    const lossRes = runSimulation({
      seed: 5,
      night: 1,
      scenario: { random_motes: false, random_shades: false, motes: [], shades: [], time_left_s: 1 },
      ticks: 120,
      snapshotEvery: 10
    });
    expect(lossRes.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'lost', reason: 'dawn' });
    expect(lossRes.end.ticks).toBe(60);

    // 3/5 lit lanterns at dawn (exact 60% threshold for Night 1) -> won / dawn_survived!
    const winAtDawn = runSimulation({
      seed: 5,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 2 },
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 60 },
          { id: 'L3', lit: true, fuel: 70 },
          { id: 'L4', lit: false },
          { id: 'L5', lit: false }
        ],
        time_left_s: 1
      },
      ticks: 120,
      snapshotEvery: 60
    });
    expect(winAtDawn.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'won', reason: 'dawn_survived' });
    // After 1s (60 ticks), fuels are 49, 59, 69 -> bonus = (50+49)+(50+59)+(50+69) + 2*50 = 99+109+119+100 = 427
    expect(winAtDawn.end.score).toBe(427);
  });

  it('is strictly deterministic for identical seeds', () => {
    const a = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    const b = runSimulation({ seed: 2026, night: 1, ticks: 600, snapshotEvery: 20 });
    expect(a).toEqual(b);
  });
});
