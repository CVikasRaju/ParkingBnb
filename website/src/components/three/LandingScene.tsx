"use client";

/**
 * The landing page's 3D city.
 *
 * A single persistent canvas sits behind the whole five-act page. The scroll
 * position — scrubbed by GSAP ScrollTrigger in `LandingExperience` — drives:
 *
 *   • the camera, damped along a Catmull-Rom spline,
 *   • the hero SUV, along the avenue and into the driveway,
 *   • every prop of the story (dome, sonar, route, gate, payout tokens).
 *
 * The scroll value arrives through a **ref**, never through React state, so a
 * 60 fps scroll never re-renders the DOM sitting on top of the canvas. The one
 * exception is `gateOpen`, which flips at most twice per scroll pass and so is
 * cheap enough to be a prop.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import PostFx from "@/components/three/PostFx";
import {
  BaySlab,
  Beacon,
  Dome,
  GateBarrier,
  GroundPulse,
  LaneLines,
  PayoutToken,
  RouteTrail,
  Skyline,
  SonarPulse,
  STATE_COLOR,
  Vehicle,
  WetRoad,
} from "@/components/three/primitives";

/** Where the story happens — constants so the camera has something to aim at. */
const BAY = { x: 3.6, z: -2 };
const GATE = { x: 3.6, z: 2.2 };

/** Camera spline: one control point per act. */
const CAMERA_POINTS: [number, number, number][] = [
  [40, 52, 38], // Act 1 — isometric drone shot over the grid
  [10, 9, 24], // Act 2 — swoop down behind the car
  [-12, 4.6, 6.5], // Act 3 — low orbit at wheel height
  [5.4, 2.7, 8.2], // Act 4 — macro on the driveway gate
  [3.4, 30, 22], // Act 5 — rise overhead for the settlement
];

/** What each of those shots is looking at. */
const TARGET_POINTS: [number, number, number][] = [
  [0, 4, 0],
  [2, 1.6, 4],
  [BAY.x, 1.4, 2],
  [GATE.x, 1.5, 0.4],
  [BAY.x, 1.4, BAY.z],
];

/**
 * The car's route: down the avenue (z 34 → −2), turning off it and into the
 * driveway as it passes the gate. Deliberately a pure function of scroll, so
 * scrubbing backwards rewinds the drive exactly.
 */
function carAt(progress: number): {
  position: [number, number, number];
  rotationY: number;
} {
  const z = 34 - progress * 36;

  const turnStart = 6;
  const turnEnd = GATE.z;
  const turn =
    z >= turnStart
      ? 0
      : z <= turnEnd
        ? 1
        : (turnStart - z) / (turnStart - turnEnd);

  return {
    position: [THREE.MathUtils.lerp(0, BAY.x, THREE.MathUtils.clamp(turn, 0, 1)), 0, z],
    rotationY: -turn * Math.PI * 0.42,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export default function LandingScene({
  progress,
  gateOpen,
}: {
  progress: { current: number };
  gateOpen: boolean;
}) {
  const { camera } = useThree();

  const spline = useMemo(
    () => new THREE.CatmullRomCurve3(CAMERA_POINTS.map((p) => new THREE.Vector3(...p))),
    [],
  );
  const targetSpline = useMemo(
    () => new THREE.CatmullRomCurve3(TARGET_POINTS.map((p) => new THREE.Vector3(...p))),
    [],
  );

  const smoothed = useRef(0);
  const lookAt = useMemo(() => new THREE.Vector3(0, 4, 0), []);
  const carGroup = useRef<THREE.Group>(null);
  const domeGroup = useRef<THREE.Group>(null);
  const tokensGroup = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    // Damp the raw scroll so a trackpad flick glides instead of snapping.
    const target = THREE.MathUtils.clamp(progress.current, 0, 1);
    smoothed.current = THREE.MathUtils.damp(smoothed.current, target, 3.4, delta * 60 * 0.016);
    const p = smoothed.current;
    const safeP = Math.min(0.999, Math.max(0.001, p));

    // Camera along the spline, with a mouse parallax that fades out as the
    // story gets close-up and precision matters more than drama.
    const point = spline.getPointAt(safeP);
    const parallax = (1 - p) * 2.6;
    camera.position.set(
      point.x + Math.sin(state.clock.elapsedTime * 0.22) * 0.35 + state.pointer.x * parallax,
      point.y + state.pointer.y * parallax * 0.6,
      point.z,
    );

    lookAt.lerp(targetSpline.getPointAt(safeP), 0.1);
    camera.lookAt(lookAt);

    // Hero SUV.
    if (carGroup.current) {
      const { position, rotationY } = carAt(p);
      carGroup.current.position.set(position[0], position[1], position[2]);
      carGroup.current.rotation.y = THREE.MathUtils.damp(
        carGroup.current.rotation.y,
        rotationY,
        4,
        delta * 60 * 0.016,
      );
    }

    // The hold: the shield exists between the lock and the arrival.
    if (domeGroup.current) {
      const scale = Math.max(
        0.001,
        smoothstep(0.18, 0.3, p) * (1 - smoothstep(0.66, 0.76, p)),
      );
      domeGroup.current.scale.setScalar(scale);
      domeGroup.current.visible = scale > 0.02;
    }

    // Settlement: the 85/15 split only exists once the session is paid out.
    if (tokensGroup.current) {
      const paid = smoothstep(0.86, 0.98, p);
      tokensGroup.current.scale.setScalar(Math.max(0.001, paid));
      tokensGroup.current.visible = paid > 0.02;
      tokensGroup.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <>
      <color attach="background" args={["#060911"]} />
      <fog attach="fog" args={["#060911", 40, 150]} />

      <ambientLight intensity={0.32} color="#8fb3ff" />
      <hemisphereLight intensity={0.28} groundColor="#04070d" color="#1d3b5c" />
      <directionalLight position={[24, 40, 18]} intensity={1.05} color="#cfe4ff" />
      <pointLight
        position={[3.6, 1.2, 4]}
        intensity={26}
        distance={26}
        color={STATE_COLOR.route}
      />

      <Skyline seed={11} count={54} />
      <WetRoad size={150} />
      <LaneLines count={16} spacing={7} />
      <LaneLines count={16} spacing={7} axis="x" color="#0e7490" />

      {/* Available bays along the avenue — emerald, as the legend promises. */}
      <BaySlab position={[-3.6, 0, 10]} color={STATE_COLOR.available} />
      <BaySlab position={[3.6, 0, 8]} color={STATE_COLOR.available} />
      <BaySlab position={[-3.6, 0, -10]} color={STATE_COLOR.available} />
      {/* The story's bay, held amber until the settlement resets it. */}
      <BaySlab position={[BAY.x, 0, BAY.z]} color={STATE_COLOR.locked} highlighted />
      <GroundPulse position={[3.6, 0, 8]} color={STATE_COLOR.available} />

      <Beacon position={[-3.6, 0, 10]} color={STATE_COLOR.available} height={5.2} />
      <Beacon position={[3.6, 0, 8]} color={STATE_COLOR.available} height={4.4} />
      <Beacon position={[BAY.x, 0, BAY.z]} color={STATE_COLOR.locked} height={6.4} />

      <SonarPulse position={[0, 0.06, 2]} size={110} />

      <group ref={domeGroup} position={[BAY.x, 0, BAY.z]}>
        <Dome position={[0, 0, 0]} color={STATE_COLOR.locked} radius={3.6} />
      </group>

      <RouteTrail from={[0, 0, 8]} to={[BAY.x, 0, BAY.z]} />

      <GateBarrier position={[GATE.x, 0, GATE.z]} open={gateOpen} />

      <group ref={carGroup}>
        <Vehicle color="#0f172a" />
      </group>

      <group ref={tokensGroup} position={[BAY.x, 2.4, BAY.z]}>
        <PayoutToken position={[-0.85, 0, 0]} color={STATE_COLOR.available} scale={1.15} />
        <PayoutToken
          position={[0.95, -0.25, 0.3]}
          color={STATE_COLOR.locked}
          scale={0.62}
          spin={-1.4}
        />
      </group>

      <PostFx />
    </>
  );
}
