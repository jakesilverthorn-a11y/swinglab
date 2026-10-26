import { describe, expect, it } from 'vitest';
import { analyzeSwing } from '../analysis/analyze';
import { generateSwing, type SyntheticOptions } from '../demo/syntheticSwing';
import { DRILLS, DRILL_BY_ID } from './drills';
import { templateCoach, faultFrequency } from './templateCoach';
import { buildCoachPayload, parseCoachReply } from './claudeCoach';
import { FAULT_DEFS } from '../analysis/faults';
import type { SwingRecord } from '../types';

function analyze(opts: Partial<SyntheticOptions> & { view: SyntheticOptions['view'] }) {
  const o: SyntheticOptions = { handedness: 'left', fps: 120, ...opts };
  const swing = generateSwing(o);
  return analyzeSwing(swing.frames, swing.aspect, { handedness: o.handedness, view: o.view, analysisFps: o.fps, slowMo: 1 });
}

const record = (analysis: ReturnType<typeof analyze>, createdAt: number): SwingRecord => ({
  id: String(createdAt),
  createdAt,
  label: 'x',
  hasClip: false,
  analysis,
});

describe('drill library', () => {
  it('covers every fault the app can detect', () => {
    for (const def of FAULT_DEFS) {
      expect(def.drillIds.length).toBeGreaterThan(0);
      for (const id of def.drillIds) expect(DRILL_BY_ID[id], `${def.id} -> ${id}`).toBeDefined();
    }
  });

  it('has unique ids and usable steps', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const d of DRILLS) {
      expect(d.steps.length).toBeGreaterThanOrEqual(2);
      expect(d.faultIds.length).toBeGreaterThan(0);
    }
  });
});

describe('template coach', () => {
  it('reports no major faults for a clean swing', () => {
    const note = templateCoach(analyze({ view: 'face-on' }));
    expect(note.headline).toMatch(/No major faults/);
    expect(note.priority).toBeUndefined();
    expect(note.drillIds).toEqual([]);
  });

  it('prioritizes the top fault and recommends real drills', () => {
    const note = templateCoach(analyze({ view: 'down-the-line', faults: { thrust: 0.4 } }));
    expect(note.priority?.faultId).toBe('early-extension');
    expect(note.drillIds).toContain('chair-wall');
    expect(note.drillIds.length).toBeLessThanOrEqual(3);
    for (const id of note.drillIds) expect(DRILL_BY_ID[id]).toBeDefined();
    expect(note.priority?.explanation).toMatch(/torso length/);
  });

  it('mentions how often a fault shows up in saved swings', () => {
    const faulty = analyze({ view: 'down-the-line', faults: { thrust: 0.4 } });
    const history = [record(faulty, 3), record(faulty, 2), record(analyze({ view: 'down-the-line' }), 1)];
    expect(faultFrequency(history, 'early-extension')).toEqual({ seen: 2, of: 3 });
    const note = templateCoach(faulty, history);
    expect(note.priority?.explanation).toMatch(/2 of your last 3 saved swings/);
  });

  it('flags experimental measurements and unavailable angles in the caveats', () => {
    const note = templateCoach(analyze({ view: 'down-the-line', faults: { overTheTop: 0.5 } }));
    expect(note.priority?.faultId).toBe('over-the-top');
    expect(note.caveats.join(' ')).toMatch(/rough 2D estimate/);
    expect(note.caveats.join(' ')).toMatch(/face-on clip/);
  });
});

describe('Claude coach', () => {
  it('sends only a small metrics summary, never landmarks', () => {
    const result = analyze({ view: 'down-the-line', faults: { thrust: 0.4 } });
    const json = JSON.stringify(buildCoachPayload(result, []));
    expect(json).not.toMatch(/"frames"|"lm"|"landmarks"/);
    expect(json.length).toBeLessThan(10_000);
    expect(json).toMatch(/early-extension/);
  });

  it('validates the reply and drops unknown ids', () => {
    const note = parseCoachReply({
      headline: 'Keep your hips back.',
      priority: { faultId: 'early-extension', explanation: 'Your hips move 40% toward the ball.' },
      drillIds: ['chair-wall', 'made-up-drill', 'rod-spine'],
      positives: ['Tempo is in range.', 42],
      caveats: [],
    });
    expect(note.source).toBe('claude');
    expect(note.drillIds).toEqual(['chair-wall', 'rod-spine']);
    expect(note.positives).toEqual(['Tempo is in range.']);
    expect(note.priority?.faultId).toBe('early-extension');
  });

  it('ignores an unknown priority fault and rejects replies without a headline', () => {
    expect(parseCoachReply({ headline: 'Hi', priority: { faultId: 'nope', explanation: 'x' } }).priority).toBeUndefined();
    expect(() => parseCoachReply({ priority: null })).toThrow();
    expect(() => parseCoachReply('text')).toThrow();
  });
});
