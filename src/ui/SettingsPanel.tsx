import { useState } from 'react';
import type { AppSettings } from '../settings';
import type { ModelVariant } from '../pose/poseEngine';
import { isIOS, isStandalone } from '../state';
import { Group, Row, Segmented, Switch } from './controls';
import { LogoMark, ShareIcon } from './icons';

interface Props {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClearHistory: () => Promise<void>;
}

export function SettingsPanel({ settings, onChange, onClearHistory }: Props) {
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({ ...settings, [key]: value });
  const showInstall = isIOS() && !isStandalone();

  return (
    <div className="screen-pad">
      <h1 className="large-title">Settings</h1>

      {showInstall && (
        <section className="install-card">
          <span className="app-tile">
            <LogoMark size={40} />
          </span>
          <div>
            <strong>Install SwingLab on your iPhone</strong>
            <p>
              In Safari, tap <ShareIcon size={16} className="inline-icon" /> <b>Share</b>, then <b>Add to Home Screen</b>. It opens
              full screen like any other app.
            </p>
          </div>
        </section>
      )}

      <Group title="Golfer">
        <Row label="Handedness">
          <Segmented
            label="Handedness"
            value={settings.handedness}
            onChange={(v) => set('handedness', v)}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Row>
        <Row label="Camera">
          <Segmented
            label="Default camera angle"
            value={settings.view}
            onChange={(v) => set('view', v)}
            options={[
              { value: 'face-on', label: 'Face-on' },
              { value: 'down-the-line', label: 'Down the line' },
            ]}
          />
        </Row>
      </Group>

      <Group
        title="Video"
        footnote="SwingLab measures the frame spacing of each clip and compares it with this setting. A clip straight off the phone at 120 fps needs no correction. A slow-motion export is slowed back to real time so tempo is reported in real seconds."
      >
        <Row label="Recorded frame rate" htmlFor="set-fps">
          <select id="set-fps" value={settings.recordedFps} onChange={(e) => set('recordedFps', Number(e.target.value))}>
            <option value={0}>Not sure</option>
            {[30, 60, 120, 240].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </Row>
        <Row label="Analysis rate" htmlFor="set-rate">
          <select id="set-rate" value={settings.analysisRate} onChange={(e) => set('analysisRate', e.target.value as AppSettings['analysisRate'])}>
            <option value="capped60">Balanced</option>
            <option value="native">Every frame</option>
          </select>
        </Row>
        <Row label="Pose model" htmlFor="set-model">
          <select id="set-model" value={settings.modelVariant} onChange={(e) => set('modelVariant', e.target.value as ModelVariant)}>
            <option value="lite">Lite · fastest</option>
            <option value="full">Full · recommended</option>
            <option value="heavy">Heavy · most accurate</option>
          </select>
        </Row>
        <Row label="Keep clips when saving" hint="Uses storage on this device.">
          <Switch checked={settings.keepClip} onChange={(v) => set('keepClip', v)} label="Keep clips when saving" />
        </Row>
      </Group>

      <Group
        title="Written feedback from Claude"
        footnote="The built-in coach works offline. With your own Anthropic API key, a button on the results screen asks Claude to write the feedback. Only the metrics summary is sent: no video, no images, no landmark data. The key stays in this browser."
      >
        <Row label="Enable Claude feedback">
          <Switch checked={settings.useClaude} onChange={(v) => set('useClaude', v)} label="Enable Claude feedback" />
        </Row>
        {settings.useClaude && (
          <>
            <Row label="API key" htmlFor="set-key">
              <input
                id="set-key"
                type="password"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={settings.claudeKey}
                onChange={(e) => set('claudeKey', e.target.value.trim())}
              />
            </Row>
            <Row label="Model" htmlFor="set-claude-model">
              <input
                id="set-claude-model"
                type="text"
                autoCapitalize="off"
                spellCheck={false}
                value={settings.claudeModel}
                onChange={(e) => set('claudeModel', e.target.value.trim())}
              />
            </Row>
          </>
        )}
      </Group>

      <Group title="Your data" footnote="Videos are processed on this device and never uploaded. Saved swings live in this browser's storage.">
        {confirming ? (
          <div className="confirm">
            <p>Delete every saved swing and clip?</p>
            <div className="confirm-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
                Keep them
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  await onClearHistory();
                  setConfirming(false);
                }}
              >
                Delete all
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="menu-item danger" onClick={() => setConfirming(true)}>
            Delete all saved swings
          </button>
        )}
      </Group>

      <p className="about">SwingLab 0.2 · pose tracking by MediaPipe</p>
    </div>
  );
}
