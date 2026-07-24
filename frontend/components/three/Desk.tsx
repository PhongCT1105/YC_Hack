'use client'

// Desk + monitor + keyboard. Chair is omitted since minions stand.
export function Desk({ position }: { position: [number, number, number] }) {
  const WOOD = '#92400E'
  const WOOD_DARK = '#78350F'
  const MONITOR_BODY = '#1F2937'
  const SCREEN = '#60A5FA'
  const KEY = '#374151'

  return (
    <group position={position}>
      {/* Desktop surface */}
      <mesh position={[0, 0.62, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.4, 0.07, 0.82]} />
        <meshLambertMaterial color={WOOD} flatShading />
      </mesh>

      {/* Desk legs — four corners */}
      {(
        [
          [-0.6, 0.28, -0.34],
          [0.6, 0.28, -0.34],
          [-0.6, 0.28, 0.34],
          [0.6, 0.28, 0.34],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <boxGeometry args={[0.07, 0.56, 0.07]} />
          <meshLambertMaterial color={WOOD_DARK} flatShading />
        </mesh>
      ))}

      {/* Under-desk crossbar */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.06]} />
        <meshLambertMaterial color={WOOD_DARK} flatShading />
      </mesh>

      {/* Monitor stand stem */}
      <mesh position={[0, 0.74, -0.24]} castShadow>
        <boxGeometry args={[0.07, 0.16, 0.14]} />
        <meshLambertMaterial color={MONITOR_BODY} flatShading />
      </mesh>

      {/* Monitor base foot */}
      <mesh position={[0, 0.665, -0.2]}>
        <boxGeometry args={[0.28, 0.03, 0.14]} />
        <meshLambertMaterial color={MONITOR_BODY} flatShading />
      </mesh>

      {/* Monitor body */}
      <mesh position={[0, 1.04, -0.25]} castShadow>
        <boxGeometry args={[0.78, 0.5, 0.055]} />
        <meshLambertMaterial color={MONITOR_BODY} flatShading />
      </mesh>

      {/* Screen bezel (slightly inset) */}
      <mesh position={[0, 1.04, -0.222]}>
        <boxGeometry args={[0.7, 0.42, 0.01]} />
        <meshLambertMaterial color="#111827" flatShading />
      </mesh>

      {/* Screen glow (emissive) */}
      <mesh position={[0, 1.04, -0.216]}>
        <boxGeometry args={[0.66, 0.38, 0.01]} />
        <meshStandardMaterial
          color={SCREEN}
          emissive={SCREEN}
          emissiveIntensity={0.55}
        />
      </mesh>

      {/* Keyboard */}
      <mesh position={[0, 0.655, 0.12]}>
        <boxGeometry args={[0.58, 0.02, 0.22]} />
        <meshLambertMaterial color={KEY} flatShading />
      </mesh>

      {/* Mouse */}
      <mesh position={[0.38, 0.655, 0.12]}>
        <boxGeometry args={[0.1, 0.02, 0.15]} />
        <meshLambertMaterial color={KEY} flatShading />
      </mesh>

      {/* Coffee cup on desk */}
      <mesh position={[-0.5, 0.7, 0.2]} castShadow>
        <cylinderGeometry args={[0.055, 0.045, 0.1, 7]} />
        <meshLambertMaterial color="#6B7280" flatShading />
      </mesh>
      {/* Cup liquid */}
      <mesh position={[-0.5, 0.755, 0.2]}>
        <cylinderGeometry args={[0.048, 0.048, 0.01, 7]} />
        <meshLambertMaterial color="#451A03" />
      </mesh>
    </group>
  )
}
