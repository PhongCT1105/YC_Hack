'use client'

import * as THREE from 'three'

function OverheadLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Fixture body */}
      <mesh>
        <boxGeometry args={[1.1, 0.06, 0.25]} />
        <meshLambertMaterial color="#E5E7EB" flatShading />
      </mesh>
      {/* Emissive panel */}
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[1.0, 0.01, 0.18]} />
        <meshStandardMaterial color="#FFFDE7" emissive="#FFFDE7" emissiveIntensity={2.5} />
      </mesh>
      <pointLight
        position={[0, -0.6, 0]}
        intensity={1.6}
        color="#FFF5E1"
        distance={8}
        decay={2}
      />
    </group>
  )
}

function Plant({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Planter pot — modern tall cylinder */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.34, 7]} />
        <meshLambertMaterial color="#292929" flatShading />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 7]} />
        <meshLambertMaterial color="#3D2B1A" flatShading />
      </mesh>
      {/* Lower foliage */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <coneGeometry args={[0.32, 0.62, 6]} />
        <meshLambertMaterial color="#166534" flatShading />
      </mesh>
      {/* Mid foliage */}
      <mesh position={[0, 1.06, 0]} castShadow>
        <coneGeometry args={[0.22, 0.48, 6]} />
        <meshLambertMaterial color="#15803D" flatShading />
      </mesh>
      {/* Upper foliage */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <coneGeometry args={[0.14, 0.34, 5]} />
        <meshLambertMaterial color="#16A34A" flatShading />
      </mesh>
      {/* Tip */}
      <mesh position={[0, 1.55, 0]}>
        <coneGeometry args={[0.06, 0.2, 4]} />
        <meshLambertMaterial color="#22C55E" flatShading />
      </mesh>
    </group>
  )
}

function WindowPane({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Sky fill */}
      <mesh position={[0, 0, -0.15]}>
        <planeGeometry args={[3.2, 2.2]} />
        <meshBasicMaterial color="#BFDBFE" />
      </mesh>
      {/* Sun glow */}
      <mesh position={[0.9, 0.6, -0.14]}>
        <circleGeometry args={[0.38, 8]} />
        <meshBasicMaterial color="#FEF08A" />
      </mesh>
      {/* Window frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[3.6, 2.5, 0.1]} />
        <meshLambertMaterial color="#E2DDD6" flatShading />
      </mesh>
      {/* Glass */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[3.2, 2.1, 0.04]} />
        <meshLambertMaterial color="#BAE6FD" transparent opacity={0.4} />
      </mesh>
      {/* Horizontal divider */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[3.2, 0.06, 0.05]} />
        <meshLambertMaterial color="#D4CFC8" flatShading />
      </mesh>
      {/* Vertical divider */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.06, 2.1, 0.05]} />
        <meshLambertMaterial color="#D4CFC8" flatShading />
      </mesh>
    </group>
  )
}

function Couch({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const FRAME = '#1E293B'
  const CUSHION = '#2D3748'
  const CUSHION_LIGHT = '#374151'

  return (
    <group position={position} rotation={rotation}>
      {/* Base frame */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 0.24, 1.0]} />
        <meshLambertMaterial color={FRAME} flatShading />
      </mesh>
      {/* Seat cushion left */}
      <mesh position={[-0.82, 0.33, 0.02]} castShadow>
        <boxGeometry args={[1.5, 0.2, 0.85]} />
        <meshLambertMaterial color={CUSHION} flatShading />
      </mesh>
      {/* Seat cushion right */}
      <mesh position={[0.82, 0.33, 0.02]} castShadow>
        <boxGeometry args={[1.5, 0.2, 0.85]} />
        <meshLambertMaterial color={CUSHION_LIGHT} flatShading />
      </mesh>
      {/* Back rest */}
      <mesh position={[0, 0.72, -0.38]} castShadow>
        <boxGeometry args={[3.2, 0.72, 0.22]} />
        <meshLambertMaterial color={FRAME} flatShading />
      </mesh>
      {/* Back cushion left */}
      <mesh position={[-0.82, 0.72, -0.26]}>
        <boxGeometry args={[1.5, 0.6, 0.14]} />
        <meshLambertMaterial color={CUSHION} flatShading />
      </mesh>
      {/* Back cushion right */}
      <mesh position={[0.82, 0.72, -0.26]}>
        <boxGeometry args={[1.5, 0.6, 0.14]} />
        <meshLambertMaterial color={CUSHION_LIGHT} flatShading />
      </mesh>
      {/* Left armrest */}
      <mesh position={[-1.72, 0.44, -0.06]} castShadow>
        <boxGeometry args={[0.22, 0.56, 0.82]} />
        <meshLambertMaterial color={FRAME} flatShading />
      </mesh>
      {/* Right armrest */}
      <mesh position={[1.72, 0.44, -0.06]} castShadow>
        <boxGeometry args={[0.22, 0.56, 0.82]} />
        <meshLambertMaterial color={FRAME} flatShading />
      </mesh>
      {/* Armrest tops */}
      <mesh position={[-1.72, 0.74, -0.06]}>
        <boxGeometry args={[0.24, 0.06, 0.86]} />
        <meshLambertMaterial color="#0F172A" flatShading />
      </mesh>
      <mesh position={[1.72, 0.74, -0.06]}>
        <boxGeometry args={[0.24, 0.06, 0.86]} />
        <meshLambertMaterial color="#0F172A" flatShading />
      </mesh>
      {/* Legs */}
      {(
        [
          [-1.5, -0.36],
          [-1.5, 0.36],
          [1.5, -0.36],
          [1.5, 0.36],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]} castShadow>
          <boxGeometry args={[0.1, 0.08, 0.1]} />
          <meshLambertMaterial color="#0A0F1A" flatShading />
        </mesh>
      ))}
    </group>
  )
}

function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Glass top */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.05, 0.55]} />
        <meshLambertMaterial color="#93C5FD" transparent opacity={0.35} />
      </mesh>
      {/* Metal frame rim */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.14, 0.04, 0.59]} />
        <meshLambertMaterial color="#1E293B" flatShading />
      </mesh>
      {/* Legs */}
      {(
        [
          [-0.46, -0.22],
          [-0.46, 0.22],
          [0.46, -0.22],
          [0.46, 0.22],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} castShadow>
          <boxGeometry args={[0.05, 0.4, 0.05]} />
          <meshLambertMaterial color="#1E293B" flatShading />
        </mesh>
      ))}
    </group>
  )
}

export function Room() {
  return (
    <group>
      {/* ── FLOOR: wood plank base ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshLambertMaterial color="#3D2510" />
      </mesh>

      {/* Wood planks — alternating shades along X, running the full Z length */}
      {Array.from({ length: 22 }).map((_, i) => {
        const x = i - 10.5
        const shades = ['#7A5230', '#6D4828', '#72502D', '#664526', '#765029']
        const shade = shades[i % shades.length]
        return (
          <mesh
            key={`plank-${i}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[x, 0.001, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.91, 22]} />
            <meshLambertMaterial color={shade} />
          </mesh>
        )
      })}

      {/* Plank cross-cut joints — subtle dark lines every ~2 units */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={`joint-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, i * 2 - 11]}
          receiveShadow
        >
          <planeGeometry args={[22, 0.035]} />
          <meshLambertMaterial color="#2A1808" />
        </mesh>
      ))}

      {/* ── WALLS: modern off-white ── */}
      {/* Back wall */}
      <mesh position={[0, 5, -9]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#F2EEE8" />
      </mesh>
      {/* Left wall */}
      <mesh position={[-9, 5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#EEEAE4" />
      </mesh>
      {/* Right wall */}
      <mesh position={[9, 5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#F2EEE8" />
      </mesh>
      {/* Front wall */}
      <mesh position={[0, 5, 9]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[22, 10]} />
        <meshLambertMaterial color="#F2EEE8" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10, 0]}>
        <planeGeometry args={[22, 22]} />
        <meshLambertMaterial color="#FAFAFA" />
      </mesh>

      {/* Baseboard trim — darker wood tone */}
      <mesh position={[0, 0.07, -8.96]}>
        <boxGeometry args={[18, 0.14, 0.08]} />
        <meshLambertMaterial color="#C4B49E" flatShading />
      </mesh>
      <mesh position={[-8.96, 0.07, 0]}>
        <boxGeometry args={[0.08, 0.14, 18]} />
        <meshLambertMaterial color="#C4B49E" flatShading />
      </mesh>
      <mesh position={[8.96, 0.07, 0]}>
        <boxGeometry args={[0.08, 0.14, 18]} />
        <meshLambertMaterial color="#C4B49E" flatShading />
      </mesh>

      {/* ── WINDOWS ── */}
      <WindowPane position={[-2, 5, -8.9]} />
      <WindowPane position={[4, 5, -8.9]} />

      {/* ── CEILING LIGHTS ── */}
      <OverheadLight position={[-3, 9.9, -2]} />
      <OverheadLight position={[3, 9.9, -2]} />
      <OverheadLight position={[-3, 9.9, 2.5]} />
      <OverheadLight position={[3, 9.9, 2.5]} />

      {/* ── PLANTS: corners + near couches ── */}
      <Plant position={[-7.5, 0, -7.5]} scale={1.1} />
      <Plant position={[7.2, 0, -7.5]} scale={1.1} />
      <Plant position={[-7.5, 0, 6.5]} scale={0.85} />
      <Plant position={[7.2, 0, 6.5]} scale={0.85} />
      {/* Accent plants near couch ends */}
      <Plant position={[-7.5, 0, 1.8]} scale={0.7} />
      <Plant position={[7.2, 0, 1.8]} scale={0.7} />

      {/* ── COUCHES: on left and right sides ── */}
      {/*
        Rotation [0, π/2, 0]: local Z → world X
        So the back (local z=-0.38) faces world -X (toward left wall) and
        the seat (local z>0) faces world +X (toward room center).
        The couch length (local X ±1.7) runs along world Z.
      */}
      <Couch position={[-7.2, 0, -1.0]} rotation={[0, Math.PI / 2, 0]} />
      <Couch position={[7.2, 0, -1.0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Coffee tables in front of each couch */}
      <CoffeeTable position={[-5.8, 0, -1.0]} />
      <CoffeeTable position={[5.8, 0, -1.0]} />

      {/* ── ACCENT: small shelf on left wall ── */}
      <mesh position={[-8.85, 4, -4]}>
        <boxGeometry args={[0.18, 0.08, 1.2]} />
        <meshLambertMaterial color="#78350F" flatShading />
      </mesh>
      {[-0.4, -0.1, 0.15, 0.38].map((offset, i) => (
        <mesh key={i} position={[-8.74, 4.18, -4 + offset]}>
          <boxGeometry args={[0.1, 0.28, 0.16]} />
          <meshLambertMaterial
            color={['#DC2626', '#2563EB', '#16A34A', '#D97706'][i]}
            flatShading
          />
        </mesh>
      ))}

      {/* ── WHITEBOARD on back wall ── */}
      <mesh position={[-5.5, 4.5, -8.88]}>
        <boxGeometry args={[3.2, 2.0, 0.08]} />
        <meshLambertMaterial color="#F1F5F9" flatShading />
      </mesh>
      <mesh position={[-5.5, 4.5, -8.82]}>
        <boxGeometry args={[3.0, 1.8, 0.02]} />
        <meshLambertMaterial color="#FAFAFA" />
      </mesh>
      {/* Whiteboard frame border */}
      <mesh position={[-5.5, 4.5, -8.82]}>
        <boxGeometry args={[3.24, 0.06, 0.04]} />
        <meshLambertMaterial color="#94A3B8" flatShading />
      </mesh>
      <mesh position={[-5.5, 4.5, -8.82]}>
        <boxGeometry args={[0.06, 2.04, 0.04]} />
        <meshLambertMaterial color="#94A3B8" flatShading />
      </mesh>
    </group>
  )
}
