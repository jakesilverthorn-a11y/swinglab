import { DRILLS } from '../coach/drills';
import { DrillCard } from './DrillCard';

export function DrillsPanel() {
  return (
    <div className="screen-pad">
      <h1 className="large-title">Drills</h1>
      <p className="lede">
        Every fault SwingLab can detect maps to one or two of these drills. Go slowly, stay within your comfort, and film another swing
        afterwards to see whether the number moved.
      </p>
      <div className="drill-list">
        {DRILLS.map((d) => (
          <DrillCard key={d.id} drill={d} />
        ))}
      </div>
    </div>
  );
}
