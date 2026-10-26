import { describe, expect, it } from 'vitest';
import { scoreMetrics } from './score';
import { analyzeSwing } from './analyze';
import { generateSwing } from '../demo/syntheticSwing';
import type { MetricResult, MetricStatus } from '../types';

const m = (status: MetricStatus, confidence = 1): MetricResult => ({
  id: 'tempo',
  label: 'Tempo',
  description: '',
  views: 'any',
  value: status === 'unavailable' ? null : 1,
  unit: '',
  display: '',
  status,
  confidence,
  target: '',
});

describe('swing score', () => {
  it('is 100 when every measured check is in range', () => {
    const s = scoreMetrics([m('good'), m('good'), m('unavailable')])!;
    expect(s.value).toBe(100);
    expect(s.inRange).toBe(2);
    expect(s.measured).toBe(2);
    expect(s.tone).toBe('good');
  });

  it('drops as checks fall out of range', () => {
    const allGood = scoreMetrics([m('good'), m('good'), m('good'), m('good')])!.value;
    const oneWarn = scoreMetrics([m('good'), m('good'), m('good'), m('warn')])!.value;
    const oneBad = scoreMetrics([m('good'), m('good'), m('good'), m('bad')])!.value;
    expect(oneWarn).toBeLessThan(allGood);
    expect(oneBad).toBeLessThan(oneWarn);
  });

  it('counts a low-confidence check for less than a confident one', () => {
    const confidentBad = scoreMetrics([m('good'), m('bad', 1)])!.value;
    const shakyBad = scoreMetrics([m('good'), m('bad', 0.3)])!.value;
    expect(shakyBad).toBeGreaterThan(confidentBad);
  });

  it('returns null when nothing could be measured', () => {
    expect(scoreMetrics([m('unavailable')])).toBeNull();
    expect(scoreMetrics([])).toBeNull();
  });

  it('scores a clean synthetic swing higher than one with several faults', () => {
    const run = (faults: Parameters<typeof generateSwing>[0]['faults']) => {
      const swing = generateSwing({ view: 'face-on', handedness: 'left', fps: 60, faults });
      const r = analyzeSwing(swing.frames, swing.aspect, { handedness: 'left', view: 'face-on', analysisFps: 60, slowMo: 1 });
      return scoreMetrics(r.metrics)!.value;
    };
    expect(run(undefined)).toBeGreaterThan(run({ slide: 0.8, hangBack: 1.1 }));
  });
});
