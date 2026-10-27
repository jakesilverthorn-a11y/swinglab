import type { AnalysisResult, CoachNote, SwingRecord } from './types';

/** The swing on the results screen: freshly analyzed, a demo, or one reopened from history. */
export interface CurrentSwing {
  analysis: AnalysisResult;
  videoUrl: string | null;
  clip: Blob | null;
  thumbnail?: string;
  coach: CoachNote;
  label: string;
  savedId?: string;
  /** When the swing was first saved, kept so later updates do not reorder the list. */
  createdAt?: number;
  isDemo: boolean;
}

/** The stored form of a swing. */
export function toRecord(swing: CurrentSwing, id: string, keepClip: boolean): SwingRecord {
  return {
    id,
    createdAt: swing.createdAt ?? Date.now(),
    label: swing.label.trim() || defaultLabel(),
    thumbnail: swing.thumbnail,
    hasClip: keepClip && swing.clip !== null,
    analysis: swing.analysis,
    coachNote: swing.coach,
  };
}

export const defaultLabel = (): string =>
  `Swing ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;

export const formatDate = (t: number): string =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatDay = (t: number): string => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Where the app is running: a Home Screen install (standalone) or a normal browser tab. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}
