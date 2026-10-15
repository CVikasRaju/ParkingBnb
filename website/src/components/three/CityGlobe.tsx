"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { cities, type CityPin } from "@/lib/data/demo";
import { hashUnit, mulberry32 } from "@/lib/random";

const RADIUS = 1.62;
const HUB = cities[0];

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** A great-circle-ish arc between two cities, lifted above the surface. */
function arcPoints(from: CityPin, to: CityPin, segments = 54): THREE.Vector3[] {
  const start = latLngToVector3(from.lat, from.lng, RADIUS);
  const end = latLngToVector3(to.lat, to.lng, RADIUS);
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = new THREE.Vector3().copy(start).lerp(end, t);
    point.normalize().multiplyScalar(RADIUS * (1 + Math.sin(Math.PI * t) * 0.3));
    points.push(point);
  }
  return points;
}

function Pin({
  city,
  hovered,
  onHover,
}: {
  city: CityPin;
  hovered: string | null;
  onHover: (city: string | null) => void;
}) {
  // Phase is derived from the city name so it stays stable across renders.

  const position = useMemo(
    () => latLngToVector3(city.lat, city.lng, RADIUS),
    [city.lat, city.lng],
  );
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const isHovered = hovered === city.name;
  const offset = useMemo(() => hashUnit(city.name) * 2, [city.name]);

  useEffect(() => {
    // Ring plane faces along the surface normal (i.e. away from the core).
    ringRef.current?.lookAt(new THREE.Vector3(0, 0, 0));
  }, []);

  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.55 + offset) % 1;
    if (ringRef.current) {
      const scale = 0.5 + t * 2.6;
      ringRef.current.scale.set(scale, scale, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        (1 - t) * (isHovered ? 0.85 : 0.4);
    }
    if (coreRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.4 + offset) * 0.12;
      coreRef.current.scale.setScalar(isHovered ? pulse * 1.9 : pulse);
    }
  });

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(city.name);
    document.body.style.cursor = "pointer";
  };

  const handleOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
    document.body.style.cursor = "auto";
  };

  return (
    <group position={position}>
      <mesh
        ref={coreRef}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onPointerDown={handleOver}
      >
        <sphereGeometry args={[0.022, 14, 14]} />
        <meshBasicMaterial color={isHovered ? "#b6ffe9" : "#35f0be"} toneMapped={false} />
      </mesh>

      <mesh ref={ringRef}>
        <ringGeometry args={[0.028, 0.038, 32]} />
        <meshBasicMaterial
          color="#0dd9a3"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Arcs() {
  const arcs = useMemo(() => {
    return cities.slice(1).map((city) => {
      const points = arcPoints(HUB, city);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: "#3b7bff",
        transparent: true,
        opacity: 0.42,
      });
      return { city: city.name, line: new THREE.Line(geometry, material), points };
    });
  }, []);

  const dotRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    arcs.forEach((arc, index) => {
      const dot = dotRefs.current[index];
      if (!dot) return;
      const progress = ((t * 0.22 + index * 0.17) % 1 + 1) % 1;
      const point = arc.points[Math.min(arc.points.length - 1, Math.floor(progress * arc.points.length))];
      dot.position.copy(point);
    });
  });

  useEffect(() => {
    return () => {
      for (const arc of arcs) {
        arc.line.geometry.dispose();
        (arc.line.material as THREE.Material).dispose();
      }
    };
  }, [arcs]);

  return (
    <>
      {arcs.map((arc) => (
        <primitive key={arc.city} object={arc.line} />
      ))}
      {arcs.map((arc, index) => (
        <mesh
          key={`dot-${arc.city}`}
          ref={(node) => {
            dotRefs.current[index] = node;
          }}
        >
          <sphereGeometry args={[0.013, 10, 10]} />
          <meshBasicMaterial color="#b6ffe9" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function Starfield() {
  const points = useMemo(() => {
    const random = mulberry32(9182736);
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const vector = new THREE.Vector3(
        random() * 2 - 1,
        random() * 2 - 1,
        random() * 2 - 1,
      )
        .normalize()
        .multiplyScalar(14 + random() * 22);
      positions[i * 3] = vector.x;
      positions[i * 3 + 1] = vector.y;
      positions[i * 3 + 2] = vector.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: "#9dc0ff",
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
    });
    return new THREE.Points(geometry, material);
  }, []);

  useEffect(() => {
    return () => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    };
  }, [points]);

  return <primitive object={points} />;
}

export default function CityGlobe({
  onHover,
}: {
  onHover: (city: CityPin | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const handleHover = useCallback(
    (name: string | null) => {
      setHovered(name);
      onHover(name ? cities.find((city) => city.name === name) ?? null : null);
    },
    [onHover],
  );

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 5]} intensity={0.8} color="#cfe0ff" />
      <pointLight position={[-5, 3, -4]} intensity={16} color="#3b7bff" distance={18} decay={2} />

      <Starfield />

      <group rotation={[0.28, 0, 0.12]}>
        {/* Atmospheric halo */}
        <mesh scale={1.07}>
          <sphereGeometry args={[RADIUS, 48, 32]} />
          <meshBasicMaterial
            color="#0dd9a3"
            transparent
            opacity={0.05}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Latitude/longitude lattice */}
        <mesh>
          <sphereGeometry args={[RADIUS, 36, 24]} />
          <meshBasicMaterial
            color="#1f2c4a"
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>

        {/* Opaque inner sphere hides the far-side wires for a solid read */}
        <mesh scale={0.985}>
          <sphereGeometry args={[RADIUS, 48, 32]} />
          <meshStandardMaterial
            color="#070c17"
            roughness={0.85}
            metalness={0.2}
            emissive="#0a1120"
            emissiveIntensity={0.6}
          />
        </mesh>

        <Arcs />

        {cities.map((city) => (
          <Pin key={city.name} city={city} hovered={hovered} onHover={handleHover} />
        ))}
      </group>

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.55}
        rotateSpeed={0.55}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 1.55}
      />
    </>
  );
}
