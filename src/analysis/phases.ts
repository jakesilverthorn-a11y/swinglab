import type { PhaseIndices } from '../types';
import { LM } from './landmarks';
import { clamp, dist, medianVec, median, mid, type Vec } from './geometry';
import type { Skeleton } from './skeleton';

export type PhaseResult =
  | {
      ok: true;
      phases: PhaseIndices;
      /** First and last frame (inclusive) of the still address baseline used for metrics. */
      addrWindow: [number, number];
      warnings: string[];
      torso: number;
      peakSpeed: number;
    }
  | { ok: false; reason: string };

// Distances below are in torso lengths.
/** Hands this close to their address position still count as "not yet moving" (raised for jittery tracking). */
const NEAR = 0.03;
/** The still-window search accepts a window whose hands never stray farther than this from its median. */
const QUIET = 0.05;
/** A window above this much wobble means the golfer was not set at address. */
const RESTLESS = 0.12;
/** The top of the backswing is the middle of the span where the hands stay within this height of their highest point. */
const TOP_BAND = 0.02;

/** Midpoint of the two wrists, used as the "hands" position. */
export function handsOf(sk: Skeleton): Vec[] {
  return sk.p.map((f) => mid(f[LM.L_WRIST], f[LM.R_WRIST]));
}

export function medianDt(t: number[]): number {
  return (t[t.length - 1] - t[0]) / (t.length - 1);
}

/**
 * Looks for the swing in the height of the hands alone, without using hand speed. The hands rise slowly to the top, fall
 * fast to impact and then rise again into the finish. That shape survives things that fool a speed measure: filmed from
 * behind the golfer the hands move mostly toward and away from the camera at impact, so their on-screen speed is small
 * and a tracking glitch can look faster than the real downswing. Returns the top (highest hands), the bottom of the
 * downswing, and a lightly filtered height track, or null when no clear rise-and-fall is present.
 */
export function swingFromHeight(
  hands: Vec[],
  torso: number,
  toFrames: (seconds: number) => number,
): { top: number; valley: number; y: number[] } | null {
  const n = hands.length;
  // A median over about 0.14 s removes short bursts of wrong wrist positions without flattening the top.
  const half = Math.max(1, Math.round(toFrames(0.14) / 2));
  const y = hands.map((_, i) => median(hands.slice(Math.max(0, i - half), Math.min(n, i + half + 1)).map((p) => p.y)));
  const near = toFrames(0.15);
  const back = toFrames(1.6);
  const fwd = toFrames(0.7);
  const quick = toFrames(0.4);

  let best: { top: number; valley: number; score: number } | null = null;
  for (let i = 1; i < n - 1; i++) {
    // Highest point of the hands within +-near (the first of equal values wins on a flat top).
    let isPeak = true;
    for (let j = Math.max(0, i - near); j <= Math.min(n - 1, i + near); j++) {
      if (j < i ? y[j] <= y[i] : y[j] < y[i]) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak) continue;

    let lowBefore = y[i];
    for (let j = Math.max(0, i - back); j < i; j++) lowBefore = Math.max(lowBefore, y[j]);
    let lowAfter = y[i];
    let valley = i;
    for (let j = i; j <= Math.min(n - 1, i + fwd); j++) {
      if (y[j] > lowAfter) {
        lowAfter = y[j];
        valley = j;
      }
    }
    const rise = lowBefore - y[i];
    const fall = lowAfter - y[i];
    // A backswing top: the hands came up a clear distance and then drop most of the way back soon after.
    if (rise < 0.5 * torso || fall < 0.6 * rise) continue;
    let quickFall = 0;
    for (let j = i; j <= Math.min(n - 1, i + quick); j++) quickFall = Math.max(quickFall, y[j] - y[i]);
    if (!best || quickFall > best.score) best = { top: i, valley, score: quickFall };
  }
  return best ? { top: best.top, valley: best.valley, y } : null;
}

/**
 * Finds the swing phases from the hand path and hand speed.
 *  - address baseline: the last stretch of stillness before the backswing (walk-ins and waggles are skipped)
 *  - top: middle of the flat peak of the hand path, before the speed peak
 *  - takeaway: when the hands start to move away from address, extrapolated back from two displacement crossings
 *    because motion starts from rest and a plain threshold would always read late
 *  - impact: hands closest to their address position around the hand-speed peak
 *  - finish: first sustained slow-down after the follow-through
 *
 * If the hand-speed peak does not lead to a believable swing (common filmed from behind the golfer, where the hands
 * move toward the camera at impact), the swing is located again from the height of the hands, see `swingFromHeight`.
 */
export function detectPhases(sk: Skeleton, slowMo = 1): PhaseResult {
  return detect(sk, slowMo, 'auto');
}

/** Same result as `detectPhases`, but always locating the swing from the height of the hands. Exposed for tests. */
export function detectPhasesByHeight(sk: Skeleton, slowMo = 1): PhaseResult {
  return detect(sk, slowMo, 'height');
}

function detect(sk: Skeleton, slowMo: number, mode: 'auto' | 'height'): PhaseResult {
  const n = sk.t.length;
  const fail = (reason: string): PhaseResult => ({ ok: false, reason });
  if (n < 12) return fail('The clip is too short to contain a full swing.');

  const hands = handsOf(sk);
  const torso = median(
    sk.p.map((f) => dist(mid(f[LM.L_SHOULDER], f[LM.R_SHOULDER]), mid(f[LM.L_HIP], f[LM.R_HIP]))),
  );
  if (!(torso > 0.03)) return fail("Could not measure the golfer's torso. Make sure the whole body is in frame.");

  const dt = medianDt(sk.t);
  // Time windows are defined in real seconds; slowMo converts them to the clip's (possibly slowed) timeline.
  const toFrames = (s: number) => Math.max(1, Math.round((s * slowMo) / dt));

  // Hand speed in torso lengths per clip second (central difference), then a 3-point median so a lone
  // glitch frame cannot become the "peak".
  const raw = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    raw[i] = dist(hands[i + 1], hands[i - 1]) / (sk.t[i + 1] - sk.t[i - 1]) / torso;
  }
  raw[0] = raw[1];
  raw[n - 1] = raw[n - 2];
  const v = raw.map((_, i) => (i === 0 || i === n - 1 ? raw[i] : median([raw[i - 1], raw[i], raw[i + 1]])));

  let speedPeak = 0;
  for (let i = 1; i < n - 1; i++) if (v[i] > v[speedPeak]) speedPeak = i;
  const speedPeakSpeed = v[speedPeak] * slowMo; // torso lengths per real second

  /** Everything after the choice of the downswing peak: top, address baseline, takeaway, impact, finish. */
  const build = (peak: number, y: number[], topFrom: number, fromHeight: boolean): PhaseResult => {
    const warnings: string[] = [];
    const peakRaw = fromHeight
      ? Math.max(...v.slice(Math.max(0, peak - toFrames(0.4)), Math.min(n, peak + toFrames(0.2) + 1)))
      : v[peak];
    const peakSpeed = peakRaw * slowMo; // torso lengths per real second
    if (peak < toFrames(0.3)) {
      return fail('The swing seems to start right at the beginning of the clip. Start recording while standing still at address.');
    }

    // A second fast stretch well away from the peak means a practice swing or a second swing is in the clip.
    if (!fromHeight) {
      const apart = toFrames(0.6);
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - peak) > apart && v[i] > 0.6 * peakRaw) {
          warnings.push('The clip seems to contain more than one swing. Only the fastest one was analyzed; film one swing per clip.');
          break;
        }
      }
    }

    // Top of backswing: the flat peak of the hand path (smallest y) before the peak. Using the middle of
    // the band near the highest point is steadier than the single highest frame, which jitters on a flat top.
    let top0 = topFrom;
    for (let i = topFrom; i <= peak; i++) if (y[i] < y[top0]) top0 = i;
    const level = y[top0] + TOP_BAND * torso;
    let l = top0;
    while (l > 0 && y[l - 1] <= level) l--;
    let r = top0;
    while (r < peak && y[r + 1] <= level) r++;
    const crossY = (i0: number, i1: number): number => {
      const a = y[i0];
      const b = y[i1];
      const k = b === a ? 0 : clamp((level - a) / (b - a), 0, 1);
      return sk.t[i0] + k * (sk.t[i1] - sk.t[i0]);
    };
    const tl = l > 0 ? crossY(l - 1, l) : sk.t[l];
    const tr = r < peak ? crossY(r, r + 1) : sk.t[r];
    const top = clamp(Math.round(((tl + tr) / 2 - sk.t[0]) / dt), l, r);
    if (peak - top < toFrames(0.06)) {
      return fail(
        'Could not find the top of the backswing. Start the clip while you are still at address, keep your hands in view at the top of the swing, and film one swing per clip.',
      );
    }

    // Address baseline: the latest still window before the backswing. Stillness is judged by displacement from
    // the window median, which is far less sensitive to tracking noise than a speed threshold.
    const win = Math.max(3, toFrames(0.2));
    const stillMedian = (a: number, b: number) => {
      const pts = hands.slice(a, b + 1);
      const pos = medianVec(pts);
      let spread = 0;
      for (const p of pts) spread = Math.max(spread, dist(p, pos) / torso);
      const jitter = median(pts.map((p) => dist(p, pos) / torso));
      return { pos, spread, near: clamp(2.5 * jitter, NEAR, 0.08) };
    };
    const scanEnd = top - toFrames(0.1);
    let quiet: { start: number; spread: number } | null = null;
    let fallback: { start: number; spread: number } | null = null;
    for (let e = scanEnd; e >= win - 1; e--) {
      const spread = stillMedian(e - win + 1, e).spread;
      if (spread <= QUIET) {
        quiet = { start: e - win + 1, spread };
        break;
      }
      if (!fallback || spread < fallback.spread) fallback = { start: e - win + 1, spread };
    }
    const pick = quiet ?? fallback ?? { start: 0, spread: stillMedian(0, Math.min(top - 1, win - 1)).spread };
    if (!quiet && pick.spread > RESTLESS) {
      warnings.push('The golfer was moving before the takeaway. Start recording once you are set at address.');
    }

    let base = stillMedian(pick.start, Math.min(top - 1, pick.start + win - 1));
    const walkBack = (b: { pos: Vec; near: number }) => {
      let i = top;
      while (i > 0 && dist(hands[i], b.pos) > b.near * torso) i--;
      return i;
    };
    let tk = walkBack(base);
    // Re-estimate the baseline from the frames just before the onset (the window may have included early motion).
    const w2 = Math.max(0, tk - win + 1);
    if (tk - w2 >= 2) {
      base = stillMedian(w2, tk);
      tk = walkBack(base);
    }
    if (tk === 0 && dist(hands[0], base.pos) > base.near * torso) {
      warnings.push('Could not find a still address position before the takeaway; tempo may be less accurate.');
    }

    // Onset: the hands leave rest with an acceleration, so displacement grows like (t - t0)^2. Two crossings (near and
    // four times near) pin down t0 without the lateness a single threshold would have.
    const d = (i: number) => dist(hands[i], base.pos) / torso;
    const far = 4 * base.near;
    let takeaway = tk;
    if (tk + 1 <= top) {
      const cross = (i0: number, i1: number, lvl: number): number => {
        const a = d(i0);
        const b = d(i1);
        const k = b === a ? 0 : clamp((lvl - a) / (b - a), 0, 1);
        return sk.t[i0] + k * (sk.t[i1] - sk.t[i0]);
      };
      const t1 = cross(tk, tk + 1, base.near);
      let j = tk + 1;
      while (j < top && d(j) < far) j++;
      if (d(j) >= far) {
        const t2 = cross(j - 1, j, far);
        // sqrt(near) / (sqrt(far) - sqrt(near)) = 1 because far = 4 * near.
        const lead = Math.min(t2 - t1, 0.2 * slowMo);
        takeaway = clamp(Math.round((t1 - lead - sk.t[0]) / dt), 0, tk);
      }
    }

    // Impact: hands closest to their address position around the speed peak.
    const lo = Math.max(top + 1, peak - toFrames(0.06));
    const hi = Math.min(n - 2, peak + toFrames(0.1));
    let impact = Math.min(Math.max(peak, lo), hi);
    let best = Infinity;
    for (let i = lo; i <= hi; i++) {
      const di = dist(hands[i], base.pos);
      if (di < best) {
        best = di;
        impact = i;
      }
    }
    if (best > 0.6 * torso) {
      impact = Math.min(Math.max(peak, lo), hi);
      warnings.push('The hands never returned close to their address position, so impact timing is approximate.');
    }

    // Finish: first frame after the follow-through where hand speed stays low.
    const hold = toFrames(0.1);
    let finish = n - 1;
    for (let i = impact + toFrames(0.15); i < n - hold; i++) {
      let slow = true;
      for (let j = i; j < i + hold; j++) {
        if (v[j] > 0.12 * peakRaw) {
          slow = false;
          break;
        }
      }
      if (slow) {
        finish = i;
        break;
      }
    }
    if (finish === n - 1) warnings.push('The clip ends before the finish pose is held still; finish balance may be unreliable.');

    const tMid = (sk.t[top] + sk.t[impact]) / 2;
    let midDownswing = top;
    for (let i = top; i <= impact; i++) {
      if (Math.abs(sk.t[i] - tMid) < Math.abs(sk.t[midDownswing] - tMid)) midDownswing = i;
    }

    const phases: PhaseIndices = {
      address: Math.max(0, takeaway - toFrames(0.1)),
      takeaway,
      top,
      midDownswing,
      impact,
      finish,
    };
    const addrWindow: [number, number] = [Math.max(0, takeaway - toFrames(0.3)), takeaway];
    return { ok: true, phases, addrWindow, warnings, torso, peakSpeed };
  };

  const noSwing = fail('No fast swing motion was found. Is there a full swing in the clip?');
  let firstFail: PhaseResult | null = null;
  if (mode === 'auto') {
    if (speedPeakSpeed < 3) {
      firstFail = noSwing;
    } else {
      const byspeed = build(speedPeak, hands.map((h) => h.y), 0, false);
      if (byspeed.ok) return byspeed;
      firstFail = byspeed;
    }
  }
  const found = swingFromHeight(hands, torso, toFrames);
  if (found) {
    const byheight = build(found.valley, found.y, Math.max(0, found.top - toFrames(0.4)), true);
    if (byheight.ok) return byheight;
    firstFail ??= byheight;
  }
  return firstFail ?? noSwing;
}
