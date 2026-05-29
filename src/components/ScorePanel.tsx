import type { UiText } from "../i18n/uiText";
import type { Song } from "../types/score";
import { PanelHeader } from "./PanelHeader";

type ScoreInputProps = {
  importedSongs: Song[];
  importError: string;
  onImportFiles: (files: File[]) => void;
  onSelectImportedSong: (songIndex: number | null) => void;
  selectedSongIndex: number | null;
  text: UiText["score"];
};

type ImportedScoresProps = {
  selectedSongIndex: number | null;
  songs: Song[];
  onSelectImportedSong: (songIndex: number | null) => void;
  text: UiText["score"];
};

function ImportedScores({
  selectedSongIndex,
  songs,
  onSelectImportedSong,
  text,
}: ImportedScoresProps) {
  if (songs.length === 0) {
    return <p className="import-empty">{text.emptyState}</p>;
  }

  return (
    <div className="imported-scores" aria-label={text.importedScoresAria}>
      <div className="imported-scores-header">
        <h3>{text.importedScoresTitle}</h3>
      </div>
      <div className="imported-score-list">
        {songs.map((song, index) => (
          <button
            className={`imported-score-card${
              selectedSongIndex === index ? " is-selected" : ""
            }`}
            key={`${song.name}-${index}`}
            type="button"
            onClick={() => onSelectImportedSong(index)}
          >
            <span>{song.name}</span>
            <span>
              {text.bpm} {song.bpm}
            </span>
            <span>
              {song.songNotes.length} {text.notes}
            </span>
            <span className="selected-score-status">
              {selectedSongIndex === index ? text.selectedStatus : text.selectStatus}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScoreInput({
  importedSongs,
  importError,
  onImportFiles,
  onSelectImportedSong,
  selectedSongIndex,
  text,
}: ScoreInputProps) {
  return (
    <section className="panel score-panel" aria-labelledby="score-input-title">
      <PanelHeader
        id="score-input-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <label className="file-import-control">
        <span>{text.importLabel}</span>
        <input
          accept=".json,.txt"
          multiple
          type="file"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);

            if (files.length > 0) {
              onImportFiles(files);
            }

            event.currentTarget.value = "";
          }}
        />
      </label>
      {importError ? <p className="parse-error">{importError}</p> : null}
      <ImportedScores
        selectedSongIndex={selectedSongIndex}
        songs={importedSongs}
        onSelectImportedSong={onSelectImportedSong}
        text={text}
      />
    </section>
  );
}
