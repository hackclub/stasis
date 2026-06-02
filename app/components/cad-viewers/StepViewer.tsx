'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { fetchCadFileContent } from '@/lib/cad-fetch';

interface StepMesh {
  name: string;
  position: Float32Array | null;
  normal: Float32Array | null;
  index: Uint32Array | null;
}

interface StepResult {
  success: boolean;
  preview: boolean;
  meshes: StepMesh[];
}

let stepWorker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: StepResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (stepWorker) return stepWorker;
  const w = new Worker('/occt-step-worker.js');
  w.onmessage = (e: MessageEvent) => {
    const { id, success, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (success) p.resolve(result);
    else p.reject(new Error(error || 'STEP parse failed'));
  };
  w.onerror = (e: ErrorEvent) => {
    for (const [, p] of pending) p.reject(new Error(e.message || 'Worker crashed'));
    pending.clear();
    w.terminate();
    if (stepWorker === w) stepWorker = null;
  };
  stepWorker = w;
  return w;
}

function parseStep(buf: ArrayBuffer): Promise<StepResult> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, buffer: buf, preview: false }, [buf]);
  });
}

function disposeResources(obj: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  obj.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      if (!geos.has(c.geometry)) { c.geometry.dispose(); geos.add(c.geometry); }
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of ms) if (m && !mats.has(m)) { m.dispose(); mats.add(m); }
    }
  });
}

function CameraFit({ model }: Readonly<{ model: THREE.Group | null }>) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!model || !controls) return;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    camera.position.set(dist, dist, dist);
    camera.lookAt(center);
    if ('target' in controls) {
      (controls as any).target.copy(center);
      (controls as any).update();
    }
    camera.updateProjectionMatrix();
  }, [model, camera, controls]);
  return null;
}

function buildGroup(result: StepResult): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd95d39, metalness: 0.1, roughness: 0.7,
    side: THREE.DoubleSide, flatShading: false,
  });

  for (const m of result.meshes) {
    if (!m.position || m.position.length < 9) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    if (m.normal) geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    else geo.computeVertexNormals();
    if (m.index) geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    group.add(new THREE.Mesh(geo, mat));
  }

  if (group.children.length === 0) throw new Error('No geometry in STEP file');

  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  return group;
}

export default function StepViewer({
  url,
  height,
}: Readonly<{ url: string; height?: number }>) {
  const modelRef = useRef<THREE.Group | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true); setError(null); setModel(null);
    if (modelRef.current) { disposeResources(modelRef.current); modelRef.current = null; }

    (async () => {
      try {
        const buf = await fetchCadFileContent(url, ctrl.signal);
        if (cancelled) return;
        const result = await parseStep(buf);
        if (cancelled) return;
        const g = buildGroup(result);
        if (cancelled) { disposeResources(g); return; }
        modelRef.current = g;
        setModel(g);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load STEP file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [url]);

  useEffect(() => () => { if (modelRef.current) disposeResources(modelRef.current); }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center text-red-400 text-xs p-4" style={height ? { height } : { height: '100%' }}>
        {error}
      </div>
    );
  }

  return (
    <div className="relative bg-brown-900" style={height ? { height } : { height: '100%' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-cream-200 text-xs z-10">
          Parsing STEP file (WASM)...
        </div>
      )}
      <Canvas
        dpr={[1, 1.5]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <PerspectiveCamera makeDefault position={[5, 5, 5]} />
        <OrbitControls makeDefault />
        <CameraFit model={model} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 15, 8]} intensity={2} />
        <directionalLight position={[-8, 8, -8]} intensity={0.8} />
        <directionalLight position={[0, -10, 5]} intensity={1} />
        <gridHelper args={[20, 20, '#3B3026', '#3B3026']} />
        {model && <primitive object={model} />}
      </Canvas>
    </div>
  );
}
