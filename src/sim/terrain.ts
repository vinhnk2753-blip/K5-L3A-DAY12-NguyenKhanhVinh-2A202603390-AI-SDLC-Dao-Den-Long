import type { NightNumber, Vec3 } from './types.js';

export const ISLAND1_RADIUS = 40.0;
export const ISLAND2_RADIUS = 28.0;
export const ISLAND2_B_CENTER_X = 70.0;
export const BRIDGE_X_MIN = 26.0;
export const BRIDGE_X_MAX = 44.0;
export const BRIDGE_Z_HALF = 2.0;

export const ISLAND3_RADIUS = 45.0;
export const TIER1_R_MIN = 12.0;
export const TIER1_R_MAX = 24.0;
export const TIER1_Y = 3.0;
export const TIER2_RADIUS = 8.0;
export const TIER2_Y = 6.0;
export const BELL_TOWER_RADIUS = 2.0;
export const BELL_TOWER_HEIGHT = 8.0;

export const RAMP_ANGLES_DEG = [30, 150] as const;
export const RAMP_R_TOP = 24.0;
export const RAMP_R_BOTTOM = 30.0;
export const RAMP_HALF_WIDTH = 1.5;

export const MAX_STEP_UP = 0.35;

export interface JumpPadDef {
  pos: Vec3;
  radius: number;
  vy: number;
  horizSpeed: number;
  dirX: number;
  dirZ: number;
}

function makeJumpPadsNight2(): JumpPadDef[] {
  const dx1 = ISLAND2_B_CENTER_X - 20;
  const dz1 = 0 - 18;
  const len1 = Math.hypot(dx1, dz1);

  const dx2 = 0 - 50;
  const dz2 = 0 - -18;
  const len2 = Math.hypot(dx2, dz2);

  return [
    { pos: [20, 0, 18], radius: 1.0, vy: 14.0, horizSpeed: 24.0, dirX: dx1 / len1, dirZ: dz1 / len1 },
    { pos: [50, 0, -18], radius: 1.0, vy: 14.0, horizSpeed: 24.0, dirX: dx2 / len2, dirZ: dz2 / len2 }
  ];
}

const NIGHT2_JUMP_PADS = makeJumpPadsNight2();
const NIGHT3_JUMP_PADS: JumpPadDef[] = [
  { pos: [0, 3, 13], radius: 1.0, vy: 12.0, horizSpeed: 8.0, dirX: 0, dirZ: -1 }
];

export function getJumpPads(night: NightNumber): JumpPadDef[] {
  if (night === 2) return NIGHT2_JUMP_PADS;
  if (night === 3) return NIGHT3_JUMP_PADS;
  return [];
}

function getRampHeight(x: number, z: number): number | null {
  for (const deg of RAMP_ANGLES_DEG) {
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const s = x * ux + z * uz;
    const d = Math.abs(x * vx + z * vz);
    // Extend top overlap slightly to 23.6 so lateral corners meet Tier 1 (r <= 24) seamlessly
    if (s >= RAMP_R_TOP - 0.4 && s <= RAMP_R_BOTTOM && d <= RAMP_HALF_WIDTH) {
      const t = (RAMP_R_BOTTOM - s) / (RAMP_R_BOTTOM - RAMP_R_TOP);
      return Math.max(0, Math.min(TIER1_Y, TIER1_Y * t));
    }
  }
  return null;
}

/**
 * Returns the ground surface Y at (x, z) for the given night, or null if over the void (cloud sea).
 */
export function getSurfaceHeight(night: NightNumber, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= ISLAND1_RADIUS ? 0 : null;
  }

  if (night === 2) {
    if (Math.hypot(x, z) <= ISLAND2_RADIUS) return 0;
    if (Math.hypot(x - ISLAND2_B_CENTER_X, z) <= ISLAND2_RADIUS) return 0;
    if (x >= BRIDGE_X_MIN && x <= BRIDGE_X_MAX && z >= -BRIDGE_Z_HALF && z <= BRIDGE_Z_HALF) {
      return 0;
    }
    return null;
  }

  // Night 3 — Đảo Chuông
  const r = Math.hypot(x, z);
  if (r > ISLAND3_RADIUS) return null;

  if (r <= TIER2_RADIUS) return TIER2_Y;

  const rampY = getRampHeight(x, z);
  if (rampY !== null) {
    // On overlap with Tier 1 annulus, take max (3.0)
    if (z > 0 && r >= TIER1_R_MIN && r <= TIER1_R_MAX) {
      return Math.max(TIER1_Y, rampY);
    }
    return rampY;
  }

  if (z > 0 && r >= TIER1_R_MIN && r <= TIER1_R_MAX) {
    return TIER1_Y;
  }

  return 0;
}

export function isInsideBellTower(night: NightNumber, x: number, z: number): boolean {
  return night === 3 && Math.hypot(x, z) < BELL_TOWER_RADIUS;
}

function isStepBlocked(night: NightNumber, curY: number, tx: number, tz: number, keepOnLand: boolean): boolean {
  if (isInsideBellTower(night, tx, tz)) return true;
  const h = getSurfaceHeight(night, tx, tz);
  if (h === null) return keepOnLand;
  if (h > curY + MAX_STEP_UP) return true;
  return false;
}

export interface MoveResolveResult {
  x: number;
  z: number;
  blocked: boolean;
}

/**
 * Resolves horizontal movement against obstacles (bell tower, vertical cliffs, and optionally void edge).
 * Allows smooth wall sliding along X/Z axes or tangent to circular bell tower.
 */
export function resolveHorizontalMove(
  night: NightNumber,
  oldX: number,
  oldZ: number,
  curY: number,
  targetX: number,
  targetZ: number,
  keepOnLand: boolean
): MoveResolveResult {
  if (!isStepBlocked(night, curY, targetX, targetZ, keepOnLand)) {
    return { x: targetX, z: targetZ, blocked: false };
  }

  // Push out smoothly if trying to penetrate the circular bell tower
  if (isInsideBellTower(night, targetX, targetZ)) {
    const r = Math.hypot(targetX, targetZ);
    const ux = r > 1e-6 ? targetX / r : 0;
    const uz = r > 1e-6 ? targetZ / r : 1;
    const px = ux * (BELL_TOWER_RADIUS + 0.001);
    const pz = uz * (BELL_TOWER_RADIUS + 0.001);
    if (!isStepBlocked(night, curY, px, pz, keepOnLand)) {
      return { x: px, z: pz, blocked: true };
    }
  }

  // Try sliding along X-only or Z-only
  const canX = !isStepBlocked(night, curY, targetX, oldZ, keepOnLand);
  const canZ = !isStepBlocked(night, curY, oldX, targetZ, keepOnLand);

  if (canX && !canZ) {
    return { x: targetX, z: oldZ, blocked: true };
  }
  if (canZ && !canX) {
    return { x: oldX, z: targetZ, blocked: true };
  }
  if (canX && canZ) {
    // Pick larger axis delta
    if (Math.abs(targetX - oldX) >= Math.abs(targetZ - oldZ)) {
      return { x: targetX, z: oldZ, blocked: true };
    }
    return { x: oldX, z: targetZ, blocked: true };
  }

  return { x: oldX, z: oldZ, blocked: true };
}

/**
 * Finds a valid ground position near (x, z) for dropped motes so they do not float over the void.
 */
export function snapToValidGround(night: NightNumber, x: number, z: number, fallback: Vec3): Vec3 {
  if (!isInsideBellTower(night, x, z)) {
    const h = getSurfaceHeight(night, x, z);
    if (h !== null) return [x, h, z];
  }
  const fh = getSurfaceHeight(night, fallback[0], fallback[2]);
  if (fh !== null && !isInsideBellTower(night, fallback[0], fallback[2])) {
    return [fallback[0], fh, fallback[2]];
  }
  return [0, getSurfaceHeight(night, 0, -18) ?? 0, night === 3 ? -18 : 0];
}
