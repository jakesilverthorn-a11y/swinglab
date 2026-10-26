import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AnalysisResult, PhaseName } from '../types';
import { drawOverlay, phaseLabel } from './drawOverlay';
import { Segmented } from './controls';
import { PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from './icons';

interface Props {
  analysis: AnalysisResult;
  /** URL of the clip, or null for a synthetic demo swing or a swing saved without its clip (drawn on a plain background). */
  videoUrl: string | null;
  /** Shown over the plain background when there is no clip to play. */
  noVideoNote?: string;
}

const SPEEDS = [0.1, 0.25, 0.5, 1];
const JUMPS: Array<{ key: PhaseName; label: string }> = [
  { key: 'address', label: 'Address' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'top', label: 'Top' },
  { key: 'midDownswing', label: 'Mid-down' },
  { key: 'impact', label: 'Impact' },
  { key: 'finish', label: 'Finish' },
];

export function OverlayPlayer({ analysis, videoUrl, noVideoNote }: Props) {
  const { frames, phases, aspect, frameInterval } = analysis;
  const n = frames.length;
  // Frames were analyzed at the middle of each native frame, so the player aims at the same spot.
  const nativeInterval = analysis.nativeInterval ?? frameInterval;
  const half = nativeInterval * 0.5;
  const [idx, setIdx] = useState(phases.address);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.25);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showGuides, setShowGuides] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idxRef = useRef(idx);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const redrawRef = useRef<(i: number) => void>(() => undefined);

  const redraw = useCallback(
    (i: number) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const cssW = wrap.clientWidth;
      const cssH = cssW / aspect;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(cssH * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, pw, ph);
      if (!videoUrl) {
        ctx.fillStyle = '#0c1210';
        ctx.fillRect(0, 0, pw, ph);
      }
      drawOverlay(ctx, pw, ph, analysis, i, { skeleton: showSkeleton, guides: showGuides });
    },
    [analysis, aspect, videoUrl, showSkeleton, showGuides],
  );

  // The playback loop calls the latest redraw through this ref, so toggling the skeleton or guides mid-play
  // does not restart playback.
  redrawRef.current = redraw;

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(n - 1, i));
    idxRef.current = clamped;
    setIdx(clamped);
  }, [n]);

  // Paused: show the chosen frame (seek the video, draw the overlay).
  useEffect(() => {
    if (playing) return;
    const video = videoRef.current;
    if (video && videoUrl) {
      const target = frames[idx].t + half;
      if (Math.abs(video.currentTime - target) > nativeInterval * 0.25) video.currentTime = target;
    }
    redraw(idx);
  }, [idx, playing, frames, half, nativeInterval, videoUrl, redraw]);

  // Seeking before the clip has loaded does nothing, and iPhones do not draw a paused video until it has played once.
  // So once the clip loads: play it muted for a moment, pause, then seek to the chosen frame.
  const primedRef = useRef(false);
  const onVideoReady = useCallback(() => {
    const video = videoRef.current;
    if (!video || playingRef.current) return;
    const seek = () => {
      if (playingRef.current) return;
      video.currentTime = frames[idxRef.current].t + half;
    };
    if (primedRef.current) {
      seek();
      return;
    }
    primedRef.current = true;
    video
      .play()
      .then(() => {
        if (!playingRef.current) video.pause();
        seek();
      })
      .catch(seek);
  }, [frames, half]);

  // Redraw when the layout changes size.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => redrawRef.current(idxRef.current));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Playing: follow the video clock (or a wall clock for the demo) and draw the matching frame.
  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current && videoUrl ? videoRef.current : null;
    let cancelled = false;
    let raf = 0;
    let k = idxRef.current >= n - 2 ? phases.address : idxRef.current;
    const startT = frames[k].t;
    const wall0 = performance.now();
    if (video) {
      video.playbackRate = speed;
      video.currentTime = startT + half;
      void video.play().catch(() => {
        if (!cancelled) setPlaying(false);
      });
    }
    const tick = () => {
      if (cancelled) return;
      const t = video ? video.currentTime : startT + ((performance.now() - wall0) / 1000) * speed;
      if (t < frames[k].t) k = 0;
      while (k < n - 1 && frames[k + 1].t <= t) k++;
      idxRef.current = k;
      setIdx(k);
      redrawRef.current(k);
      if (k >= n - 1 || video?.ended) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      video?.pause();
    };
  }, [playing, speed, frames, half, n, phases.address, videoUrl]);

  const label = phaseLabel(phases, idx);
  const progress = n > 1 ? (idx / (n - 1)) * 100 : 0;
  const scrubStyle = { '--p': `${progress}%` } as CSSProperties;

  return (
    <div className="player">
      <div ref={wrapRef} className="player-stage" style={{ aspectRatio: String(aspect) }}>
        {videoUrl && (
          <video ref={videoRef} src={videoUrl} muted playsInline preload="auto" onLoadedMetadata={onVideoReady} />
        )}
        <canvas ref={canvasRef} />
        {!videoUrl && noVideoNote && <p className="player-note">{noVideoNote}</p>}
      </div>

      <div className="scrub" style={scrubStyle}>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={idx}
          aria-label="Scrub through the swing"
          aria-valuetext={`${label}, frame ${idx + 1} of ${n}`}
          onChange={(e) => {
            setPlaying(false);
            goTo(Number(e.target.value));
          }}
        />
        <div className="scrub-marks" aria-hidden="true">
          {(['takeaway', 'top', 'impact', 'finish'] as const).map((k) => (
            <span key={k} className={`scrub-mark${idx === phases[k] ? ' on' : ''}`} style={{ '--f': phases[k] / (n - 1) } as CSSProperties} />
          ))}
        </div>
      </div>

      <div className="phase-row" role="group" aria-label="Jump to swing position">
        {JUMPS.map((j) => (
          <button
            key={j.key}
            type="button"
            className={idx === phases[j.key] ? 'phase-chip on' : 'phase-chip'}
            onClick={() => {
              setPlaying(false);
              goTo(phases[j.key]);
            }}
          >
            {j.label}
          </button>
        ))}
      </div>

      <div className="transport">
        <div className="transport-main">
          <button
            type="button"
            className="icon-btn round"
            onClick={() => {
              setPlaying(false);
              goTo(idx - 1);
            }}
            aria-label="Previous frame"
          >
            <StepBackIcon size={20} />
          </button>
          <button type="button" className="play-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </button>
          <button
            type="button"
            className="icon-btn round"
            onClick={() => {
              setPlaying(false);
              goTo(idx + 1);
            }}
            aria-label="Next frame"
          >
            <StepForwardIcon size={20} />
          </button>
        </div>
        <Segmented
          label="Playback speed"
          value={speed}
          onChange={setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
      </div>

      <div className="player-foot">
        <div className="toggles">
          <button type="button" className={`toggle${showSkeleton ? ' on' : ''}`} aria-pressed={showSkeleton} onClick={() => setShowSkeleton((v) => !v)}>
            Skeleton
          </button>
          <button type="button" className={`toggle${showGuides ? ' on' : ''}`} aria-pressed={showGuides} onClick={() => setShowGuides((v) => !v)}>
            Guides
          </button>
        </div>
        <span className="readout tabular">
          {label} · {frames[idx].t.toFixed(2)} s
        </span>
      </div>
    </div>
  );
}
