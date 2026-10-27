import type { AnalysisResult, MetricResult } from '../types';
import { metricGuide } from '../coach/metricGuide';
import { DRILL_BY_ID } from '../coach/drills';
import { THRESHOLDS } from '../analysis/metrics';
import { DrillCard } from './DrillCard';
import { gaugeFor, splitDisplay, STATUS_LABEL } from './MetricsPanel';
import { InfoIcon, PlayIcon } from './icons';

interface Props {
  metric: MetricResult;
  analysis: AnalysisResult;
  /** Jumps the replay to the swing position this metric is measured at. */
  onShow: () => void;
}

/** The body of the sheet that opens when a measurement card is tapped: this swing's read, the goal, and how to fix it. */
export function MetricDetail({ metric: m, analysis, onShow }: Props) {
  const g = metricGuide(m, analysis);
  const measured = m.status !== 'unavailable' && m.value !== null;
  const gauge = measured ? gaugeFor(THRESHOLDS[m.id], m.value as number) : null;
  const { figure, unit } = splitDisplay(m.display);
  const stepsTitle = m.status === 'good' ? 'Keep it there' : measured ? 'How to fix it' : 'How to get it measured';

  return (
    <div className={`mdetail ${m.status}`}>
      {measured && (
        <section className="mdetail-head">
          <div className="mdetail-figure">
            <p className="metric-value">
              <span className="mv-num">{figure}</span>
              {unit && <span className="mv-unit">{unit}</span>}
            </p>
            <span className={`pill ${m.status}`}>{STATUS_LABEL[m.status]}</span>
          </div>
          {gauge && (
            <div className="gauge" aria-hidden="true">
              {gauge.zones.map((z, i) => (
                <span
                  key={i}
                  className={`zone ${z.tone}${i === 0 ? ' first' : ''}${i === gauge.zones.length - 1 ? ' last' : ''}`}
                  style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}
                />
              ))}
              <span className="marker" style={{ left: `${gauge.marker}%` }} />
            </div>
          )}
          <p className="metric-target">Target: {m.target}</p>
        </section>
      )}

      <section className="mdetail-sec">
        <h3 className="mdetail-title">{measured ? 'On this swing' : 'Not measured'}</h3>
        <p>{g.read}</p>
        {g.goal && (
          <p>
            <strong>Goal:</strong> {g.goal}
          </p>
        )}
      </section>

      {measured && (
        <button type="button" className="btn secondary wide" onClick={onShow}>
          <PlayIcon size={16} /> Show me at {g.phaseLabel}
        </button>
      )}

      <section className="mdetail-sec">
        <h3 className="mdetail-title">{stepsTitle}</h3>
        {g.steps.length > 1 ? (
          <ol className="mdetail-steps">
            {g.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p>{g.steps[0]}</p>
        )}
        {measured && (
          <p className="mdetail-feel">
            Feel: <strong>“{g.feel}”</strong>
          </p>
        )}
      </section>

      {measured && (
        <section className="mdetail-sec">
          <h3 className="mdetail-title">Check it on video</h3>
          <p>{g.check}</p>
        </section>
      )}

      {measured && m.status !== 'good' && g.drillIds.length > 0 && (
        <section className="mdetail-sec">
          <h3 className="mdetail-title">Drills for this</h3>
          {g.drillIds.map((id, i) => (DRILL_BY_ID[id] ? <DrillCard key={id} drill={DRILL_BY_ID[id]} open={i === 0} /> : null))}
        </section>
      )}

      {g.caveats.length > 0 && (
        <ul className="note-list">
          {g.caveats.map((c, i) => (
            <li key={i}>
              <InfoIcon size={16} />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
