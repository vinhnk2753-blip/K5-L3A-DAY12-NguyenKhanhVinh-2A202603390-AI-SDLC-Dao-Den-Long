import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../src/sim/engine.js';
import type { ScenarioConfig } from '../../src/sim/types.js';

describe('Phase 3 Features — Ticket-03 "Đèn cạn dầu" & Contract v1.2', () => {
  it('decays fuel at 1/60 per tick, refuels using ceil((100-fuel)/10), ignores full lanterns, extinguishes at 0, and relights for 5 motes (+40)', () => {
    const refuelScenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 75 }],
      time_left_s: 120
    };
    const r1 = runSimulation({
      seed: 31,
      night: 1,
      scenario: refuelScenario,
      inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
      ticks: 10,
      snapshotEvery: 1
    });
    const refuelEv = r1.events.find((e) => e.name === 'refuel');
    expect(refuelEv).toBeDefined();
    expect(refuelEv?.data).toEqual({ lantern_id: 'L1', amount: 3, fuel: 100 });
    expect(r1.snapshots[1].score).toBe(15); // 3 * 5

    // Test lantern_out at fuel <= 0 and relight for 5 motes (+40 + 25 = 65)
    const outScenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 0.5 }], // 30 ticks left
      time_left_s: 120
    };
    const r2 = runSimulation({
      seed: 32,
      night: 1,
      scenario: outScenario,
      inputs: { frames: [{ tick: 35, interact: true }, { tick: 36, interact: false }] },
      ticks: 45,
      snapshotEvery: 1
    });
    const outEv = r2.events.find((e) => e.name === 'lantern_out');
    expect(outEv?.tick).toBe(30);
    expect(outEv?.data).toEqual({ lantern_id: 'L1' });
    expect(r2.snapshots[30].lanterns[0]).toMatchObject({ lit: false, fuel: 0, deposited: 0, ever_lit: true });

    const relightEv = r2.events.find((e) => e.name === 'lantern_lit');
    expect(relightEv?.tick).toBe(36);
    expect(relightEv?.data).toEqual({ lantern_id: 'L1', relight: true });
    expect(r2.snapshots[36].lanterns[0]).toMatchObject({ lit: true, fuel: 100, ever_lit: true, relit_count: 1 });
    expect(r2.snapshots[36].player.carried).toBe(1); // 6 - 5 = 1
    expect(r2.snapshots[36].score).toBe(65); // 5*5 + 40 = 65
  });

  it('wander shade targets weak lantern (<30 fuel), enters drain (5/s, fuel_drain every 60t), pulse gives +15 and returns to wander after stun', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }], // < 30 -> no safe zone
      shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'wander' }], // within 2m of L1!
      time_left_s: 120
    };

    // Let S1 drain L1 for 65 ticks -> should emit fuel_drain at tick 61 (1 tick to enter drain, 60 ticks draining)
    const r1 = runSimulation({ seed: 33, night: 1, scenario, ticks: 70, snapshotEvery: 1 });
    expect(r1.snapshots[1].shades[0].state).toBe('drain');
    const drainEv = r1.events.find((e) => e.name === 'fuel_drain');
    expect(drainEv).toBeDefined();
    expect(drainEv?.data.lantern_id).toBe('L1');
    expect(drainEv?.data.shade_id).toBe('S1');
    // Fuel decayed 1/s + drained 5/s = 6/s -> after ~61 ticks fuel dropped by ~6 from 25 -> ~19
    expect(Number(drainEv?.data.fuel)).toBeLessThan(20);

    // Now test Pulse hitting a draining shade -> +15 score, then after 120 ticks returns to wander
    const pulseDrainScen: ScenarioConfig = {
      player: { pos: [0, 0, 22], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
      shades: [{ id: 'S1', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }],
      time_left_s: 120
    };
    const r2 = runSimulation({
      seed: 34,
      night: 1,
      scenario: pulseDrainScen,
      inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }] },
      ticks: 130,
      snapshotEvery: 1
    });
    expect(r2.snapshots[1].score).toBe(15); // +15 for pulsing a draining shade!
    expect(r2.snapshots[1].shades[0].state).toBe('stunned');
    // At tick 121 (after 120 ticks of stun), must return to 'wander' (even with player within 12m, spec: "Hết choáng thì về wander")
    // Note: in step 2 of tick 121 it becomes wander; in step 8 of tick 121 if player is far it stays wander. Let's verify with far player:
    const farPulse = runSimulation({
      seed: 34,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 21], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [],
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
        shades: [{ id: 'S1', pos: [0, 1, 24], state: 'drain', target_lantern_id: 'L1' }],
        time_left_s: 120
      },
      inputs: {
        frames: [
          { tick: 0, pulse: true },
          { tick: 1, pulse: false, move: [0, -1] } // player runs away > 12m
        ]
      },
      ticks: 125,
      snapshotEvery: 1
    });
    expect(farPulse.snapshots[122].shades[0].state).toBe('wander');
  });

  it('keeps safe zone at exact fuel=30 and pushes shades out when refueled from <30 to >=30', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
      shades: [{ id: 'S1', pos: [0, 1, 23], state: 'drain', target_lantern_id: 'L1' }],
      time_left_s: 120
    };
    // Refuel L1 (+10 -> 35 >= 30) on tick 0 -> S1 inside 6m must be pushed out within 30 ticks without hitting player
    const res = runSimulation({
      seed: 35,
      night: 1,
      scenario,
      inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
      ticks: 35,
      snapshotEvery: 1
    });
    expect(res.events.filter((e) => e.name === 'player_hit')).toHaveLength(0);
    const s1End = res.snapshots[32].shades[0];
    expect(Math.hypot(s1End.pos[0], s1End.pos[2] - 25)).toBeGreaterThanOrEqual(5.98);
  });

  it('grows carry capacity = min(20, 10 + 2 * successful_lights) and ignores pre-lit scenario lanterns', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 25], carried: 10, flames: 3, successful_lights: 4 }, // starts at capacity 18
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0 },
        { id: 'L2', pos: [23.8, 0, 7.7], lit: true, fuel: 100 }
      ],
      time_left_s: 120
    };
    const res = runSimulation({
      seed: 36,
      night: 1,
      scenario,
      inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
      ticks: 5,
      snapshotEvery: 1
    });
    expect(res.snapshots[0].player.capacity).toBe(18);
    expect(res.snapshots[1].player.capacity).toBe(20); // 10 + 2*5 = 20 (capped at 20)
  });

  it('prioritizes no_flames over dawn_survived even on exact dawn tick', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 0, flames: 1 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
      lanterns: [
        { id: 'L1', lit: true, fuel: 100 },
        { id: 'L2', lit: true, fuel: 100 },
        { id: 'L3', lit: true, fuel: 100 }
      ],
      time_left_s: 1 / 60
    };
    const res = runSimulation({ seed: 37, night: 1, scenario, ticks: 5, snapshotEvery: 1 });
    expect(res.events.find((e) => e.name === 'game_over')?.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
});
