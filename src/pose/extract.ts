import type { PoseFrame } from '../types';
import type { PoseEngine } from './poseEngine';

export interface ExtractResult {
  frames: PoseFrame[];
  aspect: number;
  /** Seconds between analyzed frames on the clip's timeline. */
  step: number;
  /** Factor by which the clip's timeline is slowed versus real time. */
  slowMo: number;
  /** Real-time frames per second of the analysis. */
  analysisFps: number;
  /** Seconds between native frames on the clip's timeline. */
  nativeInterval: number;
  /** True when the clip's frame spacing changes partway through (variable-speed slow motion). */
  variableSpeed: boolean;
  /** True when the browser could not report frame timing and the recorded frame rate setting was trusted instead. */
  timingGuessed: boolean;
}

export interface ExtractOptions {
  /** The frame rate the clip was recorded at (for example 120 for iPhone slo-mo). 0 means unknown: treat the clip as real time. */
  recordedFps: number;
  /** 'native' analyzes every recorded frame; otherwise analysis is capped at 60 fps of real time. */
  rate: 'capped60' | 'native';
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const MAX_FRAMES = 2400;
const STANDARD_FPS = [24, 25, 30, 48, 50, 60, 90, 100, 120, 144, 240];

/** Snaps a measured frame interval to a standard frame rate when it is within 6%, undoing timestamp rounding. */
function snapInterval(gap: number): number {
  const fps = 1 / gap;
  const nearest = STANDARD_FPS.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
  return Math.abs(nearest - fps) / nearest < 0.06 ? 1 / nearest : gap;
}

export function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    // Some browsers (Safari) only report frame timing for videos that are in the page, so keep it there, invisible.
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      video.remove();
      reject(new Error('The video could not be loaded. Try an .mp4 or .mov file.'));
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    video.src = url;
    video.load();
  });
}

/** Lets the browser run other tasks. Unlike setTimeout it is not throttled when the tab is in the background. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/** Frees the decoder behind a video element that is no longer needed. */
export function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 1e-4) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 3000);
    video.addEventListener('seeked', finish);
    video.currentTime = time;
  });
}

/**
 * Plays a few frames from `start` and returns their media times. Playback is slowed so that every frame gets a
 * callback even when the display refreshes at 60 Hz (a 120 fps clip played at full speed would otherwise report
 * every second frame and look like 60 fps).
 */
async function sampleFrameTimes(video: HTMLVideoElement, start: number, count: number, rate: number): Promise<number[]> {
  const times: number[] = [];
  await seekTo(video, start);
  video.playbackRate = rate;
  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        times.push(meta.mediaTime);
        if (times.length >= count) {
          clearTimeout(timeout);
          resolve();
        } else {
          video.requestVideoFrameCallback(onFrame);
        }
      };
      video.requestVideoFrameCallback(onFrame);
      video.play().catch(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } finally {
    video.pause();
    video.playbackRate = 1;
  }
  return times;
}

/** The single-frame gap in a list of media times, or null if there are too few frames to tell. */
function intervalFromTimes(times: number[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 0.0005) gaps.push(g);
  }
  if (gaps.length < 3) return null;
  // Gaps that span a skipped callback are multiples of the interval, so keep only the single-frame gaps.
  const smallest = Math.min(...gaps);
  const singles = gaps.filter((g) => g < smallest * 1.5);
  // The mean (not the median) averages out timestamps rounded to whole milliseconds, such as 8 ms and 9 ms around 8.33 ms.
  return singles.reduce((a, b) => a + b, 0) / singles.length;
}

export interface FrameTiming {
  /** Seconds between native frames on the clip's timeline, snapped to a standard frame rate. */
  interval: number;
  /** True when different parts of the clip have clearly different frame spacing. */
  variable: boolean;
}

/**
 * Measures the spacing between native frames at three places in the clip. Returns null when the browser cannot
 * report frame times. Different spacing in different places means variable-speed slow motion, where one
 * slow-motion factor cannot describe the whole timeline.
 */
export async function estimateFrameTiming(video: HTMLVideoElement): Promise<FrameTiming | null> {
  if (!('requestVideoFrameCallback' in video)) return null;
  const duration = video.duration;
  const wasMuted = video.muted;
  video.muted = true;
  const found: number[] = [];
  try {
    const starts = duration > 1.5 ? [0.02, duration * 0.4, duration * 0.75] : [0, duration * 0.5];
    let rate = 0.25;
    for (const start of starts) {
      const gap = intervalFromTimes(await sampleFrameTimes(video, Math.min(start, Math.max(0, duration - 0.5)), 9, rate));
      if (gap !== null) {
        found.push(gap);
        // Aim for about 30 frame callbacks per second from here on: quick for slow timelines, safe for fast ones.
        // The smallest spacing seen so far sets the rate, so a fast stretch is never sampled too quickly.
        rate = Math.min(1, Math.max(0.0625, Math.min(...found) * 30));
      }
    }
  } finally {
    video.muted = wasMuted;
    await seekTo(video, 0);
  }
  if (found.length === 0) return null;
  const sorted = [...found].sort((a, b) => a - b);
  const variable = sorted[sorted.length - 1] / sorted[0] > 1.3;
  return { interval: snapInterval(sorted[Math.floor(sorted.length / 2)]), variable };
}

/** Runs pose estimation over a clip at the requested rate. */
export async function extractPoseFrames(
  video: HTMLVideoElement,
  engine: PoseEngine,
  opts: ExtractOptions,
): Promise<ExtractResult> {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('The video has no readable duration.');
  const aspect = video.videoWidth / video.videoHeight;

  const timing = await estimateFrameTiming(video);
  const fallbackFps = opts.recordedFps > 0 ? opts.recordedFps : 30;
  const nativeInterval = timing?.interval ?? 1 / fallbackFps;
  // With an unknown recorded rate the clip is taken at face value (real time). Otherwise, if native frames are
  // farther apart than the recorded rate implies, the timeline is slowed (slow-motion export).
  const recordedFps = opts.recordedFps > 0 ? opts.recordedFps : 1 / nativeInterval;
  const ratio = recordedFps * nativeInterval;
  const slowMo = Math.abs(ratio - Math.round(ratio)) < 0.15 ? Math.max(1, Math.round(ratio)) : Math.max(1, ratio);

  const realFps = opts.rate === 'native' ? recordedFps : Math.min(60, recordedFps);
  const k = Math.max(1, Math.round(slowMo / realFps / nativeInterval));
  const step = k * nativeInterval;
  const total = Math.floor((duration - nativeInterval / 2) / step) + 1;
  if (total > MAX_FRAMES) {
    throw new Error(
      `This clip is too long to analyze (${Math.round(duration)} s). Trim it to just the swing, from address to the finish.`,
    );
  }

  // A new clip starts its own timeline at zero, so it needs a landmarker that has not seen a previous clip.
  await engine.startClip();
  const frames: PoseFrame[] = [];
  let lastTs = 0;
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const t = i * step;
    await seekTo(video, Math.min(duration - 0.001, t + nativeInterval * 0.5));
    const ts = Math.max(lastTs + 1, Math.round(t * 1000));
    lastTs = ts;
    frames.push({ t, lm: engine.detect(video, ts) });
    if (i % 4 === 0) {
      opts.onProgress?.(i + 1, total);
      // Let the UI repaint.
      await yieldToUi();
    }
  }
  opts.onProgress?.(total, total);
  return {
    frames,
    aspect,
    step,
    slowMo,
    analysisFps: realFps,
    nativeInterval,
    variableSpeed: timing?.variable ?? false,
    timingGuessed: timing === null,
  };
}

/** Captures a small JPEG of the video at the given media time. */
export async function captureThumbnail(video: HTMLVideoElement, time: number, width = 240): Promise<string | undefined> {
  try {
    await seekTo(video, Math.max(0, Math.min(video.duration - 0.001, time)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * video.videoHeight) / video.videoWidth);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}
