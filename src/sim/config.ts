import type { TuningConfig, Vec3 } from './types.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = -20.0;

export const ISLAND_RADIUS_NIGHT1 = 40.0;
export const MOTE_INITIAL_COUNT = 20;
export const MOTE_MAX_COUNT = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;
export const DROPPED_MOTE_TTL_TICKS = 480;

export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_LOSE_RADIUS = 18.0;
export const SHADE_FIRST_SPAWN_TICK = 300;
export const SHADE_SPAWN_INTERVAL_TICKS = 480;
export const SHADE_MAX_COUNT_NIGHT1 = 6;
export const SHADE_MIN_SPAWN_DIST = 15.0;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_RECOIL_DIST_M = 2.0;
export const PULSE_PUSH_TICKS = 15;
export const SAFE_PUSH_MAX_TICKS = 30;

export const PHASE1_TUNING: TuningConfig = {
  player_speed: 6.5,
  carry_capacity: 10,
  lantern_cost: 8,
  lantern_count_night1: 5,
  pickup_radius: 1.2,
  interact_radius: 2.2,
  pulse_cost: 3,
  pulse_radius: 5.0,
  night1_duration_s: 240,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2.0,
  pulse_push_m: 4.0,
  pulse_cooldown_s: 3.0,
  safe_radius: 6.0,
  shade_speed: 4.0,
  shade_hit_radius: 1.0,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 5,
    per_second_left: 2,
    per_flame_left: 50
  }
};

export interface LanternSpawnDef {
  id: string;
  pos: Vec3;
}

export const NIGHT1_LANTERNS: LanternSpawnDef[] = [
  { id: 'L1', pos: [0, 0, 25] },
  { id: 'L2', pos: [23.8, 0, 7.7] },
  { id: 'L3', pos: [14.7, 0, -20.2] },
  { id: 'L4', pos: [-14.7, 0, -20.2] },
  { id: 'L5', pos: [-23.8, 0, 7.7] }
];

function ringPoints(radius: number, count: number, startDeg = 0): Vec3[] {
  const pts: Vec3[] = [];
  const step = 360 / count;
  for (let i = 0; i < count; i++) {
    const rad = ((startDeg + i * step) * Math.PI) / 180;
    pts.push([Math.round(Math.cos(rad) * radius * 1000) / 1000, 0, Math.round(Math.sin(rad) * radius * 1000) / 1000]);
  }
  return pts;
}

export const NIGHT1_MOTE_SPAWNS: Vec3[] = [
  ...ringPoints(12, 8, 0),
  ...ringPoints(33, 16, 0)
];

export const NIGHT1_SHADE_SPAWNS: Vec3[] = ringPoints(37, 12, 15);
