'use client'

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WorkerStatus } from '@/types'

export const STATUS_COLORS: Record<WorkerStatus, string> = {
  pending: '#9CA3AF',
  'in-progress': '#3B82F6',
  review: '#F59E0B',
  done: '#10B981',
  blocked: '#EF4444',
}

const YELLOW = '#FFD93D'
const YELLOW_DARK = '#F0C430'
const BLUE_OVERALLS = '#1B4FD8'
const GOGGLE_GRAY = '#4B5563'
const DARK = '#111827'

// Lens tint changes to reflect status mood
const LENS_COLOR: Record<WorkerStatus, string> = {
  pending: '#D1D5DB',
  'in-progress': '#BFDBFE',
  review: '#FDE68A',
  done: '#6EE7B7',
  blocked: '#FCA5A5',
}

function StatusRing({ status }: { status: WorkerStatus }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y = state.clock.elapsedTime * 1.4
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.9) * 0.25
  })
  return (
    <mesh ref={ref} position={[0, 1.62, 0]}>
      <torusGeometry args={[0.24, 0.045, 3, 10]} />
      <meshBasicMaterial color={STATUS_COLORS[status]} />
    </mesh>
  )
}

// Arm pose varies by status
function getArmPose(status: WorkerStatus) {
  if (status === 'blocked') {
    return {
      leftPos: [-0.36, 0.72, 0] as [number, number, number],
      rightPos: [0.36, 0.72, 0] as [number, number, number],
      leftRot: [0, 0, 2.5] as [number, number, number],
      rightRot: [0, 0, -2.5] as [number, number, number],
    }
  }
  if (status === 'done') {
    return {
      leftPos: [-0.36, 0.68, 0] as [number, number, number],
      rightPos: [0.36, 0.68, 0] as [number, number, number],
      leftRot: [0, 0, 2.1] as [number, number, number],
      rightRot: [0, 0, -2.1] as [number, number, number],
    }
  }
  // Default (pending, in-progress, review): arms relaxed at sides
  return {
    leftPos: [-0.33, 0.46, 0] as [number, number, number],
    rightPos: [0.33, 0.46, 0] as [number, number, number],
    leftRot: [0, 0, 0.38] as [number, number, number],
    rightRot: [0, 0, -0.38] as [number, number, number],
  }
}

export function Minion({
  position,
  status,
  isSelected,
  onClick,
}: {
  position: [number, number, number]
  status: WorkerStatus
  isSelected: boolean
  onClick: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const phaseRef = useRef(Math.random() * Math.PI * 2) // random phase = desync bob

  // Set initial position imperatively (avoid R3F prop fighting with useFrame)
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...position)
    }
  }, [position])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    phaseRef.current += delta
    // Idle bob — gentle sine wave
    groupRef.current.position.y = position[1] + Math.sin(phaseRef.current * 1.6) * 0.04
    // Subtle sway on x for blocked minions (distress animation)
    if (status === 'blocked') {
      groupRef.current.rotation.z = Math.sin(phaseRef.current * 3.0) * 0.06
    } else {
      groupRef.current.rotation.z = 0
    }
  })

  const arms = getArmPose(status)
  const lensColor = LENS_COLOR[status]
  const isWorking = status === 'in-progress'

  return (
    <group
      ref={groupRef}
      // Face toward camera (camera offset is [10,8,10], so face [+X,0,+Z] = π/4 around Y)
      rotation={[0, Math.PI / 4, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'default')}
    >
      {/* Floor selection ring */}
      {isSelected && (
        <mesh position={[0, -position[1] + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.56, 18]} />
          <meshBasicMaterial color="#FBBF24" transparent opacity={0.9} />
        </mesh>
      )}

      {/* Status ring floating above head */}
      <StatusRing status={status} />

      {/* ── LEGS ── */}
      <mesh position={[-0.11, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.3, 5]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>
      <mesh position={[0.11, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.3, 5]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>
      {/* Feet */}
      <mesh position={[-0.11, -0.02, 0.04]} castShadow>
        <boxGeometry args={[0.14, 0.07, 0.2]} />
        <meshLambertMaterial color={DARK} flatShading />
      </mesh>
      <mesh position={[0.11, -0.02, 0.04]} castShadow>
        <boxGeometry args={[0.14, 0.07, 0.2]} />
        <meshLambertMaterial color={DARK} flatShading />
      </mesh>

      {/* ── BODY ── */}
      <mesh position={[0, 0.54, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.28, 0.58, 6]} />
        <meshLambertMaterial color={YELLOW} flatShading />
      </mesh>

      {/* Overalls lower bib */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.285, 0.29, 0.25, 6]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>

      {/* Overall bib (front chest pocket area) */}
      <mesh position={[0, 0.66, 0.24]}>
        <boxGeometry args={[0.26, 0.28, 0.04]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>

      {/* Overall straps */}
      <mesh position={[-0.09, 0.74, 0.22]}>
        <boxGeometry args={[0.065, 0.22, 0.035]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>
      <mesh position={[0.09, 0.74, 0.22]}>
        <boxGeometry args={[0.065, 0.22, 0.035]} />
        <meshLambertMaterial color={BLUE_OVERALLS} flatShading />
      </mesh>

      {/* ── ARMS ── */}
      <mesh position={arms.leftPos} rotation={arms.leftRot} castShadow>
        <cylinderGeometry args={[0.075, 0.065, 0.4, 4]} />
        <meshLambertMaterial color={YELLOW} flatShading />
      </mesh>
      {/* Left hand */}
      <mesh
        position={[
          arms.leftPos[0] - Math.sin(arms.leftRot[2]) * 0.2,
          arms.leftPos[1] - Math.cos(arms.leftRot[2]) * 0.2,
          0,
        ]}
        castShadow
      >
        <sphereGeometry args={[0.075, 4, 3]} />
        <meshLambertMaterial color={YELLOW_DARK} flatShading />
      </mesh>

      <mesh position={arms.rightPos} rotation={arms.rightRot} castShadow>
        <cylinderGeometry args={[0.075, 0.065, 0.4, 4]} />
        <meshLambertMaterial color={YELLOW} flatShading />
      </mesh>
      {/* Right hand */}
      <mesh
        position={[
          arms.rightPos[0] + Math.sin(-arms.rightRot[2]) * 0.2,
          arms.rightPos[1] - Math.cos(arms.rightRot[2]) * 0.2,
          0,
        ]}
        castShadow
      >
        <sphereGeometry args={[0.075, 4, 3]} />
        <meshLambertMaterial color={YELLOW_DARK} flatShading />
      </mesh>

      {/* ── HEAD ── */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.33, 6, 5]} />
        <meshLambertMaterial color={YELLOW} flatShading />
      </mesh>

      {/* Goggle band — horizontal ring around head */}
      <mesh position={[0, 0.99, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.33, 0.045, 4, 10]} />
        <meshLambertMaterial color={GOGGLE_GRAY} flatShading />
      </mesh>

      {/* Goggle outer rim */}
      <mesh position={[0, 0.99, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.145, 0.042, 4, 9]} />
        <meshLambertMaterial color={GOGGLE_GRAY} flatShading />
      </mesh>

      {/* Goggle lens */}
      <mesh position={[0, 0.99, 0.295]}>
        <circleGeometry args={[0.115, 9]} />
        <meshStandardMaterial color={lensColor} emissive={lensColor} emissiveIntensity={0.2} />
      </mesh>

      {/* Pupil */}
      <mesh position={[0, 0.99, 0.31]}>
        <circleGeometry args={[0.057, 7]} />
        <meshBasicMaterial color={DARK} />
      </mesh>

      {/* Pupil shine dot */}
      <mesh position={[0.032, 1.015, 0.316]}>
        <circleGeometry args={[0.019, 5]} />
        <meshBasicMaterial color="white" />
      </mesh>

      {/* Mouth — small line or smile depending on status */}
      {status === 'done' && (
        // Smile arc
        <mesh position={[0, 0.84, 0.30]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.07, 0.018, 3, 8, Math.PI]} />
          <meshBasicMaterial color={DARK} />
        </mesh>
      )}
      {status === 'blocked' && (
        // Frown arc
        <mesh position={[0, 0.82, 0.30]}>
          <torusGeometry args={[0.07, 0.018, 3, 8, Math.PI]} />
          <meshBasicMaterial color={DARK} />
        </mesh>
      )}

      {/* Tiny headset for "in-progress" workers */}
      {isWorking && (
        <>
          <mesh position={[0, 1.28, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.33, 0.03, 4, 8, Math.PI]} />
            <meshLambertMaterial color={GOGGLE_GRAY} flatShading />
          </mesh>
          <mesh position={[-0.34, 0.95, 0]}>
            <boxGeometry args={[0.07, 0.1, 0.07]} />
            <meshLambertMaterial color={DARK} flatShading />
          </mesh>
        </>
      )}
    </group>
  )
}
