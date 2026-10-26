import type { AnalysisResult, MetricResult, MetricStatus } from '../types';

/** How much of a metric's weight counts toward the score for each grade. */
const CREDIT: Record<Exclude<MetricStatus, 'unavailable'>, number> = {
  good: 1,
  warn: 0.55,
  bad: 0.15,
};

export type ScoreTone = 'good' | 'warn' | 'bad';

export interface SwingScore {
  /** 0 to 100. */
  value: number;
  /** Measured checks that landed in range. */
  inRange: number;
  /** Checks the camera angle could measure. */
  measured: number;
  tone: ScoreTone;
  label: string;
}

/**
 * One number that summarizes a swing: the share of measured checks that are in range, weighted by how
 * confident the pose tracking was in each one. It restates the app's own thresholds and is not a validated
 * rating, so the app always shows it next to the individual measurements. Returns null when nothing was measured.
 */
export function scoreMetrics(metrics: MetricResult[]): SwingScore | null {
  let weighted = 0;
  let weights = 0;
  let inRange = 0;
  let measured = 0;
  for (const m of metrics) {
    if (m.status === 'unavailable') continue;
    measured++;
    if (m.status === 'good') inRange++;
    const w = Math.max(0.3, Math.min(1, m.confidence));
    weighted += w * CREDIT[m.status];
    weights += w;
  }
  if (measured === 0 || weights === 0) return null;
  const value = Math.round((weighted / weights) * 100);
  const tone: ScoreTone = value >= 70 ? 'good' : value >= 50 ? 'warn' : 'bad';
  const label = value >= 85 ? 'Strong' : value >= 70 ? 'Solid' : value >= 50 ? 'Developing' : 'Needs work';
  return { value, inRange, measured, tone, label };
}

export function swingScore(analysis: AnalysisResult): SwingScore | null {
  return scoreMetrics(analysis.metrics);
}
