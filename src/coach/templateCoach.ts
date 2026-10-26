import type { AnalysisResult, CoachNote, FaultId, SwingRecord } from '../types';
import { DRILL_BY_ID } from './drills';

/** How often a fault appeared in the most recent saved swings (excluding the current one). */
export function faultFrequency(history: SwingRecord[], faultId: FaultId, window = 5): { seen: number; of: number } {
  const recent = history.slice(0, window);
  const seen = recent.filter((r) => r.analysis.faults.some((f) => f.id === faultId)).length;
  return { seen, of: recent.length };
}

/** Builds coaching feedback from the analysis alone: works offline, with no API key. */
export function templateCoach(result: AnalysisResult, history: SwingRecord[] = []): CoachNote {
  const [top, second] = result.faults;
  const positives = result.metrics
    .filter((m) => m.status === 'good' && m.confidence >= 0.5)
    .slice(0, 3)
    .map((m) => `${m.label} is in range (${m.display}).`);

  const caveats: string[] = [...result.quality.warnings];
  const unavailable = result.metrics.filter((m) => m.status === 'unavailable');
  if (unavailable.length > 0) {
    const other = result.settings.view === 'face-on' ? 'down-the-line' : 'face-on';
    caveats.push(`Some measurements need a ${other} clip too, so they are not shown for this swing.`);
  }

  if (!top) {
    return {
      source: 'template',
      headline: 'No major faults showed up from this camera angle.',
      drillIds: [],
      positives,
      caveats: [
        ...caveats,
        'This only covers what a single camera angle can measure. Film the other angle for a fuller picture.',
      ],
    };
  }

  const freq = faultFrequency(history, top.id);
  const trend =
    freq.of >= 2 ? ` It also showed up in ${freq.seen} of your last ${freq.of} saved swings.` : '';
  const topMetric = result.metrics.find((m) => m.id === top.metricId);
  if (topMetric?.experimental) {
    caveats.push(`${topMetric.label} is a rough 2D estimate. Check it against the annotated video before acting on it.`);
  }
  if (top.confidence < 0.6) {
    caveats.push(`Confidence in the ${top.label.toLowerCase()} reading is low (${Math.round(top.confidence * 100)}%).`);
  }

  const drillIds = [...top.drillIds.slice(0, 2)];
  if (second) {
    const extra = second.drillIds.find((id) => !drillIds.includes(id));
    if (extra && drillIds.length < 3) drillIds.push(extra);
  }

  return {
    source: 'template',
    headline: `Work on one thing first: ${top.label.toLowerCase()}.`,
    priority: { faultId: top.id, explanation: `${top.summary} ${top.why}${trend}` },
    drillIds: drillIds.filter((id) => DRILL_BY_ID[id]),
    positives,
    caveats,
  };
}
