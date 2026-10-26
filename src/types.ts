// Shared types for the golf swing analyzer.

export type Handedness = 'right' | 'left';
export type CameraView = 'face-on' | 'down-the-line';

/** One MediaPipe landmark. x/y are normalized image coordinates (0..1), v is visibility (0..1). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  v: number;
}

/** One analyzed video frame. `t` is the media time in seconds. */
export interface PoseFrame {
  t: number;
  /** 33 landmarks, or null when no pose was detected in this frame. */
  lm: Landmark[] | null;
}

export type PhaseName = 'address' | 'takeaway' | 'top' | 'midDownswing' | 'impact' | 'finish';
/** Frame indices of each swing phase. */
export type PhaseIndices = Record<PhaseName, number>;

export type MetricId =
  | 'tempo'
  | 'headSway'
  | 'hipSlide'
  | 'finishBalance'
  | 'spineAngle'
  | 'hipThrust'
  | 'handPath'
  | 'leadArm';

export type MetricStatus = 'good' | 'warn' | 'bad' | 'unavailable';

export interface MetricResult {
  id: MetricId;
  label: string;
  /** One-line explanation of what is measured. */
  description: string;
  /** Camera views this metric is valid for. */
  views: CameraView[] | 'any';
  value: number | null;
  unit: string;
  /** Human-readable value, e.g. "3.1 : 1" or "12°". */
  display: string;
  status: MetricStatus;
  /** 0..1, based on landmark visibility and sampling precision. */
  confidence: number;
  /** Human-readable reference range. */
  target: string;
  note?: string;
  /** True when the measurement is a rough 2D heuristic. */
  experimental?: boolean;
}

export type FaultId =
  | 'tempo'
  | 'sway'
  | 'slide'
  | 'hang-back'
  | 'stand-up'
  | 'early-extension'
  | 'over-the-top'
  | 'lead-arm-collapse';

export interface Fault {
  id: FaultId;
  label: string;
  metricId: MetricId;
  /** 0..1, how far the metric is beyond its threshold. */
  severity: number;
  confidence: number;
  /** severity * confidence * priority weight; used to rank faults. */
  score: number;
  /** Short statement including the measured number. */
  summary: string;
  /** Why it matters for ball striking. */
  why: string;
  drillIds: string[];
}

export interface AnalysisSettings {
  handedness: Handedness;
  view: CameraView;
  /** Frame rate the analysis samples the clip at. */
  analysisFps: number;
  /** Factor by which the clip's timeline is slowed versus real time (1 = real time). */
  slowMo: number;
}

export interface SwingQuality {
  level: 'good' | 'fair' | 'poor';
  warnings: string[];
}

export interface AnalysisResult {
  version: 1;
  settings: AnalysisSettings;
  /** Video width / height; landmarks are normalized so x needs scaling by this for true geometry. */
  aspect: number;
  /** Seconds between analyzed frames (media time). */
  frameInterval: number;
  /** Seconds between native video frames on the clip's timeline (used to line the overlay up with the video). */
  nativeInterval?: number;
  frames: PoseFrame[];
  phases: PhaseIndices;
  /** First and last frame (inclusive) of the still address window used as the baseline for metrics. */
  addrWindow: [number, number];
  quality: SwingQuality;
  metrics: MetricResult[];
  faults: Fault[];
  /** Real-time durations in seconds. */
  durations: { backswing: number; downswing: number };
}

export interface SwingRecord {
  id: string;
  createdAt: number;
  label: string;
  thumbnail?: string;
  hasClip: boolean;
  analysis: AnalysisResult;
  coachNote?: CoachNote;
}

export interface CoachNote {
  source: 'template' | 'claude';
  headline: string;
  priority?: { faultId: FaultId; explanation: string };
  drillIds: string[];
  positives: string[];
  caveats: string[];
}

export interface Drill {
  id: string;
  name: string;
  faultIds: FaultId[];
  summary: string;
  steps: string[];
  reps: string;
  cue: string;
  caution?: string;
}
