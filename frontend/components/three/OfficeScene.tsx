'use client'

import { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Room } from './Room'
import { Desk } from './Desk'
import { Minion } from './Minion'
import type { Worker } from '@/types'

// Camera sits at this offset above/behind the look-at target.
// [10, 8, 10] gives a 45° isometric-ish view from the front-right corner.
const CAMERA_OFFSET = new THREE.Vector3(10, 8, 10)
const DEFAULT_TARGET = new THREE.Vector3(0, 0.5, 0)

function CameraRig({
  target,
  zoomed,
}: {
  target: THREE.Vector3
  zoomed: boolean
}) {
  const { camera } = useThree()
  const currentTarget = useRef(DEFAULT_TARGET.clone())

  useFrame(() => {
    // Smooth pan: lerp look-at target
    currentTarget.current.lerp(target, 0.055)

    // Move camera to maintain fixed offset from target
    camera.position.copy(currentTarget.current.clone().add(CAMERA_OFFSET))
    camera.lookAt(currentTarget.current)

    // Zoom in slightly (narrow FOV) when a minion is selected
    const perspCam = camera as THREE.PerspectiveCamera
    const targetFOV = zoomed ? 44 : 55
    perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, targetFOV, 0.05)
    perspCam.updateProjectionMatrix()
  })

  return null
}

function Scene({
  workers,
  selectedId,
  onSelect,
}: {
  workers: Worker[]
  selectedId: string | null
  onSelect: (w: Worker | null) => void
}) {
  const [cameraTarget, setCameraTarget] = useState(DEFAULT_TARGET.clone())
  const [zoomed, setZoomed] = useState(false)

  const handleMinionClick = (worker: Worker) => {
    if (selectedId === worker.id) {
      // Deselect: zoom back out
      onSelect(null)
      setCameraTarget(DEFAULT_TARGET.clone())
      setZoomed(false)
    } else {
      onSelect(worker)
      // Aim camera at the desk position (slightly elevated)
      setCameraTarget(
        new THREE.Vector3(worker.position[0], 0.5, worker.position[2])
      )
      setZoomed(true)
    }
  }

  const handleBackgroundClick = () => {
    onSelect(null)
    setCameraTarget(DEFAULT_TARGET.clone())
    setZoomed(false)
  }

  return (
    <>
      <CameraRig target={cameraTarget} zoomed={zoomed} />

      {/* Ambient fill — warm office feel */}
      <ambientLight intensity={0.45} color="#FFF8E7" />

      {/* Main directional light — casts shadows from top-left */}
      <directionalLight
        position={[6, 14, 7]}
        intensity={1.0}
        color="#FFF5DC"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-bias={-0.001}
      />

      {/* Soft fill from opposite side */}
      <directionalLight position={[-4, 6, -3]} intensity={0.3} color="#E0F0FF" />

      <Room />

      {/* Desks + Minions */}
      {workers.map((worker) => (
        <group key={worker.id}>
          <Desk position={worker.position} />
          <Minion
            // Minion stands slightly in front of their desk (toward camera)
            position={[worker.position[0], 0.15, worker.position[2] + 0.62]}
            status={worker.status}
            isSelected={worker.id === selectedId}
            onClick={() => handleMinionClick(worker)}
          />
        </group>
      ))}

      {/* Invisible floor plane — click to deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        onClick={handleBackgroundClick}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  )
}

export default function OfficeScene({
  workers,
  selectedId,
  onSelect,
}: {
  workers: Worker[]
  selectedId: string | null
  onSelect: (w: Worker | null) => void
}) {
  return (
    <Canvas
      camera={{
        position: [10, 8, 10],
        fov: 55,
        near: 0.1,
        far: 120,
      }}
      shadows
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
    >
      <Scene workers={workers} selectedId={selectedId} onSelect={onSelect} />
    </Canvas>
  )
}
