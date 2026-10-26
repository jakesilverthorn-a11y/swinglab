import { useRef, useState } from 'react';
import type { SwingRecord } from '../types';
import type { AppSettings } from '../settings';
import { analyzeSwing, AnalysisError } from '../analysis/analyze';
import { getEngine, runtimeProblem } from '../pose/poseEngine';
import { captureThumbnail, extractPoseFrames, loadVideo, releaseVideo } from '../pose/extract';
import { explainError, type ExplainedError } from '../pose/errors';
import { templateCoach } from '../coach/templateCoach';
import { defaultLabel, type CurrentSwing } from '../state';
import { Sheet } from './Sheet';
import { Segmented } from './controls';
import { ScoreRing } from './ScoreRing';
import { AlertIcon, CheckIcon, ChevronDownIcon, VideoIcon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  history: SwingRecord[];
  onResult: (swing: CurrentSwing) => void;
  onDemo: () => void;
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes > 99_500_000 ? 0 : 1)} MB`;

/** Top-down sketch of where the camera goes. The golfer is the bar, the ball the dot, the target line runs left to right. */
function AngleDiagram({ kind }: { kind: 'face-on' | 'down-the-line' }) {
  const camera =
    kind === 'face-on' ? (
      <g transform="translate(32 42)">
        <rect x="-6" y="-4" width="12" height="8" rx="2" className="dg-cam" />
        <path d="M-4 -5 L0 -13 L4 -5 Z" className="dg-view" />
      </g>
    ) : (
      <g transform="translate(6 24)">
        <rect x="-4" y="-6" width="8" height="12" rx="2" className="dg-cam" />
        <path d="M5 -4 L13 0 L5 4 Z" className="dg-view" />
      </g>
    );
  return (
    <svg viewBox="0 0 64 48" className="dg" aria-hidden="true" focusable="false">
      <line x1="14" y1="24" x2="60" y2="24" className="dg-line" />
      <line x1="30" y1="12" x2="30" y2="30" className="dg-body" />
      <circle cx="37" cy="24" r="2.2" className="dg-ball" />
      {camera}
    </svg>
  );
}

const STEPS: Array<{ id: string; match: RegExp }> = [
  { id: 'Open video', match: /^Opening/i },
  { id: 'Load model', match: /model|runtime|download|load/i },
  { id: 'Track body', match: /Tracking/i },
  { id: 'Analyze', match: /Analyzing/i },
];

export function CaptureSheet({ open, onClose, settings, onSettingsChange, history, onResult, onDemo }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<ExplainedError | null>(null);
  const [showTips, setShowTips] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [runtimeIssue] = useState(runtimeProblem);

  const analyze = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setProgress(null);
    setStatus('Opening the video…');
    const url = URL.createObjectURL(file);
    let keepUrl = false;
    let video: HTMLVideoElement | null = null;
    try {
      video = await loadVideo(url);
      const engine = await getEngine(settings.modelVariant, setStatus);
      setStatus('Tracking your body, frame by frame…');
      const extracted = await extractPoseFrames(video, engine, {
        recordedFps: settings.recordedFps,
        rate: settings.analysisRate,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      });
      setStatus('Analyzing the swing…');
      const captureWarnings: string[] = [];
      if (extracted.variableSpeed) {
        captureWarnings.push(
          'The frame timing of this clip changes partway through, which usually means variable-speed slow motion was baked in. Tempo and timings cannot be trusted. Send the original slo-mo video instead (AirDrop it, or Share and choose Options, All Photos Data).',
        );
      }
      if (extracted.timingGuessed) {
        captureWarnings.push(
          'This browser could not report the video frame timing, so the recorded frame rate setting was used as is. If the clip is a slow-motion export, check that setting.',
        );
      }
      const analysis = analyzeSwing(
        extracted.frames,
        extracted.aspect,
        {
          handedness: settings.handedness,
          view: settings.view,
          analysisFps: extracted.analysisFps,
          slowMo: extracted.slowMo,
        },
        { nativeInterval: extracted.nativeInterval, warnings: captureWarnings },
      );
      const thumbnail = await captureThumbnail(video, extracted.frames[analysis.phases.address].t);
      keepUrl = true;
      setFile(null);
      onResult({
        analysis,
        videoUrl: url,
        clip: file,
        thumbnail,
        coach: templateCoach(analysis, history),
        label: defaultLabel(),
        isDemo: false,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setError({ message: 'Analysis cancelled.' });
      else if (err instanceof AnalysisError) setError({ message: err.message });
      else {
        console.error('Analysis failed', err);
        setError(explainError(err));
      }
    } finally {
      if (video) releaseVideo(video);
      if (!keepUrl) URL.revokeObjectURL(url);
      setBusy(false);
      setProgress(null);
      setStatus('');
      abortRef.current = null;
    }
  };

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const activeStep = Math.max(0, STEPS.findIndex((s) => s.match.test(status)));

  const footer = busy ? (
    <button type="button" className="btn ghost wide" onClick={() => abortRef.current?.abort()}>
      Cancel
    </button>
  ) : (
    <>
      <button type="button" className="btn primary wide" onClick={analyze} disabled={!file || runtimeIssue !== null}>
        Analyze swing
      </button>
      <button type="button" className="btn text wide" onClick={onDemo}>
        Try a demo swing instead
      </button>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title={busy ? 'Analyzing' : 'Add a swing'} footer={footer} dismissible={!busy}>
      {busy ? (
        <div className="progress-view" role="status">
          <ScoreRing value={pct} tone="good" size={156} caption="tracked" />
          <p className="progress-status">{status}</p>
          {progress && (
            <p className="muted small tabular">
              Frame {progress.done} of {progress.total}
            </p>
          )}
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i < activeStep ? 'done' : i === activeStep ? 'now' : ''}>
                <span className="step-dot">{i < activeStep ? <CheckIcon size={12} /> : null}</span>
                {s.id}
              </li>
            ))}
          </ol>
          <p className="muted small center">Everything happens on this device. Keep the app open until it finishes.</p>
        </div>
      ) : (
        <div className="capture">
          <section>
            <h3 className="eyebrow">Camera angle</h3>
            <div className="angle-grid">
              {(
                [
                  { id: 'face-on', name: 'Face-on', note: 'Head sway, hip slide, finish balance' },
                  { id: 'down-the-line', name: 'Down the line', note: 'Spine angle, hips to ball, hand path' },
                ] as const
              ).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`angle-card${settings.view === a.id ? ' on' : ''}`}
                  aria-pressed={settings.view === a.id}
                  onClick={() => onSettingsChange({ ...settings, view: a.id })}
                >
                  <AngleDiagram kind={a.id} />
                  <strong>{a.name}</strong>
                  <small>{a.note}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="eyebrow">Golfer</h3>
            <Segmented
              label="Handedness"
              value={settings.handedness}
              onChange={(v) => onSettingsChange({ ...settings, handedness: v })}
              options={[
                { value: 'left', label: 'Left-handed' },
                { value: 'right', label: 'Right-handed' },
              ]}
            />
          </section>

          <section>
            <h3 className="eyebrow">Video</h3>
            <input
              ref={pickerRef}
              id="clip-input"
              className="visually-hidden"
              type="file"
              accept="video/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <button type="button" className={`picker${file ? ' has' : ''}`} onClick={() => pickerRef.current?.click()}>
              <span className="picker-icon">{file ? <CheckIcon size={22} /> : <VideoIcon size={24} />}</span>
              <span className="picker-text">
                <strong>{file ? file.name : 'Choose a video'}</strong>
                <small>{file ? `${mb(file.size)} · tap to change` : 'From Photos, or record one now'}</small>
              </span>
            </button>
            <p className="muted small fps-line">
              Treating the clip as <strong>{settings.recordedFps > 0 ? `${settings.recordedFps} fps` : 'real time'}</strong>. Change it in
              Settings if you filmed at a different speed.
            </p>
          </section>

          {runtimeIssue && (
            <p className="callout bad" role="alert">
              <AlertIcon size={18} />
              <span>{runtimeIssue}</span>
            </p>
          )}
          {error && (
            <div className="callout bad" role="alert">
              <AlertIcon size={18} />
              <div className="callout-text">
                <p>{error.message}</p>
                {error.detail && (
                  <details className="error-detail">
                    <summary>Technical details</summary>
                    <pre>{error.detail}</pre>
                  </details>
                )}
              </div>
            </div>
          )}

          <button type="button" className="disclose" aria-expanded={showTips} onClick={() => setShowTips((s) => !s)}>
            <span>How to film a swing that analyzes well</span>
            <ChevronDownIcon size={18} className={showTips ? 'flip' : ''} />
          </button>
          {showTips && (
            <ul className="tips-list">
              <li>Prop the phone at waist height, about 3 m (10 ft) away, and keep it still.</li>
              <li>Record in Slo-mo at 120 fps, landscape. Send the original file, not an edited copy.</li>
              <li>Keep your whole body, the club and your finish in frame, with even light.</li>
              <li>One swing per clip. Start recording once you are set, and stop after you hold the finish.</li>
              <li>
                Face-on means the camera looks at your chest. Down the line means it sits behind you on the line to the target.
              </li>
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
