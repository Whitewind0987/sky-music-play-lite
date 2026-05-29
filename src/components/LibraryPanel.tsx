import type { LibraryCategoryId } from "./AppShell";
import type { UiText } from "../i18n/uiText";
import { getAdjustedPreviewDurationMs } from "../lib/playbackScheduler";
import type { Song } from "../types/score";

type LibraryPanelProps = {
  importError: string;
  onImportFiles: (files: File[]) => void;
  onPlaySong: (songIndex: number) => void;
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

function LibraryImportArea({
  importError,
  onImportFiles,
  text,
}: Pick<LibraryPanelProps, "importError" | "onImportFiles" | "text">) {
  return (
    <section className="library-import-area" aria-label={text.importTitle}>
      <div>
        <p className="eyebrow">{text.importEyebrow}</p>
        <h3>{text.importTitle}</h3>
        <p>{text.importDescription}</p>
      </div>
      <label className="library-import-button">
        <span>{text.importLabel}</span>
        <input
          accept=".json,.txt"
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
  onPlaySong,
  onSelectSong,
  selectedSongIndex,
  songs,
  text,
}: Omit<LibraryPanelProps, "importError" | "onImportFiles" | "selectedCategory">) {
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
        <span>{text.columns.actions}</span>
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
                  aria-label={`${text.playAction}: ${song.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlaySong(index);
                  }}
                >
                  <LibraryRowPlayIcon />
                </button>
              </span>
              <span className="library-song-title">
                <span>{song.name}</span>
                {isSelected ? (
                  <span className="library-selected-badge">{text.selected}</span>
                ) : null}
              </span>
              <span className="library-song-source">{text.localImport}</span>
              <span className="library-song-muted">{text.likedPlaceholder}</span>
              <span className="library-song-duration">{duration}</span>
              <span className="library-song-actions">
                <span className="library-song-actions-placeholder">
                  {text.actionsPlaceholder}
                </span>
                <span className="library-song-action-buttons">
                  <button type="button" disabled>
                    {text.playNextAction}
                  </button>
                  <button type="button" disabled>
                    {text.addToPlaylistAction}
                  </button>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LibraryPanel({
  importError,
  onImportFiles,
  onPlaySong,
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
      <LibraryImportArea
        importError={importError}
        onImportFiles={onImportFiles}
        text={text}
      />
      <div className="library-content">
        <div className="library-content-header">
          <div>
            <p className="eyebrow">{text.tableEyebrow}</p>
            <h3>{isLocalImports ? text.tableTitle : emptyState.title}</h3>
          </div>
          <p>{isLocalImports ? text.tableDescription : emptyState.description}</p>
        </div>
        {isLocalImports ? (
          <LibrarySongTable
            onPlaySong={onPlaySong}
            onSelectSong={onSelectSong}
            selectedSongIndex={selectedSongIndex}
            songs={songs}
            text={text}
          />
        ) : (
          <div className="library-empty">
            <p className="eyebrow">{text.placeholderEyebrow}</p>
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
          </div>
        )}
        </div>
    </section>
  );
}
