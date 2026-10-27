import { useEffect, useRef, useState } from 'react';
import type { MetricId, SwingRecord } from '../types';
import type { AppSettings } from '../settings';
import { claudeCoach } from '../coach/claudeCoach';
import { swingScore } from '../analysis/score';
import { toRecord, type CurrentSwing } from '../state';
import { newId, saveSwing } from '../storage/db';
import { OverlayPlayer } from './OverlayPlayer';
import { MetricsPanel } from './MetricsPanel';
import { MetricDetail } from './MetricDetail';
import { metricGuide } from '../coach/metricGuide';
import { CoachPanel } from './CoachPanel';
import { ScoreRing } from './ScoreRing';
import { Sheet } from './Sheet';
import { Switch } from './controls';
import { AlertIcon, CheckIcon, ChevronLeftIcon, DownloadIcon, MoreIcon, TrashIcon } from './icons';

interface Props {
  current: CurrentSwing;
  setCurrent: (next: CurrentSwing) => void;
  settings: AppSettings;
  history: SwingRecord[];
  onSaved: () => void;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function ResultsScreen({ current, setCurrent, settings, history, onSaved, onBack, onDelete }: Props) {
  const [keepClip, setKeepClip] = useState(settings.keepClip);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<MetricId | null>(null);
  const [seek, setSeek] = useState<{ frame: number } | null>(null);
  const playerRef = useRef<HTMLElement>(null);
  const detailMetric = detail ? current.analysis.metrics.find((m) => m.id === detail) ?? null : null;

  const { analysis } = current;
  const score = swingScore(analysis);
  const canAsk = settings.useClaude && settings.claudeKey.length > 0;
  const m = (id: string) => analysis.metrics.find((x) => x.id === id);
  const tempo = m('tempo');

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const save = async () => {
    if (current.isDemo) return;
    setSaving(true);
    try {
      const id = current.savedId ?? newId();
      const record = toRecord(current, id, keepClip);
      await saveSwing(record, keepClip && current.clip ? current.clip : undefined);
      setCurrent({ ...current, savedId: id, createdAt: record.createdAt });
      onSaved();
      setToast(current.savedId ? 'Swing updated' : 'Saved to Progress');
    } catch {
      setToast('Could not save. Storage may be blocked in this browser.');
    } finally {
      setSaving(false);
    }
  };

  const askClaude = async () => {
    setAsking(true);
    setAskError(null);
    try {
      const coach = await claudeCoach(current.analysis, history, { apiKey: settings.claudeKey, model: settings.claudeModel });
      setCurrent({ ...current, coach });
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'The request to Claude failed.');
    } finally {
      setAsking(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), label: current.label, ...current.analysis }, null, 1)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.label.replace(/[^\w-]+/g, '_') || 'swing'}-analysis.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenu(false);
  };

  return (
    <div className="screen results" role="region" aria-label="Swing results">
      <header className="navbar">
        <button type="button" className="nav-back" onClick={onBack}>
          <ChevronLeftIcon size={22} />
          <span>Back</span>
        </button>
        <h1 className="nav-title">{current.isDemo ? 'Demo swing' : current.label}</h1>
        <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label="More actions">
          <MoreIcon size={22} />
        </button>
      </header>

      <div className="res-grid">
        <div className="res-main">
          <section className={`summary ${score?.tone ?? 'warn'}`}>
            {score ? (
              <ScoreRing value={score.value} tone={score.tone} size={124} caption={score.label} />
            ) : (
              <div className="summary-empty">No score</div>
            )}
            <div className="summary-text">
              <p className="eyebrow">
                {analysis.settings.view === 'face-on' ? 'Face-on' : 'Down the line'}
                {score ? ` · ${score.inRange}/${score.measured} in range` : ''}
              </p>
              <h2>{current.coach.headline}</h2>
            </div>
            <dl className="stat-strip">
              <div>
                <dt>Tempo</dt>
                <dd>{tempo && tempo.status !== 'unavailable' ? tempo.display : '—'}</dd>
              </div>
              <div>
                <dt>Backswing</dt>
                <dd>{analysis.durations.backswing.toFixed(2)} s</dd>
              </div>
              <div>
                <dt>Downswing</dt>
                <dd>{analysis.durations.downswing.toFixed(2)} s</dd>
              </div>
            </dl>
          </section>

          {current.isDemo && (
            <p className="callout info">
              <AlertIcon size={18} />
              <span>This is a simulated stick-figure swing that shows how the analysis looks. It cannot be saved.</span>
            </p>
          )}

          {analysis.quality.warnings.length > 0 && (
            <div className={`callout ${analysis.quality.level === 'poor' ? 'bad' : 'warn'}`} role="note">
              <AlertIcon size={18} />
              <ul>
                {analysis.quality.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="card flush" ref={playerRef}>
            <OverlayPlayer
              key={current.videoUrl ?? current.label + analysis.frames.length}
              analysis={analysis}
              videoUrl={current.videoUrl}
              seek={seek}
              noVideoNote={
                current.isDemo ? undefined : 'The video was not kept when this swing was saved. Swings you save from now on keep their video.'
              }
            />
          </section>
          {!current.isDemo && (
            <div className="savebar">
              <button type="button" className="btn primary wide" onClick={save} disabled={saving}>
                {current.savedId ? (
                  <>
                    <CheckIcon size={18} /> Saved · update
                  </>
                ) : (
                  'Save swing'
                )}
              </button>
            </div>
          )}
        </div>

        <div className="res-side">
          <CoachPanel
            note={current.coach}
            canAskClaude={canAsk}
            asking={asking}
            error={askError}
            onAskClaude={askClaude}
            between={
              <section className="block">
                <h3 className="block-title">Measurements</h3>
                <MetricsPanel metrics={analysis.metrics} onSelect={(m) => setDetail(m.id)} />
                <p className="muted small fineprint">
                  Ranges are starting heuristics, not validated norms, and one camera can only measure what it can see. Read the
                  numbers together with the annotated replay.
                </p>
              </section>
            }
          />
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <Sheet open={detailMetric !== null} onClose={() => setDetail(null)} title={detailMetric?.label ?? ''}>
        {detailMetric && (
          <MetricDetail
            metric={detailMetric}
            analysis={analysis}
            onShow={() => {
              setSeek({ frame: analysis.phases[metricGuide(detailMetric, analysis).phase] });
              setDetail(null);
              window.setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 240);
            }}
          />
        )}
      </Sheet>

      <Sheet open={menu} onClose={() => { setMenu(false); setConfirmDelete(false); }} title="Swing options">
        <div className="menu">
          {!current.isDemo && (
            <>
              <label className="field" htmlFor="swing-name">
                <span>Name</span>
                <input
                  id="swing-name"
                  type="text"
                  value={current.label}
                  onChange={(e) => setCurrent({ ...current, label: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <div className="row-item">
                <label className="row-label" htmlFor="keep-clip">
                  <span>Keep the video clip</span>
                  <small>Saves the clip on this device so you can replay it later.</small>
                </label>
                <Switch id="keep-clip" checked={keepClip} onChange={setKeepClip} label="Keep the video clip" />
              </div>
            </>
          )}
          <button type="button" className="menu-item" onClick={exportData}>
            <DownloadIcon size={20} />
            <span>Export data (JSON)</span>
          </button>
          {current.savedId &&
            (confirmDelete ? (
              <div className="confirm">
                <p>Delete this saved swing and its clip?</p>
                <div className="confirm-actions">
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      await onDelete(current.savedId!);
                      setMenu(false);
                      onBack();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="menu-item danger" onClick={() => setConfirmDelete(true)}>
                <TrashIcon size={20} />
                <span>Delete this swing</span>
              </button>
            ))}
        </div>
      </Sheet>
    </div>
  );
}
