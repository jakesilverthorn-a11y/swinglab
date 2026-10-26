import { useCallback, useEffect, useRef, useState } from 'react';
import type { SwingRecord } from './types';
import { loadSettings, saveSettings, type AppSettings } from './settings';
import { clearAll, deleteSwing, getClip, listSwings } from './storage/db';
import { templateCoach } from './coach/templateCoach';
import { generateSwing } from './demo/syntheticSwing';
import { analyzeSwing } from './analysis/analyze';
import type { CurrentSwing } from './state';
import { TabBar, type Tab } from './ui/TabBar';
import { HomeScreen } from './ui/HomeScreen';
import { HistoryPanel } from './ui/HistoryPanel';
import { DrillsPanel } from './ui/DrillsPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { CaptureSheet } from './ui/CaptureSheet';
import { ResultsScreen } from './ui/ResultsScreen';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [history, setHistory] = useState<SwingRecord[]>([]);
  const [current, setCurrentRaw] = useState<CurrentSwing | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const scrollMemo = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setHistory(await listSwings());
      setStorageError(null);
    } catch {
      setStorageError('Saved swings are unavailable in this browser. Storage may be blocked in private mode.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  // Replacing the current swing releases the old video's object URL.
  const setCurrent = useCallback((next: CurrentSwing | null) => {
    setCurrentRaw((prev) => {
      if (prev?.videoUrl && prev.videoUrl !== next?.videoUrl) URL.revokeObjectURL(prev.videoUrl);
      return next;
    });
  }, []);

  const openResults = useCallback(() => {
    scrollMemo.current = window.scrollY;
    setShowResults(true);
  }, []);

  const closeResults = useCallback(() => {
    setShowResults(false);
    requestAnimationFrame(() => window.scrollTo(0, scrollMemo.current));
  }, []);

  // The results screen sits over the tab content, so lock the page behind it.
  useEffect(() => {
    document.documentElement.classList.toggle('results-open', showResults);
    return () => document.documentElement.classList.remove('results-open');
  }, [showResults]);

  const onResult = (swing: CurrentSwing) => {
    setCurrent(swing);
    setCapturing(false);
    openResults();
  };

  const openRecord = async (record: SwingRecord) => {
    const clip = record.hasClip ? ((await getClip(record.id)) ?? null) : null;
    const others = history.filter((r) => r.id !== record.id);
    setCurrent({
      analysis: record.analysis,
      videoUrl: clip ? URL.createObjectURL(clip) : null,
      clip,
      thumbnail: record.thumbnail,
      coach: record.coachNote ?? templateCoach(record.analysis, others),
      label: record.label,
      savedId: record.id,
      isDemo: false,
    });
    openResults();
  };

  const runDemo = () => {
    const view = settings.view;
    const swing = generateSwing({
      view,
      handedness: settings.handedness,
      fps: 60,
      noise: 0.002,
      seed: 3,
      faults: view === 'face-on' ? { slide: 0.75, hangBack: 1.1 } : { thrust: 0.3, standUp: 8 },
    });
    const analysis = analyzeSwing(swing.frames, swing.aspect, { handedness: settings.handedness, view, analysisFps: 60, slowMo: 1 });
    onResult({
      analysis,
      videoUrl: null,
      clip: null,
      coach: templateCoach(analysis, history),
      label: 'Demo swing',
      isDemo: true,
    });
  };

  const remove = async (id: string) => {
    await deleteSwing(id);
    setCurrentRaw((prev) => (prev?.savedId === id ? { ...prev, savedId: undefined } : prev));
    await refresh();
  };

  const changeTab = (next: Tab) => {
    if (next !== tab) window.scrollTo(0, 0);
    setTab(next);
  };

  return (
    <div className="app">
      <main className="tab-content" aria-hidden={showResults}>
        {storageError && <p className="callout bad storage-error">{storageError}</p>}
        {tab === 'home' && (
          <HomeScreen
            history={history}
            current={current}
            onAdd={() => setCapturing(true)}
            onDemo={runDemo}
            onOpenCurrent={openResults}
            onOpenRecord={openRecord}
          />
        )}
        {tab === 'progress' && <HistoryPanel records={history} onOpen={openRecord} onAdd={() => setCapturing(true)} />}
        {tab === 'drills' && <DrillsPanel />}
        {tab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onChange={changeSettings}
            onClearHistory={async () => {
              await clearAll();
              setCurrentRaw((prev) => (prev ? { ...prev, savedId: undefined } : prev));
              await refresh();
            }}
          />
        )}
      </main>

      <TabBar active={tab} onChange={changeTab} onAdd={() => setCapturing(true)} badge={history.length} />

      <CaptureSheet
        open={capturing}
        onClose={() => setCapturing(false)}
        settings={settings}
        onSettingsChange={changeSettings}
        history={history}
        onResult={onResult}
        onDemo={runDemo}
      />

      {showResults && current && (
        <ResultsScreen
          current={current}
          setCurrent={setCurrent}
          settings={settings}
          history={history}
          onSaved={refresh}
          onBack={closeResults}
          onDelete={remove}
        />
      )}
    </div>
  );
}
