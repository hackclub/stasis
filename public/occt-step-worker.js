let occtInstance = null;
let occtLoadPromise = null;

function getOcctInstance() {
  if (occtInstance) {
    return Promise.resolve(occtInstance);
  }

  if (occtLoadPromise) {
    return occtLoadPromise;
  }

  occtLoadPromise = (async () => {
    importScripts('/occt-import-js.js');

    if (typeof self.occtimportjs !== 'function') {
      throw new Error('occt-import-js failed to initialize in worker');
    }

    occtInstance = await self.occtimportjs({
      locateFile(path) {
        if (path.endsWith('.wasm')) return '/occt-import-js.wasm';
        return path;
      },
    });

    return occtInstance;
  })();

  return occtLoadPromise;
}

function toFloat32Array(source) {
  if (!source) return null;
  if (source instanceof Float32Array) return source;
  return new Float32Array(source);
}

function toUint32Array(source) {
  if (!source) return null;
  if (source instanceof Uint32Array) return source;
  return new Uint32Array(source);
}

function decimateIndexedTriangles(indexArray, step) {
  if (!indexArray || step <= 1) return indexArray;

  const triangleCount = Math.floor(indexArray.length / 3);
  const keptTriangles = Math.ceil(triangleCount / step);
  const output = new Uint32Array(keptTriangles * 3);

  let out = 0;
  for (let tri = 0; tri < triangleCount; tri += step) {
    const base = tri * 3;
    output[out++] = indexArray[base];
    output[out++] = indexArray[base + 1];
    output[out++] = indexArray[base + 2];
  }

  return output.subarray(0, out);
}

function decimateNonIndexedTriangles(positionArray, normalArray, step) {
  if (!positionArray || step <= 1) {
    return { position: positionArray, normal: normalArray };
  }

  const triangleCount = Math.floor(positionArray.length / 9);
  const keptTriangles = Math.ceil(triangleCount / step);
  const position = new Float32Array(keptTriangles * 9);
  const normal = normalArray ? new Float32Array(keptTriangles * 9) : null;

  let out = 0;
  for (let tri = 0; tri < triangleCount; tri += step) {
    const base = tri * 9;
    position.set(positionArray.subarray(base, base + 9), out * 9);
    if (normal && normalArray) {
      normal.set(normalArray.subarray(base, base + 9), out * 9);
    }
    out++;
  }

  return {
    position: position.subarray(0, out * 9),
    normal: normal ? normal.subarray(0, out * 9) : null,
  };
}

self.onmessage = async (event) => {
  const { id, buffer, preview } = event.data ?? {};

  if (typeof id !== 'number' || !(buffer instanceof ArrayBuffer)) {
    self.postMessage({
      id,
      success: false,
      error: 'Invalid worker payload',
    });
    return;
  }

  try {
    const occt = await getOcctInstance();
    const fileBuffer = new Uint8Array(buffer);
    let result;

    // Most occt-import-js builds use ReadStepFile(buffer) with a single argument.
    try {
      result = occt.ReadStepFile(fileBuffer);
    } catch {
      // Keep compatibility with builds that accept (buffer, filename).
      result = occt.ReadStepFile(fileBuffer, 'model.step');
    }

    const transferables = [];
    const meshes = Array.isArray(result?.meshes) ? result.meshes : [];
    const rawMeshes = meshes.map((mesh, index) => ({
      name: mesh?.name || `Part ${index + 1}`,
      position: toFloat32Array(mesh?.attributes?.position?.array),
      normal: toFloat32Array(mesh?.attributes?.normal?.array),
      index: toUint32Array(mesh?.index?.array),
    }));

    const totalTriangles = rawMeshes.reduce((sum, mesh) => {
      if (mesh.index) return sum + Math.floor(mesh.index.length / 3);
      if (mesh.position) return sum + Math.floor(mesh.position.length / 9);
      return sum;
    }, 0);

    const targetPreviewTriangles = 450000;
    const previewStride =
      preview && totalTriangles > targetPreviewTriangles
        ? Math.max(2, Math.ceil(totalTriangles / targetPreviewTriangles))
        : 1;

    const normalizedMeshes = rawMeshes.map((mesh) => {
      let position = mesh.position;
      let normal = mesh.normal;
      let indexArray = mesh.index;

      if (previewStride > 1) {
        if (indexArray) {
          indexArray = decimateIndexedTriangles(indexArray, previewStride);
        } else {
          const decimated = decimateNonIndexedTriangles(position, normal, previewStride);
          position = decimated.position;
          normal = decimated.normal;
        }
      }

      if (position) transferables.push(position.buffer);
      if (normal) transferables.push(normal.buffer);
      if (indexArray) transferables.push(indexArray.buffer);

      return {
        name: mesh.name,
        position,
        normal,
        index: indexArray,
      };
    });

    self.postMessage(
      {
        id,
        success: true,
        result: {
          success: Boolean(result?.success),
          preview: Boolean(previewStride > 1),
          meshes: normalizedMeshes,
        },
      },
      transferables
    );
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'STEP parse failed',
    });
  }
};
