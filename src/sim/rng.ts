import type { Vec3 } from './types.js';

export interface SeededRng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
}

/** Deterministic mulberry32 PRNG */
export function createRng(seed: number): SeededRng {
  let a = seed >>> 0;
  function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
    int(min: number, maxExclusive: number): number {
      if (maxExclusive <= min) return min;
      return min + Math.floor(next() * (maxExclusive - min));
    }
  };
}

export function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
}

export function roundVec3(v: Vec3): Vec3 {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}
