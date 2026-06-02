'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { fetchCadFileContent } from '@/lib/cad-fetch';

function disposeResources(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      if (!geometries.has(child.geometry)) { child.geometry.dispose(); geometries.add(child.geometry); }
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) { if (m && !materials.has(m)) { m.dispose(); materials.add(m); } }
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

const DEFAULT_MAT = () =>
  new THREE.MeshStandardMaterial({
    color: 0xd95d39,
    metalness: 0.1,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

function centerModel(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

async function loadFile(ext: string, buf: ArrayBuffer): Promise<THREE.Group> {
  const lower = ext.toLowerCase();
  if (lower === '.stl') {
    const geo = new STLLoader().parse(buf);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, DEFAULT_MAT());
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox?.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const g = new THREE.Group(); g.add(mesh); return g;
  }
  if (lower === '.obj') {
    const text = new TextDecoder().decode(buf);
    const obj = new OBJLoader().parse(text);
    centerModel(obj);
    return obj;
  }
  if (lower === '.gltf' || lower === '.glb') {
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(buf, '', (gltf) => { centerModel(gltf.scene); resolve(gltf.scene); }, reject);
    });
  }
  if (lower === '.ply') {
    const geo = new PLYLoader().parse(buf);
    const hasColors = !!geo.attributes.color;
    const mat = new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0xd95d39, metalness: 0.1, roughness: 0.7,
      side: THREE.DoubleSide, vertexColors: hasColors,
    });
    const mesh = new THREE.Mesh(geo, mat);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox?.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const g = new THREE.Group(); g.add(mesh); return g;
  }
  if (lower === '.3mf') {
    const obj = new ThreeMFLoader().parse(buf);
    centerModel(obj);
    return obj;
  }
  throw new Error(`Unsupported format: ${ext}`);
}

export default function ModelViewer({
  url,
  extension,
  height = 480,
}: Readonly<{ url: string; extension: string; height?: number }>) {
  const modelRef = useRef<THREE.Group | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setModel(null);

    if (modelRef.current) { disposeResources(modelRef.current); modelRef.current = null; }

    (async () => {
      try {
        const buf = await fetchCadFileContent(url, ctrl.signal);
        if (cancelled) return;
        const m = await loadFile(extension, buf);
        if (cancelled) { disposeResources(m); return; }
        modelRef.current = m;
        setModel(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load model');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [url, extension]);

  useEffect(() => () => {
    if (modelRef.current) disposeResources(modelRef.current);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center text-red-400 text-xs p-4" style={{ height }}>
        {error}
      </div>
    );
  }

  return (
    <div className="relative bg-brown-900" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-cream-200 text-xs z-10">
          Loading model...
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
