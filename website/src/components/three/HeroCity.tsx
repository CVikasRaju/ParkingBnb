"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { mulberry32 } from "@/lib/random";

export interface BayInfo {
  id: string;
  label: string;
  pricePerHour: number;
  available: boolean;
}

export const heroBays: BayInfo[] = [
  { id: "b1", label: "Jubilee Hills · driveway", pricePerHour: 60, available: true },
  { id: "b2", label: "Hitec City · basement", pricePerHour: 45, available: true },
  { id: "b3", label: "Banjara Hills · garage", pricePerHour: 90, available: false },
  { id: "b4", label: "Gachibowli · commercial", pricePerHour: 55, available: true },
  { id: "b5", label: "Madhapur · driveway", pricePerHour: 40, available: true },
  { id: "b6", label: "Kondapur · basement", pricePerHour: 35, available: true },
];

const BAY_Z = 2.55;
const BAY_START_X = -3.1;
const BAY_GAP = 1.24;

interface Building {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  glow: number;
  /** Pulse phase offset, drawn from the seeded PRNG (never `Math.random`). */
  phase: number;
}

function useSkyline(): Building[] {
  return useMemo(() => {
    const random = mulberry32(20261015);
    const buildings: Building[] = [];
    const cells = [-3.2, -1.6, 0, 1.6, 3.2];

    for (const x of cells) {
      for (const z of cells) {
        // Keep the street where the parking bays live clear.
        if (Math.abs(z - BAY_Z) < 0.9 && x > -4.3 && x < 4.3) continue;
        if (Math.abs(x) < 0.55 && Math.abs(z) < 0.55) continue;
        if (random() < 0.28) continue;

        const width = 0.55 + random() * 0.42;
        const depth = 0.55 + random() * 0.42;
        const height = 0.45 + random() * 2.5;
        buildings.push({
          id: `${x}:${z}`,
          position: [x + (random() - 0.5) * 0.16, height / 2, z + (random() - 0.5) * 0.16],
          size: [width, height, depth],
          glow: 0.25 + random() * 0.6,
          phase: random() * Math.PI * 2,
        });
      }
    }
    return buildings;
  }, []);
}

function Building({
  position,
  size,
  glow,
  phase,
}: {
  position: [number, number, number];
  size: [number, number, number];
  glow: number;
  phase: number;
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.8 + phase);
    materialRef.current.emissiveIntensity = 0.08 + pulse * glow * 0.28;
  });

  return (
    <mesh position={position} castShadow={false}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        ref={materialRef}
        color="#101a2e"
        emissive="#3b7bff"
        emissiveIntensity={0.2}
        roughness={0.42}
        metalness={0.35}
      />
    </mesh>
  );
}

function Bay({
  info,
  index,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  info: BayInfo;
  index: number;
  hovered: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const x = BAY_START_X + index * BAY_GAP;
  const isHovered = hovered === info.id;
  const isSelected = selected === info.id;
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const accent = info.available ? "#0dd9a3" : "#61708f";

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const lift = isHovered || isSelected ? 0.16 : 0;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      lift,
      0.12,
    );

    if (ringRef.current) {
      const t = (clock.elapsedTime * 0.7 + index * 0.35) % 1;
      const scale = 0.6 + t * 2.1;
      ringRef.current.scale.set(scale, scale, scale);
      const material = ringRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = info.available ? (1 - t) * 0.5 : 0;
    }
  });

  const handleOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover(info.id);
      document.body.style.cursor = "pointer";
    },
    [info.id, onHover],
  );

  const handleOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover(null);
      document.body.style.cursor = "auto";
    },
    [onHover],
  );

  return (
    <group ref={groupRef} position={[x, 0, BAY_Z]}>
      {/* The painted bay itself. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(info.id);
        }}
      >
        <planeGeometry args={[0.86, 1.72]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isHovered || isSelected ? 0.95 : info.available ? 0.32 : 0.06}
          transparent
          opacity={info.available ? 0.72 : 0.4}
          side={THREE.DoubleSide}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Pulse ring shown for free bays. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.36, 0.46, 40]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Car({ targetX }: { targetX: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Mesh[]>([]);
  const current = useRef(-5.6);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const next = THREE.MathUtils.damp(current.current, targetX, 1.6, delta);
    const velocity = next - current.current;
    current.current = next;

    groupRef.current.position.x = next;
    // Wheels spin in proportion to how far the car moved this frame.
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x -= velocity * 9;
    }
  });

  return (
    <group ref={groupRef} position={[-5.6, 0, BAY_Z]}>
      {/* body */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.78, 0.19, 0.42]} />
        <meshStandardMaterial color="#e3eaf9" roughness={0.28} metalness={0.55} />
      </mesh>
      {/* cabin */}
      <mesh position={[-0.02, 0.36, 0]}>
        <boxGeometry args={[0.42, 0.16, 0.36]} />
        <meshStandardMaterial
          color="#35f0be"
          emissive="#35f0be"
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>
      {/* headlight beam on the road */}
      <mesh position={[0.46, 0.19, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.16, 0.7, 18, 1, true]} />
        <meshBasicMaterial
          color="#b6ffe9"
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {[
        [0.26, 0.09, 0.22],
        [0.26, 0.09, -0.22],
        [-0.26, 0.09, 0.22],
        [-0.26, 0.09, -0.22],
      ].map(([x, y, z], index) => (
        <mesh
          key={`${x}-${z}`}
          ref={(node) => {
            if (node) wheels.current[index] = node;
          }}
          position={[x, y, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.09, 0.09, 0.07, 16]} />
          <meshStandardMaterial color="#0a1120" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Ambient traffic ──────────────────────────────────────────────────────────
   The hero used to look like a still photograph: one car, parked, until you
   clicked a bay. This adds a street in front of the bay row with cars that
   drive continuously in both directions, so the scene is always moving.
   ──────────────────────────────────────────────────────────────────────────── */

const TRAFFIC_LANE_Z = 3.95;
const TRAFFIC_SPAN = 19;
const CAR_COLOURS = ["#e3eaf9", "#9fd6ff", "#ffd9a8", "#c9b6ff", "#8ff0d4", "#ffb3c1"];

interface TrafficSpec {
  id: number;
  z: number;
  offset: number;
  speed: number;
  /** 1 drives to +x, -1 to -x. */
  direction: 1 | -1;
  colour: string;
}

function useTraffic(): TrafficSpec[] {
  return useMemo(() => {
    // Seeded PRNG — never `Math.random()` in render (breaks React Compiler purity).
    const random = mulberry32(771003);
    return Array.from({ length: 7 }, (_, index) => {
      const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
      return {
        id: index,
        // Near lane travels +x, far lane travels -x.
        z: TRAFFIC_LANE_Z + (direction === 1 ? 0.24 : -0.24),
        offset: random() * TRAFFIC_SPAN,
        speed: 1.7 + random() * 1.6,
        direction,
        colour: CAR_COLOURS[Math.floor(random() * CAR_COLOURS.length)],
      };
    });
  }, []);
}

function TrafficCar({ spec }: { spec: TrafficSpec }) {
  const groupRef = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Mesh[]>([]);
  const travel = useRef(spec.offset);
  const facing = spec.direction === 1 ? 0 : Math.PI;

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Wrap around the visible strip so the flow never stops.
    travel.current =
      (travel.current + spec.speed * delta + TRAFFIC_SPAN) % TRAFFIC_SPAN;
    groupRef.current.position.x = travel.current - TRAFFIC_SPAN / 2;

    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x -= spec.speed * spec.direction * delta * 9;
    }
  });

  return (
    <group ref={groupRef} rotation={[0, facing, 0]} position={[0, 0, spec.z]}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.72, 0.17, 0.38]} />
        <meshStandardMaterial
          color={spec.colour}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
      {/* cabin */}
      <mesh position={[-0.02, 0.3, 0]}>
        <boxGeometry args={[0.36, 0.14, 0.32]} />
        <meshStandardMaterial
          color="#0d1729"
          roughness={0.15}
          metalness={0.4}
        />
      </mesh>
      {/* headlight beam ahead of the car */}
      <mesh position={[0.42, 0.16, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.14, 0.85, 16, 1, true]} />
        <meshBasicMaterial
          color="#d8fff4"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* tail lights */}
      <mesh position={[-0.37, 0.19, 0]}>
        <boxGeometry args={[0.04, 0.06, 0.3]} />
        <meshBasicMaterial color="#ff5a6e" />
      </mesh>
      {[
        [0.24, 0.07, 0.2],
        [0.24, 0.07, -0.2],
        [-0.24, 0.07, 0.2],
        [-0.24, 0.07, -0.2],
      ].map(([x, y, z], index) => (
        <mesh
          key={`${x}-${z}`}
          ref={(node) => {
            if (node) wheels.current[index] = node;
          }}
          position={[x, y, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.08, 0.08, 0.06, 14]} />
          <meshStandardMaterial color="#070c16" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Traffic() {
  const cars = useTraffic();
  return (
    <>
      {/* Street the traffic runs along, in front of the parked bay row */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, TRAFFIC_LANE_Z]}>
        <planeGeometry args={[TRAFFIC_SPAN + 2, 1.5]} />
        <meshStandardMaterial color="#090f1c" roughness={0.9} />
      </mesh>
      {/* Dashed centre line */}
      {Array.from({ length: 9 }, (_, index) => (
        <mesh
          key={`dash-${index}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[index * 2.1 - 8.4, 0.008, TRAFFIC_LANE_Z]}
        >
          <planeGeometry args={[1.1, 0.06]} />
          <meshBasicMaterial color="#2b3d63" />
        </mesh>
      ))}
      {cars.map((spec) => (
        <TrafficCar key={spec.id} spec={spec} />
      ))}
    </>
  );
}

function ParallaxRig() {
  useFrame(({ camera, pointer }) => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, 7 + pointer.x * 1.5, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 6 + pointer.y * 0.9, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 7 - pointer.x * 0.6, 0.04);
    camera.lookAt(0, 0.7, 0.4);
  });
  return null;
}

export default function HeroCity({
  onHover,
  onSelect,
}: {
  onHover: (info: BayInfo | null) => void;
  onSelect: (info: BayInfo) => void;
}) {
  const buildings = useSkyline();
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const handleHover = useCallback(
    (id: string | null) => {
      setHovered(id);
      onHover(id ? heroBays.find((b) => b.id === id) ?? null : null);
    },
    [onHover],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelected(id);
      const info = heroBays.find((b) => b.id === id);
      if (info) onSelect(info);
    },
    [onSelect],
  );

  const targetIndex = selected ? heroBays.findIndex((b) => b.id === selected) : -1;
  const targetX =
    targetIndex >= 0 ? BAY_START_X + targetIndex * BAY_GAP : -5.6;

  return (
    <>
      <ParallaxRig />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.15} color="#cfe0ff" />
      <pointLight position={[-4, 3, 4]} intensity={22} color="#0dd9a3" distance={16} decay={2} />
      <pointLight position={[5, 2.4, -3]} intensity={18} color="#3b7bff" distance={16} decay={2} />

      {/* Ground + city grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#060a13" roughness={0.95} metalness={0.05} />
      </mesh>
      <gridHelper
        args={[26, 26, "#1f2c4a", "#111a2c"]}
        position={[0, 0.001, 0]}
      />

      {/* Road strip the bays sit on */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, BAY_Z]}>
        <planeGeometry args={[13, 1.25]} />
        <meshStandardMaterial color="#0b1120" roughness={0.85} />
      </mesh>

      {buildings.map(({ id, ...building }) => (
        <Building key={id} {...building} />
      ))}

      {heroBays.map((bay, index) => (
        <Bay
          key={bay.id}
          info={bay}
          index={index}
          hovered={hovered}
          selected={selected}
          onHover={handleHover}
          onSelect={handleSelect}
        />
      ))}

      <Car targetX={targetX} />
      <Traffic />
    </>
  );
}
