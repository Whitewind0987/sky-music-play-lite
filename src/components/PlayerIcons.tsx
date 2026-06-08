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
  fill,
  strokeWidth,
}: PlayerIconProps & {
  fill?: string;
  Icon: LucideIcon;
  strokeWidth?: number;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={`player-icon${className ? ` ${className}` : ""}`}
      fill={fill}
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
      fill="currentColor"
      strokeWidth={0}
    />
  );
}

export function PauseIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Pause}
      fill="currentColor"
      strokeWidth={0}
    />
  );
}

export function StopIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Square}
      fill="currentColor"
      strokeWidth={0}
    />
  );
}

export function NextIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={SkipForward}
      fill="currentColor"
      strokeWidth={2.8}
    />
  );
}

export function QueueIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={ListMusic} />;
}

export function RepeatIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Repeat}
      className={`player-icon-repeat${props.className ? ` ${props.className}` : ""}`}
    />
  );
}

export function RepeatOneIcon(props: PlayerIconProps) {
  return (
    <PlayerIconBase
      {...props}
      Icon={Repeat1}
      className={`player-icon-repeat${props.className ? ` ${props.className}` : ""}`}
    />
  );
}

export function ShuffleIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={Shuffle} />;
}
