import type { Fault, FaultId, MetricId, MetricResult } from '../types';
import { THRESHOLDS, grade } from './metrics';

interface FaultDef {
  id: FaultId;
  metricId: MetricId;
  label: string;
  /** How directly the fault affects ball striking; used to rank faults. */
  weight: number;
  why: string;
  drillIds: string[];
  summary: (value: number) => string;
}

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;

export const FAULT_DEFS: FaultDef[] = [
  {
    id: 'early-extension',
    metricId: 'hipThrust',
    label: 'Early extension',
    weight: 1.0,
    why: 'Thrusting the hips toward the ball crowds the arms and often leads to blocks, hooks, or thin shots.',
    drillIds: ['chair-wall', 'rod-spine'],
    summary: (v) => `Your hips move ${pct(v)} of your torso length toward the ball by impact.`,
  },
  {
    id: 'stand-up',
    metricId: 'spineAngle',
    label: 'Standing up through impact',
    weight: 0.95,
    why: 'Losing your posture through impact changes your distance from the ball, which tends to cause thin or off-center strikes.',
    drillIds: ['rod-spine', 'chair-wall'],
    summary: (v) => `Your spine tilt drops by ${Math.abs(Math.round(v))}° between address and impact.`,
  },
  {
    id: 'over-the-top',
    metricId: 'handPath',
    label: 'Over the top',
    weight: 0.9,
    why: 'An outside-in downswing often produces pulls and slices because the club approaches from outside the target line.',
    drillIds: ['pump', 'headcover-outside'],
    summary: (v) => `In mid-downswing your hands sit ${pct(v)} of torso length outside the address plane line.`,
  },
  {
    id: 'slide',
    metricId: 'hipSlide',
    label: 'Hip slide',
    weight: 0.8,
    why: 'Sliding instead of rotating tends to stall the turn through impact and makes the face harder to control.',
    drillIds: ['trail-hip-wall'],
    summary: (v) => `Your hips move ${pct(v)} of a shoulder width toward the target by impact.`,
  },
  {
    id: 'tempo',
    metricId: 'tempo',
    label: 'Tempo',
    weight: 0.75,
    why: 'A consistent ratio between backswing and downswing lets the body lead the downswing and makes timing repeatable.',
    drillIds: ['count-3-1', 'feet-together'],
    summary: (v) =>
      v > 3.6
        ? `Your tempo is ${v.toFixed(1)} : 1, so the downswing is very quick compared with the backswing.`
        : `Your tempo is ${v.toFixed(1)} : 1, so the backswing is quick compared with the downswing.`,
  },
  {
    id: 'sway',
    metricId: 'headSway',
    label: 'Head sway',
    weight: 0.7,
    why: 'Moving away from the target in the backswing makes it harder to return to the ball consistently, and usually costs strike quality.',
    drillIds: ['head-wall'],
    summary: (v) => `Your head moves ${pct(v)} of a shoulder width away from the target in the backswing.`,
  },
  {
    id: 'hang-back',
    metricId: 'finishBalance',
    label: 'Hanging back',
    weight: 0.65,
    why: 'Finishing with your weight on the trail foot usually means your weight did not transfer to the lead side through impact.',
    drillIds: ['finish-hold'],
    summary: (v) => `At the finish your hips sit ${pct(v)} of a shoulder width behind your lead foot.`,
  },
  {
    id: 'lead-arm-collapse',
    metricId: 'leadArm',
    label: 'Bent lead arm',
    weight: 0.5,
    why: 'A bent lead arm at the top shortens your swing arc and makes the low point of the swing harder to control.',
    drillIds: ['extended-arm-slow'],
    summary: (v) => `Your lead elbow is bent to ${Math.round(v)}° at the top.`,
  },
];

/** Minimum metric confidence for a fault to be reported. */
export const MIN_FAULT_CONFIDENCE = 0.4;

/** Turns graded metrics into ranked faults (highest score first). */
export function deriveFaults(metrics: MetricResult[]): Fault[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const faults: Fault[] = [];
  for (const def of FAULT_DEFS) {
    const m = byId.get(def.metricId);
    if (!m || m.value === null || m.status === 'unavailable' || m.status === 'good') continue;
    if (m.confidence < MIN_FAULT_CONFIDENCE) continue;
    const { severity } = grade(THRESHOLDS[def.metricId], m.value);
    faults.push({
      id: def.id,
      label: def.label,
      metricId: def.metricId,
      severity,
      confidence: m.confidence,
      score: severity * m.confidence * def.weight,
      summary: def.summary(m.value),
      why: def.why,
      drillIds: def.drillIds,
    });
  }
  return faults.sort((a, b) => b.score - a.score);
}
