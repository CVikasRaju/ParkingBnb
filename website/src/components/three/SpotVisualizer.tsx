"use client";

/**
 * The drawer's mini canvas: the bay's clearances against the selected vehicle.
 *
 * The point is a *fit verdict*, not a photograph. Bay dimensions come from the
 * bay class (the schema stores no survey — see `DIMENSIONS` in
 * `src/lib/data/rows.ts`) and vehicle envelopes are real class figures, so the
 * comparison is honest and the UI says so underneath.
 */

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import SceneFrame from "@/components/three/SceneFrame";
import { STATE_COLOR } from "@/components/three/primitives";
import type { Spot, Vehicle } from "@/lib/types";

export interface FitVerdict {
  fits: boolean;
  lengthSlack: number;
  widthSlack: number;
  heightSlack: number;
}

export function computeFit(spot: Spot, vehicle: Vehicle): FitVerdict {
  const lengthSlack = spot.dimensions.lengthM - vehicle.lengthM;
  const widthSlack = spot.dimensions.widthM - vehicle.widthM;
  const heightSlack = spot.dimensions.heightM - vehicle.heightM;
  return {
    fits: lengthSlack >= 0 && widthSlack >= 0 && heightSlack >= 0,
    lengthSlack,
    widthSlack,
    heightSlack,
  };
}

function Scene({ spot, vehicle, fits }: { spot: Spot; vehicle: Vehicle; fits: boolean }) {
  const carRef = useRef<THREE.Group>(null);
  const bay = spot.dimensions;
  const tone = fits ? STATE_COLOR.available : STATE_COLOR.overstay;

  useFrame((state) => {
    if (carRef.current) {
      carRef.current.position.y =
        0.06 + Math.sin(state.clock.elapsedTime * 1.1) * 0.03;
    }
  });

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 6, 5]} intensity={2} />
      <directionalLight position={[-5, 3, -4]} intensity={0.6} color={STATE_COLOR.route} />

      {/* Bay outline: the surface plus a wireframe of its envelope. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[bay.widthM + 1.6, bay.lengthM + 1.6]} />
        <meshStandardMaterial color="#0b1524" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[0, bay.heightM / 2, 0]}>
        <boxGeometry args={[bay.widthM + 1.6, bay.heightM, bay.lengthM + 1.6]} />
        <meshBasicMaterial color={tone} wireframe transparent opacity={0.22} />
      </mesh>
      {/* Kerb markings */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[(side * (bay.widthM + 1.2)) / 2, 0.01, 0]}
        >
          <planeGeometry args={[0.16, bay.lengthM + 1.6]} />
          <meshBasicMaterial color={tone} toneMapped={false} transparent opacity={0.7} />
        </mesh>
      ))}

      {/* The vehicle, as a translucent shell so the fit is readable. */}
      <group ref={carRef} position={[0, 0.06, 0]}>
        <RoundedBox
          args={[vehicle.widthM, vehicle.heightM * 0.62, vehicle.lengthM]}
          radius={0.22}
          smoothness={3}
          position={[0, vehicle.heightM * 0.31, 0]}
        >
          <meshStandardMaterial
            color={tone}
            transparent
            opacity={0.42}
            roughness={0.2}
            metalness={0.7}
            emissive={tone}
            emissiveIntensity={0.28}
          />
        </RoundedBox>
        <RoundedBox
          args={[vehicle.widthM * 0.82, vehicle.heightM * 0.4, vehicle.lengthM * 0.52]}
          radius={0.18}
          smoothness={3}
          position={[0, vehicle.heightM * 0.78, -vehicle.lengthM * 0.06]}
        >
          <meshStandardMaterial color="#0a0f1c" roughness={0.25} metalness={0.8} />
        </RoundedBox>
      </group>

      {/* Dimension read-out rails. */}
      <mesh position={[0, 0.02, bay.lengthM / 2 + 0.85]}>
        <boxGeometry args={[bay.widthM + 1.6, 0.03, 0.03]} />
        <meshBasicMaterial color="#64748b" />
      </mesh>
    </>
  );
}

export default function SpotVisualizer({
  spot,
  vehicle,
}: {
  spot: Spot;
  vehicle: Vehicle;
}) {
  const fit = computeFit(spot, vehicle);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-obsidian/60">
      <SceneFrame
        className="h-44 w-full"
        cameraPosition={[4.4, 3.6, 5.2]}
        fov={34}
        maxDpr={1.5}
        fallback={<div className="shimmer h-44 w-full" />}
      >
        <Scene spot={spot} vehicle={vehicle} fits={fit.fits} />
      </SceneFrame>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
        <span
          className={`chip ${
            fit.fits
              ? "border-emerald-500/40 text-emerald-300"
              : "border-red-500/50 text-red-300"
          }`}
        >
          {fit.fits ? "Fits your vehicle" : "Too tight"}
        </span>
        <span className="mono rounded-lg bg-obsidian/80 px-2 py-1 text-[10px] text-slate-400">
          {spot.dimensions.lengthM.toFixed(1)} × {spot.dimensions.widthM.toFixed(1)} ×{" "}
          {spot.dimensions.heightM.toFixed(1)} m
        </span>
      </div>
    </div>
  );
}
