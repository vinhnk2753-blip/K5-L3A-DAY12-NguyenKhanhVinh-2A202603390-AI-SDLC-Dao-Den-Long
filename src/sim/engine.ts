import {
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  CHARM_SPEED,
  DAWN_LIT_BONUS,
  DRAIN_CHASE_RADIUS,
  DRAIN_ENTER_RADIUS,
  DRAIN_EVENT_INTERVAL_TICKS,
  DRAIN_STUN_SCORE,
  DRIFTER_DETECT_RADIUS,
  DRIFTER_DROP_FLEE_TICKS,
  DRIFTER_FAST_SPEED,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_COUNT,
  DRIFTER_MAX_STEAL,
  DRIFTER_MIN_CARRIED,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_RESPAWN_TICKS,
  FALL_THRESHOLD_Y,
  FUEL_DECAY_PER_TICK,
  FUEL_DRAIN_PER_TICK,
  FUEL_LOW_TICKS,
  FUEL_MAX_TICKS,
  FUEL_PER_MOTE_TICKS,
  GRAVITY,
  JUMP_VELOCITY,
  MOTE_INITIAL_COUNT,
  MOTE_MAX_COUNT,
  MOTE_SPAWN_INTERVAL_TICKS,
  NIGHT_MAPS,
  PULSE_PUSH_TICKS,
  RELIGHT_SCORE,
  SAFE_PUSH_MAX_TICKS,
  SHADE_DETECT_RADIUS,
  SHADE_FIRST_SPAWN_TICK,
  SHADE_LOSE_RADIUS,
  SHADE_MIN_SPAWN_DIST,
  SHADE_RECOIL_DIST_M,
  SHADE_RECOIL_TICKS,
  STANDARD_TUNING,
  TICK_RATE,
  WIND_DURATION_TICKS,
  WIND_INTERVAL_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARNING_TICKS
} from './config.js';
import { createRng, round1, round3, roundVec3, type SeededRng } from './rng.js';
import { getJumpPads, getSurfaceHeight, resolveHorizontalMove, snapToValidGround } from './terrain.js';
import type {
  DrifterState,
  EndRecord,
  EventName,
  EventRecord,
  GameState,
  InputsFile,
  LiveInputState,
  MoteKind,
  NightNumber,
  ScenarioConfig,
  ShadeState,
  SnapshotRecord,
  TuningConfig,
  Vec3
} from './types.js';

interface InternalMote {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttlTicks: number | null;
  pickupEnableTick: number;
  spawnIndex: number | null;
}

interface InternalLantern {
  id: string;
  pos: Vec3;
  deposited: number;
  lit: boolean;
  fuelTicks: number; // integer 1/60 units (0..6000)
  everLit: boolean;
  relitCount: number;
}

interface InternalShade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stateTicksLeft: number;
  activeFromTick: number;
  pushTicksLeft: number;
  pushStepX: number;
  pushStepZ: number;
  recoilDirX: number;
  recoilDirZ: number;
  wanderAngle: number;
  wanderTimer: number;
  safePushTicksLeft: number;
  safePushLanternId: string | null;
  targetLanternId: string | null;
  drainTickCounter: number;
}

interface InternalDrifter {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  fleeTicksLeft: number;
  activeFromTick: number;
  idleAngle: number;
}

interface InternalCharm {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface SimulationOptions {
  seed: number;
  night: NightNumber;
  scenario?: ScenarioConfig;
  tuning?: TuningConfig;
}

export interface SimulationInstance {
  step(input: LiveInputState): EventRecord[];
  getSnapshot(): SnapshotRecord;
  drainEvents(): EventRecord[];
  getState(): GameState;
  getTick(): number;
  getSimTick(): number;
  getScore(): number;
  getFacingYaw(): number;
  getTuning(): TuningConfig;
  isWindWarning(): boolean;
  isRespawning(): boolean;
  isDashing(): boolean;
}

function cmpId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function parseNumericSuffix(id: string, prefix: string): number {
  if (!id.startsWith(prefix)) return 0;
  const n = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function createSimulation(options: SimulationOptions): SimulationInstance {
  const mapCfg = NIGHT_MAPS[options.night];
  if (!mapCfg) {
    throw new Error(`Unsupported night "${options.night}": must be 1, 2, or 3`);
  }

  const night = options.night;
  const tuning: TuningConfig = options.tuning ?? STANDARD_TUNING;
  const rng: SeededRng = createRng(options.seed);
  const scenario = options.scenario ?? {};
  const jumpPads = getJumpPads(night);

  let tick = 0;
  let simTick = 0;
  let state: GameState = 'playing';
  let score = 0;
  let remainingTicks = Math.round((scenario.time_left_s ?? mapCfg.durationS) * TICK_RATE);

  // Player state
  const spawnOrigin: Vec3 = [...mapCfg.spawnPos];
  const playerPos: Vec3 = scenario.player?.pos ? [...scenario.player.pos] : [...spawnOrigin];
  const playerVel: Vec3 = [0, 0, 0];
  const initSurface = getSurfaceHeight(night, playerPos[0], playerPos[2]);
  let playerGrounded = initSurface !== null && Math.abs(playerPos[1] - initSurface) <= 0.05;
  let successfulLights = scenario.player?.successful_lights ?? 0;

  function getCarryCapacity(): number {
    return Math.min(tuning.capacity_max, tuning.carry_capacity + 2 * successfulLights);
  }

  let playerCarried = Math.min(getCarryCapacity(), scenario.player?.carried ?? 0);
  let playerFlames = scenario.player?.flames ?? tuning.flames;
  let invulnTicks = scenario.player?.invuln_ticks ?? 0;
  let dashCdTicks = scenario.player?.dash_cd_ticks ?? 0;
  let pulseCdTicks = scenario.player?.pulse_cd_ticks ?? 0;
  let charmTicks = scenario.player?.charm_ticks ?? 0;

  let dashTicksLeft = 0;
  let dashDirX = 0;
  let dashDirZ = 1;
  let launchActive = false;
  let launchVx = 0;
  let launchVz = 0;
  let respawnTicks = 0;
  let facingYaw = 0;

  let prevJump = false;
  let prevInteract = false;
  let prevPulse = false;
  let prevDash = false;
  let prevPause = false;

  const randomMotesEnabled = scenario.random_motes !== false;
  const randomShadesEnabled = scenario.random_shades !== false;
  const randomDriftersEnabled = scenario.random_drifters !== undefined ? scenario.random_drifters : mapCfg.hasDrifters;
  const windEnabled = scenario.wind_enabled !== undefined ? scenario.wind_enabled : mapCfg.hasWind;

  let windActive = false;
  let windDirDeg = 0;
  let windTicksLeft = 0;

  // Lanterns
  const lanterns: InternalLantern[] = mapCfg.lanterns.map((def) => ({
    id: def.id,
    pos: [...def.pos],
    deposited: 0,
    lit: false,
    fuelTicks: 0,
    everLit: false,
    relitCount: 0
  }));
  if (scenario.lanterns) {
    for (const ov of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === ov.id);
      if (target) {
        if (ov.pos) target.pos = [...ov.pos];
        if (ov.deposited !== undefined) target.deposited = ov.deposited;
        if (ov.ever_lit !== undefined) target.everLit = ov.ever_lit;
        if (ov.lit !== undefined) {
          target.lit = ov.lit;
          if (target.lit) {
            target.fuelTicks = Math.round((ov.fuel ?? tuning.fuel_max) * TICK_RATE);
            if (ov.ever_lit === undefined) target.everLit = true;
            if (ov.deposited === undefined) target.deposited = Math.max(target.deposited, tuning.lantern_cost);
          } else {
            target.fuelTicks = 0;
          }
        } else if (ov.fuel !== undefined && target.lit) {
          target.fuelTicks = Math.round(ov.fuel * TICK_RATE);
        }
      }
    }
  }

  // Motes
  let nextMoteId = 1;
  const motes: InternalMote[] = [];
  if (scenario.motes !== undefined) {
    for (const pos of scenario.motes) {
      motes.push({
        id: `M${nextMoteId++}`,
        pos: [pos[0], pos[1], pos[2]],
        kind: 'random',
        ttlTicks: null,
        pickupEnableTick: 0,
        spawnIndex: null
      });
    }
  } else if (randomMotesEnabled) {
    const indices = mapCfg.moteSpawns.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.min(MOTE_INITIAL_COUNT, indices.length);
    for (let i = 0; i < count; i++) {
      const idx = indices[i];
      const pt = mapCfg.moteSpawns[idx];
      motes.push({
        id: `M${nextMoteId++}`,
        pos: [...pt],
        kind: 'random',
        ttlTicks: null,
        pickupEnableTick: 0,
        spawnIndex: idx
      });
    }
  }

  // Shades
  let nextShadeId = 1;
  const shades: InternalShade[] = [];
  if (scenario.shades !== undefined) {
    for (const s of scenario.shades) {
      const id = s.id ?? `S${nextShadeId++}`;
      const suffix = parseNumericSuffix(id, 'S');
      if (suffix >= nextShadeId) nextShadeId = suffix + 1;
      const dist = distXZ(s.pos, playerPos);
      const groundH = getSurfaceHeight(night, s.pos[0], s.pos[2]) ?? 0;
      const shadeY = s.pos[1] > groundH ? s.pos[1] : groundH + 1.0;
      const defaultState: ShadeState = dist <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
      const chosenState = s.state ?? defaultState;
      const defaultTicks =
        chosenState === 'stunned'
          ? Math.round(tuning.pulse_stun_s * TICK_RATE)
          : chosenState === 'recoil'
            ? SHADE_RECOIL_TICKS
            : chosenState === 'spawning'
              ? 30
              : 0;

      // If scenario sets state='drain' without target_lantern_id, pick nearest weak lit lantern
      let targetLanternId = s.target_lantern_id ?? null;
      if (chosenState === 'drain' && !targetLanternId) {
        let bestL: InternalLantern | null = null;
        let bestD = Infinity;
        for (const l of lanterns) {
          if (!l.lit || l.fuelTicks >= FUEL_LOW_TICKS) continue;
          const d = distXZ(s.pos, l.pos);
          if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && bestL && l.id < bestL.id)) {
            bestD = d;
            bestL = l;
          }
        }
        targetLanternId = bestL?.id ?? null;
      }

      shades.push({
        id,
        pos: [s.pos[0], shadeY, s.pos[2]],
        state: chosenState,
        stateTicksLeft: s.state_ticks_left ?? defaultTicks,
        activeFromTick: 0,
        pushTicksLeft: 0,
        pushStepX: 0,
        pushStepZ: 0,
        recoilDirX: 1,
        recoilDirZ: 0,
        wanderAngle: rng.range(0, Math.PI * 2),
        wanderTimer: 60,
        safePushTicksLeft: 0,
        safePushLanternId: null,
        targetLanternId,
        drainTickCounter: 0
      });
    }
  }

  // Drifters
  let nextDrifterId = 1;
  const drifters: InternalDrifter[] = [];
  if (scenario.drifters !== undefined) {
    for (const d of scenario.drifters) {
      const id = d.id ?? `D${nextDrifterId++}`;
      const suffix = parseNumericSuffix(id, 'D');
      if (suffix >= nextDrifterId) nextDrifterId = suffix + 1;
      const st = d.state ?? 'idle';
      if (st === 'removed') continue;
      drifters.push({
        id,
        pos: [d.pos[0], d.pos[1] > 0 ? d.pos[1] : 1.2, d.pos[2]],
        state: st,
        stolen: d.stolen ?? 0,
        hasStolen: st === 'flee' && (d.stolen ?? 0) > 0,
        fleeTicksLeft: st === 'flee' ? DRIFTER_FLEE_TICKS : 0,
        activeFromTick: 0,
        idleAngle: rng.range(0, Math.PI * 2)
      });
    }
  }

  // Charms
  let nextCharmId = 1;
  const charms: InternalCharm[] = [];
  if (scenario.charms !== undefined) {
    for (const c of scenario.charms) {
      const id = c.id ?? `C${nextCharmId++}`;
      const suffix = parseNumericSuffix(id, 'C');
      if (suffix >= nextCharmId) nextCharmId = suffix + 1;
      const available = c.available !== false;
      const respawnTicks = available ? 0 : Math.round((c.respawn_s ?? CHARM_RESPAWN_TICKS / TICK_RATE) * TICK_RATE);
      charms.push({
        id,
        pos: [...c.pos],
        available,
        respawnTicks
      });
    }
  } else {
    for (const def of mapCfg.charms) {
      charms.push({
        id: def.id,
        pos: [...def.pos],
        available: true,
        respawnTicks: 0
      });
    }
  }

  const EMPTY_EVENTS: EventRecord[] = [];
  let pendingEvents: EventRecord[] = EMPTY_EVENTS;

  function emit(name: EventName, data: Record<string, unknown>): void {
    if (pendingEvents === EMPTY_EVENTS) {
      pendingEvents = [];
    }
    pendingEvents.push({ type: 'event', tick, name, data });
  }

  function hasActiveSafeZone(l: InternalLantern): boolean {
    return l.lit && l.fuelTicks >= FUEL_LOW_TICKS;
  }

  function isInsideActiveSafeZone(x: number, z: number): InternalLantern | null {
    for (const l of lanterns) {
      if (!hasActiveSafeZone(l)) continue;
      if (Math.hypot(x - l.pos[0], z - l.pos[2]) < tuning.safe_radius) return l;
    }
    return null;
  }

  function enforceSafeZonesForShade(s: InternalShade, excludeLanternId?: string | null): void {
    for (const l of lanterns) {
      if (!hasActiveSafeZone(l) || l.id === excludeLanternId) continue;
      const dx = s.pos[0] - l.pos[0];
      const dz = s.pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < tuning.safe_radius) {
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        const tx = l.pos[0] + ux * tuning.safe_radius;
        const tz = l.pos[2] + uz * tuning.safe_radius;
        const moved = resolveHorizontalMove(night, s.pos[0], s.pos[2], s.pos[1] - 1.0, tx, tz, true);
        s.pos[0] = moved.x;
        s.pos[2] = moved.z;
        const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
        if (h !== null) s.pos[1] = h + 1.0;
      }
    }
  }

  function triggerSafeZonePushOut(l: InternalLantern): void {
    for (const s of shades) {
      if (distXZ(s.pos, l.pos) < tuning.safe_radius) {
        s.safePushTicksLeft = SAFE_PUSH_MAX_TICKS;
        s.safePushLanternId = l.id;
        if (s.state === 'drain') {
          s.state = 'wander';
          s.targetLanternId = null;
          s.drainTickCounter = 0;
        }
      }
    }
  }

  function spawnScheduledMote(): void {
    if (motes.length >= MOTE_MAX_COUNT) return;
    const occupied = new Set<number>();
    for (const m of motes) {
      if (m.spawnIndex !== null) occupied.add(m.spawnIndex);
    }
    const freeIndices: number[] = [];
    for (let i = 0; i < mapCfg.moteSpawns.length; i++) {
      if (!occupied.has(i)) freeIndices.push(i);
    }
    if (freeIndices.length === 0) return;
    const idx = freeIndices[rng.int(0, freeIndices.length)];
    const pt = mapCfg.moteSpawns[idx];
    motes.push({
      id: `M${nextMoteId++}`,
      pos: [...pt],
      kind: 'random',
      ttlTicks: null,
      pickupEnableTick: tick + 1,
      spawnIndex: idx
    });
  }

  function spawnScheduledShade(): void {
    if (shades.length >= mapCfg.shadeMaxCount) return;
    const candidates = mapCfg.shadeSpawns.filter((pt) => {
      if (distXZ(pt, playerPos) < SHADE_MIN_SPAWN_DIST) return false;
      if (isInsideActiveSafeZone(pt[0], pt[2])) return false;
      return true;
    });
    if (candidates.length === 0) return;
    const pt = candidates[rng.int(0, candidates.length)];
    const id = `S${nextShadeId++}`;
    shades.push({
      id,
      pos: [pt[0], pt[1] + 1.0, pt[2]],
      state: 'spawning',
      stateTicksLeft: 30,
      activeFromTick: tick + 1,
      pushTicksLeft: 0,
      pushStepX: 0,
      pushStepZ: 0,
      recoilDirX: 1,
      recoilDirZ: 0,
      wanderAngle: rng.range(0, Math.PI * 2),
      wanderTimer: 60,
      safePushTicksLeft: 0,
      safePushLanternId: null,
      targetLanternId: null,
      drainTickCounter: 0
    });
    emit('shade_spawned', { id });
  }

  function spawnScheduledDrifter(): void {
    if (drifters.length >= DRIFTER_MAX_COUNT) return;
    if (mapCfg.shadeSpawns.length === 0) return;
    const pt = mapCfg.shadeSpawns[rng.int(0, mapCfg.shadeSpawns.length)];
    const id = `D${nextDrifterId++}`;
    drifters.push({
      id,
      pos: [pt[0], pt[1] + 1.4, pt[2]],
      state: 'idle',
      stolen: 0,
      hasStolen: false,
      fleeTicksLeft: 0,
      activeFromTick: tick + 1,
      idleAngle: rng.range(0, Math.PI * 2)
    });
  }

  function checkAndTriggerJumpPad(): boolean {
    if (dashTicksLeft > 0 || !playerGrounded) return false;
    for (const pad of jumpPads) {
      if (Math.hypot(playerPos[0] - pad.pos[0], playerPos[2] - pad.pos[2]) <= pad.radius && Math.abs(playerPos[1] - pad.pos[1]) <= 0.25) {
        launchActive = true;
        launchVx = pad.dirX * pad.horizSpeed;
        launchVz = pad.dirZ * pad.horizSpeed;
        playerVel[0] = launchVx;
        playerVel[1] = pad.vy;
        playerVel[2] = launchVz;
        playerGrounded = false;
        return true;
      }
    }
    return false;
  }

  function step(input: LiveInputState): EventRecord[] {
    if (state === 'won' || state === 'lost') {
      return EMPTY_EVENTS;
    }

    pendingEvents = EMPTY_EVENTS;
    tick += 1;

    // 1. Read input (pause FIRST)
    const pausePressed = !prevPause && input.pause;
    prevPause = input.pause;

    if (state === 'paused') {
      if (pausePressed) {
        state = 'playing';
        emit('resumed', {});
      } else {
        const out = pendingEvents;
        pendingEvents = EMPTY_EVENTS;
        return out;
      }
    } else if (pausePressed) {
      state = 'paused';
      emit('paused', {});
      const out = pendingEvents;
      pendingEvents = EMPTY_EVENTS;
      return out;
    }

    simTick += 1;

    const jumpPressed = !prevJump && input.jump;
    const interactPressed = !prevInteract && input.interact;
    const pulsePressed = !prevPulse && input.pulse;
    const dashPressed = !prevDash && input.dash;
    prevJump = input.jump;
    prevInteract = input.interact;
    prevPulse = input.pulse;
    prevDash = input.dash;

    // 2. Decrement timers + lantern fuel decay & drain + extinguish at fuel <= 0
    if (remainingTicks > 0) remainingTicks -= 1;
    if (dashCdTicks > 0) dashCdTicks -= 1;
    if (pulseCdTicks > 0) pulseCdTicks -= 1;
    if (invulnTicks > 0) invulnTicks -= 1;
    if (charmTicks > 0) charmTicks -= 1;

    if (respawnTicks > 0) {
      respawnTicks -= 1;
      if (respawnTicks === 0) {
        playerPos[0] = spawnOrigin[0];
        playerPos[1] = spawnOrigin[1];
        playerPos[2] = spawnOrigin[2];
        playerVel[0] = 0;
        playerVel[1] = 0;
        playerVel[2] = 0;
        playerGrounded = true;
        launchActive = false;
        dashTicksLeft = 0;
        invulnTicks = Math.round(tuning.invuln_s * TICK_RATE);
      }
    }

    if (windTicksLeft > 0) {
      windTicksLeft -= 1;
      if (windTicksLeft === 0) {
        windActive = false;
        windDirDeg = 0;
      }
    }
    if (windEnabled && simTick > 0 && simTick % WIND_INTERVAL_TICKS === 0) {
      windActive = true;
      windDirDeg = round3(rng.range(0, 360));
      windTicksLeft = WIND_DURATION_TICKS;
    }

    for (const s of shades) {
      if (s.stateTicksLeft > 0) {
        s.stateTicksLeft -= 1;
        if (s.stateTicksLeft === 0) {
          if (s.state === 'stunned') {
            // Ticket-03: "Hết choáng thì về wander"
            s.state = 'wander';
          } else if (s.state === 'spawning' || s.state === 'recoil') {
            s.state = distXZ(s.pos, playerPos) <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
          }
        }
      }
    }

    // Lantern fuel decay + draining shades (integer 1/60 units)
    if (shades.length > 1) shades.sort(cmpId);
    for (const l of lanterns) {
      if (!l.lit) continue;
      l.fuelTicks -= FUEL_DECAY_PER_TICK;

      for (const s of shades) {
        if (s.state === 'drain' && s.targetLanternId === l.id) {
          l.fuelTicks -= FUEL_DRAIN_PER_TICK;
          s.drainTickCounter += 1;
          if (s.drainTickCounter % DRAIN_EVENT_INTERVAL_TICKS === 0) {
            emit('fuel_drain', {
              lantern_id: l.id,
              shade_id: s.id,
              fuel: round1(Math.max(0, l.fuelTicks) / TICK_RATE)
            });
          }
        }
      }

      if (l.fuelTicks <= 0) {
        l.fuelTicks = 0;
        l.lit = false;
        l.deposited = 0;
        l.everLit = true;
        emit('lantern_out', { lantern_id: l.id });
        for (const s of shades) {
          if (s.state === 'drain' && s.targetLanternId === l.id) {
            s.state = 'wander';
            s.targetLanternId = null;
            s.drainTickCounter = 0;
          }
        }
      }
    }

    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      if (m.ttlTicks !== null) {
        m.ttlTicks -= 1;
        if (m.ttlTicks <= 0) motes.splice(i, 1);
      }
    }

    for (const c of charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks === 0) c.available = true;
      }
    }

    // 3. Move Mây (jump, dash, jump pad, wind) then check fall off island
    if (respawnTicks === 0) {
      let mx = input.move[0];
      let mz = input.move[1];
      const mLen = Math.hypot(mx, mz);
      if (mLen > 1) {
        mx /= mLen;
        mz /= mLen;
      }
      const yawRad = (input.cam_yaw_deg * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const wx = mx * cosY + mz * sinY;
      const wz = -mx * sinY + mz * cosY;
      const hasMove = Math.hypot(wx, wz) > 1e-6;
      if (hasMove && dashTicksLeft === 0) {
        facingYaw = Math.atan2(wx, wz);
      }

      if (dashPressed && dashTicksLeft === 0 && (dashCdTicks === 0 || charmTicks > 0)) {
        const dLen = hasMove ? Math.hypot(wx, wz) : 1;
        dashDirX = hasMove ? wx / dLen : Math.sin(facingYaw);
        dashDirZ = hasMove ? wz / dLen : Math.cos(facingYaw);
        facingYaw = Math.atan2(dashDirX, dashDirZ);
        dashTicksLeft = Math.round(tuning.dash_duration_s * TICK_RATE);
        dashCdTicks = charmTicks > 0 ? 0 : Math.round(tuning.dash_cooldown_s * TICK_RATE);
        launchActive = false;
        playerVel[1] = 0;
        emit('dash', {});
      }

      checkAndTriggerJumpPad();

      let vx = 0;
      let vz = 0;
      const isDashingThisTick = dashTicksLeft > 0;
      if (isDashingThisTick) {
        vx = dashDirX * tuning.dash_speed;
        vz = dashDirZ * tuning.dash_speed;
        dashTicksLeft -= 1;
      } else if (launchActive) {
        vx = launchVx;
        vz = launchVz;
      } else {
        const speed = charmTicks > 0 ? CHARM_SPEED : tuning.player_speed;
        vx = wx * speed;
        vz = wz * speed;
      }

      if (windActive) {
        const wRad = (windDirDeg * Math.PI) / 180;
        vx += Math.cos(wRad) * WIND_PUSH_SPEED;
        vz += Math.sin(wRad) * WIND_PUSH_SPEED;
      }

      playerVel[0] = vx;
      playerVel[2] = vz;

      const targetX = playerPos[0] + vx * DT;
      const targetZ = playerPos[2] + vz * DT;
      const moved = resolveHorizontalMove(night, playerPos[0], playerPos[2], playerPos[1], targetX, targetZ, false);
      playerPos[0] = moved.x;
      playerPos[2] = moved.z;

      if (isDashingThisTick) {
        playerVel[1] = 0;
        const surf = getSurfaceHeight(night, playerPos[0], playerPos[2]);
        if (playerGrounded && surf !== null && surf >= playerPos[1] - 0.35 && surf <= playerPos[1] + 0.35) {
          playerPos[1] = surf;
        } else if (surf === null || surf < playerPos[1] - 0.05) {
          playerGrounded = false;
        }
      } else {
        if (jumpPressed && playerGrounded && !launchActive) {
          playerVel[1] = JUMP_VELOCITY;
          playerGrounded = false;
        }

        const prevY = playerPos[1];
        const surf = getSurfaceHeight(night, playerPos[0], playerPos[2]);

        if (playerGrounded) {
          if (surf === null || surf < prevY - 0.35) {
            playerGrounded = false;
            playerPos[1] += playerVel[1] * DT + 0.5 * GRAVITY * DT * DT;
            playerVel[1] += GRAVITY * DT;
          } else {
            playerPos[1] = surf;
            playerVel[1] = 0;
          }
        } else {
          playerPos[1] += playerVel[1] * DT + 0.5 * GRAVITY * DT * DT;
          playerVel[1] += GRAVITY * DT;
          if (surf !== null && playerVel[1] <= 0 && prevY >= surf - 0.35 && playerPos[1] <= surf) {
            playerPos[1] = surf;
            playerVel[1] = 0;
            playerGrounded = true;
            launchActive = false;
          }
        }
      }

      checkAndTriggerJumpPad();

      if (tuning.fall_enabled && playerPos[1] < FALL_THRESHOLD_Y) {
        playerFlames = Math.max(0, playerFlames - 1);
        const lost = playerCarried;
        playerCarried = 0;
        playerVel[0] = 0;
        playerVel[1] = 0;
        playerVel[2] = 0;
        dashTicksLeft = 0;
        launchActive = false;
        emit('player_hit', { by: 'fall', flames: playerFlames, dropped: 0, lost });
        if (playerFlames > 0) {
          respawnTicks = FALL_RESPAWN_TICKS;
        }
      }
    }

    // 4. Pick up motes (respecting dynamic capacity) and Wind Charms
    if (respawnTicks === 0) {
      const cap = getCarryCapacity();
      for (let i = motes.length - 1; i >= 0; i--) {
        if (playerCarried >= cap) break;
        const m = motes[i];
        if (tick < m.pickupEnableTick) continue;
        if (distXZ(playerPos, m.pos) <= tuning.pickup_radius && Math.abs(playerPos[1] - m.pos[1]) <= 1.5) {
          motes.splice(i, 1);
          playerCarried += 1;
          emit('mote_picked', { carried: playerCarried });
        }
      }

      if (charms.length > 1) charms.sort(cmpId);
      for (const c of charms) {
        if (!c.available) continue;
        if (distXZ(playerPos, c.pos) <= tuning.pickup_radius && Math.abs(playerPos[1] - c.pos[1]) <= 1.5) {
          c.available = false;
          c.respawnTicks = CHARM_RESPAWN_TICKS;
          charmTicks = CHARM_DURATION_TICKS;
          dashCdTicks = 0;
          emit('charm_picked', { charm_id: c.id, charm_ticks: CHARM_DURATION_TICKS });
        }
      }
    }

    // 5. Interact with lanterns (light, relight, or refuel if fuel < 100)
    if (respawnTicks === 0 && interactPressed && playerCarried > 0) {
      let best: InternalLantern | null = null;
      let bestDist = Infinity;
      for (const l of lanterns) {
        // Only consider lanterns that can receive motes: unlit OR lit with fuel < 100
        if (l.lit && l.fuelTicks >= FUEL_MAX_TICKS) continue;
        const d = distXZ(playerPos, l.pos);
        if (d <= tuning.interact_radius) {
          if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && best !== null && l.id < best.id)) {
            best = l;
            bestDist = d;
          }
        }
      }

      if (best) {
        if (best.lit) {
          // Refuel lit lantern: used = min(carried, ceil((100 - fuel) / 10))
          const missingFuelTicks = FUEL_MAX_TICKS - best.fuelTicks;
          const motesNeeded = Math.floor((missingFuelTicks + FUEL_PER_MOTE_TICKS - 1) / FUEL_PER_MOTE_TICKS);
          const used = Math.min(playerCarried, motesNeeded);
          if (used > 0) {
            const wasLow = best.fuelTicks < FUEL_LOW_TICKS;
            playerCarried -= used;
            best.fuelTicks = Math.min(FUEL_MAX_TICKS, best.fuelTicks + used * FUEL_PER_MOTE_TICKS);
            score += used * tuning.score.per_mote;
            emit('refuel', {
              lantern_id: best.id,
              amount: used,
              fuel: round1(best.fuelTicks / TICK_RATE)
            });
            if (wasLow && best.fuelTicks >= FUEL_LOW_TICKS) {
              triggerSafeZonePushOut(best);
            }
          }
        } else {
          // Deposit to light or relight unlit lantern
          const cost = best.everLit ? tuning.relight_cost : tuning.lantern_cost;
          const needed = Math.max(0, cost - best.deposited);
          const amount = Math.min(playerCarried, needed);
          if (amount > 0) {
            playerCarried -= amount;
            best.deposited += amount;
            score += amount * tuning.score.per_mote;
            emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
            if (best.deposited >= cost) {
              const isRelight = best.everLit;
              best.lit = true;
              best.fuelTicks = FUEL_MAX_TICKS;
              best.everLit = true;
              if (isRelight) best.relitCount += 1;
              successfulLights += 1;
              score += isRelight ? RELIGHT_SCORE : tuning.score.per_lantern;
              emit('lantern_lit', { lantern_id: best.id, relight: isRelight });
              triggerSafeZonePushOut(best);
            }
          }
        }
      }
    }

    // 6. Update safe zones (only active when lit && fuel >= 30)
    for (const s of shades) {
      if (s.safePushTicksLeft > 0 && s.safePushLanternId) {
        const l = lanterns.find((x) => x.id === s.safePushLanternId);
        if (l && hasActiveSafeZone(l)) {
          const dx = s.pos[0] - l.pos[0];
          const dz = s.pos[2] - l.pos[2];
          const d = Math.hypot(dx, dz);
          if (d >= tuning.safe_radius) {
            s.safePushTicksLeft = 0;
            s.safePushLanternId = null;
          } else {
            const ux = d > 1e-6 ? dx / d : 1;
            const uz = d > 1e-6 ? dz / d : 0;
            const stepOut = (tuning.safe_radius - d + 0.05) / s.safePushTicksLeft;
            const moved = resolveHorizontalMove(night, s.pos[0], s.pos[2], s.pos[1] - 1.0, s.pos[0] + ux * stepOut, s.pos[2] + uz * stepOut, true);
            s.pos[0] = moved.x;
            s.pos[2] = moved.z;
            const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
            if (h !== null) s.pos[1] = h + 1.0;
            s.safePushTicksLeft -= 1;
            if (s.safePushTicksLeft <= 0) {
              enforceSafeZonesForShade(s);
              s.safePushLanternId = null;
            } else {
              enforceSafeZonesForShade(s, s.safePushLanternId);
            }
          }
        } else {
          s.safePushTicksLeft = 0;
          s.safePushLanternId = null;
        }
      } else {
        enforceSafeZonesForShade(s);
      }
    }

    // 7. Pulse (3D distance from player.y + 0.8m; +15 if shade was draining, +5 otherwise)
    if (respawnTicks === 0 && pulsePressed && pulseCdTicks === 0 && playerCarried >= tuning.pulse_cost) {
      playerCarried -= tuning.pulse_cost;
      pulseCdTicks = Math.round(tuning.pulse_cooldown_s * TICK_RATE);
      const pulseCenter: Vec3 = [playerPos[0], playerPos[1] + 0.8, playerPos[2]];

      const stunnedIds: string[] = [];
      const sortedShades = [...shades].sort(cmpId);
      for (const s of sortedShades) {
        if (tick < s.activeFromTick || s.state === 'spawning') continue;
        if (dist3D(pulseCenter, s.pos) <= tuning.pulse_radius) {
          const wasDraining = s.state === 'drain';
          stunnedIds.push(s.id);
          s.state = 'stunned';
          s.stateTicksLeft = Math.round(tuning.pulse_stun_s * TICK_RATE);
          s.targetLanternId = null;
          s.drainTickCounter = 0;
          const dx = s.pos[0] - playerPos[0];
          const dz = s.pos[2] - playerPos[2];
          const d = Math.hypot(dx, dz);
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          s.pushTicksLeft = PULSE_PUSH_TICKS;
          s.pushStepX = (ux * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          s.pushStepZ = (uz * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          score += wasDraining ? DRAIN_STUN_SCORE : tuning.score.per_stun;
        }
      }

      const sortedDrifters = [...drifters].sort(cmpId);
      for (const d of sortedDrifters) {
        if (tick < d.activeFromTick) continue;
        if (dist3D(pulseCenter, d.pos) <= tuning.pulse_radius) {
          if (d.state === 'chase') {
            d.state = 'flee';
            d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (d.state === 'flee' && d.stolen > 0) {
            const amount = d.stolen;
            const dropPos = snapToValidGround(night, d.pos[0], d.pos[2], playerPos);
            for (let i = 0; i < amount; i++) {
              const angle = (i / Math.max(1, amount)) * Math.PI * 2;
              const valid = snapToValidGround(night, dropPos[0] + Math.cos(angle) * 0.4, dropPos[2] + Math.sin(angle) * 0.4, dropPos);
              motes.push({
                id: `M${nextMoteId++}`,
                pos: valid,
                kind: 'dropped',
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
                pickupEnableTick: tick + 1,
                spawnIndex: null
              });
            }
            d.stolen = 0;
            d.fleeTicksLeft = DRIFTER_DROP_FLEE_TICKS;
            emit('drifter_drop', { drifter_id: d.id, amount });
          }
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });
    }

    // 8. Move Shades (with drain + weak-lantern targeting) and Drifters
    const shadeSpeed = mapCfg.shadeSpeed;
    for (const s of shades) {
      if (s.state === 'spawning' || s.safePushTicksLeft > 0) continue;

      if (s.state === 'stunned') {
        if (s.pushTicksLeft > 0) {
          const moved = resolveHorizontalMove(
            night,
            s.pos[0],
            s.pos[2],
            s.pos[1] - 1.0,
            s.pos[0] + s.pushStepX,
            s.pos[2] + s.pushStepZ,
            true
          );
          s.pos[0] = moved.x;
          s.pos[2] = moved.z;
          const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
          if (h !== null) s.pos[1] = h + 1.0;
          if (moved.blocked) s.pushTicksLeft = 0;
          else s.pushTicksLeft -= 1;
        }
        enforceSafeZonesForShade(s);
        continue;
      }

      if (s.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DIST_M / SHADE_RECOIL_TICKS;
        const moved = resolveHorizontalMove(
          night,
          s.pos[0],
          s.pos[2],
          s.pos[1] - 1.0,
          s.pos[0] + s.recoilDirX * stepDist,
          s.pos[2] + s.recoilDirZ * stepDist,
          true
        );
        s.pos[0] = moved.x;
        s.pos[2] = moved.z;
        const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
        if (h !== null) s.pos[1] = h + 1.0;
        enforceSafeZonesForShade(s);
        continue;
      }

      const dPlayer = distXZ(s.pos, playerPos);

      if (s.state === 'drain') {
        if (respawnTicks === 0 && dPlayer <= DRAIN_CHASE_RADIUS) {
          s.state = 'chase';
          s.targetLanternId = null;
          s.drainTickCounter = 0;
        } else {
          const target = lanterns.find((l) => l.id === s.targetLanternId);
          if (!target || !target.lit || target.fuelTicks >= FUEL_LOW_TICKS || distXZ(s.pos, target.pos) > DRAIN_ENTER_RADIUS) {
            s.state = 'wander';
            s.targetLanternId = null;
            s.drainTickCounter = 0;
          } else {
            // Stand still while draining
            continue;
          }
        }
      }

      if (s.state === 'wander' && dPlayer <= SHADE_DETECT_RADIUS && respawnTicks === 0) {
        s.state = 'chase';
        s.targetLanternId = null;
      } else if (s.state === 'chase' && (dPlayer > SHADE_LOSE_RADIUS || respawnTicks > 0)) {
        s.state = 'wander';
      }

      if (s.state === 'chase') {
        if (dPlayer > 1e-6) {
          const ux = (playerPos[0] - s.pos[0]) / dPlayer;
          const uz = (playerPos[2] - s.pos[2]) / dPlayer;
          const moveDist = Math.min(shadeSpeed * DT, dPlayer);
          const moved = resolveHorizontalMove(
            night,
            s.pos[0],
            s.pos[2],
            s.pos[1] - 1.0,
            s.pos[0] + ux * moveDist,
            s.pos[2] + uz * moveDist,
            true
          );
          s.pos[0] = moved.x;
          s.pos[2] = moved.z;
          const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
          if (h !== null) s.pos[1] = h + 1.0;
        }
      } else {
        // wander: prioritize nearest weak lit lantern (fuel < 30), tie-break smallest id
        let weakTarget: InternalLantern | null = null;
        let weakDist = Infinity;
        for (const l of lanterns) {
          if (!l.lit || l.fuelTicks >= FUEL_LOW_TICKS) continue;
          const d = distXZ(s.pos, l.pos);
          if (d < weakDist - 1e-9 || (Math.abs(d - weakDist) <= 1e-9 && weakTarget && l.id < weakTarget.id)) {
            weakDist = d;
            weakTarget = l;
          }
        }

        if (weakTarget) {
          if (weakDist <= DRAIN_ENTER_RADIUS) {
            s.state = 'drain';
            s.targetLanternId = weakTarget.id;
            s.drainTickCounter = 0;
          } else {
            const ux = (weakTarget.pos[0] - s.pos[0]) / weakDist;
            const uz = (weakTarget.pos[2] - s.pos[2]) / weakDist;
            const moveDist = Math.min(shadeSpeed * DT, weakDist);
            const moved = resolveHorizontalMove(
              night,
              s.pos[0],
              s.pos[2],
              s.pos[1] - 1.0,
              s.pos[0] + ux * moveDist,
              s.pos[2] + uz * moveDist,
              true
            );
            s.pos[0] = moved.x;
            s.pos[2] = moved.z;
            const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
            if (h !== null) s.pos[1] = h + 1.0;
            if (distXZ(s.pos, weakTarget.pos) <= DRAIN_ENTER_RADIUS) {
              s.state = 'drain';
              s.targetLanternId = weakTarget.id;
              s.drainTickCounter = 0;
            }
          }
        } else {
          // Move toward nearest unlit lantern, else wander smoothly
          let unlitTarget: InternalLantern | null = null;
          let unlitDist = Infinity;
          for (const l of lanterns) {
            if (l.lit) continue;
            const d = distXZ(s.pos, l.pos);
            if (d < unlitDist - 1e-9 || (Math.abs(d - unlitDist) <= 1e-9 && unlitTarget && l.id < unlitTarget.id)) {
              unlitDist = d;
              unlitTarget = l;
            }
          }

          const wanderSpeed = shadeSpeed * 0.5;
          if (unlitTarget && unlitDist > 3.0) {
            const ux = (unlitTarget.pos[0] - s.pos[0]) / unlitDist;
            const uz = (unlitTarget.pos[2] - s.pos[2]) / unlitDist;
            const moved = resolveHorizontalMove(
              night,
              s.pos[0],
              s.pos[2],
              s.pos[1] - 1.0,
              s.pos[0] + ux * wanderSpeed * DT,
              s.pos[2] + uz * wanderSpeed * DT,
              true
            );
            s.pos[0] = moved.x;
            s.pos[2] = moved.z;
            const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
            if (h !== null) s.pos[1] = h + 1.0;
          } else {
            s.wanderTimer -= 1;
            if (s.wanderTimer <= 0) {
              s.wanderAngle += rng.range(-0.9, 0.9);
              s.wanderTimer = rng.int(45, 120);
            }
            const moved = resolveHorizontalMove(
              night,
              s.pos[0],
              s.pos[2],
              s.pos[1] - 1.0,
              s.pos[0] + Math.cos(s.wanderAngle) * wanderSpeed * DT,
              s.pos[2] + Math.sin(s.wanderAngle) * wanderSpeed * DT,
              true
            );
            if (moved.blocked) s.wanderAngle += Math.PI * 0.75;
            s.pos[0] = moved.x;
            s.pos[2] = moved.z;
            const h = getSurfaceHeight(night, s.pos[0], s.pos[2]);
            if (h !== null) s.pos[1] = h + 1.0;
          }
        }
      }

      enforceSafeZonesForShade(s);
    }

    // Move Drifters
    for (let i = drifters.length - 1; i >= 0; i--) {
      const d = drifters[i];
      if (tick < d.activeFromTick) continue;

      if (d.state === 'flee') {
        const dx = d.pos[0] - playerPos[0];
        const dz = d.pos[2] - playerPos[2];
        const dist = Math.hypot(dx, dz);
        const ux = dist > 1e-6 ? dx / dist : 1;
        const uz = dist > 1e-6 ? dz / dist : 0;
        d.pos[0] += ux * DRIFTER_FAST_SPEED * DT;
        d.pos[2] += uz * DRIFTER_FAST_SPEED * DT;
        d.fleeTicksLeft -= 1;
        if (d.fleeTicksLeft <= 0) {
          d.state = 'removed';
          drifters.splice(i, 1);
        }
        continue;
      }

      const dPlayer = distXZ(d.pos, playerPos);
      const shouldChase = respawnTicks === 0 && playerCarried >= DRIFTER_MIN_CARRIED && dPlayer <= DRIFTER_DETECT_RADIUS;
      d.state = shouldChase ? 'chase' : 'idle';

      if (d.state === 'chase') {
        if (dPlayer > 1e-6) {
          const ux = (playerPos[0] - d.pos[0]) / dPlayer;
          const uz = (playerPos[2] - d.pos[2]) / dPlayer;
          const moveDist = Math.min(DRIFTER_FAST_SPEED * DT, dPlayer);
          d.pos[0] += ux * moveDist;
          d.pos[2] += uz * moveDist;
          d.pos[1] += (playerPos[1] + 1.2 - d.pos[1]) * 0.15;
        }
      } else {
        d.idleAngle += 0.025;
        d.pos[0] += Math.cos(d.idleAngle) * DRIFTER_IDLE_SPEED * DT;
        d.pos[2] += Math.sin(d.idleAngle) * DRIFTER_IDLE_SPEED * DT;
      }
    }

    // 9. Contacts: Drifters steal first, then Shades hit
    if (respawnTicks === 0) {
      if (drifters.length > 1) drifters.sort(cmpId);
      for (const d of drifters) {
        if (tick < d.activeFromTick) continue;
        if (d.state !== 'chase' || d.hasStolen) continue;
        if (distXZ(playerPos, d.pos) <= DRIFTER_STEAL_RADIUS) {
          const amount = Math.min(DRIFTER_MAX_STEAL, playerCarried);
          playerCarried -= amount;
          d.stolen = amount;
          d.hasStolen = true;
          d.state = 'flee';
          d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          emit('drifter_steal', { drifter_id: d.id, amount, carried: playerCarried });
        }
      }

      if (invulnTicks === 0) {
        if (shades.length > 1) shades.sort(cmpId);
        for (const s of shades) {
          if (tick < s.activeFromTick) continue;
          if (s.state !== 'chase' && s.state !== 'wander') continue;
          if (s.safePushTicksLeft > 0) continue;
          if (distXZ(playerPos, s.pos) <= tuning.shade_hit_radius && Math.abs(playerPos[1] - s.pos[1]) <= 1.5) {
            playerFlames = Math.max(0, playerFlames - 1);
            const dropped = Math.floor(playerCarried * tuning.hit_drop_ratio);
            playerCarried -= dropped;

            for (let i = 0; i < dropped; i++) {
              const angle = rng.range(0, Math.PI * 2);
              const r = rng.range(1.5, 2.5);
              const valid = snapToValidGround(night, playerPos[0] + Math.cos(angle) * r, playerPos[2] + Math.sin(angle) * r, playerPos);
              motes.push({
                id: `M${nextMoteId++}`,
                pos: valid,
                kind: 'dropped',
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
                pickupEnableTick: tick + 1,
                spawnIndex: null
              });
            }

            invulnTicks = Math.round(tuning.invuln_s * TICK_RATE);
            s.state = 'recoil';
            s.stateTicksLeft = SHADE_RECOIL_TICKS;
            const rdx = s.pos[0] - playerPos[0];
            const rdz = s.pos[2] - playerPos[2];
            const rd = Math.hypot(rdx, rdz);
            s.recoilDirX = rd > 1e-6 ? rdx / rd : 1;
            s.recoilDirZ = rd > 1e-6 ? rdz / rd : 0;

            emit('player_hit', { by: 'shade', flames: playerFlames, dropped });
            break;
          }
        }
      }
    }

    // 10. Scheduled spawns
    if (randomMotesEnabled && simTick > 0 && simTick % MOTE_SPAWN_INTERVAL_TICKS === 0) {
      spawnScheduledMote();
    }
    if (randomShadesEnabled) {
      if (simTick === SHADE_FIRST_SPAWN_TICK) {
        spawnScheduledShade();
        spawnScheduledShade();
      } else if (simTick > SHADE_FIRST_SPAWN_TICK && (simTick - SHADE_FIRST_SPAWN_TICK) % mapCfg.shadeSpawnIntervalTicks === 0) {
        spawnScheduledShade();
      }
    }
    if (randomDriftersEnabled && simTick > 0 && simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0) {
      spawnScheduledDrifter();
    }

    // 11. Win / Loss check (Ticket-03: no early all_lit win; check no_flames first, then dawn_survived vs dawn)
    if (playerFlames <= 0) {
      state = 'lost';
      emit('game_over', { result: 'lost', reason: 'no_flames' });
    } else if (remainingTicks <= 0) {
      const litLanterns = lanterns.filter((l) => l.lit);
      const requiredLit = Math.ceil(tuning.win_ratio * lanterns.length);
      if (litLanterns.length >= requiredLit) {
        state = 'won';
        for (const l of litLanterns) {
          score += DAWN_LIT_BONUS + Math.floor(l.fuelTicks / TICK_RATE);
        }
        score += playerFlames * tuning.score.per_flame_left;
        emit('game_over', { result: 'won', reason: 'dawn_survived' });
      } else {
        state = 'lost';
        emit('game_over', { result: 'lost', reason: 'dawn' });
      }
    }

    const out = pendingEvents;
    pendingEvents = EMPTY_EVENTS;
    return out;
  }

  function getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick,
      sim_tick: simTick,
      night,
      state,
      time_left_s: round3(Math.max(0, remainingTicks) / TICK_RATE),
      score,
      wind: {
        active: windActive,
        dir_deg: windActive ? round3(windDirDeg) : 0
      },
      player: {
        pos: roundVec3(playerPos),
        vel: roundVec3(playerVel),
        grounded: playerGrounded,
        flames: playerFlames,
        carried: playerCarried,
        capacity: getCarryCapacity(),
        invuln: invulnTicks > 0,
        dash_cd_s: round3(dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(pulseCdTicks / TICK_RATE),
        charm_s: round3(charmTicks / TICK_RATE)
      },
      lanterns: lanterns.map((l) => ({
        id: l.id,
        pos: roundVec3(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? round1(l.fuelTicks / TICK_RATE) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount
      })),
      shades: shades.map((s) => ({
        id: s.id,
        pos: roundVec3(s.pos),
        state: s.state
      })),
      motes_active: motes.length,
      motes: motes.map((m) => ({
        id: m.id,
        pos: roundVec3(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE)
      })),
      drifters: drifters.map((d) => ({
        id: d.id,
        pos: roundVec3(d.pos),
        state: d.state,
        stolen: d.stolen
      })),
      charms: charms.map((c) => ({
        id: c.id,
        pos: roundVec3(c.pos),
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE)
      }))
    };
  }

  return {
    step,
    getSnapshot,
    drainEvents(): EventRecord[] {
      const ev = pendingEvents;
      pendingEvents = EMPTY_EVENTS;
      return ev;
    },
    getState: () => state,
    getTick: () => tick,
    getSimTick: () => simTick,
    getScore: () => score,
    getFacingYaw: () => facingYaw,
    getTuning: () => tuning,
    isWindWarning(): boolean {
      if (!windEnabled || windActive) return false;
      const mod = simTick % WIND_INTERVAL_TICKS;
      return mod >= WIND_INTERVAL_TICKS - WIND_WARNING_TICKS;
    },
    isRespawning: () => respawnTicks > 0,
    isDashing: () => dashTicksLeft > 0
  };
}

export interface RunSimulationOptions {
  seed: number;
  night: NightNumber;
  scenario?: ScenarioConfig;
  inputs?: InputsFile;
  ticks: number;
  snapshotEvery?: number;
}

export interface RunSimulationResult {
  snapshots: SnapshotRecord[];
  events: EventRecord[];
  records: Array<SnapshotRecord | EventRecord | EndRecord>;
  end: EndRecord;
}

export function runSimulation(opts: RunSimulationOptions): RunSimulationResult {
  const snapshotEvery = opts.snapshotEvery ?? 10;
  const sim = createSimulation({
    seed: opts.seed,
    night: opts.night,
    scenario: opts.scenario
  });

  const frames = opts.inputs?.frames ?? [];
  let frameIdx = 0;
  const currentInput: LiveInputState = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false
  };

  const snapshots: SnapshotRecord[] = [];
  const events: EventRecord[] = [];
  const records: Array<SnapshotRecord | EventRecord | EndRecord> = [];

  const snap0 = sim.getSnapshot();
  snapshots.push(snap0);
  records.push(snap0);

  const startEvent: EventRecord = { type: 'event', tick: 0, name: 'night_start', data: { night: opts.night } };
  events.push(startEvent);
  records.push(startEvent);

  for (let k = 0; k < opts.ticks; k++) {
    const st = sim.getState();
    if (st === 'won' || st === 'lost') break;

    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx++];
      if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) currentInput.jump = f.jump;
      if (f.interact !== undefined) currentInput.interact = f.interact;
      if (f.pulse !== undefined) currentInput.pulse = f.pulse;
      if (f.dash !== undefined) currentInput.dash = f.dash;
      if (f.pause !== undefined) currentInput.pause = f.pause;
    }

    const stepEvents = sim.step(currentInput);
    for (const ev of stepEvents) {
      events.push(ev);
      records.push(ev);
    }

    const currentTick = sim.getTick();
    if (currentTick % snapshotEvery === 0) {
      const snap = sim.getSnapshot();
      snapshots.push(snap);
      records.push(snap);
    }

    const afterState = sim.getState();
    if (afterState === 'won' || afterState === 'lost') {
      break;
    }
  }

  const end: EndRecord = {
    type: 'end',
    ticks: sim.getTick(),
    state: sim.getState(),
    score: sim.getScore()
  };
  records.push(end);

  return { snapshots, events, records, end };
}
