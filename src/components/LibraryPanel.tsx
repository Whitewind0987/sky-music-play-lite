import type { LibraryCategoryId } from "./AppShell";
import type { UiText } from "../i18n/uiText";
import { getAdjustedPreviewDurationMs } from "../lib/playbackScheduler";
import type { Song } from "../types/score";

type LibraryPanelProps = {
  importDisabled: boolean;
  importError: string;
  onAddToQueue: (songIndex: number) => void;
  onImportFiles: (files: File[]) => void;
  onPlaySong: (songIndex: number) => void;
  onPlaySongNext: (songIndex: number) => void;
  onSelectSong: (songIndex: number) => void;
  selectedCategory: LibraryCategoryId;
  selectedSongIndex: number | null;
  songs: Song[];
  text: UiText["library"];
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function readFilesFromInput(fileList: FileList | null) {
  return Array.from(fileList ?? []);
}

function LibraryRowPlayIcon() {
  return (
    <svg
      className="library-row-play-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.2 3.4v9.2L12 8 5.2 3.4Z" fill="currentColor" />
    </svg>
  );
}

function LibraryPlayNextIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 3.8v8.4l5.8-4.2L3 3.8Zm7 0h1.4v8.4H10V3.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LibraryAddToPlaylistIcon() {
  return (
    <svg
      className="library-title-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4h6.8v1.2H2.5V4Zm0 3.2h6.8v1.2H2.5V7.2Zm0 3.2h4.8v1.2H2.5v-1.2Zm9.2-2.9h1.2v2h2v1.2h-2v2h-1.2v-2h-2V9.5h2v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LibraryImportArea({
  importDisabled,
  importError,
  onImportFiles,
  text,
}: Pick<
  LibraryPanelProps,
  "importDisabled" | "importError" | "onImportFiles" | "text"
>) {
  return (
    <section className="library-import-area" aria-label={text.importTitle}>
      <div>
        <p className="eyebrow">{text.importEyebrow}</p>
        <h3>{text.importTitle}</h3>
        <p>{text.importDescription}</p>
      </div>
      <label
        className={`library-import-button${importDisabled ? " is-disabled" : ""}`}
        aria-disabled={importDisabled}
      >
        <span>{text.importLabel}</span>
        <input
          accept=".json,.txt"
          disabled={importDisabled}
          multiple
          type="file"
          onChange={(event) => {
            const files = readFilesFromInput(event.currentTarget.files);

            if (files.length > 0) {
              onImportFiles(files);
            }

            event.currentTarget.value = "";
          }}
        />
      </label>
      {importError ? <p className="parse-error">{importError}</p> : null}
    </section>
  );
}

function LibrarySongTable({
  onAddToQueue,
  onPlaySong,
  onPlaySongNext,
  onSelectSong,
  selectedSongIndex,
  songs,
  text,
}: Omit<
  LibraryPanelProps,
  "importDisabled" | "importError" | "onImportFiles" | "selectedCategory"
>) {
  if (songs.length === 0) {
    return (
      <div className="library-empty">
        <p className="eyebrow">{text.emptyEyebrow}</p>
        <h3>{text.emptyTitle}</h3>
        <p>{text.emptyDescription}</p>
      </div>
    );
  }

  return (
    <section className="library-table" aria-label={text.tableTitle}>
      <div className="library-table-header">
        <span>{text.columns.index}</span>
        <span>{text.columns.title}</span>
        <span>{text.columns.source}</span>
        <span>{text.columns.liked}</span>
        <span>{text.columns.duration}</span>
      </div>
      <div className="library-table-body">
        {songs.map((song, index) => {
          const isSelected = selectedSongIndex === index;
          const duration = formatDuration(
            getAdjustedPreviewDurationMs(song.songNotes),
          );
          const displayIndex = String(index + 1).padStart(2, "0");

          return (
            <div
              className={`library-song-row${isSelected ? " is-selected" : ""}`}
              key={`${song.name}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSong(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectSong(index);
                }
              }}
            >
              <span className="library-song-index">
                <span className="library-song-number">{displayIndex}</span>
                <button
                  className="library-row-play"
                  type="button"
                  aria-label={`${text.playThisScoreAction}: ${song.name}`}
                  title={text.playThisScoreAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlaySong(index);
                  }}
                >
                  <LibraryRowPlayIcon />
                </button>
              </span>
              <span className="library-song-title">
                <span className="library-song-title-text">{song.name}</span>
                <span className="library-row-title-actions">
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.playNextAction}
                    title={text.playNextAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlaySongNext(index);
                    }}
                  >
                    <LibraryPlayNextIcon />
                  </button>
                  <button
                    className="library-title-icon-button"
                    type="button"
                    aria-label={text.addToQueueAction}
                    title={text.addToQueueAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddToQueue(index);
                    }}
                  >
                    <LibraryAddToPlaylistIcon />
                  </button>
                </span>
                {isSelected ? (
                  <span className="library-selected-badge">{text.selected}</span>
                ) : null}
              </span>
              <span className="library-song-source">{text.localImport}</span>
              <span className="library-song-muted">{text.likedPlaceholder}</span>
              <span className="library-song-duration">{duration}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LibraryPanel({
  importDisabled,
  importError,
  onAddToQueue,
  onImportFiles,
  onPlaySong,
  onPlaySongNext,
  onSelectSong,
  selectedCategory,
  selectedSongIndex,
  songs,
  text,
}: LibraryPanelProps) {
  const isLocalImports = selectedCategory === "local-imports";
  const emptyState = text.categoryEmptyStates[selectedCategory];

  return (
    <section className="library-panel" aria-label={text.aria}>
      {isLocalImports ? (
        <LibraryImportArea
          importDisabled={importDisabled}
          importError={importError}
          onImportFiles={onImportFiles}
          text={text}
        />
      ) : null}
      <div className="library-content">
        <div className="library-content-header">
          <div>
            <h3>{isLocalImports ? text.tableTitle : emptyState.title}</h3>
          </div>
          {!isLocalImports ? <p>{emptyState.description}</p> : null}
        </div>
        {isLocalImports ? (
          <LibrarySongTable
            onAddToQueue={onAddToQueue}
            onPlaySong={onPlaySong}
            onPlaySongNext={onPlaySongNext}
            onSelectSong={onSelectSong}
            selectedSongIndex={selectedSongIndex}
            songs={songs}
            text={text}
          />
        ) : (
          <div className="library-empty">
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
          </div>
        )}
        </div>
    </section>
  );
}
