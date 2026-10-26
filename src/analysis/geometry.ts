// Small 2D geometry helpers. All points are in "height units": x is scaled by the
// video aspect ratio so one unit is the same distance horizontally and vertically.

export interface Vec {
  x: number;
  y: number;
}

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const RAD = 180 / Math.PI;

/** Interior angle at b (degrees) formed by the segments b->a and b->c. */
export function angleAt(a: Vec, b: Vec, c: Vec): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const denom = len(u) * len(v);
  if (denom === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot(u, v) / denom));
  return Math.acos(cos) * RAD;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function medianVec(points: Vec[]): Vec {
  return { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)) };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
