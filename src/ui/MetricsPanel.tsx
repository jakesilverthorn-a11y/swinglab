import type { MetricResult, MetricStatus } from '../types';
import { THRESHOLDS, type Threshold } from '../analysis/metrics';
import { AlertIcon, CheckIcon, ChevronRightIcon, CloseIcon, InfoIcon } from './icons';

export const STATUS_LABEL: Record<MetricStatus, string> = {
  good: 'In range',
  warn: 'Watch',
  bad: 'Fix this',
  unavailable: 'Not measured',
};

const ACTION_LABEL: Record<MetricStatus, string> = {
  good: 'How to keep it',
  warn: 'How to fix it',
  bad: 'How to fix it',
  unavailable: 'Why it was not measured',
};

const ORDER: Record<MetricStatus, number> = { bad: 0, warn: 1, good: 2, unavailable: 3 };

type Tone = 'good' | 'warn' | 'bad';
interface Zone {
  from: number;
  to: number;
  tone: Tone;
}

/** Lays the metric's thresholds out on a bar and finds where the measured value sits (all as 0..100 percentages). */
export function gaugeFor(th: Threshold, value: number): { zones: Zone[]; marker: number; clamped: boolean } {
  let edges: Array<[number, Tone]>;
  let lo: number;
  let hi: number;
  if (th.kind === 'high') {
    const span = th.bad - th.warn;
    lo = th.warn - 1.2 * span;
    hi = th.bad + 0.6 * span;
    edges = [
      [th.warn, 'good'],
      [th.bad, 'warn'],
      [hi, 'bad'],
    ];
  } else if (th.kind === 'low') {
    const span = th.warn - th.bad;
    hi = th.warn + 1.2 * span;
    lo = th.bad - 0.6 * span;
    edges = [
      [th.bad, 'bad'],
      [th.warn, 'warn'],
      [hi, 'good'],
    ];
  } else {
    const wLo = th.goodLo - th.warnLo;
    const wHi = th.warnHi - th.goodHi;
    lo = th.warnLo - 0.6 * wLo;
    hi = th.warnHi + 0.6 * wHi;
    edges = [
      [th.warnLo, 'bad'],
      [th.goodLo, 'warn'],
      [th.goodHi, 'good'],
      [th.warnHi, 'warn'],
      [hi, 'bad'],
    ];
  }
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zones: Zone[] = [];
  let prev = lo;
  for (const [edge, tone] of edges) {
    zones.push({ from: pos(prev), to: pos(edge), tone });
    prev = edge;
  }
  const raw = pos(value);
  const marker = Math.min(97, Math.max(3, raw));
  return { zones, marker, clamped: raw !== marker };
}

/** Splits "59% of shoulder width" into the figure ("59%") and its unit text, so the figure can be set large. */
export function splitDisplay(display: string): { figure: string; unit: string } {
  const m = /^([+−-]?\d+(?:\.\d+)?(?:\s:\s\d+(?:\.\d+)?)?[%°]?)\s*(.*)$/.exec(display.trim());
  if (!m) return { figure: display, unit: '' };
  return { figure: m[1].replace(/^-/, '−'), unit: m[2] };
}

const StatusIcon = ({ status }: { status: MetricStatus }) =>
  status === 'good' ? (
    <CheckIcon size={14} />
  ) : status === 'warn' ? (
    <AlertIcon size={14} />
  ) : status === 'bad' ? (
    <CloseIcon size={14} />
  ) : (
    <InfoIcon size={14} />
  );

export function MetricsPanel({ metrics, onSelect }: { metrics: MetricResult[]; onSelect?: (m: MetricResult) => void }) {
  const sorted = [...metrics].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return (
    <div className="metrics">
      {sorted.map((m) => {
        const measured = m.status !== 'unavailable' && m.value !== null;
        const g = measured ? gaugeFor(THRESHOLDS[m.id], m.value as number) : null;
        const { figure, unit } = splitDisplay(m.display);
        return (
          <article
            key={m.id}
            className={`metric ${m.status}${onSelect ? ' tappable' : ''}`}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={onSelect ? `${m.label}, ${m.display}, ${STATUS_LABEL[m.status]}. ${ACTION_LABEL[m.status]}` : undefined}
            onClick={onSelect ? () => onSelect(m) : undefined}
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(m);
                    }
                  }
                : undefined
            }
          >
            <header>
              <h4>{m.label}</h4>
              <span className={`pill ${m.status}`}>
                <StatusIcon status={m.status} />
                {STATUS_LABEL[m.status]}
              </span>
            </header>
            <p className="metric-value">
              <span className="mv-num">{figure}</span>
              {unit && <span className="mv-unit">{unit}</span>}
            </p>
            {g && (
              <div className="gauge" role="img" aria-label={`${m.label} ${m.display}. ${STATUS_LABEL[m.status]}. Target ${m.target}.`}>
                {g.zones.map((z, i) => (
                  <span
                    key={i}
                    className={`zone ${z.tone}${i === 0 ? ' first' : ''}${i === g.zones.length - 1 ? ' last' : ''}`}
                    style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}
                  />
                ))}
                <span className="marker" style={{ left: `${g.marker}%` }} />
              </div>
            )}
            {measured && <p className="metric-target">Target: {m.target}</p>}
            {m.note && <p className="metric-note">{m.note}</p>}
            {measured && (
              <p className="metric-foot">
                <span className="conf-dots" aria-hidden="true">
                  {[0.25, 0.5, 0.75, 1].map((t) => (
                    <i key={t} className={m.confidence >= t - 0.12 ? 'on' : ''} />
                  ))}
                </span>
                Tracking confidence {Math.round(m.confidence * 100)}%{m.experimental ? ' · rough 2D estimate' : ''}
              </p>
            )}
            {onSelect && (
              <span className="metric-more">
                {ACTION_LABEL[m.status]}
                <ChevronRightIcon size={16} />
              </span>
            )}
          </article>
        );
      })}
    </div>
  );
}
