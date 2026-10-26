import type { AnalysisResult, PhaseIndices } from '../types';
import { JOINTS, LM, SKELETON, leadIndices } from '../analysis/landmarks';
import { median, RAD } from '../analysis/geometry';

export interface OverlayOptions {
  skeleton: boolean;
  guides: boolean;
}

interface Pt {
  x: number;
  y: number;
}

/** Address reference positions in normalized image coordinates, computed once per analysis. */
interface Reference {
  head: Pt;
  hip: Pt;
  shoulder: Pt;
  hands: Pt;
  facing: number;
}

const cache = new WeakMap<AnalysisResult, Reference>();

function reference(a: AnalysisResult): Reference {
  const hit = cache.get(a);
  if (hit) return hit;
  const { frames, phases, settings } = a;
  const [from, to] = a.addrWindow ?? [Math.max(0, phases.takeaway - 6), phases.takeaway];
  const idxs: number[] = [];
  for (let i = from; i <= to; i++) idxs.push(i);
  const med = (sel: (lm: NonNullable<(typeof frames)[number]['lm']>) => number) =>
    median(idxs.map((i) => sel(frames[i].lm!)));
  const mid = (k1: number, k2: number): Pt => ({
    x: med((l) => (l[k1].x + l[k2].x) / 2),
    y: med((l) => (l[k1].y + l[k2].y) / 2),
  });
  const faceDiff = median(
    idxs.flatMap((i) => {
      const l = frames[i].lm!;
      return [l[LM.L_FOOT].x - l[LM.L_HEEL].x, l[LM.R_FOOT].x - l[LM.R_HEEL].x];
    }),
  );
  const ref: Reference = {
    head: mid(LM.L_EAR, LM.R_EAR),
    hip: mid(LM.L_HIP, LM.R_HIP),
    shoulder: mid(LM.L_SHOULDER, LM.R_SHOULDER),
    hands: mid(LM.L_WRIST, LM.R_WRIST),
    facing: Math.abs(faceDiff) > 0.002 ? Math.sign(faceDiff) : settings.handedness === 'right' ? 1 : -1,
  };
  cache.set(a, ref);
  return ref;
}

export function phaseLabel(phases: PhaseIndices, i: number): string {
  if (i < phases.takeaway) return 'Address';
  if (i < phases.top) return 'Backswing';
  if (i === phases.top) return 'Top';
  if (i < phases.impact) return 'Downswing';
  if (i === phases.impact) return 'Impact';
  if (i < phases.finish) return 'Follow-through';
  return 'Finish';
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  a: AnalysisResult,
  idx: number,
  opts: OverlayOptions,
): void {
  const lm = a.frames[idx]?.lm;
  if (!lm) return;
  const ref = reference(a);
  const lw = Math.max(2, h / 220);
  const px = (p: Pt): [number, number] => [p.x * w, p.y * h];
  const lead = leadIndices(a.settings.handedness);
  const faceOn = a.settings.view === 'face-on';

  const line = (p1: Pt, p2: Pt, color: string, width = lw, dash: number[] = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash.map((d) => d * lw));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...px(p1));
    ctx.lineTo(...px(p2));
    ctx.stroke();
    ctx.restore();
  };
  const extend = (p1: Pt, p2: Pt, before: number, after: number): [Pt, Pt] => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return [
      { x: p1.x - dx * before, y: p1.y - dy * before },
      { x: p2.x + dx * after, y: p2.y + dy * after },
    ];
  };
  /** A label pill: x is the pill's left edge and y its vertical center. */
  const text = (s: string, x: number, y: number, color = '#fff') => {
    ctx.save();
    const fs = Math.max(11, Math.round(h / 30));
    ctx.font = `700 ${fs}px -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const padX = fs * 0.65;
    const bw = ctx.measureText(s).width + padX * 2;
    const bh = fs * 1.9;
    ctx.fillStyle = 'rgba(6,9,8,0.74)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y - bh / 2, bw, bh, bh / 2);
    else ctx.rect(x, y - bh / 2, bw, bh);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(s, x + padX, y + fs * 0.04);
    ctx.restore();
  };

  if (opts.guides) {
    // Address reference lines (dashed amber).
    if (faceOn) {
      line({ x: ref.head.x, y: ref.head.y - 0.12 }, { x: ref.head.x, y: 0.98 }, 'rgba(251,191,36,0.85)', lw, [6, 6]);
      line({ x: ref.hip.x, y: ref.hip.y - 0.1 }, { x: ref.hip.x, y: 0.98 }, 'rgba(251,191,36,0.55)', lw, [3, 6]);
    } else {
      const [s1, s2] = extend(ref.hip, ref.shoulder, 0.4, 0.7);
      line(s1, s2, 'rgba(251,191,36,0.85)', lw, [6, 6]);
      const [p1, p2] = extend(ref.hands, ref.shoulder, 0.5, 1.2);
      line(p1, p2, 'rgba(248,113,113,0.9)', lw, [8, 5]);
    }
    // Hand trail from takeaway to the current frame.
    const start = a.phases.takeaway;
    if (idx > start) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,245,66,0.95)';
      ctx.lineWidth = lw * 1.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = start; i <= idx; i++) {
        const l = a.frames[i].lm!;
        const x = ((l[LM.L_WRIST].x + l[LM.R_WRIST].x) / 2) * w;
        const y = ((l[LM.L_WRIST].y + l[LM.R_WRIST].y) / 2) * h;
        if (i === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Current spine, shoulder, and hip lines.
    const hip = { x: (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2, y: (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2 };
    const sh = {
      x: (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2,
      y: (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2,
    };
    const [sp1, sp2] = extend(hip, sh, 0.15, 0.25);
    line(sp1, sp2, '#22d3ee', lw * 1.3);
    if (faceOn) {
      line(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER], '#22d3ee', lw);
      line(lm[LM.L_HIP], lm[LM.R_HIP], '#a78bfa', lw);
    } else {
      const dx = (sh.x - hip.x) * a.aspect;
      const dy = sh.y - hip.y;
      const tilt = Math.atan2(dx * ref.facing, -dy) * RAD;
      const [lx, ly] = px({ x: sh.x, y: sh.y - 0.07 });
      text(`Spine ${tilt.toFixed(0)}°`, lx + h / 40, ly, '#22d3ee');
    }
  }

  if (opts.skeleton) {
    const leadSegs = new Set([`${lead.shoulder}-${lead.elbow}`, `${lead.elbow}-${lead.wrist}`]);
    for (const [i, j] of SKELETON) {
      const isLead = leadSegs.has(`${i}-${j}`);
      line(lm[i], lm[j], isLead ? '#4ade80' : 'rgba(255,255,255,0.9)', isLead ? lw * 1.4 : lw);
    }
    ctx.save();
    ctx.fillStyle = '#fff';
    for (const k of JOINTS) {
      ctx.beginPath();
      ctx.arc(lm[k].x * w, lm[k].y * h, lw * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  text(phaseLabel(a.phases, idx).toUpperCase(), h / 36, h / 13, '#c8f542');
}
