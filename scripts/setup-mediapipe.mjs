// Copies the MediaPipe WASM runtime into public/ and downloads the pose model,
// so the app runs fully offline after the first install. Failures are non-fatal:
// the app falls back to the CDN at runtime (see src/pose/poseEngine.ts).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('[setup] copied MediaPipe WASM runtime to public/mediapipe/wasm');
} else {
  console.warn('[setup] MediaPipe package not found; run npm install first.');
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const modelDst = join(root, 'public/models/pose_landmarker_full.task');

if (!existsSync(modelDst)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelDst), { recursive: true });
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
    console.log('[setup] downloaded pose_landmarker_full.task');
  } catch (err) {
    console.warn(
      `[setup] could not download the pose model (${err}). The app will load it from the CDN at runtime instead.`,
    );
  }
}
