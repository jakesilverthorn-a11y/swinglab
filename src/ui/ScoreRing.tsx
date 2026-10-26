import { useEffect, useId, useState } from 'react';
import type { ScoreTone } from '../analysis/score';

interface Props {
  value: number;
  tone: ScoreTone;
  size?: number;
  /** Small caption under the number. */
  caption?: string;
  /** Thinner ring and no caption, for list rows. */
  compact?: boolean;
}

/** Circular progress ring that fills to the score. The number uses tabular figures so it does not jitter. */
export function ScoreRing({ value, tone, size = 132, caption, compact = false }: Props) {
  const gid = useId();
  const stroke = compact ? Math.max(4, size * 0.1) : size * 0.085;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className={`ring ${tone}${compact ? ' compact' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Swing score ${value} out of 100`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ring-a)" />
            <stop offset="1" stopColor="var(--ring-b)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-num" style={{ fontSize: size * (compact ? (value >= 100 ? 0.27 : 0.32) : value >= 100 ? 0.31 : 0.36) }}>
          {value}
        </span>
        {caption && !compact && <span className="ring-cap">{caption}</span>}
      </div>
    </div>
  );
}
