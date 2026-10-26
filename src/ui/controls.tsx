import type { CSSProperties, ReactNode } from 'react';

interface SegOption<T extends string | number> {
  value: T;
  label: string;
}

/** iOS-style segmented control with a sliding thumb. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const style = { '--n': options.length, '--i': idx } as CSSProperties;
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={style}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** iOS-style on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

/** A group of rows with an optional small heading and footnote, like an iOS inset grouped list. */
export function Group({ title, footnote, children }: { title?: string; footnote?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      {title && <h3 className="group-title">{title}</h3>}
      <div className="group-card">{children}</div>
      {footnote && <p className="group-note">{footnote}</p>}
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="row-item">
      <label className="row-label" htmlFor={htmlFor}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}
