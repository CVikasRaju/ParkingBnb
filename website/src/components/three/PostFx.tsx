"use client";

/**
 * The post-processing pipeline from the choreography spec.
 *
 * Bloom is selective by construction: only materials authored with
 * `toneMapped={false}` push past 1.0 luminance, so the neon bay beacons, lane
 * markings and route trails glow while asphalt, glass and text stay matte.
 *
 * It mounts only when the display can afford a second full-screen pass — a wide
 * viewport, enough cores and device memory, and no `prefers-reduced-motion`.
 * Anywhere weaker, the scene renders without it: slightly flatter, and free.
 *
 * The capability probe is an external store, exactly like `SceneFrame`'s WebGL
 * check, so the server and the first client render agree and nothing is written
 * to state during an effect.
 */

import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useSyncExternalStore } from "react";

let affordable: boolean | null = null;

function probe(): boolean | null {
  if (affordable !== null) return affordable;
  if (typeof window === "undefined") return null;

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      affordable = false;
      return affordable;
    }
    if (window.innerWidth < 1024) {
      affordable = false;
      return affordable;
    }

    const cores = navigator.hardwareConcurrency ?? 0;
    if (cores && cores < 4) {
      affordable = false;
      return affordable;
    }

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    affordable = !(typeof memory === "number" && memory < 4);
  } catch {
    affordable = false;
  }

  return affordable;
}

/** The verdict never changes after load, so there is nothing to notify. */
const subscribeToNothing = () => () => {};
const unknownOnServer = () => null;

export default function PostFx() {
  const enabled = useSyncExternalStore(subscribeToNothing, probe, unknownOnServer);
  if (enabled !== true) return null;

  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={1.1} mipmapBlur intensity={0.85} />
      <Vignette eskil={false} offset={0.12} darkness={0.82} />
    </EffectComposer>
  );
}
