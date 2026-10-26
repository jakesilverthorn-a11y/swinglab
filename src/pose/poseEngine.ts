import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../types';

export type ModelVariant = 'lite' | 'full' | 'heavy';

const base = import.meta.env.BASE_URL;
/** Set at build time (VITE_BUNDLED=1) for a hosted build that ships the runtime and model next to the page. */
const BUNDLED = import.meta.env.VITE_BUNDLED === '1';
/** Some hosts only serve a fixed list of file types, so the model can ship as a JSON file holding it in base64 (VITE_MODEL_AS_JSON=1). */
const MODEL_AS_JSON = import.meta.env.VITE_MODEL_AS_JSON === '1';
/** Resolves a bundled file against the page, so the app also works from a sub-folder or a relative base. */
const local = (path: string) => new URL(`${base}${path}`, document.baseURI).href;
const WASM_LOCAL = local('mediapipe/wasm');
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${__MEDIAPIPE_VERSION__}/wasm`;
const modelLocal = (v: ModelVariant) => local(`models/pose_landmarker_${v}.task`);
const modelCdn = (v: ModelVariant) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`;

/**
 * Explains why pose tracking cannot run in this page, or returns null when it can. A host page can forbid
 * WebAssembly through its content security policy, which would otherwise show up only as a cryptic failure mid-analysis.
 */
export function runtimeProblem(): string | null {
  if (typeof WebAssembly === 'undefined') return 'This browser does not support WebAssembly, which pose tracking needs.';
  try {
    // The smallest valid module: the 8-byte header.
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch {
    return 'This page is not allowed to run WebAssembly, which pose tracking needs, so videos cannot be analyzed here. The demo swing still works. Open the app from another place (for example the copy running on your computer).';
  }
  return null;
}

async function loadModelFromJson(variant: ModelVariant): Promise<Uint8Array> {
  const res = await fetch(local(`models/pose_landmarker_${variant}.json`));
  if (!res.ok) throw new Error(`The pose model could not be loaded (HTTP ${res.status}).`);
  const { b64 } = (await res.json()) as { b64: string };
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** True when a real file (not the dev server's HTML fallback) exists at the URL. */
async function isRealFile(url: string, minBytes: number): Promise<boolean> {
  if (BUNDLED) return true;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return false;
    return Number(res.headers.get('content-length') ?? minBytes) >= minBytes;
  } catch {
    return false;
  }
}

/** Thin wrapper around the MediaPipe Pose Landmarker running in the browser (WebAssembly, GPU when available). */
export class PoseEngine {
  /** True once the current landmarker has seen a frame, so the next clip needs a fresh one. */
  private used = false;
  private lastTimestamp = 0;

  private constructor(
    private landmarker: PoseLandmarker,
    /** The delegate that is running now; a rebuild keeps using the one that worked. */
    public delegate: 'GPU' | 'CPU',
    readonly variant: ModelVariant,
    private readonly build: (delegate: 'GPU' | 'CPU') => Promise<PoseLandmarker>,
  ) {}

  static async create(variant: ModelVariant, onStatus?: (message: string) => void): Promise<PoseEngine> {
    onStatus?.('Loading the pose runtime…');
    const wasmBase = (await isRealFile(`${WASM_LOCAL}/vision_wasm_internal.wasm`, 1_000_000)) ? WASM_LOCAL : WASM_CDN;
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);

    onStatus?.('Loading the pose model…');
    // A JSON-packaged model ships only the full variant.
    const chosen: ModelVariant = MODEL_AS_JSON ? 'full' : variant;
    const modelSource = MODEL_AS_JSON
      ? { modelAssetBuffer: await loadModelFromJson(chosen) }
      : { modelAssetPath: (await isRealFile(modelLocal(chosen), 1_000_000)) ? modelLocal(chosen) : modelCdn(chosen) };
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { ...modelSource, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return new PoseEngine(await make('GPU'), 'GPU', variant, make);
    } catch (err) {
      console.warn('GPU delegate unavailable, falling back to CPU.', err);
      return new PoseEngine(await make('CPU'), 'CPU', variant, make);
    }
  }

  /**
   * Gets the engine ready for a new clip. MediaPipe's video mode needs timestamps that only ever increase and it
   * carries tracking state from frame to frame, so a landmarker that has already followed one clip is replaced
   * with a fresh one. Without this, the second swing analyzed in a session fails with a "timestamp mismatch".
   */
  async startClip(): Promise<void> {
    if (this.used) {
      this.landmarker.close();
      try {
        this.landmarker = await this.build(this.delegate);
      } catch (err) {
        if (this.delegate === 'CPU') throw err;
        console.warn('GPU delegate unavailable, falling back to CPU.', err);
        this.delegate = 'CPU';
        this.landmarker = await this.build('CPU');
      }
    }
    this.used = false;
    this.lastTimestamp = 0;
  }

  /** Detects the pose in the video's current frame. Timestamps must increase between calls. */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null {
    // Never hand MediaPipe a timestamp that is not later than the previous one: it aborts the whole graph.
    const ts = Math.max(timestampMs, this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    this.used = true;
    const result = this.landmarker.detectForVideo(video, ts);
    const lm = result.landmarks[0];
    if (!lm) return null;
    return lm.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.visibility ?? 0 }));
  }

  close(): void {
    this.landmarker.close();
  }
}

let cached: PoseEngine | null = null;

/** Returns a shared engine, recreating it when the model variant changes. */
export async function getEngine(variant: ModelVariant, onStatus?: (message: string) => void): Promise<PoseEngine> {
  if (cached && cached.variant === variant) return cached;
  cached?.close();
  cached = null;
  cached = await PoseEngine.create(variant, onStatus);
  return cached;
}
