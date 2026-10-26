import { describe, expect, it } from 'vitest';
import { analyzeSwing, AnalysisError } from './analyze';
import { generateSwing, type SyntheticFaults, type SyntheticOptions } from '../demo/syntheticSwing';
import type { AnalysisSettings, FaultId, MetricId, PoseFrame } from '../types';
import { detectPhases, detectPhasesByHeight } from './phases';
import { smoothFrames, toSkeleton } from './skeleton';
import { LM } from './landmarks';

function run(opts: Partial<SyntheticOptions> & { view: SyntheticOptions['view'] }, settings?: Partial<AnalysisSettings>) {
  const o: SyntheticOptions = { handedness: 'left', fps: 60, ...opts };
  const swing = generateSwing(o);
  const s: AnalysisSettings = {
    handedness: o.handedness,
    view: o.view,
    analysisFps: o.fps,
    slowMo: 1,
    ...settings,
  };
  return { swing, result: analyzeSwing(swing.frames, swing.aspect, s) };
}

const metric = (r: ReturnType<typeof run>['result'], id: MetricId) => r.metrics.find((m) => m.id === id)!;

describe('phase detection', () => {
  for (const fps of [30, 60, 120]) {
    for (const handedness of ['left', 'right'] as const) {
      for (const view of ['face-on', 'down-the-line'] as const) {
        it(`finds takeaway, top and impact (${view}, ${handedness}, ${fps} fps)`, () => {
          const { swing, result } = run({ view, handedness, fps });
          const tol = Math.ceil(0.06 * fps); // 60 ms
          // The takeaway is extrapolated back from two displacement crossings, so it should not read late.
          expect(Math.abs(result.phases.takeaway - swing.truth.takeaway)).toBeLessThanOrEqual(tol);
          expect(Math.abs(result.phases.top - swing.truth.top)).toBeLessThanOrEqual(tol);
          expect(Math.abs(result.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(tol);
          expect(result.phases.finish).toBeGreaterThan(result.phases.impact);
        });
      }
    }
  }

  it('stays accurate with landmark noise', () => {
    const { swing, result } = run({ view: 'face-on', fps: 120, noise: 0.003, seed: 7 });
    expect(Math.abs(result.phases.top - swing.truth.top)).toBeLessThanOrEqual(8);
    expect(Math.abs(result.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(8);
  });

  it('gives the same phases for portrait and landscape video', () => {
    const land = run({ view: 'down-the-line', fps: 60, aspect: 16 / 9 }).result;
    const port = run({ view: 'down-the-line', fps: 60, aspect: 9 / 16 }).result;
    expect(port.phases.top).toBe(land.phases.top);
    expect(port.phases.impact).toBe(land.phases.impact);
  });

  it('rejects a clip with no swing in it', () => {
    const swing = generateSwing({ view: 'face-on', handedness: 'left', fps: 60, backswing: 100, downswing: 100, follow: 100 });
    const still = swing.frames.slice(0, 60);
    expect(() =>
      analyzeSwing(still, swing.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 }),
    ).toThrow(AnalysisError);
  });
});

/** Moves both wrists far from the golfer for `count` frames starting just before the top, as when the hands are hidden behind the head. */
function loseWristsAtTop(frames: PoseFrame[], top: number, count: number, jump = 0.3): PoseFrame[] {
  return frames.map((f, i) =>
    i >= top - 1 && i < top - 1 + count
      ? {
          ...f,
          lm: f.lm!.map((l, k) => (k === LM.L_WRIST || k === LM.R_WRIST ? { ...l, x: l.x + (jump * 0.5) / 1.7778, y: l.y - jump } : l)),
        }
      : f,
  );
}

describe('swings that are hard to track', () => {
  for (const view of ['face-on', 'down-the-line'] as const) {
    for (const fps of [60, 120]) {
      it(`still finds the swing when the wrists are lost for 4 frames at the top (${view}, ${fps} fps)`, () => {
        const swing = generateSwing({ view, handedness: 'left', fps, noise: 0.002, seed: 3 });
        const frames = loseWristsAtTop(swing.frames, swing.truth.top, Math.round((4 * fps) / 60));
        const result = analyzeSwing(frames, swing.aspect, { handedness: 'left', view, analysisFps: fps, slowMo: 1 });
        const tol = Math.ceil(0.06 * fps);
        expect(Math.abs(result.phases.top - swing.truth.top)).toBeLessThanOrEqual(tol);
        expect(Math.abs(result.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(tol);
      });
    }

    it(`finds the same swing when the follow-through is faster than the downswing (${view})`, () => {
      const { swing, result } = run({ view, fps: 60, noise: 0.002, seed: 3, follow: 0.12 });
      expect(Math.abs(result.phases.top - swing.truth.top)).toBeLessThanOrEqual(4);
      expect(Math.abs(result.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(4);
    });
  }

  for (const view of ['face-on', 'down-the-line'] as const) {
    for (const fps of [30, 60, 120]) {
      it(`locates top and impact from the height of the hands alone (${view}, ${fps} fps)`, () => {
        const swing = generateSwing({ view, handedness: 'left', fps, noise: 0.002, seed: 5 });
        const sk = toSkeleton(smoothFrames(swing.frames, swing.aspect, 1).frames, swing.aspect);
        const found = detectPhasesByHeight(sk, 1);
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        const tol = Math.ceil(0.08 * fps);
        expect(Math.abs(found.phases.top - swing.truth.top)).toBeLessThanOrEqual(tol);
        expect(Math.abs(found.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(tol);
      });
    }
  }

  it('falls back to the height of the hands when raw hand speed cannot find the top', () => {
    // Skip the wrist clean-up on purpose: four wrong frames at the top then make a speed spike next to the top.
    const swing = generateSwing({ view: 'down-the-line', handedness: 'left', fps: 60, noise: 0.002, seed: 3 });
    const frames = loseWristsAtTop(swing.frames, swing.truth.top, 4);
    const sk = toSkeleton(frames, swing.aspect);
    const found = detectPhases(sk, 1);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(Math.abs(found.phases.top - swing.truth.top)).toBeLessThanOrEqual(4);
    expect(Math.abs(found.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(4);
  });

  it('still reports a clip that has no swing in it', () => {
    const swing = generateSwing({ view: 'down-the-line', handedness: 'left', fps: 60, backswing: 100, downswing: 100, follow: 100 });
    const sk = toSkeleton(swing.frames.slice(0, 90), swing.aspect);
    expect(detectPhases(sk, 1).ok).toBe(false);
  });
});

describe('real-world capture', () => {
  const near = (a: number, b: number, fps: number, ms = 60) => Math.abs(a - b) <= Math.ceil((ms / 1000) * fps);

  for (const view of ['face-on', 'down-the-line'] as const) {
    it(`ignores a waggle and a walk-in before the address (${view})`, () => {
      const { swing, result } = run({ view, fps: 60, waggle: 0.03, walkIn: 0.8, idle: 1.8, noise: 0.002, seed: 6 });
      expect(near(result.phases.takeaway, swing.truth.takeaway, 60)).toBe(true);
      expect(near(result.phases.top, swing.truth.top, 60)).toBe(true);
      expect(near(result.phases.impact, swing.truth.impact, 60)).toBe(true);
      expect(metric(result, 'tempo').value!).toBeGreaterThan(2.6);
      expect(metric(result, 'tempo').value!).toBeLessThan(3.4);
      expect(result.faults.map((f) => f.id)).toEqual([]);
      expect(result.quality.warnings.join(' ')).not.toMatch(/moving before the takeaway/);
    });
  }

  it('keeps the address baseline in the still stretch, not in the waggle', () => {
    const { swing, result } = run({ view: 'face-on', fps: 60, waggle: 0.04, idle: 1.6, settle: 0.4 });
    const [a, b] = result.addrWindow;
    expect(b).toBeGreaterThanOrEqual(swing.truth.takeaway - 6);
    expect(b).toBeLessThanOrEqual(swing.truth.takeaway + 1);
    expect(a).toBeGreaterThan(Math.round((1.6 - 0.4) * 60) - 12);
  });

  it('is not thrown off by a few glitch frames around impact', () => {
    const swing = generateSwing({ view: 'face-on', handedness: 'left', fps: 60, noise: 0.002, seed: 3 });
    const bad = new Set([swing.truth.impact - 2, swing.truth.impact - 1, swing.truth.top + 3]);
    const frames = swing.frames.map((f, i) =>
      bad.has(i) ? { ...f, lm: f.lm!.map((l, k) => (k === 15 || k === 16 ? { ...l, x: 0.95, y: 0.9 } : l)) } : f,
    );
    const r = analyzeSwing(frames, swing.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 });
    expect(near(r.phases.top, swing.truth.top, 60)).toBe(true);
    expect(near(r.phases.impact, swing.truth.impact, 60)).toBe(true);
    expect(metric(r, 'tempo').value!).toBeGreaterThan(2.5);
    expect(metric(r, 'tempo').value!).toBeLessThan(3.5);
  });

  it('keeps tempo within about 10% across frame rates', () => {
    for (const fps of [60, 120]) {
      for (const view of ['face-on', 'down-the-line'] as const) {
        const { result } = run({ view, fps, noise: 0.002, seed: 9 });
        expect(Math.abs(metric(result, 'tempo').value! - 3)).toBeLessThan(0.35);
      }
    }
  });

  it('warns when the clip contains more than one swing', () => {
    const a = generateSwing({ view: 'face-on', handedness: 'left', fps: 60 });
    const b = generateSwing({ view: 'face-on', handedness: 'left', fps: 60 });
    // The golfer resets between swings, so blend smoothly from the finish back to address instead of cutting.
    const last = a.frames[a.frames.length - 1];
    const first = b.frames[0];
    const blend = Array.from({ length: 90 }, (_, k) => {
      const w = (k + 1) / 91;
      return {
        t: last.t + (k + 1) / 60,
        lm: last.lm!.map((l, j) => ({ x: l.x + (first.lm![j].x - l.x) * w, y: l.y + (first.lm![j].y - l.y) * w, z: 0, v: 0.95 })),
      };
    });
    const offset = last.t + 91 / 60;
    const frames = [...a.frames, ...blend, ...b.frames.map((f) => ({ ...f, t: f.t + offset }))];
    const r = analyzeSwing(frames, a.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 });
    expect(r.quality.warnings.join(' ')).toMatch(/more than one swing/);
  });

  it('warns when the handedness setting contradicts the clip', () => {
    for (const view of ['face-on', 'down-the-line'] as const) {
      const swing = generateSwing({ view, handedness: 'right', fps: 60 });
      const wrong = analyzeSwing(swing.frames, swing.aspect, { handedness: 'left', view, analysisFps: 60, slowMo: 1 });
      expect(wrong.quality.warnings.join(' '), view).toMatch(/handedness/);
      const right = analyzeSwing(swing.frames, swing.aspect, { handedness: 'right', view, analysisFps: 60, slowMo: 1 });
      expect(right.quality.warnings.join(' '), view).not.toMatch(/handedness/);
    }
  });

  it('passes the native frame spacing and capture warnings through', () => {
    const swing = generateSwing({ view: 'face-on', handedness: 'left', fps: 60 });
    const r = analyzeSwing(swing.frames, swing.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 }, { nativeInterval: 1 / 120, warnings: ['Clip timing changes partway through.'] });
    expect(r.nativeInterval).toBeCloseTo(1 / 120, 6);
    expect(r.quality.warnings[0]).toBe('Clip timing changes partway through.');
    expect(r.quality.level).toBe('fair');
    expect(r.addrWindow[1]).toBe(r.phases.takeaway);
  });
});

describe('metrics on a clean swing', () => {
  for (const handedness of ['left', 'right'] as const) {
    it(`reports tempo near 3:1 and raises no faults (face-on, ${handedness})`, () => {
      const { result } = run({ view: 'face-on', handedness, fps: 120 });
      expect(metric(result, 'tempo').value).toBeCloseTo(3, 0);
      expect(result.faults.map((f) => f.id)).toEqual([]);
      expect(metric(result, 'spineAngle').status).toBe('unavailable');
    });

    it(`raises no faults (down-the-line, ${handedness})`, () => {
      const { result } = run({ view: 'down-the-line', handedness, fps: 120 });
      expect(result.faults.map((f) => f.id)).toEqual([]);
      expect(metric(result, 'headSway').status).toBe('unavailable');
      expect(metric(result, 'handPath').value).toBeLessThan(0.05);
    });
  }

  it('scales durations by the slow-motion factor', () => {
    const { result } = run({ view: 'face-on', fps: 60, backswing: 3.6, downswing: 1.2, follow: 1.4, hold: 3.2 }, { slowMo: 4 });
    // The takeaway is threshold-based, so the backswing reads slightly short; the downswing is exact.
    expect(Math.abs(result.durations.backswing - 0.9)).toBeLessThan(0.1);
    expect(Math.abs(result.durations.downswing - 0.3)).toBeLessThan(0.05);
    expect(metric(result, 'tempo').value).toBeCloseTo(3, 0);
  });
});

describe('fault detection', () => {
  const cases: Array<{
    name: string;
    view: SyntheticOptions['view'];
    faults?: SyntheticFaults;
    timing?: Partial<SyntheticOptions>;
    expected: FaultId;
  }> = [
    { name: 'head sway', view: 'face-on', faults: { sway: 0.8 }, expected: 'sway' },
    { name: 'hip slide', view: 'face-on', faults: { slide: 0.9 }, expected: 'slide' },
    { name: 'hanging back', view: 'face-on', faults: { hangBack: 1.3 }, expected: 'hang-back' },
    { name: 'standing up', view: 'down-the-line', faults: { standUp: 14 }, expected: 'stand-up' },
    { name: 'early extension', view: 'down-the-line', faults: { thrust: 0.4 }, expected: 'early-extension' },
    { name: 'over the top', view: 'down-the-line', faults: { overTheTop: 0.45 }, expected: 'over-the-top' },
    { name: 'bent lead arm', view: 'face-on', faults: { leadArmBend: 55 }, expected: 'lead-arm-collapse' },
    { name: 'rushed transition', view: 'face-on', timing: { backswing: 1.0, downswing: 0.2 }, expected: 'tempo' },
    { name: 'hurried backswing', view: 'face-on', timing: { backswing: 0.5, downswing: 0.3 }, expected: 'tempo' },
  ];

  for (const c of cases) {
    for (const handedness of ['left', 'right'] as const) {
      it(`detects ${c.name} (${handedness})`, () => {
        const { result } = run({ view: c.view, handedness, fps: 120, faults: c.faults, ...c.timing });
        expect(result.faults.map((f) => f.id)).toContain(c.expected);
        expect(result.faults[0].id).toBe(c.expected);
        expect(result.faults[0].summary.length).toBeGreaterThan(10);
        expect(result.faults[0].drillIds.length).toBeGreaterThan(0);
      });
    }
  }

  it('ranks early extension above tempo when both are present', () => {
    const { result } = run({ view: 'down-the-line', fps: 120, faults: { thrust: 0.4 }, backswing: 1.0, downswing: 0.2 });
    const ids = result.faults.map((f) => f.id);
    expect(ids[0]).toBe('early-extension');
    expect(ids).toContain('tempo');
  });
});

describe('precision and confidence', () => {
  it('reports lower tempo confidence at 30 fps than at 120 fps', () => {
    const lo = metric(run({ view: 'face-on', fps: 30 }).result, 'tempo').confidence;
    const hi = metric(run({ view: 'face-on', fps: 120 }).result, 'tempo').confidence;
    expect(lo).toBeLessThan(hi);
  });

  it('warns about low frame rates', () => {
    const { result } = run({ view: 'face-on', fps: 30 });
    expect(result.quality.warnings.join(' ')).toMatch(/frames per second/);
    expect(result.quality.level).toBe('fair');
  });

  it('survives dropped pose frames', () => {
    const swing = generateSwing({ view: 'face-on', handedness: 'left', fps: 60 });
    const frames = swing.frames.map((f, i) => (i % 9 === 4 ? { ...f, lm: null } : f));
    const r = analyzeSwing(frames, swing.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 });
    expect(Math.abs(r.phases.impact - swing.truth.impact)).toBeLessThanOrEqual(4);
  });
});
