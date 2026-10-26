import type { CameraView, Handedness } from './types';
import type { ModelVariant } from './pose/poseEngine';

export interface AppSettings {
  handedness: Handedness;
  view: CameraView;
  /** Frame rate the clips are recorded at. */
  recordedFps: number;
  analysisRate: 'capped60' | 'native';
  modelVariant: ModelVariant;
  keepClip: boolean;
  useClaude: boolean;
  claudeKey: string;
  claudeModel: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  handedness: 'left',
  view: 'face-on',
  recordedFps: 120,
  analysisRate: 'capped60',
  modelVariant: 'full',
  keepClip: false,
  useClaude: false,
  claudeKey: '',
  claudeModel: 'claude-sonnet-5-5',
};

const KEY = 'golf-swing-analyzer:settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
