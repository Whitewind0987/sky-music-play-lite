import type { ReactNode } from "react";

type PlayerModeSurfaceProps = {
  bottomPlayer: ReactNode;
  isOpen: boolean;
  visualization: ReactNode;
};

export function PlayerModeSurface({
  bottomPlayer,
  isOpen,
  visualization,
}: PlayerModeSurfaceProps) {
  return (
    <div className={`player-mode-surface${isOpen ? " is-open" : ""}`}>
      {visualization}
      {bottomPlayer}
    </div>
  );
}
