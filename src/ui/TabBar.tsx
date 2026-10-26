import type { ReactNode } from 'react';
import { FlagIcon, PlusIcon, SlidersIcon, TargetIcon, TrendIcon } from './icons';

export type Tab = 'home' | 'progress' | 'drills' | 'settings';

const LEFT: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Swing', icon: <FlagIcon size={24} /> },
  { id: 'progress', label: 'Progress', icon: <TrendIcon size={24} /> },
];
const RIGHT: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: 'drills', label: 'Drills', icon: <TargetIcon size={24} /> },
  { id: 'settings', label: 'Settings', icon: <SlidersIcon size={24} /> },
];

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  onAdd: () => void;
  badge?: number;
}

export function TabBar({ active, onChange, onAdd, badge }: Props) {
  const item = (t: { id: Tab; label: string; icon: ReactNode }) => (
    <button
      key={t.id}
      type="button"
      className={`tab${active === t.id ? ' on' : ''}`}
      aria-current={active === t.id ? 'page' : undefined}
      onClick={() => onChange(t.id)}
    >
      <span className="tab-icon">
        {t.icon}
        {t.id === 'progress' && badge ? <em className="tab-badge">{badge > 99 ? '99+' : badge}</em> : null}
      </span>
      <span className="tab-label">{t.label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Sections">
      {LEFT.map(item)}
      <button type="button" className="tab-add" onClick={onAdd} aria-label="Add a swing">
        <PlusIcon size={26} />
      </button>
      {RIGHT.map(item)}
    </nav>
  );
}
