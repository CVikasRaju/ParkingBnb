"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const GRID = 30;
const COUNT = GRID * GRID;
const SPACING = 0.64;

/**
 * An abstract field of parking bays rendered as a single InstancedMesh.
 *
 * Height and colour come from two overlapping signals: a slow travelling sine
 * wave, and a fast ripple centred on the pointer. Only one draw call, ~900
 * instances, and no per-instance React components — cheap enough to sit
 * alongside the other scenes.
 */
export default function ParkingWave() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const ripple = useMemo(() => new THREE.Vector2(0, 0), []);
  const half = useMemo(() => ((GRID - 1) * SPACING) / 2, []);

  const writeInstances = useMemo(
    () => (time: number, px: number, py: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;

      ripple.set(px * half, -py * half);
      let index = 0;

      for (let ix = 0; ix < GRID; ix += 1) {
        for (let iz = 0; iz < GRID; iz += 1) {
          const x = ix * SPACING - half;
          const z = iz * SPACING - half;

          const distance = Math.hypot(x - ripple.x, z - ripple.y);
          const travelling = Math.sin(distance * 0.8 - time * 2.0);
          const cursorRipple =
            Math.exp(-distance * 0.45) * Math.sin(distance * 1.7 - time * 4.5);

          const energy = Math.max(0, travelling) * 0.5 + Math.max(0, cursorRipple) * 0.95;
          const height = 0.07 + energy * 1.45;

          dummy.position.set(x, height / 2, z);
          dummy.scale.set(0.3, height, 0.3);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);

          // Mint when calm, drifting to azure at the crest.
          color.setHSL(0.46 - energy * 0.17, 0.86, 0.15 + energy * 0.47);
          mesh.setColorAt(index, color);
          index += 1;
        }
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [color, dummy, half, ripple],
  );

  // Paint a valid first frame so the field never flashes as a single blob.
  useLayoutEffect(() => {
    writeInstances(0, 0, 0);
  }, [writeInstances]);

  useFrame(({ clock, pointer }) => {
    writeInstances(clock.elapsedTime, pointer.x, pointer.y);
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 9, 5]} intensity={0.9} color="#cfe0ff" />
      <pointLight position={[0, 2.6, 3]} intensity={14} color="#0dd9a3" distance={14} decay={2} />

      <group rotation={[-0.16, 0, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#05080f" roughness={0.9} metalness={0.25} />
        </mesh>

        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, COUNT]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      </group>
    </>
  );
}
