/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * The 3D scenes need jitter — building heights, star positions, pulse phases —
 * but `Math.random()` must never be called during render: it is impure, so the
 * server and client would disagree and hydration would mismatch. A seeded
 * generator gives identical results every time for the same seed.
 */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 0..1 value derived from a string, for per-item variety. */
export function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}
