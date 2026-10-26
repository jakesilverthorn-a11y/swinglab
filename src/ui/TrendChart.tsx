import { useId } from 'react';

export type Tone = 'good' | 'warn' | 'bad';

export interface TrendPoint {
  value: number;
  at: number;
  tone: Tone;
}

export interface TrendGuide {
  y: number;
  tone: Tone;
}

interface Props {
  points: TrendPoint[];
  guides?: TrendGuide[];
  /** Fixed y range. Without it the range is fitted to the data and guides. */
  domain?: [number, number];
  format?: (v: number) => string;
  label: string;
  emptyText: string;
}

const W = 340;
const H = 190;
const M = { l: 38, r: 14, t: 14, b: 28 };

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Line chart with an area fill, light gridlines, dashed threshold guides, and the latest point emphasized. */
export function TrendChart({ points, guides = [], domain, format, label, emptyText }: Props) {
  const gid = useId();
  if (points.length < 2) return <p className="muted empty-chart">{emptyText}</p>;

  const fmt = format ?? ((v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)));
  const all = [...points.map((p) => p.value), ...guides.map((g) => g.y)];
  let y0: number;
  let y1: number;
  if (domain) {
    [y0, y1] = domain;
  } else {
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo || 1) * 0.14;
    y0 = lo - pad;
    y1 = hi + pad;
  }
  const X = (i: number) => M.l + (i / (points.length - 1)) * (W - M.l - M.r);
  const Y = (v: number) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const ticks = [y0, (y0 + y1) / 2, y1];
  const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${X(0).toFixed(1)},${(H - M.b).toFixed(1)} ${line} ${X(points.length - 1).toFixed(1)},${(H - M.b).toFixed(1)}`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over ${points.length} swings, latest ${fmt(last.value)}`} className="trend">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className="grid" />
          <text x={M.l - 7} y={Y(t) + 3.5} textAnchor="end" className="axis">
            {fmt(t)}
          </text>
        </g>
      ))}
      {guides.map((g, i) => (
        <line key={i} x1={M.l} x2={W - M.r} y1={Y(g.y)} y2={Y(g.y)} className={`guide ${g.tone}`} />
      ))}
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" className="series" />
      {points.map((p, i) => (
        <circle key={i} cx={X(i)} cy={Y(p.value)} r={i === points.length - 1 ? 0 : 3} className={`dot ${p.tone}`}>
          <title>{`${day(p.at)}: ${fmt(p.value)}`}</title>
        </circle>
      ))}
      <circle cx={X(points.length - 1)} cy={Y(last.value)} r="9" className={`halo ${last.tone}`} />
      <circle cx={X(points.length - 1)} cy={Y(last.value)} r="4.6" className={`dot last ${last.tone}`} />
      <text x={M.l} y={H - 8} className="axis">
        {day(points[0].at)}
      </text>
      <text x={W - M.r} y={H - 8} textAnchor="end" className="axis">
        {day(last.at)}
      </text>
    </svg>
  );
}
