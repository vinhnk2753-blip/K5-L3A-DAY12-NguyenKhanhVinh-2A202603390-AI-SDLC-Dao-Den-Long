import type { InputFrame, InputsFile, ScenarioConfig, Vec2, Vec3 } from './types.js';

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

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
    if (!Number.isInteger(f.tick) || (f.tick as number) < 0) {
      throw new ContractValidationError(`frames[${i}].tick must be a non-negative integer`);
    }
    const tick = f.tick as number;
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
    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
    if (raw.player.pos !== undefined) {
      scen.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    }
    if (raw.player.carried !== undefined) {
      if (!Number.isInteger(raw.player.carried) || (raw.player.carried as number) < 0) {
        throw new ContractValidationError('scenario.player.carried must be a non-negative integer');
      }
      scen.player.carried = raw.player.carried as number;
    }
    if (raw.player.flames !== undefined) {
      if (!Number.isInteger(raw.player.flames) || (raw.player.flames as number) < 0) {
        throw new ContractValidationError('scenario.player.flames must be a non-negative integer');
      }
      scen.player.flames = raw.player.flames as number;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ContractValidationError('scenario.random_motes must be a boolean');
    }
    scen.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ContractValidationError('scenario.random_shades must be a boolean');
    }
    scen.random_shades = raw.random_shades;
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
    scen.shades = raw.shades.map((s, idx) => {
      if (!isPlainObject(s)) {
        throw new ContractValidationError(`scenario.shades[${idx}] must be an object`);
      }
      const pos = assertVec3(s.pos, `scenario.shades[${idx}].pos`);
      const id = s.id !== undefined ? String(s.id) : undefined;
      return { id, pos };
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
      if (l.deposited !== undefined) {
        if (!Number.isInteger(l.deposited) || (l.deposited as number) < 0) {
          throw new ContractValidationError(`scenario.lanterns[${idx}].deposited must be a non-negative integer`);
        }
        out.deposited = l.deposited as number;
      }
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
