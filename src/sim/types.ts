export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type GameState = 'playing' | 'won' | 'lost';
export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';

export interface ScoreConfig {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface TuningConfig {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreConfig;
}

export interface InputFrame {
  tick: number;
  move?: Vec2;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Vec3[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface SnapshotPlayer {
  pos: Vec3;
  flames: number;
  carried: number;
}

export interface SnapshotLantern {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface SnapshotShade {
  id: string;
  pos: Vec3;
  state: ShadeState;
}

export interface SnapshotMote {
  id: string;
  pos: Vec3;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameState;
  time_left_s: number;
  score: number;
  player: SnapshotPlayer;
  lanterns: SnapshotLantern[];
  shades: SnapshotShade[];
  motes_active: number;
  motes: SnapshotMote[];
}

export interface EventRecord {
  type: 'event';
  tick: number;
  name:
    | 'mote_picked'
    | 'deposit'
    | 'lantern_lit'
    | 'pulse'
    | 'player_hit'
    | 'shade_spawned'
    | 'game_over';
  data: Record<string, unknown>;
}

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}

export interface LiveInputState {
  move: Vec2;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}
