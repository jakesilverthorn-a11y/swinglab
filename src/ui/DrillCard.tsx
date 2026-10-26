import { useState } from 'react';
import type { Drill } from '../types';
import { FAULT_DEFS } from '../analysis/faults';
import { AlertIcon, ChevronDownIcon, TargetIcon } from './icons';

const FAULT_LABEL: Record<string, string> = Object.fromEntries(FAULT_DEFS.map((f) => [f.id, f.label]));

export function DrillCard({ drill, open = false }: { drill: Drill; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const bodyId = `drill-${drill.id}`;
  return (
    <article className={`drill${expanded ? ' open' : ''}`}>
      <button type="button" className="drill-head" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((e) => !e)}>
        <span className="drill-icon">
          <TargetIcon size={20} />
        </span>
        <span className="drill-title">
          <strong>{drill.name}</strong>
          <small>Helps with {drill.faultIds.map((f) => FAULT_LABEL[f] ?? f).join(', ').toLowerCase()}</small>
        </span>
        <ChevronDownIcon size={18} className="drill-chev" />
      </button>
      {expanded && (
        <div id={bodyId} className="drill-body">
          <p>{drill.summary}</p>
          <ol>
            {drill.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <dl className="drill-meta">
            <div>
              <dt>Reps</dt>
              <dd>{drill.reps}</dd>
            </div>
            <div>
              <dt>Feel</dt>
              <dd>“{drill.cue}”</dd>
            </div>
          </dl>
          {drill.caution && (
            <p className="callout warn">
              <AlertIcon size={18} />
              <span>{drill.caution}</span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
