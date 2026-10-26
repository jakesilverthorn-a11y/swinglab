import { useMemo, useState } from 'react';
import type { MetricId, SwingRecord } from '../types';
import { FAULT_DEFS } from '../analysis/faults';
import { META, METRIC_ORDER, THRESHOLDS } from '../analysis/metrics';
import { swingScore } from '../analysis/score';
import { formatDay } from '../state';
import { splitDisplay } from './MetricsPanel';
import { TrendChart, type TrendPoint, type TrendGuide } from './TrendChart';
import { ScoreRing } from './ScoreRing';
import { Sheet } from './Sheet';
import { CheckIcon, ChevronRightIcon, TrendIcon } from './icons';

interface Props {
  records: SwingRecord[];
  onOpen: (record: SwingRecord) => void;
  onAdd: () => void;
}

export function HistoryPanel({ records, onOpen, onAdd }: Props) {
  const [metricId, setMetricId] = useState<MetricId>('tempo');
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const chronological = useMemo(() => [...records].reverse(), [records]);
  const recent = records.slice(0, 10);

  const frequency = useMemo(
    () =>
      FAULT_DEFS.map((f) => ({
        id: f.id,
        label: f.label,
        count: recent.filter((r) => r.analysis.faults.some((x) => x.id === f.id)).length,
      }))
        .filter((f) => f.count > 0)
        .sort((a, b) => b.count - a.count),
    [recent],
  );

  const scorePoints: TrendPoint[] = useMemo(
    () =>
      chronological
        .map((r) => {
          const s = swingScore(r.analysis);
          return s ? { value: s.value, at: r.createdAt, tone: s.tone } : null;
        })
        .filter((p): p is TrendPoint => p !== null),
    [chronological],
  );

  const metricPoints: TrendPoint[] = useMemo(
    () =>
      chronological
        .map((r) => {
          const m = r.analysis.metrics.find((x) => x.id === metricId);
          return m && m.value !== null && m.status !== 'unavailable' ? { value: m.value, at: r.createdAt, tone: m.status } : null;
        })
        .filter((p): p is TrendPoint => p !== null),
    [chronological, metricId],
  );

  const th = THRESHOLDS[metricId];
  const guides: TrendGuide[] =
    th.kind === 'band'
      ? [
          { y: th.goodLo, tone: 'good' },
          { y: th.goodHi, tone: 'good' },
        ]
      : [
          { y: th.warn, tone: 'warn' },
          { y: th.bad, tone: 'bad' },
        ];

  const compare = picked.map((id) => records.find((r) => r.id === id)).filter((r): r is SwingRecord => Boolean(r));
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  const scoreLow = scorePoints.length ? Math.min(...scorePoints.map((p) => p.value)) : 0;
  const scoreDomain: [number, number] = [Math.max(0, Math.floor((scoreLow - 8) / 10) * 10), 100];
  const latest = scorePoints[scorePoints.length - 1];
  const prior = scorePoints.slice(Math.max(0, scorePoints.length - 6), -1);
  const priorAvg = prior.length ? prior.reduce((a, p) => a + p.value, 0) / prior.length : null;
  const delta = latest && priorAvg !== null ? Math.round(latest.value - priorAvg) : null;

  if (records.length === 0) {
    return (
      <div className="screen-pad">
        <h1 className="large-title">Progress</h1>
        <section className="empty-state">
          <span className="empty-icon">
            <TrendIcon size={28} />
          </span>
          <h2>Your progress will show up here</h2>
          <p className="muted">
            Analyze a swing and tap Save swing. After two or more saved swings you will see your score and each measurement trend over
            time.
          </p>
          <button type="button" className="btn primary" onClick={onAdd}>
            Add a swing
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="screen-pad">
      <h1 className="large-title">Progress</h1>

      <section className="card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Swing score</p>
            <p className="big-num">
              {latest ? latest.value : '—'}
              {delta !== null && delta !== 0 && (
                <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                  {delta > 0 ? '+' : '−'}
                  {Math.abs(delta)}
                </span>
              )}
            </p>
            <p className="muted small">{delta !== null ? 'vs your previous 5 swings' : 'Latest saved swing'}</p>
          </div>
          {latest && <ScoreRing value={latest.value} tone={latest.tone} size={72} compact />}
        </div>
        <TrendChart
          points={scorePoints}
          guides={[{ y: 70, tone: 'good' }]}
          domain={scoreDomain}
          format={(v) => String(Math.round(v))}
          label="Swing score"
          emptyText="Save at least two swings to see your score trend."
        />
      </section>

      <section className="card">
        <h2 className="card-title">Measurements over time</h2>
        <div className="chip-scroll" role="radiogroup" aria-label="Measurement">
          {METRIC_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={metricId === id}
              className={`chip${metricId === id ? ' on' : ''}`}
              onClick={() => setMetricId(id)}
            >
              {META[id].label}
            </button>
          ))}
        </div>
        <TrendChart
          points={metricPoints}
          guides={guides}
          label={META[metricId].label}
          emptyText={`Save at least two swings that measured ${META[metricId].label.toLowerCase()} to see a trend.`}
        />
        <p className="muted small">Dashed lines mark the {th.kind === 'band' ? 'edges of the target range' : 'watch and fix-this thresholds'}.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Faults in your last {recent.length} swings</h2>
        {frequency.length === 0 ? (
          <p className="muted">No faults were flagged in your recent swings.</p>
        ) : (
          <ul className="bars">
            {frequency.map((f) => (
              <li key={f.id}>
                <span className="bar-label">{f.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(f.count / recent.length) * 100}%` }} />
                </span>
                <span className="bar-count tabular">
                  {f.count}/{recent.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2 className="block-title">Saved swings</h2>
          {picked.length === 2 ? (
            <button type="button" className="btn small primary" onClick={() => setComparing(true)}>
              Compare
            </button>
          ) : (
            <span className="muted small">Tick two to compare</span>
          )}
        </div>
        <ul className="swing-list">
          {records.map((r) => {
            const s = swingScore(r.analysis);
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`pick${on ? ' on' : ''}`}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Compare ${r.label}`}
                  onClick={() => toggle(r.id)}
                >
                  {on && <CheckIcon size={14} />}
                </button>
                <button type="button" className="swing-row" onClick={() => onOpen(r)}>
                  {r.thumbnail ? <img src={r.thumbnail} alt="" className="thumb" /> : <span className="thumb empty" aria-hidden="true" />}
                  <span className="swing-row-text">
                    <strong>{r.label}</strong>
                    <small>
                      {formatDay(r.createdAt)} · {r.analysis.settings.view === 'face-on' ? 'Face-on' : 'Down the line'}
                    </small>
                    <small className="fix">{r.analysis.faults[0] ? r.analysis.faults[0].label : 'No faults flagged'}</small>
                  </span>
                  {s && <span className={`score-pill ${s.tone}`}>{s.value}</span>}
                  <ChevronRightIcon size={16} className="chev" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={comparing && compare.length === 2} onClose={() => setComparing(false)} title="Compare swings">
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>Measurement</th>
                {compare.map((r) => (
                  <th key={r.id}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Swing score</td>
                {compare.map((r) => {
                  const s = swingScore(r.analysis);
                  return (
                    <td key={r.id} className={s?.tone ?? 'unavailable'}>
                      {s ? s.value : 'n/a'}
                    </td>
                  );
                })}
              </tr>
              {METRIC_ORDER.map((id) => {
                const cells = compare.map((r) => r.analysis.metrics.find((m) => m.id === id));
                if (cells.every((c) => !c || c.status === 'unavailable')) return null;
                return (
                  <tr key={id}>
                    <td>{META[id].label}</td>
                    {cells.map((c, i) => (
                      <td key={i} className={c ? c.status : 'unavailable'}>
                        {c && c.status !== 'unavailable' ? splitDisplay(c.display).figure : 'n/a'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sheet>
    </div>
  );
}
