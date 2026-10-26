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
  keepClip: true,
  useClaude: false,
  claudeKey: '',
  claudeModel: 'claude-sonnet-5-5',
};

const KEY = 'golf-swing-analyzer:settings';
/** Bumped when a stored setting needs a one-time change. Version 2 turns on keeping clips, which used to default to off. */
const VERSION = 2;
const VERSION_KEY = 'golf-swing-analyzer:settings-version';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
      if (Number(localStorage.getItem(VERSION_KEY) ?? 1) < 2) {
        stored.keepClip = true;
        localStorage.setItem(KEY, JSON.stringify(stored));
      }
      localStorage.setItem(VERSION_KEY, String(VERSION));
      return stored;
    }
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    localStorage.setItem(VERSION_KEY, String(VERSION));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
