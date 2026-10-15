"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  cameraPosition?: [number, number, number];
  fov?: number;
  /** Shown while the scene boots, and permanently on weak/reduced setups. */
  fallback?: ReactNode;
  /** Fog colour, so scenes blend into the page background. */
  fog?: [string, number, number] | null;
  maxDpr?: number;
};

/* ── WebGL capability, modelled as an external store ─────────────────────────
   The probe is a one-off capability check, not React state. Caching it in a
   module-level variable and reading it through `useSyncExternalStore` avoids
   the setState-during-effect cascade entirely — and returning `null` for the
   server snapshot keeps hydration identical to the pre-hydration HTML.
   ─────────────────────────────────────────────────────────────────────────── */

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

/** Nothing ever happens to WebGL support after load, so never notify. */
const subscribeToNothing = () => () => {};
/** Server + first hydration render: capability not yet known. */
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
 * Three things make a page with several WebGL scenes safe to ship:
 *  1. WebGL is probed before mounting; unsupported browsers get the CSS fallback.
 *  2. `prefers-reduced-motion` disables the canvas entirely rather than
 *     animating behind the user's back.
 *  3. The canvas is only mounted while its host is near the viewport, so the
 *     GPU is never rendering three scenes at once — and it unmounts again when
 *     scrolled away so long pages don't leak frames.
 */
export default function SceneFrame({
  children,
  className,
  cameraPosition = [7, 6, 7],
  fov = 38,
  fallback,
  fog = null,
  maxDpr = 1.75,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

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
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setActive(entry.isIntersecting);
      },
      { rootMargin: "200px 0px 200px 0px", threshold: 0.01 },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const placeholder = (
    <div className="shimmer absolute inset-0 flex items-center justify-center">
      <span className="text-xs tracking-[0.28em] text-mist-500 uppercase">
        {supported === false ? "3D unavailable" : "Loading scene"}
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
          }}
          style={{ background: "transparent" }}
        >
          {fog ? <fog attach="fog" args={fog} /> : null}
          {children}
        </Canvas>
      ) : (
        fallback ?? placeholder
      )}
    </div>
  );
}
