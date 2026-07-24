'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function OverheadLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Fixture body */}
      <mesh>
        <boxGeometry args={[0.9, 0.07, 0.22]} />
        <meshLambertMaterial color="#E5E7EB" flatShading />
      </mesh>
      {/* Emissive panel */}
      <mesh position={[0, -0.042, 0]}>
        <boxGeometry args={[0.8, 0.01, 0.16]} />
        <meshStandardMaterial color="#FFFDE7" emissive="#FFFDE7" emissiveIntensity={2} />
      </mesh>
      <pointLight
        position={[0, -0.5, 0]}
        intensity={1.4}
        color="#FFF8E1"
        distance={7}
        decay={2}
      />
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.11, 0.26, 6]} />
        <meshLambertMaterial color="#B45309" flatShading />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.04, 6]} />
        <meshLambertMaterial color="#78350F" flatShading />
      </mesh>
      {/* Lower foliage */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <coneGeometry args={[0.3, 0.58, 5]} />
        <meshLambertMaterial color="#15803D" flatShading />
      </mesh>
      {/* Upper foliage */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.2, 0.42, 5]} />
        <meshLambertMaterial color="#16A34A" flatShading />
      </mesh>
      {/* Tip */}
      <mesh position={[0, 1.2, 0]}>
        <coneGeometry args={[0.1, 0.22, 4]} />
        <meshLambertMaterial color="#22C55E" flatShading />
      </mesh>
    </group>
  )
}

function WindowPane({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Sky fill behind glass */}
      <mesh position={[0, 0, -0.15]}>
        <planeGeometry args={[3.2, 2.0]} />
        <meshBasicMaterial color="#BFDBFE" />
      </mesh>
      {/* Sun glow circle */}
      <mesh position={[0.8, 0.5, -0.14]}>
        <circleGeometry args={[0.4, 8]} />
        <meshBasicMaterial color="#FEF08A" />
      </mesh>
      {/* Window frame outer */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[3.6, 2.4, 0.12]} />
        <meshLambertMaterial color="#D6C9A8" flatShading />
      </mesh>
      {/* Glass */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[3.2, 2.0, 0.04]} />
        <meshLambertMaterial color="#BAE6FD" transparent opacity={0.45} />
      </mesh>
      {/* Horizontal divider */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[3.2, 0.07, 0.06]} />
        <meshLambertMaterial color="#C8B89A" flatShading />
      </mesh>
      {/* Vertical divider */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.07, 2.0, 0.06]} />
        <meshLambertMaterial color="#C8B89A" flatShading />
      </mesh>
    </group>
  )
}

export function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshLambertMaterial color="#CFC3A2" />
      </mesh>

      {/* Subtle floor grid */}
      <gridHelper args={[22, 11, '#BEB296', '#BEB296']} position={[0, 0.003, 0]} />

      {/* Back wall (z = -9) */}
      <mesh position={[0, 5, -9]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#EDE3D0" />
      </mesh>

      {/* Left wall (x = -9) */}
      <mesh position={[-9, 5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#E5D9C5" />
      </mesh>

      {/* Right wall (x = 9) — partially visible */}
      <mesh position={[9, 5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#EDE3D0" />
      </mesh>

      {/* Front wall (z = 9) — behind camera, mostly hidden */}
      <mesh position={[0, 5, 9]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#EDE3D0" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10, 0]}>
        <planeGeometry args={[22, 22]} />
        <meshLambertMaterial color="#F5F0E8" />
      </mesh>

      {/* Baseboard trim */}
      <mesh position={[0, 0.06, -8.96]}>
        <boxGeometry args={[18, 0.12, 0.09]} />
        <meshLambertMaterial color="#BFB295" flatShading />
      </mesh>
      <mesh position={[-8.96, 0.06, 0]}>
        <boxGeometry args={[0.09, 0.12, 18]} />
        <meshLambertMaterial color="#BFB295" flatShading />
      </mesh>

      {/* Window on back wall */}
      <WindowPane position={[-2, 5, -8.9]} />

      {/* Second window */}
      <WindowPane position={[4, 5, -8.9]} />

      {/* Ceiling light fixtures */}
      <OverheadLight position={[-3, 9.9, -2]} />
      <OverheadLight position={[3, 9.9, -2]} />
      <OverheadLight position={[-3, 9.9, 2.5]} />
      <OverheadLight position={[3, 9.9, 2.5]} />

      {/* Corner plants */}
      <Plant position={[-7.5, 0, -7.5]} />
      <Plant position={[7.2, 0, -7.5]} />

      {/* Small shelf on left wall */}
      <mesh position={[-8.85, 4, -4]}>
        <boxGeometry args={[0.18, 0.08, 1.2]} />
        <meshLambertMaterial color="#92400E" flatShading />
      </mesh>
      {/* Books on shelf */}
      {[-0.4, -0.1, 0.15, 0.38].map((offset, i) => (
        <mesh key={i} position={[-8.74, 4.18, -4 + offset]}>
          <boxGeometry args={[0.1, 0.26, 0.16]} />
          <meshLambertMaterial
            color={['#DC2626', '#2563EB', '#16A34A', '#D97706'][i]}
            flatShading
          />
        </mesh>
      ))}

      {/* Whiteboard on back wall */}
      <mesh position={[-5.5, 4.5, -8.88]}>
        <boxGeometry args={[3.2, 2.0, 0.08]} />
        <meshLambertMaterial color="#F1F5F9" flatShading />
      </mesh>
      <mesh position={[-5.5, 4.5, -8.82]}>
        <boxGeometry args={[3.0, 1.8, 0.02]} />
        <meshLambertMaterial color="#FAFAFA" />
      </mesh>
      {/* Whiteboard frame */}
      <mesh position={[-5.5, 4.5, -8.82]}>
        <boxGeometry args={[3.2, 0.07, 0.05]} />
        <meshLambertMaterial color="#6B7280" flatShading />
      </mesh>
    </group>
  )
}
