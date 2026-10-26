import type { AnalysisResult, AnalysisSettings, PoseFrame, SwingQuality } from '../types';
import { AnalysisError, smoothFrames, toSkeleton } from './skeleton';
import { detectPhases, medianDt } from './phases';
import { checkOrientation, computeMetrics } from './metrics';
import { deriveFaults } from './faults';

/**
 * Full analysis of one swing: gap-fill and smooth the pose track, find the swing phases,
 * compute metrics, and derive ranked faults. Throws AnalysisError with a user-readable
 * message when the clip cannot be analyzed.
 *
 * `extra.nativeInterval` is the spacing of the clip's own video frames (seconds on the clip timeline); the player uses
 * it to line the overlay up with the video. `extra.warnings` are capture problems found before analysis (for example
 * variable-speed slow motion) that should be shown with the other quality warnings.
 */
export interface AnalyzeExtras {
  nativeInterval?: number;
  warnings?: string[];
}

export function analyzeSwing(
  raw: PoseFrame[],
  aspect: number,
  settings: AnalysisSettings,
  extra: AnalyzeExtras = {},
): AnalysisResult {
  const { frames, missingFraction } = smoothFrames(raw, aspect, settings.slowMo);
  const sk = toSkeleton(frames, aspect);
  const dt = medianDt(sk.t);

  const found = detectPhases(sk, settings.slowMo);
  if (!found.ok) throw new AnalysisError(found.reason);
  const { phases, addrWindow, warnings } = found;

  const realDt = dt / settings.slowMo;
  const backswing = (sk.t[phases.top] - sk.t[phases.takeaway]) / settings.slowMo;
  const downswing = (sk.t[phases.impact] - sk.t[phases.top]) / settings.slowMo;

  const quality: SwingQuality = { level: 'good', warnings: [...(extra.warnings ?? []), ...warnings] };
  const orientation = checkOrientation(sk, phases, settings, addrWindow);
  if (orientation) quality.warnings.push(orientation);
  if (1 / realDt < 45) {
    quality.warnings.push(
      `Sampled at about ${Math.round(1 / realDt)} frames per second in real time. A slow-motion clip (120 fps or more) gives more precise timing.`,
    );
  }
  if (missingFraction > 0.1) {
    quality.warnings.push(`The pose was lost in ${Math.round(missingFraction * 100)}% of frames; results may be unreliable.`);
  }
  if (backswing < 0.3 || backswing > 3 || downswing < 0.1 || downswing > 1.2) {
    quality.warnings.push(
      settings.slowMo > 1
        ? `The backswing or downswing duration looks unusual. The clip was treated as ${Number(settings.slowMo.toFixed(2))}x slow motion; if that is wrong, set the recorded frame rate in settings.`
        : 'The backswing or downswing duration looks unusual. If your clip is slow motion, check the recorded frame rate in settings.',
    );
  }
  if (phases.impact - phases.top < 6) {
    quality.warnings.push('Very few frames were analyzed in the downswing, so impact timing is approximate.');
  }
  quality.level = missingFraction > 0.25 ? 'poor' : quality.warnings.length > 0 ? 'fair' : 'good';

  const metrics = computeMetrics(sk, phases, settings, addrWindow);
  const faults = deriveFaults(metrics);

  return {
    version: 1,
    settings,
    aspect,
    frameInterval: dt,
    nativeInterval: extra.nativeInterval,
    frames,
    phases,
    addrWindow,
    quality,
    metrics,
    faults,
    durations: { backswing, downswing },
  };
}

export { AnalysisError };
