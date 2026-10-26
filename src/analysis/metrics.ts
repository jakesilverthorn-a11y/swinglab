import type { AnalysisSettings, MetricId, MetricResult, MetricStatus, PhaseIndices } from '../types';
import { LM, leadIndices } from './landmarks';
import { angleAt, clamp, dist, dot, len, mean, median, medianVec, mid, sub, RAD, type Vec } from './geometry';
import type { Skeleton } from './skeleton';
import { handsOf, medianDt } from './phases';

// ---------------------------------------------------------------------------
// Thresholds. These are starting heuristics, not validated norms: they are meant
// to be tuned against a coach's read of real swings (roadmap phase 2).
// ---------------------------------------------------------------------------

export type Threshold =
  | { kind: 'high'; warn: number; bad: number }
  | { kind: 'low'; warn: number; bad: number }
  | { kind: 'band'; goodLo: number; goodHi: number; warnLo: number; warnHi: number };

export const THRESHOLDS: Record<MetricId, Threshold> = {
  tempo: { kind: 'band', goodLo: 2.4, goodHi: 3.6, warnLo: 1.9, warnHi: 4.4 },
  headSway: { kind: 'high', warn: 0.35, bad: 0.65 },
  hipSlide: { kind: 'high', warn: 0.45, bad: 0.8 },
  finishBalance: { kind: 'low', warn: -0.4, bad: -0.8 },
  spineAngle: { kind: 'low', warn: -6, bad: -12 },
  hipThrust: { kind: 'high', warn: 0.15, bad: 0.35 },
  handPath: { kind: 'high', warn: 0.1, bad: 0.3 },
  leadArm: { kind: 'low', warn: 155, bad: 135 },
};

/** Grades a value against its threshold. Severity runs 0.3 (just past the warn line) to 1 (at or beyond the bad line). */
export function grade(th: Threshold, value: number): { status: MetricStatus; severity: number } {
  let excess = 0;
  let range = 1;
  switch (th.kind) {
    case 'high':
      excess = value - th.warn;
      range = th.bad - th.warn;
      break;
    case 'low':
      excess = th.warn - value;
      range = th.warn - th.bad;
      break;
    case 'band':
      if (value > th.goodHi) {
        excess = value - th.goodHi;
        range = th.warnHi - th.goodHi;
      } else if (value < th.goodLo) {
        excess = th.goodLo - value;
        range = th.goodLo - th.warnLo;
      } else {
        excess = -1;
      }
      break;
  }
  if (excess <= 0) return { status: 'good', severity: 0 };
  const frac = clamp(excess / range, 0, 1);
  return { status: frac >= 1 ? 'bad' : 'warn', severity: 0.3 + 0.7 * frac };
}

interface Meta {
  label: string;
  description: string;
  views: MetricResult['views'];
  unit: string;
  target: string;
  experimental?: boolean;
}

export const META: Record<MetricId, Meta> = {
  tempo: {
    label: 'Tempo',
    description: 'Backswing time divided by downswing time.',
    views: 'any',
    unit: 'ratio',
    target: 'About 3 : 1 (2.4 to 3.6)',
  },
  headSway: {
    label: 'Head sway',
    description: 'How far the head moves away from the target during the backswing.',
    views: ['face-on'],
    unit: 'shoulder widths',
    target: 'Under 35% of shoulder width',
  },
  hipSlide: {
    label: 'Hip slide',
    description: 'How far the hips move toward the target by impact.',
    views: ['face-on'],
    unit: 'shoulder widths',
    target: 'Under 45% of shoulder width',
  },
  finishBalance: {
    label: 'Finish balance',
    description: 'Hip position over the lead foot in the finish.',
    views: ['face-on'],
    unit: 'shoulder widths',
    target: 'Hips over or ahead of the lead foot (above -40%)',
  },
  spineAngle: {
    label: 'Spine angle change',
    description: 'Change in forward spine tilt from address to impact.',
    views: ['down-the-line'],
    unit: 'degrees',
    target: 'Within 6° of the address tilt',
  },
  hipThrust: {
    label: 'Hips toward the ball',
    description: 'How far the hips move toward the ball from address to impact.',
    views: ['down-the-line'],
    unit: 'torso lengths',
    target: 'Under 15% of torso length',
  },
  handPath: {
    label: 'Downswing hand path',
    description: 'Where the hands are in mid-downswing relative to the address hands-to-shoulders plane line.',
    views: ['down-the-line'],
    unit: 'torso lengths',
    target: 'On or below the plane line (under 10% outside)',
    experimental: true,
  },
  leadArm: {
    label: 'Lead arm at the top',
    description: 'Elbow angle of the lead arm at the top of the backswing.',
    views: 'any',
    unit: 'degrees',
    target: 'Mostly straight (155° or more)',
    experimental: true,
  },
};

export const METRIC_ORDER: MetricId[] = [
  'tempo',
  'headSway',
  'hipSlide',
  'finishBalance',
  'spineAngle',
  'hipThrust',
  'handPath',
  'leadArm',
];

// ---------------------------------------------------------------------------

interface Ctx {
  sk: Skeleton;
  ph: PhaseIndices;
  s: AnalysisSettings;
  dt: number;
  fps: number;
  lead: ReturnType<typeof leadIndices>;
  /** Frame indices of the still address window just before the takeaway. */
  addr: number[];
  hands: Vec[];
  /** Landmark used as the head position, fixed for the whole swing so the track never jumps between sources. */
  headSrc: 'ears' | 'nose';
}

const range = (a: number, b: number): number[] => {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};

function around(ctx: Ctx, i: number, r: number): number[] {
  const n = ctx.sk.t.length;
  return range(Math.max(0, i - r), Math.min(n - 1, i + r));
}

const P = (ctx: Ctx, i: number, k: number): Vec => ctx.sk.p[i][k];
const hipMid = (ctx: Ctx, i: number): Vec => mid(P(ctx, i, LM.L_HIP), P(ctx, i, LM.R_HIP));
const shoulderMid = (ctx: Ctx, i: number): Vec => mid(P(ctx, i, LM.L_SHOULDER), P(ctx, i, LM.R_SHOULDER));

/** Head center: midpoint of the ears (steadier than the nose) or the nose, whichever source was chosen for this swing. */
function head(ctx: Ctx, i: number): Vec {
  if (ctx.headSrc === 'ears') return mid(P(ctx, i, LM.L_EAR), P(ctx, i, LM.R_EAR));
  return P(ctx, i, LM.NOSE);
}

/** Uses the ears when both are visible through most of the swing so far, otherwise the nose. */
function chooseHeadSource(sk: Skeleton, from: number, to: number): 'ears' | 'nose' {
  const vis: number[] = [];
  for (let i = from; i <= to; i++) vis.push(Math.min(sk.v[i][LM.L_EAR], sk.v[i][LM.R_EAR]));
  return median(vis) >= 0.5 && mean(vis) >= 0.45 ? 'ears' : 'nose';
}

/**
 * Confidence from landmark visibility. Each group is a set of landmarks of which at
 * least one must be visible (handy when one side is hidden behind the body); the
 * frame's confidence is the weakest group, averaged over the frames.
 */
function groupConf(ctx: Ctx, frames: number[], groups: number[][]): number {
  if (frames.length === 0) return 0;
  const per = frames.map((i) => Math.min(...groups.map((g) => Math.max(...g.map((k) => ctx.sk.v[i][k])))));
  return clamp(mean(per), 0, 1);
}

function make(id: MetricId, value: number | null, display: string, confidence: number, note?: string): MetricResult {
  const m = META[id];
  const base = { id, label: m.label, description: m.description, views: m.views, unit: m.unit, target: m.target, experimental: m.experimental };
  if (value === null || !Number.isFinite(value)) {
    return { ...base, value: null, display: 'n/a', status: 'unavailable', confidence: 0, note };
  }
  return { ...base, value, display, status: grade(THRESHOLDS[id], value).status, confidence: clamp(confidence, 0, 1), note };
}

const unavailable = (id: MetricId, note: string): MetricResult => make(id, null, 'n/a', 0, note);

/** Majority sign of a set of differences; ignores tiny ones. Returns 0 when there is no clear majority. */
function majority(diffs: number[], minAbs: number): number {
  let pos = 0;
  let neg = 0;
  for (const d of diffs) {
    if (d > minAbs) pos++;
    else if (d < -minAbs) neg++;
  }
  if (pos + neg === 0 || pos === neg) return 0;
  return pos > neg ? 1 : -1;
}

/** Lead side minus trail side across hips, knees and ankles, face-on (positive = lead side on the image right). */
function leadMinusTrail(ctx: Ctx): number[] {
  const { lead } = ctx;
  const diffs: number[] = [];
  for (const i of ctx.addr) {
    diffs.push(P(ctx, i, lead.hip).x - P(ctx, i, lead.trailHip).x);
    diffs.push(P(ctx, i, lead.knee).x - P(ctx, i, lead.trailKnee).x);
    diffs.push(P(ctx, i, lead.ankle).x - P(ctx, i, lead.trailAnkle).x);
  }
  return diffs;
}

/** Sign of the direction toward the target in a face-on clip (+1 = image right): where the lead side of the body is. */
function targetDirection(ctx: Ctx): number {
  return majority(leadMinusTrail(ctx), 0.01) || (ctx.s.handedness === 'right' ? 1 : -1);
}

/** Sign of the direction the golfer faces in a down-the-line clip (+1 = image right): which way the toes point from the heels. */
function facingDirection(ctx: Ctx): number {
  const diffs: number[] = [];
  for (const i of ctx.addr) {
    diffs.push(P(ctx, i, LM.L_FOOT).x - P(ctx, i, LM.L_HEEL).x);
    diffs.push(P(ctx, i, LM.R_FOOT).x - P(ctx, i, LM.R_HEEL).x);
  }
  return majority(diffs, 0.004) || (ctx.s.handedness === 'right' ? 1 : -1);
}

function shoulderWidth(ctx: Ctx): number {
  return median(ctx.addr.map((i) => dist(P(ctx, i, LM.L_SHOULDER), P(ctx, i, LM.R_SHOULDER))));
}

function torsoLength(ctx: Ctx): number {
  return median(ctx.addr.map((i) => len(sub(shoulderMid(ctx, i), hipMid(ctx, i)))));
}

// ---------------------------------------------------------------------------
// Individual metrics
// ---------------------------------------------------------------------------

function tempo(ctx: Ctx): MetricResult {
  const { sk, ph, s } = ctx;
  const tb = sk.t[ph.top] - sk.t[ph.takeaway];
  const td = sk.t[ph.impact] - sk.t[ph.top];
  if (!(tb > 0) || !(td > 0)) return unavailable('tempo', 'Could not time the backswing and downswing.');
  const ratio = tb / td;
  // Fewer frames in the downswing means a larger timing error.
  const precision = clamp((ph.impact - ph.top) / 16, 0.3, 1);
  const vis = groupConf(ctx, range(ph.takeaway, ph.impact), [[LM.L_WRIST], [LM.R_WRIST]]);
  const note = `Backswing ${(tb / s.slowMo).toFixed(2)} s, downswing ${(td / s.slowMo).toFixed(2)} s.`;
  return make('tempo', ratio, `${ratio.toFixed(1)} : 1`, vis * precision, note);
}

function headSway(ctx: Ctx): MetricResult {
  const { ph } = ctx;
  const sw = shoulderWidth(ctx);
  if (!(sw > 0.06)) return unavailable('headSway', 'Shoulders look stacked. Is this clip really filmed face-on?');
  const tdir = targetDirection(ctx);
  const x0 = median(ctx.addr.map((i) => head(ctx, i).x));
  let sway = -Infinity;
  for (const i of range(ph.takeaway, ph.top)) sway = Math.max(sway, ((head(ctx, i).x - x0) * -tdir) / sw);
  const conf = groupConf(ctx, range(ph.takeaway, ph.top), [[LM.L_EAR, LM.R_EAR, LM.NOSE]]);
  return make('headSway', sway, `${Math.round(sway * 100)}% of shoulder width`, conf);
}

function hipSlide(ctx: Ctx): MetricResult {
  const { ph } = ctx;
  const sw = shoulderWidth(ctx);
  if (!(sw > 0.06)) return unavailable('hipSlide', 'Shoulders look stacked. Is this clip really filmed face-on?');
  const tdir = targetDirection(ctx);
  const x0 = median(ctx.addr.map((i) => hipMid(ctx, i).x));
  const win = around(ctx, ph.impact, 1);
  const x1 = mean(win.map((i) => hipMid(ctx, i).x));
  const v = ((x1 - x0) * tdir) / sw;
  const conf = groupConf(ctx, [...ctx.addr, ...win], [[LM.L_HIP], [LM.R_HIP]]);
  const note = v < -0.1 ? 'Your hips moved away from the target by impact.' : undefined;
  return make('hipSlide', v, `${Math.round(v * 100)}% of shoulder width`, conf, note);
}

function finishBalance(ctx: Ctx): MetricResult {
  const { ph, lead } = ctx;
  const sw = shoulderWidth(ctx);
  if (!(sw > 0.06)) return unavailable('finishBalance', 'Shoulders look stacked. Is this clip really filmed face-on?');
  const tdir = targetDirection(ctx);
  const win = range(Math.max(ph.impact + 1, ph.finish - 2), ph.finish);
  const v = mean(win.map((i) => ((hipMid(ctx, i).x - P(ctx, i, lead.ankle).x) * tdir) / sw));
  const conf = groupConf(ctx, win, [[LM.L_HIP], [LM.R_HIP], [lead.ankle]]);
  return make('finishBalance', v, `${Math.round(v * 100)}% of shoulder width`, conf);
}

/** Forward tilt of the spine (degrees, positive = leaning toward the ball) in a down-the-line clip. */
function tilt(ctx: Ctx, i: number, facing: number): number {
  const d = sub(shoulderMid(ctx, i), hipMid(ctx, i));
  return Math.atan2(d.x * facing, -d.y) * RAD;
}

function spineAngle(ctx: Ctx): MetricResult {
  const { ph } = ctx;
  const facing = facingDirection(ctx);
  const a0 = median(ctx.addr.map((i) => tilt(ctx, i, facing)));
  const win = around(ctx, ph.impact, 1);
  const a1 = mean(win.map((i) => tilt(ctx, i, facing)));
  const change = a1 - a0;
  const conf = groupConf(ctx, [...ctx.addr, ...win], [
    [LM.L_SHOULDER, LM.R_SHOULDER],
    [LM.L_HIP, LM.R_HIP],
  ]);
  const note = `Spine tilt ${a0.toFixed(0)}° at address, ${a1.toFixed(0)}° at impact.`;
  return make('spineAngle', change, `${change > 0 ? '+' : ''}${change.toFixed(0)}°`, conf, note);
}

function hipThrust(ctx: Ctx): MetricResult {
  const { ph } = ctx;
  const facing = facingDirection(ctx);
  const tl = torsoLength(ctx);
  if (!(tl > 0.03)) return unavailable('hipThrust', 'Could not measure the torso.');
  const x0 = median(ctx.addr.map((i) => hipMid(ctx, i).x));
  const win = around(ctx, ph.impact, 1);
  const x1 = mean(win.map((i) => hipMid(ctx, i).x));
  const v = ((x1 - x0) * facing) / tl;
  const conf = groupConf(ctx, [...ctx.addr, ...win], [[LM.L_HIP, LM.R_HIP]]);
  return make('hipThrust', v, `${Math.round(v * 100)}% of torso length`, conf);
}

function handPath(ctx: Ctx): MetricResult {
  const { ph, hands } = ctx;
  const facing = facingDirection(ctx);
  const tl = torsoLength(ctx);
  const a = medianVec(ctx.addr.map((i) => hands[i]));
  const sa = medianVec(ctx.addr.map((i) => shoulderMid(ctx, i)));
  const u = sub(sa, a);
  const ul = len(u);
  if (!(tl > 0.03) || ul < 0.1 * tl) return unavailable('handPath', 'Could not find the address plane line.');
  const uHat = { x: u.x / ul, y: u.y / ul };
  // Normal to the plane line, pointing outward (toward the ball line) and up.
  let n = { x: -uHat.y, y: uHat.x };
  if (dot(n, { x: facing, y: -1 }) < 0) n = { x: -n.x, y: -n.y };
  const win = around(ctx, ph.midDownswing, 1);
  const m = medianVec(win.map((i) => hands[i]));
  const v = dot(sub(m, a), n) / tl;
  const conf =
    groupConf(ctx, win, [[LM.L_WRIST], [LM.R_WRIST]]) * groupConf(ctx, ctx.addr, [[LM.L_SHOULDER, LM.R_SHOULDER]]) * 0.7;
  return make('handPath', v, `${v >= 0 ? '+' : ''}${Math.round(v * 100)}% of torso length`, conf);
}

function leadArm(ctx: Ctx): MetricResult {
  const { ph, lead } = ctx;
  const win = around(ctx, ph.top, 1);
  const ang = mean(win.map((i) => angleAt(P(ctx, i, lead.shoulder), P(ctx, i, lead.elbow), P(ctx, i, lead.wrist))));
  const conf = groupConf(ctx, win, [[lead.shoulder], [lead.elbow], [lead.wrist]]) * 0.8;
  const note = '2D angle: an arm pointing toward or away from the camera can read as bent.';
  return make('leadArm', ang, `${Math.round(ang)}°`, conf, note);
}

// ---------------------------------------------------------------------------

function makeCtx(sk: Skeleton, ph: PhaseIndices, s: AnalysisSettings, addrWindow: [number, number]): Ctx {
  const dt = medianDt(sk.t);
  return {
    sk,
    ph,
    s,
    dt,
    fps: 1 / dt,
    lead: leadIndices(s.handedness),
    addr: range(addrWindow[0], Math.max(addrWindow[0], addrWindow[1])),
    hands: handsOf(sk),
    headSrc: chooseHeadSource(sk, addrWindow[0], ph.top),
  };
}

/**
 * Sanity check of the handedness setting against the clip.
 *  - Face-on: the hands travel away from the target in the backswing. If they travel toward the side labelled as the
 *    lead side, the handedness is set the wrong way round (a mirrored swing cannot be told apart from the pose alone).
 *  - Down-the-line: with the camera behind the golfer, a right-hander faces the right of the frame and a left-hander the left.
 * Returns a warning when the clip contradicts the setting, otherwise null.
 */
export function checkOrientation(
  sk: Skeleton,
  ph: PhaseIndices,
  s: AnalysisSettings,
  addrWindow: [number, number],
): string | null {
  const ctx = makeCtx(sk, ph, s, addrWindow);
  if (s.view === 'face-on') {
    const sw = shoulderWidth(ctx);
    if (!(sw > 0.06)) return null;
    const x0 = median(ctx.addr.map((i) => ctx.hands[i].x));
    const x1 = median(around(ctx, ph.top, 1).map((i) => ctx.hands[i].x));
    const towardTarget = ((x1 - x0) * targetDirection(ctx)) / sw;
    if (towardTarget > 0.2) {
      return 'The hands move toward the lead side in the backswing, which usually means the handedness setting is the wrong way round. Check it, otherwise head sway, hip slide and finish balance will be mirrored.';
    }
    return null;
  }
  const expected = s.handedness === 'right' ? 1 : -1;
  const m = facingDirection(ctx);
  if (m !== expected) {
    return `The golfer faces the ${m > 0 ? 'right' : 'left'} of the frame, which is unusual for a ${s.handedness}-handed down-the-line clip. Check the handedness setting and that the camera is behind the golfer.`;
  }
  return null;
}

export function computeMetrics(
  sk: Skeleton,
  ph: PhaseIndices,
  s: AnalysisSettings,
  addrWindow: [number, number],
): MetricResult[] {
  const ctx = makeCtx(sk, ph, s, addrWindow);

  const faceOn = s.view === 'face-on';
  const needFace = 'Needs a face-on clip.';
  const needDtl = 'Needs a down-the-line clip.';
  return [
    tempo(ctx),
    faceOn ? headSway(ctx) : unavailable('headSway', needFace),
    faceOn ? hipSlide(ctx) : unavailable('hipSlide', needFace),
    faceOn ? finishBalance(ctx) : unavailable('finishBalance', needFace),
    faceOn ? unavailable('spineAngle', needDtl) : spineAngle(ctx),
    faceOn ? unavailable('hipThrust', needDtl) : hipThrust(ctx),
    faceOn ? unavailable('handPath', needDtl) : handPath(ctx),
    leadArm(ctx),
  ];
}
