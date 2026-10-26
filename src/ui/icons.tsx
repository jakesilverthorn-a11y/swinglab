import type { ReactNode, SVGProps } from 'react';

/** Small stroke icon set drawn on a 24px grid. Icons inherit the current text color. */
function Icon({ children, size = 24, ...rest }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const FlagIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 21V3.5" />
    <path d="M6 4.5c3.2-1.6 5.6 1.6 9 0 1.2-.55 2.2-.6 3-.4v8c-.8-.2-1.8-.15-3 .4-3.4 1.6-5.8-1.6-9 0" />
    <path d="M3.5 21h5" />
  </Icon>
);
export const TrendIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 17.5l5.2-5.6 3.6 3.4 7.2-8.3" />
    <path d="M15.2 7h4.3v4.3" />
  </Icon>
);
export const TargetIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.6" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);
export const SlidersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.6">
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const ChevronLeftIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.3">
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Icon>
);
export const ChevronRightIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.3">
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Icon>
);
export const ChevronDownIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.3">
    <path d="M5.5 9.5L12 16l6.5-6.5" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.2">
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const MoreIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </Icon>
);
export const PlayIcon = (p: P) => (
  <Icon {...p} strokeWidth="1.6">
    <path d="M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7a.6.6 0 0 0-.92.5z" fill="currentColor" />
  </Icon>
);
export const PauseIcon = (p: P) => (
  <Icon {...p} strokeWidth="1.6">
    <rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" />
    <rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" />
  </Icon>
);
export const StepBackIcon = (p: P) => (
  <Icon {...p} strokeWidth="1.6">
    <path d="M6 5.5v13" strokeWidth="2.2" />
    <path d="M18.5 6.2v11.6a.5.5 0 0 1-.78.42l-8.2-5.8a.5.5 0 0 1 0-.84l8.2-5.8a.5.5 0 0 1 .78.42z" fill="currentColor" />
  </Icon>
);
export const StepForwardIcon = (p: P) => (
  <Icon {...p} strokeWidth="1.6">
    <path d="M18 5.5v13" strokeWidth="2.2" />
    <path d="M5.5 6.2v11.6a.5.5 0 0 0 .78.42l8.2-5.8a.5.5 0 0 0 0-.84l-8.2-5.8a.5.5 0 0 0-.78.42z" fill="currentColor" />
  </Icon>
);
export const VideoIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2.6" />
    <path d="M15.5 10.4l4.6-2.6a.5.5 0 0 1 .75.43v7.54a.5.5 0 0 1-.75.43l-4.6-2.6" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p} strokeWidth="2.5">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const AlertIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4.2l8.6 14.9a.9.9 0 0 1-.78 1.35H4.18a.9.9 0 0 1-.78-1.35z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </Icon>
);
export const InfoIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5" />
    <circle cx="12" cy="7.9" r=".7" fill="currentColor" />
  </Icon>
);
export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.8 12.2h8.8L17.2 7" />
    <path d="M10 10.5v5.5M14 10.5v5.5" />
  </Icon>
);
export const DownloadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4.5v10.5M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" />
  </Icon>
);
export const SparkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />
  </Icon>
);
export const ShareIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 15V4M8.2 7.7L12 4l3.8 3.7" />
    <path d="M6.5 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-.5" />
  </Icon>
);
export const PersonIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="7.5" r="3" />
    <path d="M6 20v-4.2a3.3 3.3 0 0 1 3.3-3.3h5.4a3.3 3.3 0 0 1 3.3 3.3V20" />
  </Icon>
);

/** The SwingLab mark: a ball launching on a rising trail. The app icon uses the same shapes. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lm-trail" x1="6" y1="57" x2="44" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="0.6" stopColor="var(--accent)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <path d="M6 57C12 34 26 17 46 14L46 27C32 31 17 42 6 57Z" fill="url(#lm-trail)" />
      <circle cx="50" cy="20" r="9" fill="var(--accent)" />
    </svg>
  );
}
