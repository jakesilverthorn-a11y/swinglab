/** An error ready to show: a sentence a golfer can act on, plus the raw text for anyone who wants it. */
export interface ExplainedError {
  message: string;
  detail?: string;
}

/** Text that comes from MediaPipe's WebAssembly runtime rather than from this app. */
const RUNTIME_NOISE =
  /Graph has errors|CalculatorGraph|INVALID_ARGUMENT|third_party\/|research\/drishti|Source Location Trace|RuntimeError|memory access out of bounds|Aborted\(|wasm|unreachable|Out of memory|Array buffer allocation failed|Cannot enlarge memory/i;

const OUT_OF_MEMORY = /out of memory|allocation failed|cannot enlarge memory|memory access out of bounds/i;

/**
 * Turns whatever was thrown during an analysis into something readable. Messages written by this app pass through
 * unchanged; raw output from the pose runtime becomes a short instruction with the original kept as a detail line.
 */
export function explainError(err: unknown): ExplainedError {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw) return { message: 'Something went wrong while analyzing the video. Try again.' };
  if (!RUNTIME_NOISE.test(raw) && raw.length <= 240) return { message: raw };

  const detail = raw.length > 1200 ? `${raw.slice(0, 1200)}…` : raw;
  if (/timestamp mismatch/i.test(raw)) {
    return {
      message: 'Pose tracking got out of step with the video. Tap Analyze swing to try again. If it happens twice, close and reopen the app.',
      detail,
    };
  }
  if (OUT_OF_MEMORY.test(raw)) {
    return {
      message: 'This device ran out of memory while tracking the swing. Close other apps, or trim the clip to just the swing, then try again.',
      detail,
    };
  }
  return {
    message: 'Pose tracking hit a problem it could not recover from. Close and reopen the app, then try again.',
    detail,
  };
}
