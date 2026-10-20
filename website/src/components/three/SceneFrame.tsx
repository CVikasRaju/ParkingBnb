"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  cameraPosition?: [number, number, number];
  fov?: number;
  /** Shown while the scene boots, and permanently on unsupported setups. */
  fallback?: ReactNode;
  /** Fog as `[colour, near, far]`, so scenes melt into the page background. */
  fog?: [string, number, number] | null;
  maxDpr?: number;
  /** Mount the canvas even when off-screen (used by the full-screen map). */
  alwaysOn?: boolean;
  gl?: CanvasProps["gl"];
  onCreated?: CanvasProps["onCreated"];
};

/* ── Capability probes, modelled as external stores ─────────────────────────
   WebGL support is a one-off capability, not React state. Caching it in a
   module variable and reading it through `useSyncExternalStore` removes the
   setState-during-effect cascade — and returning `null` for the server snapshot
   keeps the first client render identical to the pre-hydration HTML.
   ────────────────────────────────────────────────────────────────────────── */

let webglSupport: boolean | null = null;

function getWebglSupport(): boolean | null {
  if (webglSupport !== null) return webglSupport;
  try {
    if (typeof document === "undefined") return null;
    const probe = document.createElement("canvas");
    webglSupport = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** WebGL support never changes after load, so there is nothing to notify. */
const subscribeToNothing = () => () => {};
const unknownOnServer = () => null;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeToReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const noReducedMotion = () => false;

/**
 * A hardened wrapper around the R3F `<Canvas>`.
 *
 * Three things make a site with several WebGL scenes safe to ship:
 *  1. WebGL is probed before mounting, so an unsupported browser gets the CSS
 *     fallback instead of a black rectangle.
 *  2. `prefers-reduced-motion` disables the canvas rather than animating behind
 *     the visitor's back.
 *  3. The canvas only mounts while its host is near the viewport (unless
 *     `alwaysOn`), so the GPU never renders several scenes at once.
 */
export default function SceneFrame({
  children,
  className,
  cameraPosition = [6, 5, 8],
  fov = 40,
  fallback,
  fog = null,
  maxDpr = 1.75,
  alwaysOn = false,
  gl,
  onCreated,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(alwaysOn);

  const supported = useSyncExternalStore<boolean | null>(
    subscribeToNothing,
    getWebglSupport,
    unknownOnServer,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    noReducedMotion,
  );

  useEffect(() => {
    if (alwaysOn) return;
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setActive(entry.isIntersecting);
      },
      { rootMargin: "240px 0px 240px 0px", threshold: 0.01 },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [alwaysOn]);

  const placeholder = fallback ?? (
    <div className="shimmer absolute inset-0 grid place-items-center">
      <span className="mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">
        {supported === false ? "3D unavailable" : "Booting renderer"}
      </span>
    </div>
  );

  const renderCanvas = supported === true && !reducedMotion;

  return (
    <div ref={hostRef} className={className}>
      {renderCanvas && active ? (
        <Canvas
          camera={{ position: cameraPosition, fov }}
          dpr={[1, maxDpr]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            ...(typeof gl === "object" ? gl : {}),
          }}
          onCreated={onCreated}
        >
          {fog ? <fog attach="fog" args={fog} /> : null}
          {children}
        </Canvas>
      ) : (
        placeholder
      )}
    </div>
  );
}
