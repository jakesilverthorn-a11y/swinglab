// MediaPipe Pose landmark indices (33-point BlazePose topology).
export const LM = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT: 31,
  R_FOOT: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** Skeleton segments drawn by the overlay. */
export const SKELETON: Array<[number, number]> = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
  [LM.L_ANKLE, LM.L_FOOT],
  [LM.R_ANKLE, LM.R_FOOT],
];

/** Landmarks drawn as joints. */
export const JOINTS: number[] = [
  LM.NOSE,
  LM.L_SHOULDER,
  LM.R_SHOULDER,
  LM.L_ELBOW,
  LM.R_ELBOW,
  LM.L_WRIST,
  LM.R_WRIST,
  LM.L_HIP,
  LM.R_HIP,
  LM.L_KNEE,
  LM.R_KNEE,
  LM.L_ANKLE,
  LM.R_ANKLE,
];

export function leadIndices(handedness: 'right' | 'left') {
  // A right-handed golfer's lead side is their left; a left-handed golfer's is their right.
  const left = handedness === 'right';
  return {
    shoulder: left ? LM.L_SHOULDER : LM.R_SHOULDER,
    elbow: left ? LM.L_ELBOW : LM.R_ELBOW,
    wrist: left ? LM.L_WRIST : LM.R_WRIST,
    hip: left ? LM.L_HIP : LM.R_HIP,
    knee: left ? LM.L_KNEE : LM.R_KNEE,
    ankle: left ? LM.L_ANKLE : LM.R_ANKLE,
    trailKnee: left ? LM.R_KNEE : LM.L_KNEE,
    trailAnkle: left ? LM.R_ANKLE : LM.L_ANKLE,
    trailShoulder: left ? LM.R_SHOULDER : LM.L_SHOULDER,
    trailHip: left ? LM.R_HIP : LM.L_HIP,
  };
}
