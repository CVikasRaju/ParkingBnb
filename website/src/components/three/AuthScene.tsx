"use client";

/**
 * The auth portal's 3D backdrop.
 *
 * Three roles, three camera poses: a driver-side low angle, an isometric view
 * of the host's driveway, and an operator's high god-view over the grid. The
 * camera damps between poses rather than cutting, so switching role *reads* as
 * the same city seen from a different place.
 *
 * The licence plate is a real 3D-anchored element: `drei`'s `<Html>` projects a
 * DOM label onto the car's plate mesh, which is how the text can update on every
 * keystroke without shipping a font atlas or rebuilding geometry.
 */

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  BaySlab,
  Beacon,
  Dome,
  GroundPulse,
  LaneLines,
  Skyline,
  STATE_COLOR,
  Vehicle,
  WetRoad,
} from "@/components/three/primitives";
import type { Role } from "@/lib/types";

/** Camera pose + accent colour per role. */
const POSES: Record<Role, { position: [number, number, number]; target: [number, number, number]; accent: string }> = {
  driver: { position: [7.5, 2.4, 9], target: [0, 1.2, 0], accent: STATE_COLOR.available },
  provider: { position: [-9, 6.5, 9], target: [0, 1, 0], accent: STATE_COLOR.route },
  admin: { position: [0, 22, 16], target: [0, 0, 0], accent: STATE_COLOR.overstay },
};

/** Static geometry — memoised so the plate label can re-render on its own. */
const Backdrop = memo(function Backdrop() {
  return (
    <>
      <Skyline seed={23} count={38} accent="#1e5f8a" />
      <WetRoad size={110} reflect={false} />
      <LaneLines count={14} spacing={7} color="#0e7490" />

      <BaySlab position={[3.4, 0, 1.5]} color={STATE_COLOR.available} />
      <Beacon position={[3.4, 0, 1.5]} color={STATE_COLOR.available} height={4.6} />
      <GroundPulse position={[3.4, 0, 1.5]} />

      {/* The host's perspective: a shielded bay waiting for its driver. */}
      <group position={[-3.4, 0, -1]}>
        <BaySlab position={[0, 0, 0]} color={STATE_COLOR.locked} highlighted />
        <Dome position={[0, 0, 0]} color={STATE_COLOR.locked} radius={3.2} opacity={0.2} />
      </group>
    </>
  );
});

/** The live plate, anchored to the car. Kept tiny so typing stays cheap. */
function PlateLabel({ plate, color }: { plate: string; color: string }) {
  return (
    <Html position={[0, 0.55, 2.4]} center distanceFactor={9} zIndexRange={[20, 0]}>
      <div
        className="mono rounded-md border px-3 py-1.5 text-center text-[13px] font-bold tracking-[0.18em] whitespace-nowrap"
        style={{
          background: "#0b1220",
          borderColor: color,
          color,
          boxShadow: `0 0 22px -6px ${color}`,
        }}
      >
        {plate.trim() ? plate.toUpperCase() : "KA-19-••-••••"}
      </div>
    </Html>
  );
}

export default function AuthScene({
  role,
  plate,
}: {
  role: Role;
  plate: string;
}) {
  const { camera } = useThree();
  const lookAt = useRef(new THREE.Vector3(...POSES.driver.target));
  const pose = POSES[role];

  const accent = useMemo(() => pose.accent, [pose.accent]);

  useFrame((state, delta) => {
    const speed = 2.2 * delta * 60 * 0.016;
    const { x, y, z } = camera.position;

    // `position.set` rather than per-axis assignment: the camera comes from a
    // hook, and React's immutability rules only permit calling its methods.
    camera.position.set(
      THREE.MathUtils.damp(x, pose.position[0], speed, delta) + state.pointer.x * 0.6,
      THREE.MathUtils.damp(y, pose.position[1], speed, delta),
      THREE.MathUtils.damp(z, pose.position[2], speed, delta),
    );

    lookAt.current.lerp(new THREE.Vector3(...pose.target), 0.05);
    camera.lookAt(lookAt.current);
  });

  return (
    <>
      <color attach="background" args={["#060911"]} />
      <fog attach="fog" args={["#060911", 26, 90]} />

      <ambientLight intensity={0.4} color="#8fb3ff" />
      <directionalLight position={[12, 22, 10]} intensity={1.1} color="#d7e7ff" />
      <pointLight position={[0, 3, 2]} intensity={22} distance={18} color={accent} />

      <Backdrop />

      <group position={[0, 0, 0]} rotation={[0, Math.PI * 0.06, 0]}>
        <Vehicle color="#0f172a" />
        <PlateLabel plate={plate} color={accent} />
      </group>
    </>
  );
}
