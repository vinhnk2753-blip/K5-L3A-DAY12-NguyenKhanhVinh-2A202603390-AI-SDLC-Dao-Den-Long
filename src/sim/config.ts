import type { NightNumber, TuningConfig, Vec3 } from './types.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = -20.0;
export const FALL_THRESHOLD_Y = -10.0;
export const FALL_RESPAWN_TICKS = 60;

export const CHARM_SPEED = 7.2;
export const CHARM_DURATION_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;

export const MOTE_INITIAL_COUNT = 20;
export const MOTE_MAX_COUNT = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;
export const DROPPED_MOTE_TTL_TICKS = 480;

export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_LOSE_RADIUS = 18.0;
export const SHADE_FIRST_SPAWN_TICK = 300;
export const SHADE_MIN_SPAWN_DIST = 15.0;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_RECOIL_DIST_M = 2.0;
export const PULSE_PUSH_TICKS = 15;
export const SAFE_PUSH_MAX_TICKS = 30;

export const DRIFTER_IDLE_SPEED = 2.0;
export const DRIFTER_FAST_SPEED = 7.0;
export const DRIFTER_DETECT_RADIUS = 15.0;
export const DRIFTER_MIN_CARRIED = 5;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_MAX_STEAL = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_DROP_FLEE_TICKS = 120;
export const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
export const DRIFTER_MAX_COUNT = 2;

export const WIND_INTERVAL_TICKS = 1800; // 30s
export const WIND_DURATION_TICKS = 300;  // 5s
export const WIND_WARNING_TICKS = 120;   // 2s
export const WIND_PUSH_SPEED = 2.0;

export const STANDARD_TUNING: TuningConfig = {
  player_speed: 6.0,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1.0,
  interact_radius: 2.0,
  pulse_cost: 3,
  pulse_radius: 5.0,
  dash_speed: 14.0,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  night1_duration_s: 300,
  night2_duration_s: 330,
  night3_duration_s: 360,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2.0,
  pulse_push_m: 4.0,
  pulse_cooldown_s: 3.0,
  safe_radius: 6.0,
  shade_speed: 4.0,
  shade_hit_radius: 1.0,
  fall_enabled: true,
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

export interface CharmSpawnDef {
  id: string;
  pos: Vec3;
}

export interface NightMapConfig {
  night: NightNumber;
  title: string;
  islandName: string;
  elderQuote: string;
  durationS: number;
  shadeSpeed: number;
  shadeSpawnIntervalTicks: number;
  shadeMaxCount: number;
  hasDrifters: boolean;
  hasWind: boolean;
  spawnPos: Vec3;
  lanterns: LanternSpawnDef[];
  moteSpawns: Vec3[];
  shadeSpawns: Vec3[];
  charms: CharmSpawnDef[];
}

function ringPoints(cx: number, cz: number, y: number, radius: number, count: number, startDeg = 0): Vec3[] {
  const pts: Vec3[] = [];
  const step = 360 / count;
  for (let i = 0; i < count; i++) {
    const rad = ((startDeg + i * step) * Math.PI) / 180;
    const x = Math.round((cx + Math.cos(rad) * radius) * 1000) / 1000;
    const z = Math.round((cz + Math.sin(rad) * radius) * 1000) / 1000;
    pts.push([x, y, z]);
  }
  return pts;
}

function arcPoints(cx: number, cz: number, y: number, radius: number, anglesDeg: number[]): Vec3[] {
  return anglesDeg.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x = Math.round((cx + Math.cos(rad) * radius) * 1000) / 1000;
    const z = Math.round((cz + Math.sin(rad) * radius) * 1000) / 1000;
    return [x, y, z] as Vec3;
  });
}

export const NIGHT_MAPS: Record<NightNumber, NightMapConfig> = {
  1: {
    night: 1,
    title: 'Đêm 1',
    islandName: 'Đảo Bến',
    elderQuote: '“Mây ơi, năm ngọn đèn Đảo Bến đã tắt rồi. Con nhớ giữ vững ngọn lửa trong tay, đừng để Bóng Mực lại gần nhé.”',
    durationS: STANDARD_TUNING.night1_duration_s,
    shadeSpeed: 4.0,
    shadeSpawnIntervalTicks: 480, // 8s
    shadeMaxCount: 6,
    hasDrifters: false,
    hasWind: false,
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      { id: 'L2', pos: [23.8, 0, 7.7] },
      { id: 'L3', pos: [14.7, 0, -20.2] },
      { id: 'L4', pos: [-14.7, 0, -20.2] },
      { id: 'L5', pos: [-23.8, 0, 7.7] }
    ],
    moteSpawns: [
      ...ringPoints(0, 0, 0, 12, 8, 0),
      ...ringPoints(0, 0, 0, 33, 16, 0)
    ],
    shadeSpawns: ringPoints(0, 0, 0, 37, 12, 15),
    charms: []
  },
  2: {
    night: 2,
    title: 'Đêm 2',
    islandName: 'Đảo Cau',
    elderQuote: '“Cầu tre nối hai bờ Đảo Cau không có lan can đâu con. Hãy tận dụng bục nhảy, Bùa Gió giữa cầu và coi chừng Gió Lạc cướp đom đóm!”',
    durationS: STANDARD_TUNING.night2_duration_s,
    shadeSpeed: 4.0,
    shadeSpawnIntervalTicks: 420, // 7s
    shadeMaxCount: 8,
    hasDrifters: true,
    hasWind: false,
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20] },
      { id: 'L2', pos: [17, 0, -10] },
      { id: 'L3', pos: [-17, 0, -10] },
      { id: 'L4', pos: [70, 0, 20] },
      { id: 'L5', pos: [87, 0, -10] },
      { id: 'L6', pos: [53, 0, -10] }
    ],
    moteSpawns: [
      ...ringPoints(0, 0, 0, 10, 4, 0),
      ...ringPoints(0, 0, 0, 22, 8, 0),
      ...ringPoints(70, 0, 0, 10, 4, 0),
      ...ringPoints(70, 0, 0, 22, 8, 0)
    ],
    shadeSpawns: [
      ...ringPoints(0, 0, 0, 26, 8, 22.5),
      ...ringPoints(70, 0, 0, 26, 8, 22.5)
    ],
    charms: [{ id: 'C1', pos: [35, 0, 0] }]
  },
  3: {
    night: 3,
    title: 'Đêm 3',
    islandName: 'Đảo Chuông',
    elderQuote: '“Đêm cuối cùng trên Đảo Chuông ba tầng! Leo hai con dốc lên tầng giữa, dùng bục nhảy tới Tháp Chuông và vững chân trước những cơn gió lớn.”',
    durationS: STANDARD_TUNING.night3_duration_s,
    shadeSpeed: 4.5,
    shadeSpawnIntervalTicks: 360, // 6s
    shadeMaxCount: 10,
    hasDrifters: true,
    hasWind: true,
    spawnPos: [0, 0, -18], // Wait — let's check spawnPos! Contract v1.0 says player spawns at (0,0,0), wait: on Night 3 (0,0,0) is INSIDE the bell tower on Tier 2!
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] }
    ],
    moteSpawns: [
      ...ringPoints(0, 0, 0, 34, 18, 0),
      ...arcPoints(0, 0, 3, 18, [20, 40, 60, 80, 100, 120, 140, 160]),
      ...arcPoints(0, 0, 6, 5, [45, 135, 225, 315])
    ],
    shadeSpawns: ringPoints(0, 0, 0, 43, 16, 0),
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] }
    ]
  }
};
