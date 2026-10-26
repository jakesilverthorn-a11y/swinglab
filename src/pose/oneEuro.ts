// One Euro filter (Casiez et al., 2012): low jitter when a point is still, low lag when it moves fast.

class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last(): number | null {
    return this.y;
  }
}

export class OneEuroFilter {
  private readonly x = new LowPass();
  private readonly dx = new LowPass();
  private lastT: number | null = null;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 3.0,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, t: number): number {
    if (this.lastT === null) {
      this.lastT = t;
      this.x.filter(value, 1);
      this.dx.filter(0, 1);
      return value;
    }
    const dt = Math.max(t - this.lastT, 1e-6);
    this.lastT = t;
    const prev = this.x.last() ?? value;
    const rawDx = (value - prev) / dt;
    const edx = this.dx.filter(rawDx, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }
}

/**
 * Smooths a whole track offline. Runs the filter forward and backward and averages
 * the two passes, which cancels the lag a single causal pass would add and so keeps
 * the timing of the top of the backswing and impact accurate.
 */
export function smoothTrack(values: number[], times: number[], minCutoff = 1.2, beta = 3.0): number[] {
  const n = values.length;
  if (n < 3) return [...values];
  const fwd = new OneEuroFilter(minCutoff, beta);
  const f = values.map((v, i) => fwd.filter(v, times[i]));
  const bwd = new OneEuroFilter(minCutoff, beta);
  const b = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) b[i] = bwd.filter(values[i], -times[i]);
  return f.map((v, i) => (v + b[i]) / 2);
}
