import type { UiText } from "../i18n/uiText";
import type { PlaybackState } from "../types/playback";
import type { Song } from "../types/score";

type BottomPlayerProps = {
  currentSong: Song | null;
  onPause: () => void;
  onPlay: () => void;
  onResume: () => void;
  onStop: () => void;
  playbackState: PlaybackState;
  text: UiText["bottomPlayer"];
};

export function BottomPlayer({
  currentSong,
  onPause,
  onPlay,
  onResume,
  onStop,
  playbackState,
  text,
}: BottomPlayerProps) {
  const hasSong = currentSong !== null;
  const canPlay =
    hasSong && (playbackState === "idle" || playbackState === "finished");
  const canPause = playbackState === "playing";
  const canResume = playbackState === "paused";
  const canStop = playbackState === "playing" || playbackState === "paused";

  return (
    <footer className="bottom-player" aria-label={text.aria}>
      <div className="bottom-player-score">
        <span className="bottom-player-label">{text.currentScore}</span>
        <strong>{currentSong?.name ?? text.noScore}</strong>
        <div className="bottom-player-meta">
          <span>
            {text.bpm}: {currentSong?.bpm ?? "--"}
          </span>
          <span>
            {text.notes}: {currentSong?.songNotes.length ?? "--"}
          </span>
          <span>
            {text.state}: {text.states[playbackState]}
          </span>
        </div>
      </div>

      <div className="bottom-player-controls" aria-label={text.controlsAria}>
        <button type="button" disabled={!canPlay} onClick={onPlay}>
          {text.play}
        </button>
        <button type="button" disabled={!canPause} onClick={onPause}>
          {text.pause}
        </button>
        <button type="button" disabled={!canResume} onClick={onResume}>
          {text.resume}
        </button>
        <button type="button" disabled={!canStop} onClick={onStop}>
          {text.stop}
        </button>
      </div>

      <div className="bottom-player-placeholders">
        <div className="bottom-player-progress" aria-label={text.progress}>
          <span />
        </div>
        <button type="button" disabled>
          {text.queue}
        </button>
        <button type="button" disabled>
          {text.mode}
        </button>
      </div>
    </footer>
  );
}
