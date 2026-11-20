export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type NightNumber = 1 | 2 | 3;

export type GameState = 'playing' | 'paused' | 'won' | 'lost';
export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';
export type DrifterState = 'idle' | 'chase' | 'flee' | 'removed';
export type MoteKind = 'random' | 'dropped';

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
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
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
  pause?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeState;
  state_ticks_left?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3;
  state?: DrifterState;
  stolen?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos: Vec3;
  available?: boolean;
  respawn_s?: number;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Vec3[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  time_left_s?: number;
}

export interface SnapshotPlayer {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  flames: number;
  carried: number;
  invuln: boolean;
  dash_cd_s: number;
  pulse_cd_s: number;
  charm_s: number;
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
  kind: MoteKind;
  ttl_s: number | null;
}

export interface SnapshotDrifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
}

export interface SnapshotCharm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawn_s: number;
}

export interface SnapshotWind {
  active: boolean;
  dir_deg: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightNumber;
  state: GameState;
  time_left_s: number;
  score: number;
  wind: SnapshotWind;
  player: SnapshotPlayer;
  lanterns: SnapshotLantern[];
  shades: SnapshotShade[];
  motes_active: number;
  motes: SnapshotMote[];
  drifters: SnapshotDrifter[];
  charms: SnapshotCharm[];
}

export type EventName =
  | 'night_start'
  | 'mote_picked'
  | 'deposit'
  | 'lantern_lit'
  | 'pulse'
  | 'dash'
  | 'charm_picked'
  | 'drifter_steal'
  | 'drifter_drop'
  | 'player_hit'
  | 'shade_spawned'
  | 'paused'
  | 'resumed'
  | 'game_over';

export interface EventRecord {
  type: 'event';
  tick: number;
  name: EventName;
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
  dash: boolean;
  pause: boolean;
}
