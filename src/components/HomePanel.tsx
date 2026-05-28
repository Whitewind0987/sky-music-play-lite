import type { UiText } from "../i18n/uiText";
import type { Song } from "../types/score";

type HomePanelProps = {
  onGoToScore: () => void;
  onSelectSong: (songIndex: number) => void;
  selectedSongIndex: number | null;
  songs: Song[];
  text: UiText["home"];
};

export function HomePanel({
  onGoToScore,
  onSelectSong,
  selectedSongIndex,
  songs,
  text,
}: HomePanelProps) {
  if (songs.length === 0) {
    return (
      <section className="home-panel" aria-label={text.aria}>
        <div className="home-empty">
          <p className="eyebrow">{text.emptyEyebrow}</p>
          <h3>{text.emptyTitle}</h3>
          <p>{text.emptyDescription}</p>
          <button type="button" onClick={onGoToScore}>
            {text.goToScore}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="home-panel" aria-label={text.aria}>
      <div className="home-panel-header">
        <div>
          <p className="eyebrow">{text.listEyebrow}</p>
          <h3>{text.listTitle}</h3>
        </div>
        <button type="button" onClick={onGoToScore}>
          {text.importMore}
        </button>
      </div>

      <div className="home-score-list">
        {songs.map((song, index) => (
          <button
            className={`home-score-card${
              selectedSongIndex === index ? " is-selected" : ""
            }`}
            key={`${song.name}-${index}`}
            type="button"
            onClick={() => onSelectSong(index)}
          >
            <span className="home-score-name">{song.name}</span>
            <span className="home-score-meta">
              <span>
                {text.bpm}: {song.bpm}
              </span>
              <span>
                {text.notes}: {song.songNotes.length}
              </span>
            </span>
            <span className="home-score-status">
              {selectedSongIndex === index ? text.selected : text.select}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
