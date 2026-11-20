import type {
  DrifterState,
  InputFrame,
  InputsFile,
  ScenarioCharm,
  ScenarioConfig,
  ScenarioDrifter,
  ScenarioShade,
  ShadeState,
  Vec2,
  Vec3
} from './types.js';

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>(['spawning', 'wander', 'chase', 'recoil', 'stunned']);
const VALID_DRIFTER_STATES = new Set<DrifterState>(['idle', 'chase', 'flee', 'removed']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertVec3(v: unknown, label: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isFiniteNumber)) {
    throw new ContractValidationError(`${label} must be a [x, y, z] finite number tuple`);
  }
  return [v[0], v[1], v[2]];
}

function assertVec2Move(v: unknown, label: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isFiniteNumber)) {
    throw new ContractValidationError(`${label} must be a [x, z] finite number tuple`);
  }
  if (v[0] < -1 || v[0] > 1 || v[1] < -1 || v[1] > 1) {
    throw new ContractValidationError(`${label} components must be in [-1, 1]`);
  }
  return [v[0], v[1]];
}

function assertNonNegInt(v: unknown, label: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) {
    throw new ContractValidationError(`${label} must be a non-negative integer`);
  }
  return v as number;
}

export function validateInputs(raw: unknown): InputsFile {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError('Inputs root must be a JSON object');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractValidationError('Inputs "frames" must be an array');
  }

  let prevTick = -1;
  const frames: InputFrame[] = [];

  for (let i = 0; i < raw.frames.length; i++) {
    const f = raw.frames[i];
    if (!isPlainObject(f)) {
      throw new ContractValidationError(`frames[${i}] must be an object`);
    }
    const tick = assertNonNegInt(f.tick, `frames[${i}].tick`);
    if (tick <= prevTick) {
      throw new ContractValidationError(`frames[${i}].tick (${tick}) must be strictly increasing (prev=${prevTick})`);
    }
    prevTick = tick;

    const frame: InputFrame = { tick };
    if (f.move !== undefined) {
      frame.move = assertVec2Move(f.move, `frames[${i}].move`);
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(f.cam_yaw_deg)) {
        throw new ContractValidationError(`frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[key] !== undefined) {
        if (typeof f[key] !== 'boolean') {
          throw new ContractValidationError(`frames[${i}].${key} must be a boolean`);
        }
        frame[key] = f[key] as boolean;
      }
    }
    frames.push(frame);
  }

  return { frames };
}

export function validateScenario(raw: unknown): ScenarioConfig {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError('Scenario root must be a JSON object');
  }

  const scen: ScenarioConfig = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ContractValidationError('scenario.player must be an object');
    }
    scen.player = {};
    if (raw.player.pos !== undefined) scen.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    if (raw.player.carried !== undefined) scen.player.carried = assertNonNegInt(raw.player.carried, 'scenario.player.carried');
    if (raw.player.flames !== undefined) scen.player.flames = assertNonNegInt(raw.player.flames, 'scenario.player.flames');
    if (raw.player.invuln_ticks !== undefined) scen.player.invuln_ticks = assertNonNegInt(raw.player.invuln_ticks, 'scenario.player.invuln_ticks');
    if (raw.player.dash_cd_ticks !== undefined) scen.player.dash_cd_ticks = assertNonNegInt(raw.player.dash_cd_ticks, 'scenario.player.dash_cd_ticks');
    if (raw.player.pulse_cd_ticks !== undefined) scen.player.pulse_cd_ticks = assertNonNegInt(raw.player.pulse_cd_ticks, 'scenario.player.pulse_cd_ticks');
    if (raw.player.charm_ticks !== undefined) scen.player.charm_ticks = assertNonNegInt(raw.player.charm_ticks, 'scenario.player.charm_ticks');
  }

  for (const key of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') {
        throw new ContractValidationError(`scenario.${key} must be a boolean`);
      }
      scen[key] = raw[key] as boolean;
    }
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractValidationError('scenario.motes must be an array');
    }
    scen.motes = raw.motes.map((m, idx) => assertVec3(m, `scenario.motes[${idx}]`));
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractValidationError('scenario.shades must be an array');
    }
    scen.shades = raw.shades.map((s, idx): ScenarioShade => {
      if (!isPlainObject(s)) {
        throw new ContractValidationError(`scenario.shades[${idx}] must be an object`);
      }
      const pos = assertVec3(s.pos, `scenario.shades[${idx}].pos`);
      if (s.id !== undefined && typeof s.id !== 'string') {
        throw new ContractValidationError(`scenario.shades[${idx}].id must be a string`);
      }
      let state: ShadeState | undefined;
      if (s.state !== undefined) {
        if (typeof s.state !== 'string' || !VALID_SHADE_STATES.has(s.state as ShadeState)) {
          throw new ContractValidationError(`scenario.shades[${idx}].state is invalid: "${String(s.state)}"`);
        }
        state = s.state as ShadeState;
      }
      const state_ticks_left =
        s.state_ticks_left !== undefined ? assertNonNegInt(s.state_ticks_left, `scenario.shades[${idx}].state_ticks_left`) : undefined;
      return { id: s.id as string | undefined, pos, state, state_ticks_left };
    });
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractValidationError('scenario.drifters must be an array');
    }
    scen.drifters = raw.drifters.map((d, idx): ScenarioDrifter => {
      if (!isPlainObject(d)) {
        throw new ContractValidationError(`scenario.drifters[${idx}] must be an object`);
      }
      const pos = assertVec3(d.pos, `scenario.drifters[${idx}].pos`);
      if (d.id !== undefined && typeof d.id !== 'string') {
        throw new ContractValidationError(`scenario.drifters[${idx}].id must be a string`);
      }
      let state: DrifterState | undefined;
      if (d.state !== undefined) {
        if (typeof d.state !== 'string' || !VALID_DRIFTER_STATES.has(d.state as DrifterState)) {
          throw new ContractValidationError(`scenario.drifters[${idx}].state is invalid`);
        }
        state = d.state as DrifterState;
      }
      const stolen = d.stolen !== undefined ? assertNonNegInt(d.stolen, `scenario.drifters[${idx}].stolen`) : undefined;
      return { id: d.id as string | undefined, pos, state, stolen };
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractValidationError('scenario.charms must be an array');
    }
    scen.charms = raw.charms.map((c, idx): ScenarioCharm => {
      if (!isPlainObject(c)) {
        throw new ContractValidationError(`scenario.charms[${idx}] must be an object`);
      }
      const pos = assertVec3(c.pos, `scenario.charms[${idx}].pos`);
      if (c.id !== undefined && typeof c.id !== 'string') {
        throw new ContractValidationError(`scenario.charms[${idx}].id must be a string`);
      }
      if (c.available !== undefined && typeof c.available !== 'boolean') {
        throw new ContractValidationError(`scenario.charms[${idx}].available must be a boolean`);
      }
      if (c.respawn_s !== undefined && (!isFiniteNumber(c.respawn_s) || c.respawn_s < 0)) {
        throw new ContractValidationError(`scenario.charms[${idx}].respawn_s must be a non-negative finite number`);
      }
      return {
        id: c.id as string | undefined,
        pos,
        available: c.available as boolean | undefined,
        respawn_s: c.respawn_s as number | undefined
      };
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractValidationError('scenario.lanterns must be an array');
    }
    scen.lanterns = raw.lanterns.map((l, idx) => {
      if (!isPlainObject(l) || typeof l.id !== 'string') {
        throw new ContractValidationError(`scenario.lanterns[${idx}] must be an object with string id`);
      }
      const out: { id: string; pos?: Vec3; deposited?: number; lit?: boolean } = { id: l.id };
      if (l.pos !== undefined) out.pos = assertVec3(l.pos, `scenario.lanterns[${idx}].pos`);
      if (l.deposited !== undefined) out.deposited = assertNonNegInt(l.deposited, `scenario.lanterns[${idx}].deposited`);
      if (l.lit !== undefined) {
        if (typeof l.lit !== 'boolean') {
          throw new ContractValidationError(`scenario.lanterns[${idx}].lit must be a boolean`);
        }
        out.lit = l.lit;
      }
      return out;
    });
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ContractValidationError('scenario.time_left_s must be a non-negative finite number');
    }
    scen.time_left_s = raw.time_left_s;
  }

  return scen;
}
