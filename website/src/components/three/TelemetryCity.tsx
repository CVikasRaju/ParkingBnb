"use client";

/**
 * Two more 3D surfaces, both fed by real rows rather than by animation state:
 *
 *  • `TelemetryCity` — the operator god-view. Every listed bay is a column
 *    whose colour is its status and whose height is how long it has been held,
 *    so a stuck lock is visually obvious from across the room.
 *  • `SlotPreview` — the host's configurator. The bay class changes the
 *    geometry (open driveway / enclosed basement / gated lot), and the rate
 *    slider drives how brightly the ground glows.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  BaySlab,
  Beacon,
  Dome,
  GateBarrier,
  LaneLines,
  Skyline,
  STATE_COLOR,
  WetRoad,
} from "@/components/three/primitives";
import type { Spot, SpotKind } from "@/lib/types";

/* ── Operator god-view ─────────────────────────────────────────────────────── */

export interface TelemetryLock {
  spotId: string;
  status: string;
  ageMinutes: number;
}

function Column({
  spot,
  lock,
  index,
}: {
  spot: Spot;
  lock: TelemetryLock | null;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const held = lock?.status === "pending_lock";

  // Spread the catalogue around the origin on a ring, so the god-view reads as
  // a city district rather than a pile of columns.
  const [x, z] = useMemo(() => {
    const angle = (index / 8) * Math.PI * 2;
    const radius = 11;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }, [index]);

  const height = held ? 6 + Math.min(18, lock.ageMinutes * 0.4) : 3.2;

  useFrame((state) => {
    if (!meshRef.current) return;
    const pulse = held ? 0.82 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.18 : 1;
    meshRef.current.scale.y = THREE.MathUtils.damp(
      meshRef.current.scale.y,
      pulse,
      4,
      0.016,
    );
  });

  const color =
    lock?.status === "checked_in"
      ? STATE_COLOR.route
      : held
        ? STATE_COLOR.locked
        : spot.status === "available"
          ? STATE_COLOR.available
          : "#475569";

  return (
    <group position={[x, 0, z]}>
      <mesh ref={meshRef} position={[0, height / 2, 0]}>
        <boxGeometry args={[1.5, height, 1.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={held ? 0.7 : 0.28}
          transparent
          opacity={0.72}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
      <Beacon position={[0, 0, 0]} color={color} height={height + 5} radius={0.5} intensity={0.6} />
    </group>
  );
}

export function TelemetryCity({
  spots,
  locks,
}: {
  spots: Spot[];
  locks: TelemetryLock[];
}) {
  const lockBySpot = useMemo(
    () => new Map(locks.map((lock) => [lock.spotId, lock])),
    [locks],
  );

  return (
    <>
      <ambientLight intensity={0.42} color="#93b4ff" />
      <directionalLight position={[18, 30, 14]} intensity={0.9} color="#dbeafe" />
      <pointLight position={[0, 10, 0]} intensity={40} distance={40} color={STATE_COLOR.route} />

      <Skyline seed={41} count={26} accent="#123a52" />
      <WetRoad size={120} reflect={false} y={-0.05} />
      <LaneLines count={14} spacing={7} color="#0b4a5c" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[9.4, 13.4, 64]} />
        <meshBasicMaterial color="#0e2233" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>

      {spots.slice(0, 8).map((spot, index) => (
        <Column
          key={spot.id}
          spot={spot}
          lock={lockBySpot.get(spot.id) ?? null}
          index={index}
        />
      ))}
    </>
  );
}

/* ── Host slot preview ─────────────────────────────────────────────────────── */

const BAY_KINDS: Array<{ key: SpotKind; label: string; blurb: string }> = [
  { key: "driveway", label: "Open driveway", blurb: "Cheapest, easiest, no clearance limit." },
  { key: "basement", label: "Basement bay", blurb: "Covered, low clearance — set a height limit." },
  { key: "garage", label: "Private garage", blurb: "Enclosed and lockable, premium rate." },
  { key: "lot", label: "IoT gated lot", blurb: "Barrier-controlled, ANPR plate access." },
];

export { BAY_KINDS };

export function SlotPreview({
  kind,
  hourlyRate,
  gated,
}: {
  kind: SpotKind;
  hourlyRate: number;
  gated: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const demand = THREE.MathUtils.clamp(hourlyRate / 120, 0.1, 1);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.24) * 0.4;
    }
  });

  const color = gated ? STATE_COLOR.route : STATE_COLOR.available;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} />
      <pointLight position={[0, 3, 0]} intensity={10 + demand * 30} color={color} />

      <group ref={groupRef}>
        <BaySlab position={[0, 0, 0]} size={3.2} color={color} highlighted={demand > 0.5} />

        {kind === "driveway" && (
          <>
            {/* A kerb and a dropped-crossover ramp up to the road. */}
            <mesh position={[0, 0.07, 3.5]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[4.4, 3]} />
              <meshStandardMaterial color="#0f1a2b" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.14, 2.1]}>
              <boxGeometry args={[4.4, 0.16, 0.5]} />
              <meshStandardMaterial color="#16233a" roughness={0.8} />
            </mesh>
          </>
        )}

        {kind === "basement" && (
          <>
            {/* Ceiling slab, so the clearance story is visible. */}
            <mesh position={[0, 2.2, 0]}>
              <boxGeometry args={[5.6, 0.24, 7]} />
              <meshStandardMaterial color="#131c2e" roughness={0.7} metalness={0.3} />
            </mesh>
            {[-2.7, 2.7].map((x) => (
              <mesh key={x} position={[x, 1.1, 0]}>
                <boxGeometry args={[0.24, 2.2, 7]} />
                <meshStandardMaterial color="#0d1626" roughness={0.85} />
              </mesh>
            ))}
          </>
        )}

        {kind === "garage" && (
          <>
            <mesh position={[0, 1.5, -3.4]}>
              <boxGeometry args={[5.6, 3, 0.3]} />
              <meshStandardMaterial color="#101a2c" roughness={0.7} />
            </mesh>
            {[-2.7, 2.7].map((x) => (
              <mesh key={x} position={[x, 1.5, 0]}>
                <boxGeometry args={[0.3, 3, 6.8]} />
                <meshStandardMaterial color="#0d1626" roughness={0.85} />
              </mesh>
            ))}
            <mesh position={[0, 3.05, 0]}>
              <boxGeometry args={[5.8, 0.25, 7]} />
              <meshStandardMaterial color="#132038" roughness={0.6} />
            </mesh>
          </>
        )}

        {kind === "lot" && (
          <>
            {[-1.8, 1.8].map((x) => (
              <BaySlab key={x} position={[x, 0, -3.4]} size={2} color={color} />
            ))}
            <Dome position={[0, 0, 0]} color={color} radius={4.2} opacity={0.14} />
          </>
        )}

        {gated && <GateBarrier position={[0, 0, 4.4]} open={false} color={STATE_COLOR.route} />}
      </group>
    </>
  );
}
