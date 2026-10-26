// Generates a synthetic golf swing as MediaPipe-style landmark frames. Used by the unit
// tests (with known ground truth and injectable faults) and by the "Try a demo swing"
// button so the UI can be explored without a video. It is a stick-figure model, not a
// biomechanical simulation.
import type { CameraView, Handedness, Landmark, PoseFrame } from '../types';
import { LANDMARK_COUNT, LM } from '../analysis/landmarks';

export interface SyntheticFaults {
  /** Head moves away from the target at the top, in shoulder widths (face-on). */
  sway?: number;
  /** Hip shift toward the target at impact, in shoulder widths (face-on). Default 0.2. */
  slide?: number;
  /** How far behind the lead foot the hips end up at the finish, in shoulder widths from the healthy default. */
  hangBack?: number;
  /** Degrees of forward spine tilt lost between address and impact (down-the-line). */
  standUp?: number;
  /** Hip shift toward the ball at impact, in torso lengths (down-the-line). */
  thrust?: number;
  /** Hands outside the plane line at mid-downswing, in torso lengths (down-the-line). */
  overTheTop?: number;
  /** Degrees the lead elbow is bent at the top. */
  leadArmBend?: number;
}

export interface SyntheticOptions {
  view: CameraView;
  handedness: Handedness;
  fps: number;
  aspect?: number;
  idle?: number;
  backswing?: number;
  downswing?: number;
  follow?: number;
  hold?: number;
  /** Standard deviation of landmark noise in height units. */
  noise?: number;
  seed?: number;
  faults?: SyntheticFaults;
  /** Hand waggle before the swing, as an amplitude in height units. Stops `settle` seconds before the takeaway. */
  waggle?: number;
  /** Seconds the waggle stops before the takeaway (default 0.3). */
  settle?: number;
  /** Seconds the golfer is still walking into position at the start of the clip (the whole body drifts sideways). */
  walkIn?: number;
}

export interface SyntheticSwing {
  frames: PoseFrame[];
  aspect: number;
  /** Ground-truth frame indices. */
  truth: { takeaway: number; top: number; impact: number };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V = { x: number; y: number };

export function generateSwing(opts: SyntheticOptions): SyntheticSwing {
  const aspect = opts.aspect ?? 16 / 9;
  const fps = opts.fps;
  const idle = opts.idle ?? 0.6;
  const tb = opts.backswing ?? 0.9;
  const td = opts.downswing ?? 0.3;
  const tf = opts.follow ?? 0.4;
  const hold = opts.hold ?? 0.8;
  const noise = opts.noise ?? 0;
  const f = opts.faults ?? {};
  const waggle = opts.waggle ?? 0;
  const settle = opts.settle ?? 0.3;
  const walkIn = opts.walkIn ?? 0;
  const rand = mulberry32(opts.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

  const dir = opts.handedness === 'right' ? 1 : -1;
  const leadIsLeft = opts.handedness === 'right';
  const faceOn = opts.view === 'face-on';

  const TL = 0.25; // torso length
  const SW = 0.2; // shoulder width (face-on)
  const cx = aspect / 2;
  const hip0: V = { x: cx, y: 0.58 };
  const tilt0 = (30 * Math.PI) / 180;

  const T0 = idle;
  const T1 = T0 + tb;
  const T2 = T1 + td;
  const T3 = T2 + tf;
  const end = T3 + hold;

  // Phase progress at time t.
  const prog = (t: number) => {
    const b = t <= T0 ? 0 : t >= T1 ? 1 : smoothstep((t - T0) / tb);
    const d = t <= T1 ? 0 : t >= T2 ? 1 : ((t - T1) / td) ** 2;
    const fo = t <= T2 ? 0 : t >= T3 ? 1 : 1 - (1 - (t - T2) / tf) ** 2;
    return { b, d, fo };
  };

  // Key hand positions.
  let A: V, Top: V, Fin: V;
  let planeN: V = { x: 0, y: 0 };
  const sa0: V = faceOn
    ? { x: hip0.x, y: hip0.y - TL }
    : { x: hip0.x + dir * TL * Math.sin(tilt0), y: hip0.y - TL * Math.cos(tilt0) };
  if (faceOn) {
    A = { x: cx + dir * 0.02, y: 0.55 };
    Top = { x: cx - dir * 0.1, y: 0.22 };
    Fin = { x: cx + dir * 0.08, y: 0.2 };
  } else {
    A = { x: cx + dir * 0.2, y: 0.52 };
    const u = { x: sa0.x - A.x, y: sa0.y - A.y };
    const ul = Math.hypot(u.x, u.y);
    const uh = { x: u.x / ul, y: u.y / ul };
    Top = { x: sa0.x + uh.x * 0.12, y: sa0.y + uh.y * 0.12 };
    Fin = { x: cx + dir * 0.05, y: 0.25 };
    // Outward (toward the ball line) and up normal to the plane line.
    planeN = { x: -uh.y, y: uh.x };
    if (planeN.x * dir + planeN.y * -1 < 0) planeN = { x: -planeN.x, y: -planeN.y };
  }

  const hFinDefault = 0.65;
  const slideAmt = f.slide ?? 0.2;
  const swayAmt = f.sway ?? 0.1;
  const hFin = hFinDefault - (f.hangBack ?? 0);
  const thrust = f.thrust ?? 0;
  const standUp = f.standUp ?? 0;
  const otp = f.overTheTop ?? 0;
  const bend = f.leadArmBend ?? 0;

  const n = Math.ceil(end * fps) + 1;
  const frames: PoseFrame[] = [];

  const elbowFor = (S: V, W: V, phiDeg: number): V => {
    const dx = W.x - S.x;
    const dy = W.y - S.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const phi = (phiDeg * Math.PI) / 180;
    const a = d / (2 * Math.sin(phi / 2));
    const h = a * Math.cos(phi / 2);
    let nx = -dy / d;
    let ny = dx / d;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: (S.x + W.x) / 2 + nx * h, y: (S.y + W.y) / 2 + ny * h };
  };

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const { b, d, fo } = prog(t);

    // Hands.
    let H: V;
    if (t <= T1) H = { x: lerp(A.x, Top.x, b), y: lerp(A.y, Top.y, b) };
    else if (t <= T2) {
      const bump = Math.sin(Math.PI * d) / Math.sin(Math.PI * 0.25);
      H = {
        x: lerp(Top.x, A.x, d) + planeN.x * otp * TL * bump,
        y: lerp(Top.y, A.y, d) + planeN.y * otp * TL * bump,
      };
    } else H = { x: lerp(A.x, Fin.x, fo), y: lerp(A.y, Fin.y, fo) };
    if (waggle > 0 && t < T0 - settle) {
      H = { x: H.x + waggle * Math.sin(2 * Math.PI * 1.5 * t), y: H.y + waggle * 0.5 * Math.sin(2 * Math.PI * 1.5 * t + 1) };
    }
    const walkDx = walkIn > 0 && t < walkIn ? 0.15 * (1 - t / walkIn) ** 2 : 0;

    // Hips, shoulders, head.
    let hip: V;
    let sh: V;
    let headC: V;
    let tilt = tilt0;
    if (faceOn) {
      const hOff =
        t <= T1 ? -0.05 * b : t <= T2 ? lerp(-0.05, slideAmt, d) : lerp(slideAmt, hFin, fo);
      hip = { x: hip0.x + dir * SW * hOff, y: hip0.y };
      sh = { x: hip.x, y: hip.y - TL };
      const hx = t <= T1 ? swayAmt * b : t <= T2 ? lerp(swayAmt, 0, d) : 0;
      headC = { x: cx - dir * SW * hx, y: 0.2 };
    } else {
      const w = t <= T1 ? 0 : t <= T2 ? d : 1;
      hip = { x: hip0.x + dir * TL * thrust * w, y: hip0.y };
      tilt = tilt0 - (standUp * Math.PI / 180) * w;
      sh = { x: hip.x + dir * TL * Math.sin(tilt), y: hip.y - TL * Math.cos(tilt) };
      headC = { x: sh.x + dir * 0.05, y: sh.y - 0.1 };
    }

    const off = faceOn ? SW / 2 : 0.012;
    const hipOff = faceOn ? 0.06 : 0.01;
    const leadSh: V = { x: sh.x + dir * off, y: sh.y };
    const trailSh: V = { x: sh.x - dir * off, y: sh.y };
    const leadHip: V = { x: hip.x + dir * hipOff, y: hip.y };
    const trailHip: V = { x: hip.x - dir * hipOff, y: hip.y };

    const leadW: V = { x: H.x + dir * 0.008, y: H.y };
    const trailW: V = { x: H.x - dir * 0.008, y: H.y };
    const phiLead = 180 - bend * (t <= T1 ? b * b : t <= T2 ? 1 - d : 0);
    const phiTrail = 180 - 70 * (t <= T1 ? b : t <= T2 ? 1 - d : 0);
    const leadE = elbowFor(leadSh, leadW, phiLead);
    const trailE = elbowFor(trailSh, trailW, phiTrail);

    const pts: V[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: cx, y: 0.5 }));
    const set = (k: number, p: V) => (pts[k] = p);

    const ear = faceOn ? 0.03 : 0.005;
    set(LM.NOSE, { x: headC.x + (faceOn ? 0 : dir * 0.05), y: headC.y + 0.01 });
    set(LM.L_EAR, { x: headC.x - ear, y: headC.y });
    set(LM.R_EAR, { x: headC.x + ear, y: headC.y });

    const side = (leadIdx: number, trailIdx: number, leadP: V, trailP: V) => {
      set(leadIdx, leadP);
      set(trailIdx, trailP);
    };
    const pair = (leadKey: 'L' | 'R', idxL: number, idxR: number) => (leadKey === 'L' ? [idxL, idxR] : [idxR, idxL]);
    const k = leadIsLeft ? 'L' : 'R';
    let [a, c] = pair(k, LM.L_SHOULDER, LM.R_SHOULDER);
    side(a, c, leadSh, trailSh);
    [a, c] = pair(k, LM.L_ELBOW, LM.R_ELBOW);
    side(a, c, leadE, trailE);
    [a, c] = pair(k, LM.L_WRIST, LM.R_WRIST);
    side(a, c, leadW, trailW);
    [a, c] = pair(k, LM.L_HIP, LM.R_HIP);
    side(a, c, leadHip, trailHip);

    // Legs.
    const stance = faceOn ? 0.11 : 0.005;
    const kneeX = faceOn ? 0.1 : 0.06;
    const leadAnkle: V = { x: cx + dir * stance, y: 0.95 };
    const trailAnkle: V = { x: cx - dir * stance, y: 0.95 };
    [a, c] = pair(k, LM.L_KNEE, LM.R_KNEE);
    side(a, c, { x: cx + dir * kneeX, y: 0.77 }, { x: cx - dir * (faceOn ? kneeX : kneeX - 0.01), y: 0.77 });
    [a, c] = pair(k, LM.L_ANKLE, LM.R_ANKLE);
    side(a, c, leadAnkle, trailAnkle);
    const heelDx = faceOn ? 0 : -dir * 0.03;
    const toeDx = faceOn ? 0 : dir * 0.07;
    [a, c] = pair(k, LM.L_HEEL, LM.R_HEEL);
    side(a, c, { x: leadAnkle.x + heelDx, y: 0.965 }, { x: trailAnkle.x + heelDx, y: 0.965 });
    [a, c] = pair(k, LM.L_FOOT, LM.R_FOOT);
    side(a, c, { x: leadAnkle.x + toeDx, y: 0.975 }, { x: trailAnkle.x + toeDx, y: 0.975 });

    const lm: Landmark[] = pts.map((p) => ({
      x: (p.x + walkDx + (noise ? gauss() * noise : 0)) / aspect,
      y: p.y + (noise ? gauss() * noise : 0),
      z: 0,
      v: 0.95,
    }));
    frames.push({ t, lm });
  }

  return {
    frames,
    aspect,
    truth: { takeaway: Math.round(T0 * fps), top: Math.round(T1 * fps), impact: Math.round(T2 * fps) },
  };
}
