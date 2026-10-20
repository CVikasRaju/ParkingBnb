"use client";

/**
 * Procedural 3D vocabulary for ParkPeer.
 *
 * Everything here is built from primitives in code — no `.glb`, no texture
 * downloads — so the scenes render out of the box and stay sharp at any DPR.
 * The custom shaders are what make state readable at a glance: an available bay
 * hums emerald, a held bay turns amber, and a settled session splits into two
 * glowing payout tokens.
 */

import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { mulberry32 } from "@/lib/random";
import type { SpotStatus } from "@/lib/types";

/* ── Palette, shared with the CSS tokens in globals.css ───────────────────── */
export const STATE_COLOR = {
  available: "#10B981",
  locked: "#F59E0B",
  route: "#06B6D4",
  overstay: "#EF4444",
} as const;

export const statusColor = (status: SpotStatus): string =>
  status === "available"
    ? STATE_COLOR.available
    : status === "locked"
      ? STATE_COLOR.locked
      : status === "maintenance"
        ? STATE_COLOR.overstay
        : "#64748b";

/* ── Pointer, damped, without re-rendering React ─────────────────────────── */

/**
 * Normalised pointer in `[-1, 1]` on both axes, damped towards the live value
 * inside the render loop.
 *
 * Returns a ref, not state: parallax has to update every frame, and setting
 * React state at 60 fps would re-render the whole page behind the canvas.
 */
export function usePointerRef(damping = 0.06) {
  const target = useRef(new THREE.Vector2(0, 0));
  const smooth = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      target.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(() => {
    smooth.current.lerp(target.current, damping);
  });

  return smooth;
}

/* ── Skyline ───────────────────────────────────────────────────────────────── */

export interface BuildingSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  windows: number;
}

/**
 * Deterministic city block.
 *
 * Buildings are laid out on a grid with the streets left clear, so the camera
 * path can run down an avenue. `mulberry32` keeps the layout identical between
 * the server and the client — `Math.random()` in render would hydrate
 * differently on every load.
 */
export function buildBlock(seed: number, count = 46, spacing = 7, streetEvery = 4) {
  const random = mulberry32(seed);
  const buildings: BuildingSpec[] = [];

  const half = Math.ceil(Math.sqrt(count) / 2);
  for (let gx = -half; gx <= half && buildings.length < count; gx += 1) {
    for (let gz = -half; gz <= half && buildings.length < count; gz += 1) {
      // Leave the avenue and cross-streets empty.
      if (gx % streetEvery === 0 || gz % streetEvery === 0) continue;
      if (gx === 0 && gz === 0) continue;

      const jitter = () => (random() - 0.5) * 1.1;
      buildings.push({
        x: gx * spacing + jitter(),
        z: gz * spacing + jitter(),
        width: 2.4 + random() * 2.2,
        depth: 2.4 + random() * 2.2,
        height: 2.6 + random() * 13,
        windows: 3 + Math.floor(random() * 7),
      });
    }
  }

  return buildings;
}

/**
 * One instanced draw call for the whole skyline.
 *
 * Emissive window bands are baked into the material rather than modelled, which
 * is what keeps ~50 towers at a comfortable frame rate on integrated graphics.
 */
export function Skyline({
  seed = 7,
  count = 46,
  color = "#0b1220",
  accent = STATE_COLOR.route,
}: {
  seed?: number;
  count?: number;
  color?: string;
  accent?: string;
}) {
  const buildings = useMemo(() => buildBlock(seed, count), [seed, count]);
  const towerRef = useRef<THREE.InstancedMesh>(null);
  const beaconRef = useRef<THREE.InstancedMesh>(null);

  // One effect drives both instanced meshes: the tower block and its roof-light.
  useEffect(() => {
    const towers = towerRef.current;
    const beacons = beaconRef.current;
    if (!towers || !beacons) return;

    const matrix = new THREE.Matrix4();
    buildings.forEach((building, index) => {
      matrix.makeScale(building.width, building.height, building.depth);
      matrix.setPosition(building.x, building.height / 2, building.z);
      towers.setMatrixAt(index, matrix);

      matrix.makeTranslation(building.x, building.height + 0.18, building.z);
      beacons.setMatrixAt(index, matrix);
    });

    towers.instanceMatrix.needsUpdate = true;
    beacons.instanceMatrix.needsUpdate = true;
  }, [buildings]);

  return (
    <group>
      <instancedMesh ref={towerRef} args={[undefined, undefined, buildings.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={color}
          roughness={0.62}
          metalness={0.35}
          emissive={accent}
          emissiveIntensity={0.045}
        />
      </instancedMesh>

      {/* Rooftop beacons: one additive instanced pass, no per-building mesh. */}
      <instancedMesh ref={beaconRef} args={[undefined, undefined, buildings.length]}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ── Streets ───────────────────────────────────────────────────────────────── */

/**
 * Wet asphalt.
 *
 * Uses drei's reflector on the avenue so the neon availability pins smear
 * across the road — the cyberpunk read the spec asks for. Kept to a single
 * plane because a reflector is a second render pass.
 */
export function WetRoad({
  size = 120,
  reflect = true,
  y = -0.02,
}: {
  size?: number;
  reflect?: boolean;
  y?: number;
}) {
  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      {reflect ? (
        <MeshReflectorMaterial
          resolution={512}
          mixBlur={9}
          mixStrength={26}
          blur={[320, 90]}
          mirror={0.42}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.35}
          color="#080d18"
          metalness={0.62}
          roughness={0.82}
        />
      ) : (
        <meshStandardMaterial color="#080d18" roughness={0.85} metalness={0.5} />
      )}
    </group>
  );
}

/** Glowing lane markings. Emissive so the bloom pass picks them up. */
export function LaneLines({
  count = 12,
  spacing = 7,
  color = STATE_COLOR.route,
  axis = "z",
}: {
  count?: number;
  spacing?: number;
  color?: string;
  axis?: "x" | "z";
}) {
  const dashes = useMemo(() => {
    const out: Array<[number, number]> = [];
    const span = Math.floor(count / 2);
    for (let i = -span; i <= span; i += 1) out.push([i * spacing, span * spacing]);
    return out;
  }, [count, spacing]);

  return (
    <group>
      {dashes.map(([a, span]) =>
        axis === "z" ? (
          <mesh key={`z${a}`} position={[a, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.14, span * 2]} />
            <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.5} />
          </mesh>
        ) : (
          <mesh key={`x${a}`} position={[0, 0.01, a]} rotation={[-Math.PI / 2, Math.PI / 2, 0]}>
            <planeGeometry args={[0.14, span * 2]} />
            <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.5} />
          </mesh>
        ),
      )}
    </group>
  );
}

/* ── Vehicle ───────────────────────────────────────────────────────────────── */

/**
 * A low-poly car assembled from boxes.
 *
 * The silhouette matters more than the detail: a wedge cab, a body, four
 * wheels and two headlight quads that double as the light source in the hero.
 */
export function Vehicle({
  position = [0, 0, 0],
  rotationY = 0,
  color = "#111827",
  scale = 1,
  headlights = true,
}: {
  position?: [number, number, number];
  rotationY?: number;
  color?: string;
  scale?: number;
  headlights?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Body */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[2.05, 0.62, 4.6]} />
        <meshStandardMaterial color={color} roughness={0.28} metalness={0.75} />
      </mesh>
      {/* Cab */}
      <mesh position={[0, 1.12, -0.25]}>
        <boxGeometry args={[1.82, 0.62, 2.35]} />
        <meshStandardMaterial color="#0a0f1c" roughness={0.15} metalness={0.85} />
      </mesh>
      {/* Roof glass strip */}
      <mesh position={[0, 1.44, -0.25]}>
        <boxGeometry args={[1.5, 0.04, 1.9]} />
        <meshStandardMaterial
          color={STATE_COLOR.route}
          emissive={STATE_COLOR.route}
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </mesh>
      {/* Wheels */}
      {(
        [
          [0.98, 1.5],
          [-0.98, 1.5],
          [0.98, -1.5],
          [-0.98, -1.5],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.34, 0.34, 0.26, 16]} />
          <meshStandardMaterial color="#05070d" roughness={0.9} />
        </mesh>
      ))}
      {/* Headlights */}
      {headlights &&
        (
          [
            [0.62, 2.3],
            [-0.62, 2.3],
          ] as const
        ).map(([x, z]) => (
          <mesh key={`hl${x}`} position={[x, 0.62, z]}>
            <boxGeometry args={[0.42, 0.16, 0.06]} />
            <meshBasicMaterial color="#e6fbff" toneMapped={false} />
          </mesh>
        ))}
      {/* Tail lights */}
      {(
        [
          [0.72, -2.3],
          [-0.72, -2.3],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`tl${x}`} position={[x, 0.66, z]}>
          <boxGeometry args={[0.4, 0.12, 0.06]} />
          <meshBasicMaterial color={STATE_COLOR.overstay} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Bay markers ───────────────────────────────────────────────────────────── */

const beaconVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Vertical beacon.
 *
 * Fades out towards the top and pulses travelling bands, so a bay stays legible
 * from a 60-metre drone shot without a label. Additive blending means the bloom
 * pass lights it up without a second geometry.
 */
const beaconFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    float fade = pow(1.0 - clamp(vUv.y, 0.0, 1.0), 1.7);
    float bands = 0.72 + 0.28 * sin(vUv.y * 26.0 - uTime * 3.2);
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float alpha = fade * bands * uIntensity * (0.45 + 0.55 * edge);
    gl_FragColor = vec4(uColor * (1.35 + 0.65 * bands), alpha);
  }
`;

export function Beacon({
  position,
  color = STATE_COLOR.available,
  height = 6,
  radius = 0.9,
  intensity = 0.85,
}: {
  position: [number, number, number];
  color?: string;
  height?: number;
  radius?: number;
  intensity?: number;
}) {
  // A fresh uniforms object per colour/intensity change keeps the values
  // immutable from React's point of view; only `uTime` is animated, and it is
  // written through the material ref inside the render loop.
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    }),
    [color, intensity],
  );
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    const material = materialRef.current;
    if (material) material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]}>
      <cylinderGeometry args={[radius, radius * 0.72, height, 20, 1, true]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={beaconVertex}
        fragmentShader={beaconFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/** Ground ring that pulses outwards under a bay. */
export function GroundPulse({
  position,
  color = STATE_COLOR.available,
  radius = 2.4,
  speed = 1.6,
}: {
  position: [number, number, number];
  color?: string;
  radius?: number;
  speed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh) return;
    const phase = (state.clock.elapsedTime * speed) % 1;
    material.opacity = 0.55 * (1 - phase);
    mesh.scale.setScalar(1 + phase * radius);
  });

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1] + 0.03, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.92, 1, 48]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ── Holographic dome shield ───────────────────────────────────────────────── */

/**
 * Translucent security dome over a held bay.
 *
 * A fresnel term keeps the silhouette bright and the centre see-through, which
 * reads as a shield rather than a solid ball.
 */
export function Dome({
  position,
  color = STATE_COLOR.locked,
  radius = 3.4,
  opacity = 0.32,
}: {
  position: [number, number, number];
  color?: string;
  radius?: number;
  opacity?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.18;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <sphereGeometry args={[radius, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={opacity}
          roughness={0.08}
          metalness={0.1}
          transmission={0.55}
          thickness={0.6}
          side={THREE.DoubleSide}
          emissive={color}
          emissiveIntensity={0.22}
        />
      </mesh>
      {/* Latitude ring, for the "scanned" look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, radius * 0.42, 0]}>
        <torusGeometry args={[radius * 0.86, 0.022, 8, 48]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, radius * 0.78, 0]}>
        <torusGeometry args={[radius * 0.5, 0.016, 8, 40]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/* ── IoT gate ──────────────────────────────────────────────────────────────── */

/**
 * The barrier at an IoT-gated lot.
 *
 * Two posts and an arm that lifts through 90°. The arm angle is animated from
 * the same `open` prop the HUD uses, so the checklist and the 3D gate can never
 * disagree.
 */
export function GateBarrier({
  position = [0, 0, 0],
  rotationY = 0,
  open = false,
  color = STATE_COLOR.route,
}: {
  position?: [number, number, number];
  rotationY?: number;
  open?: boolean;
  color?: string;
}) {
  const armRef = useRef<THREE.Group>(null);
  const target = useRef(0);

  useEffect(() => {
    target.current = open ? Math.PI / 2 : 0;
  }, [open]);

  useFrame(() => {
    const arm = armRef.current;
    if (!arm) return;
    arm.rotation.z = THREE.MathUtils.lerp(arm.rotation.z, target.current, 0.06);
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-2.4, 1, 0]}>
        <boxGeometry args={[0.36, 2, 0.36]} />
        <meshStandardMaterial color="#131c2e" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[2.4, 0.6, 0]}>
        <boxGeometry args={[0.5, 1.2, 0.5]} />
        <meshStandardMaterial color="#131c2e" roughness={0.4} metalness={0.6} />
      </mesh>
      <group ref={armRef} position={[-2.2, 1.85, 0]}>
        <mesh position={[2.4, 0, 0]}>
          <boxGeometry args={[4.7, 0.14, 0.22]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.55}
            toneMapped={false}
            roughness={0.3}
          />
        </mesh>
      </group>
      <mesh position={[-2.4, 2.1, 0]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial color={open ? STATE_COLOR.available : STATE_COLOR.overstay} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── Settlement tokens ─────────────────────────────────────────────────────── */

/** A glowing payout token — the 85/15 split made visible. */
export function PayoutToken({
  position,
  color = STATE_COLOR.available,
  scale = 1,
  spin = 1,
}: {
  position: [number, number, number];
  color?: string;
  scale?: number;
  spin?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y = state.clock.elapsedTime * spin;
    mesh.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.4) * 0.12;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <cylinderGeometry args={[0.6, 0.6, 0.14, 24]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.85}
        metalness={0.9}
        roughness={0.18}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ── Sonar sweep ───────────────────────────────────────────────────────────── */

const sonarFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = 1.0 - smoothstep(0.0, 0.085, abs(r - uProgress));
    float edge = 1.0 - smoothstep(0.86, 1.0, r);
    float trail = 0.25 * (1.0 - smoothstep(0.0, 0.5, abs(r - max(uProgress - 0.12, 0.0))));
    gl_FragColor = vec4(uColor, (ring + trail) * edge * 0.9);
  }
`;

/**
 * The search sonar from the choreography spec: a cyan ring expanding across the
 * city grid, followed by the availability pins it "reveals".
 */
export function SonarPulse({
  position = [0, 0.05, 0],
  size = 90,
  color = STATE_COLOR.route,
  speed = 0.34,
}: {
  position?: [number, number, number];
  size?: number;
  color?: string;
  speed?: number;
}) {
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 } }),
    [color],
  );
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    const material = materialRef.current;
    if (material) material.uniforms.uProgress.value = (state.clock.elapsedTime * speed) % 1.4;
  });

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={beaconVertex}
        fragmentShader={sonarFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ── Route chevrons ────────────────────────────────────────────────────────── */

/** The glowing cyan trajectory the car follows into a bay. */
export function RouteTrail({
  from,
  to,
  color = STATE_COLOR.route,
  lift = 0.16,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  lift?: number;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(from[0], from[1] + lift, from[2]),
        new THREE.Vector3((from[0] + to[0]) / 2, from[1] + lift + 0.5, (from[2] + to[2]) / 2),
        new THREE.Vector3(to[0], to[1] + lift, to[2]),
      ]),
    [from, to, lift],
  );

  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.055, 8, false), [curve]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
    </mesh>
  );
}

/* ── Parking bay slab ──────────────────────────────────────────────────────── */

export function BaySlab({
  position,
  size = 2.7,
  color = STATE_COLOR.available,
  highlighted = false,
}: {
  position: [number, number, number];
  size?: number;
  color?: string;
  highlighted?: boolean;
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[size, size * 1.9]} />
        <meshStandardMaterial
          color="#0b1524"
          emissive={color}
          emissiveIntensity={highlighted ? 0.75 : 0.4}
          transparent
          opacity={highlighted ? 0.95 : 0.78}
        />
      </mesh>
      {/* Outline */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[size * 0.44, size * 0.5, 4]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
