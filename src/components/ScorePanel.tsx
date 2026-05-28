import type { UiText } from "../i18n/uiText";
import type { Note, Song } from "../types/score";
import { PanelHeader } from "./PanelHeader";

type ScoreInputProps = {
  error: string;
  importedSongs: Song[];
  importError: string;
  input: string;
  notes: Note[];
  onImportFile: (file: File) => void;
  onInputChange: (value: string) => void;
  onParseScore: () => void;
  onSelectImportedSong: (songIndex: number | null) => void;
  selectedSongIndex: number | null;
  songs: Song[];
  text: UiText["score"];
};

type ExampleScoresProps = {
  songs: Song[];
  text: UiText["score"];
};

function ExampleScores({ songs, text }: ExampleScoresProps) {
  return (
    <div className="example-scores" aria-label={text.exampleScoresAria}>
      {songs.map((song) => (
        <article className="score-card" key={song.name}>
          <h3>{song.name}</h3>
          <dl>
            <div>
              <dt>{text.bpm}</dt>
              <dd>{song.bpm}</dd>
            </div>
            <div>
              <dt>{text.notes}</dt>
              <dd>{song.songNotes.length}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

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
    return <p className="import-empty">{text.noImportedScores}</p>;
  }

  return (
    <div className="imported-scores" aria-label={text.importedScoresAria}>
      <div className="imported-scores-header">
        <h3>{text.importedScoresTitle}</h3>
        <button type="button" onClick={() => onSelectImportedSong(null)}>
          {text.useTextInput}
        </button>
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
          </button>
        ))}
      </div>
    </div>
  );
}

function ParsedNotes({
  notes,
  text,
}: {
  notes: Note[];
  text: UiText["score"];
}) {
  if (notes.length === 0) {
    return <p className="parse-empty">{text.noParsedNotes}</p>;
  }

  return (
    <div className="parsed-notes" aria-label="Parsed score notes">
      <p>
        {notes.length} {text.notesParsed}
      </p>
      <ol>
        {notes.map((note, index) => (
          <li key={`${note.time}-${note.key}-${index}`}>
            <span>{note.key}</span>
            <span>
              {note.time} {text.milliseconds}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ScoreInput({
  error,
  importedSongs,
  importError,
  input,
  notes,
  onImportFile,
  onInputChange,
  onParseScore,
  onSelectImportedSong,
  selectedSongIndex,
  songs,
  text,
}: ScoreInputProps) {
  return (
    <section className="panel score-panel" aria-labelledby="score-input-title">
      <PanelHeader
        id="score-input-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <textarea
        aria-labelledby="score-input-title"
        onChange={(event) => onInputChange(event.currentTarget.value)}
        placeholder={text.placeholder}
        value={input}
      />
      <label className="file-import-control">
        <span>{text.importLabel}</span>
        <input
          accept=".json,.txt"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            if (file) {
              onImportFile(file);
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
      <button className="parse-button" type="button" onClick={onParseScore}>
        {text.parseButton}
      </button>
      {error ? <p className="parse-error">{error}</p> : null}
      <ParsedNotes notes={notes} text={text} />
      <ExampleScores songs={songs} text={text} />
    </section>
  );
}
