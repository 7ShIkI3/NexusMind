import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

type BrainNode = {
  id: string
  label: string
  node_type?: string
  weight?: number
}

type BrainEdge = {
  source: string
  target: string
  label?: string
  edge_type?: string
}

type Brain3DProps = {
  nodes: BrainNode[]
  edges: BrainEdge[]
}

export default function Brain3D({ nodes, edges }: Brain3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  const palette = useMemo(() => ({
    note: 0x8b5cf6,
    rag: 0x22c55e,
    entity: 0x38bdf8,
    folder: 0xf59e0b,
    provider: 0xf97316,
    system: 0x94a3b8,
    default: 0xf97316,
  }), [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth || 800
    const height = mount.clientHeight || 540

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x08111f, 12, 28)

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
    camera.position.set(0, 0.8, 12)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0x8ebfff, 1.9)
    scene.add(ambient)

    const keyLight = new THREE.PointLight(0x8b5cf6, 2.4, 50)
    keyLight.position.set(5, 5, 8)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight(0x22c55e, 1.8, 40)
    fillLight.position.set(-7, -4, 6)
    scene.add(fillLight)

    const brainGroup = new THREE.Group()
    scene.add(brainGroup)

    const brainMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.0, 4),
      new THREE.MeshPhysicalMaterial({
        color: 0x8b5cf6,
        emissive: 0x11111a,
        emissiveIntensity: 0.5,
        roughness: 0.22,
        metalness: 0.45,
        transparent: true,
        opacity: 0.55,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
      }),
    )
    brainMesh.scale.set(1.15, 1.0, 0.85)
    brainGroup.add(brainMesh)

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(3.05, 4)),
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.18 }),
    )
    wireframe.scale.set(1.15, 1.0, 0.85)
    brainGroup.add(wireframe)

    const ringGeometry = new THREE.TorusKnotGeometry(4.1, 0.08, 140, 18, 2, 3)
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0f172a,
      transparent: true,
      opacity: 0.32,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = Math.PI / 2.5
    brainGroup.add(ring)

    const nodeMeshes: THREE.Mesh[] = []
    const linkLines: THREE.Line[] = []
    const nodePositions = new Map<string, THREE.Vector3>()
    const orderedNodes = [...nodes].sort((a, b) => (b.weight || 0) - (a.weight || 0))
    const radius = 4.1

    orderedNodes.forEach((node, index) => {
      const position = fibonacciPoint(index, Math.max(orderedNodes.length, 1), radius)
      nodePositions.set(node.id, position)

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.15, 0.22 + (node.weight || 0) * 0.06), 20, 20),
        new THREE.MeshStandardMaterial({
          color: palette[node.node_type as keyof typeof palette] || palette.default,
          emissive: 0x08111f,
          emissiveIntensity: 0.7,
          roughness: 0.25,
          metalness: 0.15,
        }),
      )
      sphere.position.copy(position)
      brainGroup.add(sphere)
      nodeMeshes.push(sphere)

      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.28, 0.35 + (node.weight || 0) * 0.08), 16, 16),
        new THREE.MeshBasicMaterial({
          color: palette[node.node_type as keyof typeof palette] || palette.default,
          transparent: true,
          opacity: 0.12,
        }),
      )
      aura.position.copy(position)
      brainGroup.add(aura)
      nodeMeshes.push(aura)
    })

    edges.slice(0, 48).forEach((edge, index) => {
      const source = nodePositions.get(edge.source)
      const target = nodePositions.get(edge.target)
      if (!source || !target) return
      const lineMaterial = new THREE.LineBasicMaterial({
        color: index % 2 === 0 ? 0x38bdf8 : 0x8b5cf6,
        transparent: true,
        opacity: 0.22,
      })
      const curve = new THREE.CatmullRomCurve3([
        source.clone(),
        midpoint(source, target, 0.42),
        target.clone(),
      ])
      const points = curve.getPoints(24)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const line = new THREE.Line(geometry, lineMaterial)
      brainGroup.add(line)
      linkLines.push(line)
    })

    const subtleCloud = new THREE.Points(
      new THREE.SphereGeometry(6.0, 18, 18),
      new THREE.PointsMaterial({ color: 0x67e8f9, size: 0.04, transparent: true, opacity: 0.28 }),
    )
    brainGroup.add(subtleCloud)

    let frame = 0
    const animate = () => {
      frame += 0.008
      brainGroup.rotation.y = frame * 0.7
      brainGroup.rotation.x = Math.sin(frame * 0.25) * 0.12
      ring.rotation.z += 0.0018
      brainMesh.scale.set(
        1.15 + Math.sin(frame * 0.85) * 0.02,
        1.0 + Math.sin(frame * 0.55) * 0.015,
        0.85 + Math.sin(frame * 0.4) * 0.02,
      )
      renderer.render(scene, camera)
      requestId = window.requestAnimationFrame(animate)
    }

    let requestId = window.requestAnimationFrame(animate)

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = mount.clientWidth || width
      const nextHeight = mount.clientHeight || height
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
      renderer.setSize(nextWidth, nextHeight)
    })
    resizeObserver.observe(mount)

    return () => {
      window.cancelAnimationFrame(requestId)
      resizeObserver.disconnect()
      nodeMeshes.forEach((mesh) => {
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose())
        } else {
          mesh.material.dispose()
        }
      })
      linkLines.forEach((line) => {
        line.geometry.dispose()
        if (Array.isArray(line.material)) {
          line.material.forEach((material) => material.dispose())
        } else {
          line.material.dispose()
        }
      })
      brainMesh.geometry.dispose()
      brainMesh.material.dispose()
      wireframe.geometry.dispose()
      wireframe.material.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
      subtleCloud.geometry.dispose()
      subtleCloud.material.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [nodes, edges, palette])

  return <div ref={mountRef} className="h-full w-full min-h-[420px]" />
}

function fibonacciPoint(index: number, count: number, radius: number) {
  const phi = Math.acos(1 - 2 * ((index + 0.5) / count))
  const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5)
  const x = radius * Math.cos(theta) * Math.sin(phi)
  const y = radius * Math.sin(theta) * Math.sin(phi) * 0.82
  const z = radius * Math.cos(phi) * 0.9
  return new THREE.Vector3(x, y, z)
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3, lift: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5)
  mid.z += Math.max(0.6, Math.abs(a.z - b.z) * lift)
  return mid
}