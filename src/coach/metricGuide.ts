import type { AnalysisResult, MetricId, MetricResult, PhaseName } from '../types';
import { FAULT_DEFS } from '../analysis/faults';

/** What the measurement detail sheet shows for one metric on one swing. */
export interface MetricGuide {
  /** What this swing showed, in plain words with its numbers. */
  read: string;
  /** Where to get to, and roughly how far that is from this swing. Empty when already in range. */
  goal: string;
  /** Steps to fix it, or the keys to keeping it when it is already in range. */
  steps: string[];
  /** A short feel to swing with. */
  feel: string;
  /** How to check it in the replay. */
  check: string;
  /** The swing position the measurement is taken at, for the "show me" button. */
  phase: PhaseName;
  phaseLabel: string;
  drillIds: string[];
  /** Reasons to take the number with a pinch of salt. */
  caveats: string[];
}

const pct = (v: number) => Math.round(Math.abs(v) * 100);
const sec = (v: number) => `${v.toFixed(2)} s`;

const PHASE_LABEL: Record<PhaseName, string> = {
  address: 'address',
  takeaway: 'the takeaway',
  top: 'the top',
  midDownswing: 'mid-downswing',
  impact: 'impact',
  finish: 'the finish',
};

interface Content {
  phase: PhaseName;
  read: (m: MetricResult, a: AnalysisResult) => string;
  goal: (m: MetricResult, a: AnalysisResult) => string;
  fix: (m: MetricResult, a: AnalysisResult) => string[];
  keep: string[];
  feel: (m: MetricResult) => string;
  check: string;
}

const CONTENT: Record<MetricId, Content> = {
  tempo: {
    phase: 'top',
    read: (m, a) =>
      `Your backswing took ${sec(a.durations.backswing)} and your downswing ${sec(a.durations.downswing)}, so the backswing lasted ${m.display.replace(' : 1', '')} times as long as the downswing.`,
    goal: (_m, a) => {
      const target = a.durations.downswing * 3;
      const diff = target - a.durations.backswing;
      return diff > 0
        ? `With your ${sec(a.durations.downswing)} downswing, a 3 : 1 tempo means a backswing of about ${sec(target)}, roughly ${sec(diff)} longer than this one.`
        : `With your ${sec(a.durations.downswing)} downswing, a 3 : 1 tempo means a backswing of about ${sec(target)}, roughly ${sec(-diff)} shorter than this one.`;
    },
    fix: (m) =>
      (m.value ?? 3) < 2.4
        ? [
            'Slow the takeaway. For the first foot, move the club, hands and chest away together, with no snatch from the hands.',
            'Let the backswing finish before you start down. Feel a tiny "set" at the top.',
            'Count "one, two, three" evenly on the way back and "hit" on the way down.',
            'Keep your grip pressure light, about 4 out of 10. Tension speeds up the backswing.',
          ]
        : [
            'Do not pause or hover at the top. Let the backswing flow straight into the downswing.',
            'If the backswing is long, shorten it a little instead of slowing it down.',
            'Start the downswing with the lower body so it has speed without a lunge from the arms.',
            'Count "one, two" back and "hit" down to tighten the rhythm, then build back up to three.',
          ],
    keep: [
      'Keep using the same count in practice. Tempo is most likely to slip under pressure and with the driver.',
      'Warm up with a few counted swings before you hit balls.',
    ],
    feel: (m) => ((m.value ?? 3) < 2.4 ? 'Three back, one through.' : 'Flow through the top.'),
    check:
      'Tap Takeaway, Top and Impact in the replay and watch the time readout. Takeaway to Top should take about three times as long as Top to Impact.',
  },
  headSway: {
    phase: 'top',
    read: (m) => `Your head moved ${pct(m.value ?? 0)}% of a shoulder width away from the target between address and the top.`,
    goal: (m) => `Under 35%, so about ${pct(m.value ?? 0) - 35} percentage points less movement.`,
    fix: () => [
      'Feel your trail hip turn behind you rather than slide away from the target.',
      'At the top, keep your weight on the inside of your trail foot. If it rolls onto the outside edge, you have swayed.',
      'Let your head rotate a little, but keep it over the same spot.',
      'If your stance is very wide, narrow it slightly. Wide stances invite a sway.',
    ],
    keep: ['Keep turning around a steady head.', 'Keep your trail knee flexed in the backswing so it braces the turn.'],
    feel: () => 'Turn around the head.',
    check: 'Tap Top in the replay with Guides on. Compare your head with where it started at address.',
  },
  hipSlide: {
    phase: 'impact',
    read: (m) => `Your hips moved ${pct(m.value ?? 0)}% of a shoulder width toward the target by impact.`,
    goal: (m) => `Under 45%, so about ${pct(m.value ?? 0) - 45} percentage points less slide.`,
    fix: () => [
      'Start the downswing by turning the lead hip back and around, not toward the target.',
      'At impact your belt buckle should already be turning toward the target, with the lead hip over or just inside the lead foot.',
      'Keep some flex in the lead knee into impact, and let it straighten as you rotate instead of drifting forward.',
      'Feel the trail hip drive around, not across.',
    ],
    keep: ['Keep starting down with a turn of the lead hip.', 'Keep your lead hip over your lead foot at impact.'],
    feel: () => 'Turn in a barrel.',
    check: 'Tap Impact in the replay with Guides on. Your hips should be close to the line they started on.',
  },
  finishBalance: {
    phase: 'finish',
    read: (m) => {
      const v = m.value ?? 0;
      return v < 0
        ? `At the finish your hips sat ${pct(v)}% of a shoulder width behind your lead foot.`
        : `At the finish your hips sat ${pct(v)}% of a shoulder width ahead of your lead foot.`;
    },
    goal: (m) => `Hips over or ahead of the lead foot (within 40% behind it), so about ${pct(m.value ?? 0) - 40} percentage points further forward.`,
    fix: () => [
      'Start shifting toward the lead side as the downswing begins, before the club reaches the ball.',
      'Turn your belt buckle and chest to face the target at the finish.',
      'Finish with your trail foot up on its toe and almost all your weight on the lead foot.',
      'Hold the finish for three seconds. If you cannot, swing slower until you can.',
    ],
    keep: ['Keep holding your finish until the ball lands.', 'Keep the trail foot up on its toe at the end.'],
    feel: () => 'Finish and freeze.',
    check: 'Tap Finish in the replay. Your hips should be stacked over your lead foot.',
  },
  spineAngle: {
    phase: 'impact',
    read: (m) => {
      const v = Math.round(m.value ?? 0);
      return v < 0
        ? `Your forward tilt dropped by ${-v}° between address and impact, so you stood up through the ball.`
        : `Your forward tilt changed by ${v > 0 ? '+' : ''}${v}° between address and impact.`;
    },
    goal: (m) => `Within 6° of your address tilt, so about ${Math.max(0, Math.round(-(m.value ?? 0)) - 6)}° more tilt kept at impact.`,
    fix: () => [
      'Keep your chest over the ball through impact. Feel like you hit it with your chest still pointing down.',
      'Keep your hips back, near where they were at address, as you turn down.',
      'Stay in your knee flex until the ball is gone.',
      'Check your setup: tilt from the hips with a straight back, so it is a posture you can hold.',
    ],
    keep: ['Keep your chest over the ball through impact.', 'Keep your knee flex until after the ball is gone.'],
    feel: () => 'Keep the tilt.',
    check: 'Tap Address, then Impact, in the replay. The spine line should lean about the same amount in both.',
  },
  hipThrust: {
    phase: 'impact',
    read: (m) => `Your hips moved ${pct(m.value ?? 0)}% of your torso length toward the ball between address and impact.`,
    goal: (m) => `Under 15%, so about ${pct(m.value ?? 0) - 15} percentage points less movement toward the ball.`,
    fix: () => [
      'Feel your glutes stay against an imaginary wall behind you through impact.',
      'Turn the hips, lead hip back, instead of pushing them toward the ball.',
      'Keep your trail heel down a moment longer in the downswing.',
      'At setup, keep your weight in the middle of your feet, not on your toes.',
    ],
    keep: ['Keep your seat back as you turn through.', 'Keep your weight centered over your feet at setup.'],
    feel: () => 'Seat stays back.',
    check: 'Tap Address, then Impact, in the replay with Guides on. Your hips should stay close to the line behind them.',
  },
  handPath: {
    phase: 'midDownswing',
    read: (m) => {
      const v = m.value ?? 0;
      return v > 0
        ? `In mid-downswing your hands were ${pct(v)}% of your torso length outside the plane line set at address.`
        : `In mid-downswing your hands were ${pct(v)}% of your torso length inside the plane line set at address.`;
    },
    goal: (m) => `On or under the line (under 10% outside), so about ${pct(m.value ?? 0) - 10} percentage points further in.`,
    fix: () => [
      'Start the downswing with the lower body and let the arms drop before the shoulders turn.',
      'Feel your trail elbow move down in front of your trail hip.',
      'Keep your trail shoulder back a beat longer at the start of the downswing.',
      'Feel the club come at the ball from inside the target line and swing out slightly past it.',
    ],
    keep: ['Keep letting the arms drop first from the top.', 'Keep your trail elbow close to your side on the way down.'],
    feel: () => 'Drop, do not throw.',
    check: 'Tap Mid-down in the replay with Guides on. Your hands should be on or below the plane line.',
  },
  leadArm: {
    phase: 'top',
    read: (m) => `Your lead elbow was at ${Math.round(m.value ?? 0)}° at the top. 180° is perfectly straight.`,
    goal: (m) => `155° or more, so about ${Math.max(0, 155 - Math.round(m.value ?? 0))}° straighter.`,
    fix: () => [
      'Make the backswing with your chest turn, not by lifting your arms.',
      'Feel width: push your hands away from your chest as you go back.',
      'Stop the backswing where your lead arm starts to fold. A shorter, wider top beats a longer, bent one.',
      'Keep the lead arm relaxed and long, not locked.',
    ],
    keep: ['Keep turning your chest to create the backswing.', 'Keep the lead arm long and relaxed.'],
    feel: () => 'Long lead arm, turning chest.',
    check: 'Tap Top in the replay. Your lead arm should look nearly straight.',
  },
};

const VIEW_NAME = { 'face-on': 'face-on (camera facing your chest)', 'down-the-line': 'down the line (camera behind you, looking at the target)' };

export function metricGuide(m: MetricResult, a: AnalysisResult): MetricGuide {
  const c = CONTENT[m.id];
  const drillIds = [...new Set(FAULT_DEFS.filter((f) => f.metricId === m.id).flatMap((f) => f.drillIds))];
  const caveats: string[] = [];
  const base = { phase: c.phase, phaseLabel: PHASE_LABEL[c.phase], check: c.check, drillIds, feel: c.feel(m) };

  if (m.status === 'unavailable' || m.value === null) {
    const views = m.views === 'any' ? null : m.views;
    const viewHint =
      views && !views.includes(a.settings.view)
        ? `This one needs a ${VIEW_NAME[views[0]]} clip. This swing was filmed ${a.settings.view === 'face-on' ? 'face-on' : 'down the line'}.`
        : 'Film with your whole body in frame, in good light, with the camera steady at about hip height.';
    return { ...base, read: m.note ?? 'This could not be measured on this swing.', goal: '', steps: [viewHint], caveats };
  }

  if (m.id === 'tempo' && a.durations.backswing < 0.45) {
    caveats.push(
      `A ${sec(a.durations.backswing)} backswing is shorter than almost any golfer's, so the clip's timing is probably off. Check the recorded frame rate in Settings (120 for iPhone slo-mo).`,
    );
  }
  if (m.confidence < 0.4) {
    caveats.push(
      `Tracking confidence was only ${Math.round(m.confidence * 100)}%, so treat this number as rough. A clip with your whole body in frame and good light gives a firmer read.`,
    );
  }
  if (m.experimental) {
    caveats.push('This is a rough 2D estimate from one camera angle. Read it together with the replay.');
  }

  if (m.status === 'good') {
    return { ...base, read: c.read(m, a), goal: '', steps: c.keep, caveats };
  }
  return { ...base, read: c.read(m, a), goal: c.goal(m, a), steps: c.fix(m, a), caveats };
}
