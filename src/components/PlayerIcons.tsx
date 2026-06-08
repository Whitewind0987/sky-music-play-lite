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
}: PlayerIconProps & { Icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden="true"
      className={`player-icon${className ? ` ${className}` : ""}`}
      focusable="false"
    />
  );
}

export function PlayIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={Play} />;
}

export function PauseIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={Pause} />;
}

export function StopIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={Square} />;
}

export function NextIcon(props: PlayerIconProps) {
  return <PlayerIconBase {...props} Icon={SkipForward} />;
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
