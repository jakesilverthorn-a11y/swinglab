import type { ReactNode } from 'react';
import type { CoachNote } from '../types';
import { DRILL_BY_ID } from '../coach/drills';
import { FAULT_DEFS } from '../analysis/faults';
import { DrillCard } from './DrillCard';
import { CheckIcon, InfoIcon, SparkIcon } from './icons';

interface Props {
  note: CoachNote;
  canAskClaude: boolean;
  asking: boolean;
  error: string | null;
  onAskClaude: () => void;
  /** Rendered between the drills and the notes (the results screen puts the measurements here). */
  between?: ReactNode;
}

/** The written part of the results: why the top fix matters, the drills for it, what is fine, and the caveats. */
export function CoachPanel({ note, canAskClaude, asking, error, onAskClaude, between }: Props) {
  const faultLabel = note.priority ? FAULT_DEFS.find((f) => f.id === note.priority!.faultId)?.label : undefined;
  return (
    <div className="coach">
      {note.priority && (
        <section className="fix-card">
          <p className="eyebrow">Fix this first</p>
          <h3>{faultLabel ?? 'Top priority'}</h3>
          <p>{note.priority.explanation}</p>
          <p className="muted small">{note.source === 'claude' ? 'Written by Claude' : 'Built-in coach'}</p>
        </section>
      )}

      {note.drillIds.length > 0 && (
        <section className="block">
          <h3 className="block-title">Drills to try</h3>
          {note.drillIds.map((id, i) => (DRILL_BY_ID[id] ? <DrillCard key={id} drill={DRILL_BY_ID[id]} open={i === 0} /> : null))}
        </section>
      )}

      {between}

      {note.positives.length > 0 && (
        <section className="block">
          <h3 className="block-title">What looks fine</h3>
          <ul className="check-list">
            {note.positives.map((p, i) => (
              <li key={i}>
                <CheckIcon size={16} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.caveats.length > 0 && (
        <section className="block">
          <h3 className="block-title">Keep in mind</h3>
          <ul className="note-list">
            {note.caveats.map((c, i) => (
              <li key={i}>
                <InfoIcon size={16} />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canAskClaude && (
        <section className="block">
          <button type="button" className="btn secondary wide" onClick={onAskClaude} disabled={asking}>
            <SparkIcon size={18} />
            {asking ? 'Asking Claude…' : note.source === 'claude' ? 'Ask Claude again' : 'Get written feedback from Claude'}
          </button>
          <p className="muted small center">Sends only the metrics summary, never video.</p>
        </section>
      )}
      {error && <p className="callout bad">{error}</p>}
    </div>
  );
}
