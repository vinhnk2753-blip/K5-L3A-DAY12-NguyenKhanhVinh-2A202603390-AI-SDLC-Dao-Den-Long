import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../src/sim/engine.js';
import type { InputFrame, ScenarioConfig } from '../../src/sim/types.js';

describe('Phase 2 Features — Ticket-02 & Contract v1.1', () => {
  it('dashes at 14 m/s for 12 ticks (2.8m), preserves air height, enforces 1.5s cooldown from start', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    };
    const frames: InputFrame[] = [
      { tick: 0, jump: true },
      { tick: 1, jump: false },
      { tick: 10, dash: true }, // air dash while airborne
      { tick: 11, dash: false },
      { tick: 50, dash: true }, // still on cooldown (1.5s = 90 ticks from tick 10 -> ready at tick 100)
      { tick: 51, dash: false },
      { tick: 100, dash: true }, // ready!
      { tick: 101, dash: false }
    ];
    const res = runSimulation({ seed: 10, night: 1, scenario, inputs: { frames }, ticks: 120, snapshotEvery: 1 });
    const dashEvents = res.events.filter((e) => e.name === 'dash');
    expect(dashEvents).toHaveLength(2);
    expect(dashEvents[0].tick).toBe(11);
    expect(dashEvents[1].tick).toBe(101);

    // Check altitude preserved during air dash ticks 11..22
    const yStart = res.snapshots[11].player.pos[1];
    expect(yStart).toBeGreaterThan(0.5);
    expect(res.snapshots[22].player.pos[1]).toBeCloseTo(yStart, 3);
    // Horizontal distance during 12 ticks of dash = 14 * 0.2 = 2.8m along +Z
    expect(res.snapshots[22].player.pos[2]).toBeCloseTo(2.8, 2);
  });

  it('handles falling off island (Y < -10): ignores invuln, loses all motes, waits 60 ticks, respawns with 90t invuln', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [39.5, 0, 0], carried: 6, flames: 2, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: []
    };
    const frames: InputFrame[] = [
      { tick: 0, move: [1, 0], cam_yaw_deg: 0 }, // walk off edge at r=40
      { tick: 20, move: [0, 0] }
    ];
    const res = runSimulation({ seed: 11, night: 1, scenario, inputs: { frames }, ticks: 160, snapshotEvery: 1 });
    const hits = res.events.filter((e) => e.name === 'player_hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].data).toEqual({ by: 'fall', flames: 1, dropped: 0, lost: 6 });

    const hitTick = hits[0].tick;
    // After 60 ticks respawn at (0,0,0) with invuln active
    const respawnSnap = res.snapshots[hitTick + 60];
    expect(respawnSnap.player.pos).toEqual([0, 0, 0]);
    expect(respawnSnap.player.vel).toEqual([0, 0, 0]);
    expect(respawnSnap.player.invuln).toBe(true);
    expect(respawnSnap.player.carried).toBe(0);
    expect(respawnSnap.player.flames).toBe(1);
  });

  it('Night 2 Đảo Cau: bamboo bridge connects islands and jump pad launches player onto Island B', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [20, 0, 18], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      drifters: []
    };
    // Input moves backward (-X) while airborne — must NOT override jump pad launch velocity!
    const frames: InputFrame[] = [{ tick: 0, move: [-1, 0], cam_yaw_deg: 0 }];
    const res = runSimulation({ seed: 12, night: 2, scenario, inputs: { frames }, ticks: 100, snapshotEvery: 1 });

    expect(res.snapshots[0].night).toBe(2);
    expect(res.snapshots[0].lanterns).toHaveLength(6);
    expect(res.events.some((e) => e.name === 'night_start' && e.data.night === 2)).toBe(true);

    // At landing (~85 ticks = 1.41s), player should be inside Island B (center (70,0,0), r=28)
    const landSnap = res.snapshots[88];
    const distToB = Math.hypot(landSnap.player.pos[0] - 70, landSnap.player.pos[2]);
    expect(distToB).toBeLessThan(28);
    expect(landSnap.player.grounded).toBe(true);
    expect(landSnap.player.pos[1]).toBe(0);
  });

  it('Night 3 Đảo Chuông: ramps climb to Tier 1, jump pad reaches Tier 2, bell tower blocks, wind pushes', () => {
    // Part A: Walk up 30-degree ramp from r=30 to r=23.5 (Tier 1 Y=3)
    const rad30 = (30 * Math.PI) / 180;
    const rampScenario: ScenarioConfig = {
      player: { pos: [30.2 * Math.cos(rad30), 0, 30.2 * Math.sin(rad30)], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
      drifters: []
    };
    const rampFrames: InputFrame[] = [
      { tick: 0, move: [-Math.cos(rad30), -Math.sin(rad30)], cam_yaw_deg: 0 },
      { tick: 80, move: [0, 0] }
    ];
    const rampRes = runSimulation({ seed: 13, night: 3, scenario: rampScenario, inputs: { frames: rampFrames }, ticks: 90, snapshotEvery: 10 });
    expect(rampRes.snapshots[0].lanterns).toHaveLength(7);
    const topSnap = rampRes.snapshots[rampRes.snapshots.length - 1];
    expect(topSnap.player.pos[1]).toBeCloseTo(3.0, 2);

    // Part B: Jump pad at (0, 3, 13) launches onto Tier 2 (Y=6)
    const padRes = runSimulation({
      seed: 14,
      night: 3,
      scenario: {
        player: { pos: [0, 3, 13], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        drifters: []
      },
      ticks: 65,
      snapshotEvery: 5
    });
    const tier2Snap = padRes.snapshots[padRes.snapshots.length - 1];
    expect(tier2Snap.player.pos[1]).toBeCloseTo(6.0, 2);
    expect(tier2Snap.player.grounded).toBe(true);

    // Part C: Bell tower at (0,6,0) radius 2 blocks walking through center
    const towerRes = runSimulation({
      seed: 15,
      night: 3,
      scenario: {
        player: { pos: [0, 6, 4], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        drifters: []
      },
      inputs: { frames: [{ tick: 0, move: [0, -1], cam_yaw_deg: 0 }] },
      ticks: 60,
      snapshotEvery: 10
    });
    const towerLast = towerRes.snapshots[towerRes.snapshots.length - 1];
    expect(Math.hypot(towerLast.player.pos[0], towerLast.player.pos[2])).toBeGreaterThanOrEqual(1.99);

    // Part D: Wind gust activates at tick 1800 and pushes player
    const windRes = runSimulation({
      seed: 16,
      night: 3,
      scenario: {
        player: { pos: [0, 0, -20], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: true,
        motes: [],
        shades: [],
        drifters: []
      },
      ticks: 1920,
      snapshotEvery: 60
    });
    const activeWindSnap = windRes.snapshots.find((s) => s.wind.active);
    expect(activeWindSnap).toBeDefined();
    const afterWind = windRes.snapshots[windRes.snapshots.length - 1];
    const pushedDist = Math.hypot(afterWind.player.pos[0] - 0, afterWind.player.pos[2] - -20);
    expect(pushedDist).toBeGreaterThan(2.5);
  });

  it('Gió Lạc (Drifter) steals when carried>=5 ignoring invuln/safe zone, and drops stolen motes when pulsed during flee', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 20], carried: 7, flames: 3, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 20], lit: true, deposited: 10 }],
      drifters: [{ id: 'D1', pos: [0, 1.2, 18], state: 'idle', stolen: 0 }]
    };
    const frames: InputFrame[] = [
      { tick: 15, pulse: true }, // pulse right after D1 steals and starts fleeing
      { tick: 16, pulse: false }
    ];
    const res = runSimulation({ seed: 20, night: 2, scenario, inputs: { frames }, ticks: 160, snapshotEvery: 10 });

    const steal = res.events.find((e) => e.name === 'drifter_steal');
    expect(steal).toBeDefined();
    expect(steal?.data).toEqual({ drifter_id: 'D1', amount: 3, carried: 4 });

    const drop = res.events.find((e) => e.name === 'drifter_drop');
    expect(drop).toBeDefined();
    expect(drop?.data).toEqual({ drifter_id: 'D1', amount: 3 });

    // Drifter vanishes 120 ticks after drop
    const lastSnap = res.snapshots[res.snapshots.length - 1];
    expect(lastSnap.drifters).toHaveLength(0);
    expect(lastSnap.motes.filter((m) => m.kind === 'dropped')).toHaveLength(3);
  });

  it('Bùa Gió (Wind Charm) grants 7.2 m/s speed and zero-cooldown dash for 600 ticks, respawns in 2700 ticks', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [33, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      drifters: [],
      charms: [{ id: 'C1', pos: [35, 0, 0], available: true, respawn_s: 0 }]
    };
    const frames: InputFrame[] = [
      { tick: 0, move: [1, 0], cam_yaw_deg: 0 }, // walk onto C1 at x=35
      { tick: 25, move: [0, 0], dash: true },
      { tick: 26, dash: false },
      { tick: 38, dash: true }, // only 13 ticks later -> allowed with charm!
      { tick: 39, dash: false }
    ];
    const res = runSimulation({ seed: 21, night: 2, scenario, inputs: { frames }, ticks: 60, snapshotEvery: 1 });
    const picked = res.events.find((e) => e.name === 'charm_picked');
    expect(picked).toBeDefined();
    expect(picked?.data).toEqual({ charm_id: 'C1', charm_ticks: 600 });

    const dashes = res.events.filter((e) => e.name === 'dash');
    expect(dashes).toHaveLength(2);
    expect(res.snapshots[res.snapshots.length - 1].charms[0].available).toBe(false);
    expect(res.snapshots[res.snapshots.length - 1].charms[0].respawn_s).toBeGreaterThan(40);
  });

  it('pause freezes sim_tick, time_left_s, cooldowns, and spawns; resume continues cleanly', () => {
    const scenario: ScenarioConfig = {
      player: { pos: [0, 0, 0], carried: 5, flames: 3, pulse_cd_ticks: 60 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 100
    };
    const frames: InputFrame[] = [
      { tick: 5, pause: true },
      { tick: 6, pause: false },
      { tick: 25, pause: true },
      { tick: 26, pause: false }
    ];
    const res = runSimulation({ seed: 22, night: 1, scenario, inputs: { frames }, ticks: 40, snapshotEvery: 1 });

    expect(res.events.some((e) => e.name === 'paused' && e.tick === 6)).toBe(true);
    expect(res.events.some((e) => e.name === 'resumed' && e.tick === 26)).toBe(true);

    const s6 = res.snapshots[6];
    const s20 = res.snapshots[20];
    expect(s6.state).toBe('paused');
    expect(s20.state).toBe('paused');
    expect(s20.sim_tick).toBe(s6.sim_tick);
    expect(s20.time_left_s).toBe(s6.time_left_s);
    expect(s20.player.pulse_cd_s).toBe(s6.player.pulse_cd_s);

    const s40 = res.snapshots[40];
    expect(s40.state).toBe('playing');
    expect(s40.sim_tick).toBe(20); // 40 total ticks - 20 paused ticks = 20 sim_ticks
  });
});
