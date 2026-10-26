import type { Landmark, PoseFrame } from '../types';
import { LANDMARK_COUNT, LM } from './landmarks';
import { median, type Vec } from './geometry';
import { smoothTrack } from '../pose/oneEuro';

/** Per-frame landmark positions in height units plus visibilities, ready for geometry. */
export interface Skeleton {
  /** Media time of each frame, seconds. */
  t: number[];
  /** p[frame][landmark] in height units (x scaled by the video aspect ratio). */
  p: Vec[][];
  /** v[frame][landmark] visibility 0..1. */
  v: number[][];
  aspect: number;
}

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

/** Linear interpolation over gaps; leading/trailing gaps hold the nearest valid value. */
function fillGaps(values: Array<number | null>): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (values[i] !== null) {
      const cur = values[i] as number;
      if (last === -1) {
        for (let j = 0; j < i; j++) out[j] = cur;
      } else if (i - last > 1) {
        const a = out[last];
        for (let j = last + 1; j < i; j++) out[j] = a + ((cur - a) * (j - last)) / (i - last);
      }
      out[i] = cur;
      last = i;
    }
  }
  if (last === -1) return out.fill(0);
  for (let j = last + 1; j < n; j++) out[j] = out[last];
  return out;
}

/**
 * Hampel-style outlier rejection: a sample is replaced by its neighborhood median when it
 * deviates by more than `floor` and by more than `k` robust standard deviations. Single-frame
 * pose glitches (a wrist jumping across the frame in a blurred impact frame) are removed, while
 * real fast motion, which moves smoothly across the window, is left alone.
 */
export function despike(values: number[], half = 3, floor = 0.02, k = 3): number[] {
  const n = values.length;
  const out = values.slice();
  for (let i = 0; i < n; i++) {
    const win = values.slice(Math.max(0, i - half), Math.min(n, i + half + 1));
    const med = median(win);
    const mad = median(win.map((v) => Math.abs(v - med))) * 1.4826;
    if (Math.abs(values[i] - med) > Math.max(floor, k * mad)) out[i] = med;
  }
  return out;
}

/**
 * Fills frames where pose detection failed, removes single-frame glitches, and smooths every
 * landmark track. Returns the smoothed frames (still in normalized image coordinates, so they can
 * be drawn straight onto the video) and the fraction of frames that had no detection.
 *
 * Filtering runs in height units and in real time (clip time divided by `slowMo`), so smoothing
 * behaves the same for landscape and portrait video and for slow-motion timelines.
 */
export function smoothFrames(
  raw: PoseFrame[],
  aspect = 1,
  slowMo = 1,
): { frames: PoseFrame[]; missingFraction: number } {
  const n = raw.length;
  const valid = raw.filter((f) => f.lm !== null).length;
  if (valid < 3) throw new AnalysisError('No person was detected in the clip. Check the framing and lighting.');
  const times = raw.map((f) => f.t / slowMo);
  // The wrists are the landmarks that go wrong for several frames in a row (hidden behind the head or body at the top of
  // the swing, or swapped with each other), so they get a wider outlier window: runs of wrong frames up to about 80 ms
  // are replaced by their neighbors. Everything else keeps the short window.
  const realDt = n > 1 ? (times[n - 1] - times[0]) / (n - 1) : 0.02;
  const wristHalf = Math.max(3, Math.ceil(0.07 / realDt));
  const halfFor = (k: number) => (k === LM.L_WRIST || k === LM.R_WRIST ? wristHalf : 3);

  const xs: number[][] = [];
  const ys: number[][] = [];
  const zs: number[][] = [];
  const vs: number[][] = [];
  for (let k = 0; k < LANDMARK_COUNT; k++) {
    const get = (sel: (l: Landmark) => number) => raw.map((f) => (f.lm ? sel(f.lm[k]) : null));
    const half = halfFor(k);
    const x = smoothTrack(despike(fillGaps(get((l) => l.x * aspect)), half), times);
    xs.push(x.map((v) => v / aspect));
    ys.push(smoothTrack(despike(fillGaps(get((l) => l.y)), half), times));
    zs.push(fillGaps(get((l) => l.z)));
    vs.push(fillGaps(get((l) => l.v)));
  }

  const frames: PoseFrame[] = raw.map((f, i) => ({
    t: f.t,
    lm: Array.from({ length: LANDMARK_COUNT }, (_, k) => ({ x: xs[k][i], y: ys[k][i], z: zs[k][i], v: vs[k][i] })),
  }));
  return { frames, missingFraction: (n - valid) / n };
}

export function toSkeleton(frames: PoseFrame[], aspect: number): Skeleton {
  const t: number[] = [];
  const p: Vec[][] = [];
  const v: number[][] = [];
  for (const f of frames) {
    if (!f.lm) throw new AnalysisError('Internal error: frames must be gap-filled before analysis.');
    t.push(f.t);
    p.push(f.lm.map((l) => ({ x: l.x * aspect, y: l.y })));
    v.push(f.lm.map((l) => l.v));
  }
  return { t, p, v, aspect };
}
