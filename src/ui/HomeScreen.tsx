import { useMemo } from 'react';
import type { SwingRecord } from '../types';
import type { CurrentSwing } from '../state';
import { formatDate, formatDay } from '../state';
import { swingScore } from '../analysis/score';
import { DRILL_BY_ID } from '../coach/drills';
import { FAULT_DEFS } from '../analysis/faults';
import { LogoMark, ChevronRightIcon, PlusIcon, PlayIcon } from './icons';
import { ScoreRing } from './ScoreRing';
import { DrillCard } from './DrillCard';

interface Props {
  history: SwingRecord[];
  current: CurrentSwing | null;
  onAdd: () => void;
  onDemo: () => void;
  onOpenCurrent: () => void;
  onOpenRecord: (record: SwingRecord) => void;
  onSeeAll: () => void;
}

function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 220 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hero-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M-10 20C20 130 120 170 214 80" fill="none" stroke="url(#hero-arc)" strokeWidth="2" />
      <path d="M-10 44C28 140 120 176 220 98" fill="none" stroke="url(#hero-arc)" strokeWidth="1.2" opacity="0.5" />
      <path d="M-10 66C34 150 124 182 226 116" fill="none" stroke="url(#hero-arc)" strokeWidth="1" opacity="0.28" />
      <circle cx="192" cy="60" r="7" fill="var(--accent)" />
      <circle cx="192" cy="60" r="16" fill="none" stroke="var(--accent)" strokeOpacity="0.28" />
    </svg>
  );
}

export function HomeScreen({ history, current, onAdd, onDemo, onOpenCurrent, onOpenRecord, onSeeAll }: Props) {
  const latest = history[0];
  const showCurrent = current !== null && current.savedId === undefined;
  const latestAnalysis = showCurrent ? current.analysis : latest?.analysis;

  const stats = useMemo(() => {
    const scores = history.map((r) => swingScore(r.analysis)?.value).filter((v): v is number => v !== undefined);
    const last5 = scores.slice(0, 5);
    const avg = last5.length ? Math.round(last5.reduce((a, b) => a + b, 0) / last5.length) : null;
    const counts = new Map<string, number>();
    for (const r of history.slice(0, 10)) for (const f of r.analysis.faults.slice(0, 2)) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topLabel = top ? FAULT_DEFS.find((f) => f.id === top[0])?.label : undefined;
    return { avg, topLabel, topCount: top?.[1] ?? 0, n: history.slice(0, 10).length };
  }, [history]);

  const nextDrillId = latestAnalysis?.faults[0]?.drillIds[0];
  const nextDrill = nextDrillId ? DRILL_BY_ID[nextDrillId] : undefined;
  const nextFault = latestAnalysis?.faults[0];

  const lastScore = latestAnalysis ? swingScore(latestAnalysis) : null;
  const lastTitle = showCurrent ? current.label : latest?.label;
  const lastWhen = showCurrent ? 'Just analyzed · not saved yet' : latest ? formatDate(latest.createdAt) : '';
  const lastThumb = showCurrent ? current.thumbnail : latest?.thumbnail;
  const lastFault = latestAnalysis?.faults[0]?.label;
  // The swings under the latest one: skip the one already shown in the card above.
  const earlier = (showCurrent ? history : history.slice(1)).slice(0, 4);

  return (
    <div className="screen-pad">
      <header className="brand">
        <LogoMark size={30} />
        <span className="wordmark">SwingLab</span>
      </header>

      <section className="hero">
        <HeroArt />
        <p className="eyebrow">Slo-mo swing analysis</p>
        <h1>
          Film a swing.
          <br />
          Fix one thing.
        </h1>
        <p className="hero-sub">
          SwingLab tracks your body in a clip from your phone, finds the key positions in your swing, and tells you what to work on
          first.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn primary" onClick={onAdd}>
            <PlusIcon size={18} />
            Add a swing
          </button>
          <button type="button" className="btn secondary" onClick={onDemo}>
            <PlayIcon size={16} />
            See a demo
          </button>
        </div>
      </section>

      {latestAnalysis && (
        <section className="block">
          <h2 className="block-title">Latest swing</h2>
          <button
            type="button"
            className="swing-card"
            onClick={() => (showCurrent ? onOpenCurrent() : latest && onOpenRecord(latest))}
          >
            {lastThumb ? <img src={lastThumb} alt="" className="thumb" /> : <span className="thumb empty" aria-hidden="true" />}
            <span className="swing-card-text">
              <strong>{lastTitle}</strong>
              <small>{lastWhen}</small>
              <span className="swing-card-fix">{lastFault ? `Top fix: ${lastFault}` : 'No major faults flagged'}</span>
            </span>
            {lastScore && <ScoreRing value={lastScore.value} tone={lastScore.tone} size={52} compact />}
            <ChevronRightIcon size={18} className="chev" />
          </button>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2 className="block-title">Earlier swings</h2>
            <button type="button" className="link-btn" onClick={onSeeAll}>
              See all {history.length}
            </button>
          </div>
          <ul className="swing-list">
            {earlier.map((r) => {
              const sc = swingScore(r.analysis);
              return (
                <li key={r.id}>
                  <button type="button" className="swing-row" onClick={() => onOpenRecord(r)}>
                    {r.thumbnail ? <img src={r.thumbnail} alt="" className="thumb" /> : <span className="thumb empty" aria-hidden="true" />}
                    <span className="swing-row-text">
                      <strong>{r.label}</strong>
                      <small>
                        {formatDay(r.createdAt)} · {r.analysis.settings.view === 'face-on' ? 'Face-on' : 'Down the line'}
                      </small>
                      <small className="fix">{r.analysis.faults[0] ? r.analysis.faults[0].label : 'No faults flagged'}</small>
                    </span>
                    {sc && <span className={`score-pill ${sc.tone}`}>{sc.value}</span>}
                    <ChevronRightIcon size={16} className="chev" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="stats" aria-label="Recent summary">
          <div className="stat">
            <span className="stat-num">{history.length}</span>
            <span className="stat-cap">Swings saved</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats.avg ?? '—'}</span>
            <span className="stat-cap">Avg score, last 5</span>
          </div>
          <div className="stat wide-stat">
            <span className="stat-text">{stats.topLabel ?? 'None yet'}</span>
            <span className="stat-cap">
              {stats.topLabel ? `Most common fix, ${stats.topCount} of last ${stats.n}` : 'Most common fix'}
            </span>
          </div>
        </section>
      )}

      {nextDrill && nextFault && (
        <section className="block">
          <h2 className="block-title">Up next: a drill for {nextFault.label.toLowerCase()}</h2>
          <DrillCard drill={nextDrill} />
        </section>
      )}

      {!latestAnalysis && (
        <section className="block how">
          <h2 className="block-title">How it works</h2>
          <ol className="how-list">
            <li>
              <span className="how-num">1</span>
              <div>
                <strong>Film</strong>
                <p>Prop your phone about 10 ft away and record one swing in Slo-mo.</p>
              </div>
            </li>
            <li>
              <span className="how-num">2</span>
              <div>
                <strong>Analyze</strong>
                <p>Pick the clip. The tracking runs on your phone and the video is never uploaded.</p>
              </div>
            </li>
            <li>
              <span className="how-num">3</span>
              <div>
                <strong>Fix one thing</strong>
                <p>See your score, the replay with your skeleton drawn on it, and a drill for the top fault.</p>
              </div>
            </li>
          </ol>
        </section>
      )}
    </div>
  );
}
