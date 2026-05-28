import type { ReactNode } from "react";

type PlayerIconProps = {
  className?: string;
};

function PlayerIconBase({
  children,
  className,
}: PlayerIconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={`player-icon${className ? ` ${className}` : ""}`}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase {...props}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </PlayerIconBase>
  );
}

export function PauseIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase {...props}>
      <path d="M7 5h3v14H7V5Zm7 0h3v14h-3V5Z" fill="currentColor" />
    </PlayerIconBase>
  );
}

export function StopIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase {...props}>
      <path d="M7 7h10v10H7V7Z" fill="currentColor" />
    </PlayerIconBase>
  );
}

export function QueueIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase {...props}>
      <path
        d="M5 7h10M5 12h14M5 17h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </PlayerIconBase>
  );
}

export function RepeatIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      className={`player-icon-repeat${props.className ? ` ${props.className}` : ""}`}
    >
      <path
        d="M7 7h8.5a3.5 3.5 0 0 1 0 7H14m1.5-7L13 4.5M15.5 7 13 9.5M17 17H8.5a3.5 3.5 0 0 1 0-7H10m-1.5 7L11 19.5M8.5 17 11 14.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </PlayerIconBase>
  );
}

export function ShuffleIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase {...props}>
      <path
        d="M5 7h2.2c2.2 0 3.3 1.1 4.5 3.2l.6 1.1c1.1 2.1 2.2 3.7 4.5 3.7H19m-2-3 3 3-3 3M5 17h2.2c1.6 0 2.6-.6 3.5-1.8M14 8.8c.8-1.1 1.7-1.8 3-1.8H19m-2-3 3 3-3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </PlayerIconBase>
  );
}
