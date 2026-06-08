import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipForward,
  Square,
  type LucideIcon,
} from "lucide-react";

type PlayerIconProps = {
  className?: string;
};

function PlayerIconBase({
  Icon,
  className,
  filled = false,
  strokeWidth = 2,
}: PlayerIconProps & {
  filled?: boolean;
  Icon: LucideIcon;
  strokeWidth?: number;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={`player-icon${className ? ` ${className}` : ""}`}
      fill={filled ? "currentColor" : "none"}
      focusable="false"
      strokeWidth={strokeWidth}
    />
  );
}

export function PlayIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Play}
      filled
      strokeWidth={0}
    />
  );
}

export function PauseIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Pause}
      filled
      strokeWidth={0}
    />
  );
}

export function StopIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Square}
      filled
      strokeWidth={0}
    />
  );
}

export function NextIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={SkipForward}
      filled
      strokeWidth={2.8}
    />
  );
}

export function QueueIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={ListMusic} strokeWidth={2} />;
}

export function RepeatIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Repeat}
      className={`player-icon-repeat${props.className ? ` ${props.className}` : ""}`}
      strokeWidth={1.8}
    />
  );
}

export function RepeatOneIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Repeat1}
      className={`player-icon-repeat${props.className ? ` ${props.className}` : ""}`}
      strokeWidth={1.8}
    />
  );
}

export function ShuffleIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={Shuffle} strokeWidth={2} />;
}
