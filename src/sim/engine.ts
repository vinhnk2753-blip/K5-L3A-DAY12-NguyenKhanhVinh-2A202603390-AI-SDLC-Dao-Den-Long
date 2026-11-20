import {
  DROPPED_MOTE_TTL_TICKS,
  DT,
  GRAVITY,
  ISLAND_RADIUS_NIGHT1,
  JUMP_VELOCITY,
  MOTE_INITIAL_COUNT,
  MOTE_MAX_COUNT,
  MOTE_SPAWN_INTERVAL_TICKS,
  NIGHT1_LANTERNS,
  NIGHT1_MOTE_SPAWNS,
  NIGHT1_SHADE_SPAWNS,
  PHASE1_TUNING,
  PULSE_PUSH_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SHADE_DETECT_RADIUS,
  SHADE_FIRST_SPAWN_TICK,
  SHADE_LOSE_RADIUS,
  SHADE_MAX_COUNT_NIGHT1,
  SHADE_MIN_SPAWN_DIST,
  SHADE_RECOIL_DIST_M,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWN_INTERVAL_TICKS,
  TICK_RATE
} from './config.js';
import { createRng, round3, roundVec3, type SeededRng } from './rng.js';
import type {
  EndRecord,
  EventRecord,
  GameState,
  InputsFile,
  LiveInputState,
  ScenarioConfig,
  ShadeState,
  SnapshotRecord,
  TuningConfig,
  Vec3
} from './types.js';

interface InternalMote {
  id: string;
  pos: Vec3;
  dropped: boolean;
  ttlTicks: number | null;
  pickupEnableTick: number;
  spawnIndex: number | null;
}

interface InternalLantern {
  id: string;
  pos: Vec3;
  deposited: number;
  lit: boolean;
}

interface InternalShade {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stateTicksLeft: number;
  pushTicksLeft: number;
  pushStepX: number;
  pushStepZ: number;
  recoilDirX: number;
  recoilDirZ: number;
  wanderAngle: number;
  wanderTimer: number;
  safePushTicksLeft: number;
  safePushLanternId: string | null;
}

export interface SimulationOptions {
  seed: number;
  night: number;
  scenario?: ScenarioConfig;
  tuning?: TuningConfig;
}

export interface SimulationInstance {
  step(input: LiveInputState): EventRecord[];
  getSnapshot(): SnapshotRecord;
  drainEvents(): EventRecord[];
  getState(): GameState;
  getTick(): number;
  getScore(): number;
  getPulseCooldownTicks(): number;
  getInvulnTicks(): number;
  getFacingYaw(): number;
  getTuning(): TuningConfig;
}

function clampToIsland(x: number, z: number, maxR: number): [number, number] {
  const r = Math.hypot(x, z);
  if (r > maxR && r > 1e-9) {
    const s = maxR / r;
    return [x * s, z * s];
  }
  return [x, z];
}

function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function parseNumericSuffix(id: string, prefix: string): number {
  if (!id.startsWith(prefix)) return 0;
  const n = Number.parseInt(id.slice(prefix.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function createSimulation(options: SimulationOptions): SimulationInstance {
  if (options.night !== 1) {
    throw new Error(`Unsupported night "${options.night}" in Phase 1 (only night 1 is supported)`);
  }

  const tuning: TuningConfig = options.tuning ?? PHASE1_TUNING;
  const rng: SeededRng = createRng(options.seed);
  const scenario = options.scenario ?? {};

  let tick = 0;
  let simTick = 0;
  let state: GameState = 'playing';
  let score = 0;
  let remainingTicks = Math.round((scenario.time_left_s ?? tuning.night1_duration_s) * TICK_RATE);

  const playerPos: Vec3 = scenario.player?.pos ? [...scenario.player.pos] : [0, 0, 0];
  let playerVy = 0;
  let playerGrounded = playerPos[1] <= 0;
  let playerCarried = Math.min(tuning.carry_capacity, scenario.player?.carried ?? 0);
  let playerFlames = scenario.player?.flames ?? tuning.flames;
  let invulnTicks = 0;
  let pulseCdTicks = 0;
  let facingYaw = 0; // +Z facing

  let prevJump = false;
  let prevInteract = false;
  let prevPulse = false;

  const randomMotesEnabled = scenario.random_motes !== false;
  const randomShadesEnabled = scenario.random_shades !== false;

  // Lanterns
  const lanterns: InternalLantern[] = NIGHT1_LANTERNS.map((def) => ({
    id: def.id,
    pos: [...def.pos],
    deposited: 0,
    lit: false
  }));

  if (scenario.lanterns) {
    for (const override of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === override.id);
      if (target) {
        if (override.pos) target.pos = [...override.pos];
        if (override.deposited !== undefined) target.deposited = override.deposited;
        if (override.lit !== undefined) {
          target.lit = override.lit;
          if (target.lit && override.deposited === undefined) {
            target.deposited = Math.max(target.deposited, tuning.lantern_cost);
          }
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
        pos: [pos[0], 0, pos[2]],
        dropped: false,
        ttlTicks: null,
        pickupEnableTick: 0,
        spawnIndex: null
      });
    }
  } else if (randomMotesEnabled) {
    const indices = NIGHT1_MOTE_SPAWNS.map((_, i) => i);
    // Fisher-Yates shuffle with seeded RNG
    for (let i = indices.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.min(MOTE_INITIAL_COUNT, indices.length);
    for (let i = 0; i < count; i++) {
      const idx = indices[i];
      const pt = NIGHT1_MOTE_SPAWNS[idx];
      motes.push({
        id: `M${nextMoteId++}`,
        pos: [...pt],
        dropped: false,
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
      shades.push({
        id,
        pos: [s.pos[0], s.pos[1] > 0 ? s.pos[1] : 1.0, s.pos[2]],
        state: dist <= SHADE_DETECT_RADIUS ? 'chase' : 'wander',
        stateTicksLeft: 0,
        pushTicksLeft: 0,
        pushStepX: 0,
        pushStepZ: 0,
        recoilDirX: 0,
        recoilDirZ: 0,
        wanderAngle: rng.range(0, Math.PI * 2),
        wanderTimer: 60,
        safePushTicksLeft: 0,
        safePushLanternId: null
      });
    }
  }

  let pendingEvents: EventRecord[] = [];

  function emit(name: EventRecord['name'], data: Record<string, unknown>): void {
    pendingEvents.push({ type: 'event', tick, name, data });
  }

  function isInsideLitSafeZone(x: number, z: number): InternalLantern | null {
    for (const l of lanterns) {
      if (!l.lit) continue;
      if (Math.hypot(x - l.pos[0], z - l.pos[2]) < tuning.safe_radius) {
        return l;
      }
    }
    return null;
  }

  function enforceSafeZonesForShade(s: InternalShade): void {
    for (const l of lanterns) {
      if (!l.lit) continue;
      const dx = s.pos[0] - l.pos[0];
      const dz = s.pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < tuning.safe_radius) {
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        const [cx, cz] = clampToIsland(l.pos[0] + ux * tuning.safe_radius, l.pos[2] + uz * tuning.safe_radius, ISLAND_RADIUS_NIGHT1 - 0.5);
        s.pos[0] = cx;
        s.pos[2] = cz;
      }
    }
  }

  function spawnScheduledShade(): void {
    if (shades.length >= SHADE_MAX_COUNT_NIGHT1) return;
    const candidates = NIGHT1_SHADE_SPAWNS.filter((pt) => {
      if (distXZ(pt, playerPos) < SHADE_MIN_SPAWN_DIST) return false;
      if (isInsideLitSafeZone(pt[0], pt[2])) return false;
      return true;
    });
    if (candidates.length === 0) return;
    const pt = candidates[rng.int(0, candidates.length)];
    const id = `S${nextShadeId++}`;
    shades.push({
      id,
      pos: [pt[0], 1.0, pt[2]],
      state: 'spawning',
      stateTicksLeft: 30,
      pushTicksLeft: 0,
      pushStepX: 0,
      pushStepZ: 0,
      recoilDirX: 0,
      recoilDirZ: 0,
      wanderAngle: rng.range(0, Math.PI * 2),
      wanderTimer: 60,
      safePushTicksLeft: 0,
      safePushLanternId: null
    });
    emit('shade_spawned', { id });
  }

  function spawnScheduledMote(): void {
    if (motes.length >= MOTE_MAX_COUNT) return;
    const occupied = new Set<number>();
    for (const m of motes) {
      if (m.spawnIndex !== null) occupied.add(m.spawnIndex);
    }
    const freeIndices: number[] = [];
    for (let i = 0; i < NIGHT1_MOTE_SPAWNS.length; i++) {
      if (!occupied.has(i)) freeIndices.push(i);
    }
    if (freeIndices.length === 0) return;
    const idx = freeIndices[rng.int(0, freeIndices.length)];
    const pt = NIGHT1_MOTE_SPAWNS[idx];
    motes.push({
      id: `M${nextMoteId++}`,
      pos: [...pt],
      dropped: false,
      ttlTicks: null,
      pickupEnableTick: tick + 1,
      spawnIndex: idx
    });
  }

  function step(input: LiveInputState): EventRecord[] {
    if (state !== 'playing') {
      return [];
    }

    pendingEvents = [];
    tick += 1;
    simTick += 1;

    // 1. Read input & edge triggers
    const jumpPressed = !prevJump && input.jump;
    const interactPressed = !prevInteract && input.interact;
    const pulsePressed = !prevPulse && input.pulse;
    prevJump = input.jump;
    prevInteract = input.interact;
    prevPulse = input.pulse;

    // 2. Decrement timers
    if (remainingTicks > 0) remainingTicks -= 1;
    if (invulnTicks > 0) invulnTicks -= 1;
    if (pulseCdTicks > 0) pulseCdTicks -= 1;

    for (const s of shades) {
      if (s.stateTicksLeft > 0) {
        s.stateTicksLeft -= 1;
        if (s.stateTicksLeft === 0 && (s.state === 'spawning' || s.state === 'stunned' || s.state === 'recoil')) {
          s.state = distXZ(s.pos, playerPos) <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
        }
      }
    }

    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      if (m.ttlTicks !== null) {
        m.ttlTicks -= 1;
        if (m.ttlTicks <= 0) {
          motes.splice(i, 1);
        }
      }
    }

    // 3. Move player
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

    if (Math.hypot(wx, wz) > 1e-6) {
      facingYaw = Math.atan2(wx, wz);
    }

    const nextX = playerPos[0] + wx * tuning.player_speed * DT;
    const nextZ = playerPos[2] + wz * tuning.player_speed * DT;
    const [clampedX, clampedZ] = clampToIsland(nextX, nextZ, ISLAND_RADIUS_NIGHT1);
    playerPos[0] = clampedX;
    playerPos[2] = clampedZ;

    if (jumpPressed && playerGrounded) {
      playerVy = JUMP_VELOCITY;
      playerGrounded = false;
    }

    if (!playerGrounded) {
      playerPos[1] += playerVy * DT + 0.5 * GRAVITY * DT * DT;
      playerVy += GRAVITY * DT;
      if (playerPos[1] <= 0) {
        playerPos[1] = 0;
        playerVy = 0;
        playerGrounded = true;
      }
    }

    // 4. Pick up motes
    for (let i = motes.length - 1; i >= 0; i--) {
      if (playerCarried >= tuning.carry_capacity) break;
      const m = motes[i];
      if (tick < m.pickupEnableTick) continue;
      if (distXZ(playerPos, m.pos) <= tuning.pickup_radius && Math.abs(playerPos[1] - m.pos[1]) <= 1.5) {
        motes.splice(i, 1);
        playerCarried += 1;
        emit('mote_picked', { carried: playerCarried });
      }
    }

    // 5. Interact with lanterns
    if (interactPressed && playerCarried > 0) {
      let best: InternalLantern | null = null;
      let bestDist = Infinity;
      for (const l of lanterns) {
        if (l.lit) continue;
        const d = distXZ(playerPos, l.pos);
        if (d <= tuning.interact_radius) {
          if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && best !== null && l.id < best.id)) {
            best = l;
            bestDist = d;
          }
        }
      }
      if (best) {
        const needed = Math.max(0, tuning.lantern_cost - best.deposited);
        const amount = Math.min(playerCarried, needed);
        if (amount > 0) {
          playerCarried -= amount;
          best.deposited += amount;
          score += amount * tuning.score.per_mote;
          emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= tuning.lantern_cost) {
            best.lit = true;
            score += tuning.score.per_lantern;
            emit('lantern_lit', { lantern_id: best.id });
            // Mark shades currently inside newly lit lantern safe zone for push-out
            for (const s of shades) {
              if (distXZ(s.pos, best.pos) < tuning.safe_radius) {
                s.safePushTicksLeft = SAFE_PUSH_MAX_TICKS;
                s.safePushLanternId = best.id;
              }
            }
          }
        }
      }
    }

    // 6. Update safe zones
    for (const s of shades) {
      if (s.safePushTicksLeft > 0 && s.safePushLanternId) {
        const l = lanterns.find((x) => x.id === s.safePushLanternId);
        if (l) {
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
            const [cx, cz] = clampToIsland(s.pos[0] + ux * stepOut, s.pos[2] + uz * stepOut, ISLAND_RADIUS_NIGHT1 - 0.5);
            s.pos[0] = cx;
            s.pos[2] = cz;
            s.safePushTicksLeft -= 1;
            if (s.safePushTicksLeft <= 0) {
              enforceSafeZonesForShade(s);
              s.safePushLanternId = null;
            }
          }
        }
      } else {
        enforceSafeZonesForShade(s);
      }
    }

    // 7. Pulse
    if (pulsePressed && pulseCdTicks === 0 && playerCarried >= tuning.pulse_cost) {
      playerCarried -= tuning.pulse_cost;
      pulseCdTicks = Math.round(tuning.pulse_cooldown_s * TICK_RATE);
      const stunnedIds: string[] = [];
      const sortedShades = [...shades].sort((a, b) => a.id.localeCompare(b.id));
      for (const s of sortedShades) {
        if (s.state === 'spawning') continue;
        if (distXZ(playerPos, s.pos) <= tuning.pulse_radius) {
          stunnedIds.push(s.id);
          s.state = 'stunned';
          s.stateTicksLeft = Math.round(tuning.pulse_stun_s * TICK_RATE);
          const dx = s.pos[0] - playerPos[0];
          const dz = s.pos[2] - playerPos[2];
          const d = Math.hypot(dx, dz);
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          s.pushTicksLeft = PULSE_PUSH_TICKS;
          s.pushStepX = (ux * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          s.pushStepZ = (uz * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          score += tuning.score.per_stun;
        }
      }
      emit('pulse', { stunned_ids: stunnedIds });
    }

    // 8. Move shades
    for (const s of shades) {
      if (s.state === 'spawning') continue;

      if (s.state === 'stunned') {
        if (s.pushTicksLeft > 0) {
          const nx = s.pos[0] + s.pushStepX;
          const nz = s.pos[2] + s.pushStepZ;
          if (Math.hypot(nx, nz) <= ISLAND_RADIUS_NIGHT1 - 0.5) {
            s.pos[0] = nx;
            s.pos[2] = nz;
          } else {
            s.pushTicksLeft = 0;
          }
          if (s.pushTicksLeft > 0) s.pushTicksLeft -= 1;
        }
        if (s.safePushTicksLeft === 0) enforceSafeZonesForShade(s);
        continue;
      }

      if (s.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DIST_M / SHADE_RECOIL_TICKS;
        const [cx, cz] = clampToIsland(
          s.pos[0] + s.recoilDirX * stepDist,
          s.pos[2] + s.recoilDirZ * stepDist,
          ISLAND_RADIUS_NIGHT1 - 0.5
        );
        s.pos[0] = cx;
        s.pos[2] = cz;
        if (s.safePushTicksLeft === 0) enforceSafeZonesForShade(s);
        continue;
      }

      const dPlayer = distXZ(s.pos, playerPos);
      if (s.state === 'wander' && dPlayer <= SHADE_DETECT_RADIUS) {
        s.state = 'chase';
      } else if (s.state === 'chase' && dPlayer > SHADE_LOSE_RADIUS) {
        s.state = 'wander';
      }

      if (s.state === 'chase') {
        if (dPlayer > 1e-6) {
          const ux = (playerPos[0] - s.pos[0]) / dPlayer;
          const uz = (playerPos[2] - s.pos[2]) / dPlayer;
          const moveDist = Math.min(tuning.shade_speed * DT, dPlayer);
          const [cx, cz] = clampToIsland(s.pos[0] + ux * moveDist, s.pos[2] + uz * moveDist, ISLAND_RADIUS_NIGHT1 - 0.5);
          s.pos[0] = cx;
          s.pos[2] = cz;
        }
      } else {
        // wander
        s.wanderTimer -= 1;
        if (s.wanderTimer <= 0) {
          s.wanderAngle += rng.range(-0.9, 0.9);
          s.wanderTimer = rng.int(45, 120);
        }
        const wanderSpeed = tuning.shade_speed * 0.5;
        let nx = s.pos[0] + Math.cos(s.wanderAngle) * wanderSpeed * DT;
        let nz = s.pos[2] + Math.sin(s.wanderAngle) * wanderSpeed * DT;
        if (Math.hypot(nx, nz) > ISLAND_RADIUS_NIGHT1 - 2) {
          s.wanderAngle = Math.atan2(-s.pos[2], -s.pos[0]);
          nx = s.pos[0] + Math.cos(s.wanderAngle) * wanderSpeed * DT;
          nz = s.pos[2] + Math.sin(s.wanderAngle) * wanderSpeed * DT;
        }
        s.pos[0] = nx;
        s.pos[2] = nz;
      }

      if (s.safePushTicksLeft === 0) enforceSafeZonesForShade(s);
    }

    // 9. Shade hits (ascending id order, max 1 flame lost per tick)
    if (invulnTicks === 0) {
      const sortedShades = [...shades].sort((a, b) => a.id.localeCompare(b.id));
      for (const s of sortedShades) {
        if (s.state !== 'chase' && s.state !== 'wander') continue;
        if (s.safePushTicksLeft > 0) continue;
        if (distXZ(playerPos, s.pos) <= tuning.shade_hit_radius && Math.abs(playerPos[1] - s.pos[1]) <= 1.5) {
          playerFlames = Math.max(0, playerFlames - 1);
          const dropped = Math.floor(playerCarried * tuning.hit_drop_ratio);
          playerCarried -= dropped;

          for (let i = 0; i < dropped; i++) {
            const angle = rng.range(0, Math.PI * 2);
            const r = rng.range(1.5, 2.5);
            const [dx, dz] = clampToIsland(playerPos[0] + Math.cos(angle) * r, playerPos[2] + Math.sin(angle) * r, ISLAND_RADIUS_NIGHT1 - 0.5);
            motes.push({
              id: `M${nextMoteId++}`,
              pos: [dx, 0, dz],
              dropped: true,
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

    // 10. Scheduled spawns
    if (randomMotesEnabled && simTick > 0 && simTick % MOTE_SPAWN_INTERVAL_TICKS === 0) {
      spawnScheduledMote();
    }
    if (randomShadesEnabled) {
      if (simTick === SHADE_FIRST_SPAWN_TICK) {
        spawnScheduledShade();
        spawnScheduledShade();
      } else if (simTick > SHADE_FIRST_SPAWN_TICK && (simTick - SHADE_FIRST_SPAWN_TICK) % SHADE_SPAWN_INTERVAL_TICKS === 0) {
        spawnScheduledShade();
      }
    }

    // 11. Win / Loss check
    const allLit = lanterns.every((l) => l.lit);
    if (playerFlames <= 0) {
      state = 'lost';
      emit('game_over', { result: 'lost', reason: 'no_flames' });
    } else if (allLit) {
      state = 'won';
      const secLeft = Math.floor(Math.max(0, remainingTicks) / TICK_RATE);
      score += secLeft * tuning.score.per_second_left + playerFlames * tuning.score.per_flame_left;
      emit('game_over', { result: 'won', reason: 'all_lit' });
    } else if (remainingTicks <= 0) {
      state = 'lost';
      emit('game_over', { result: 'lost', reason: 'dawn' });
    }

    const out = pendingEvents;
    pendingEvents = [];
    return out;
  }

  function getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick,
      sim_tick: simTick,
      state,
      time_left_s: round3(Math.max(0, remainingTicks) / TICK_RATE),
      score,
      player: {
        pos: roundVec3(playerPos),
        flames: playerFlames,
        carried: playerCarried
      },
      lanterns: lanterns.map((l) => ({
        id: l.id,
        pos: roundVec3(l.pos),
        lit: l.lit,
        deposited: l.deposited
      })),
      shades: shades.map((s) => ({
        id: s.id,
        pos: roundVec3(s.pos),
        state: s.state
      })),
      motes_active: motes.length,
      motes: motes.map((m) => ({
        id: m.id,
        pos: roundVec3(m.pos)
      }))
    };
  }

  return {
    step,
    getSnapshot,
    drainEvents(): EventRecord[] {
      const ev = pendingEvents;
      pendingEvents = [];
      return ev;
    },
    getState: () => state,
    getTick: () => tick,
    getScore: () => score,
    getPulseCooldownTicks: () => pulseCdTicks,
    getInvulnTicks: () => invulnTicks,
    getFacingYaw: () => facingYaw,
    getTuning: () => tuning
  };
}

export interface RunSimulationOptions {
  seed: number;
  night: number;
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
    pulse: false
  };

  const snapshots: SnapshotRecord[] = [];
  const events: EventRecord[] = [];
  const records: Array<SnapshotRecord | EventRecord | EndRecord> = [];

  // Tick 0 snapshot before any input
  const snap0 = sim.getSnapshot();
  snapshots.push(snap0);
  records.push(snap0);

  for (let k = 0; k < opts.ticks; k++) {
    if (sim.getState() !== 'playing') break;

    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx++];
      if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) currentInput.jump = f.jump;
      if (f.interact !== undefined) currentInput.interact = f.interact;
      if (f.pulse !== undefined) currentInput.pulse = f.pulse;
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

    if (sim.getState() !== 'playing') {
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
