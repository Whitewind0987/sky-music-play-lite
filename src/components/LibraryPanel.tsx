import type { LibraryCategoryId } from "./AppShell";
import type { UiText } from "../i18n/uiText";
import { getAdjustedPreviewDurationMs } from "../lib/playbackScheduler";
import type {
  LibrarySongId,
  LibrarySongListItem,
  UserPlaylist,
} from "../types/library";

type LibraryPanelProps = {
  hasSearchQuery: boolean;
  importDisabled: boolean;
  importError: string;
  items: LibrarySongListItem[];
  onAddSongToPlaylist: (playlistId: string, songIndex: number) => void;
  onAddToQueue: (songIndex: number) => void;
  onCreatePlaylist: () => void;
  onCreatePlaylistWithSong: (songIndex: number) => void;
  onDeleteLocalSong: (songIndex: number) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onImportFiles: (files: File[]) => void;
  onPlaySong: (songIndex: number) => void;
  onPlaySongNext: (songIndex: number) => void;
  onPlaylistSelect: (playlistId: string) => void;
  onRemoveFromLiked: (songId: LibrarySongId) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: LibrarySongId) => void;
  onRenamePlaylist: (playlistId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectSong: (songIndex: number) => void;
  onToggleLiked: (songIndex: number) => void;
  playlists: UserPlaylist[];
  searchQuery: string;
  selectedCategory: LibraryCategoryId;
  selectedPlaylist: UserPlaylist | null;
  selectedPlaylistId: string | null;
  selectedSongIndex: number | null;
  text: UiText["library"];
};

const createPlaylistOptionValue = "__create_playlist__";

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function readFilesFromInput(fileList: FileList | null) {
  return Array.from(fileList ?? []);
}

function HeartIcon({ isLiked }: { isLiked: boolean }) {
  return (
    <svg
      className="library-heart-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 17.2 8.8 16.1C4.4 12.1 2 9.9 2 6.7 2 4.2 4 2.3 6.5 2.3c1.4 0 2.7.6 3.5 1.6.8-1 2.1-1.6 3.5-1.6C16 2.3 18 4.2 18 6.7c0 3.2-2.4 5.4-6.8 9.4L10 17.2Z"
        fill={isLiked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
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

function LibraryAddToQueueIcon() {
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

function PlaylistManager({
  onCreatePlaylist,
  onDeletePlaylist,
  onPlaylistSelect,
  onRenamePlaylist,
  playlists,
  selectedPlaylistId,
  text,
}: Pick<
  LibraryPanelProps,
  | "onCreatePlaylist"
  | "onDeletePlaylist"
  | "onPlaylistSelect"
  | "onRenamePlaylist"
  | "playlists"
  | "selectedPlaylistId"
  | "text"
>) {
  return (
    <section className="playlist-manager" aria-label={text.playlistsTitle}>
      <div className="playlist-manager-header">
        <h3>{text.playlistsTitle}</h3>
        <button type="button" onClick={onCreatePlaylist}>
          {text.createPlaylist}
        </button>
      </div>
      {playlists.length === 0 ? (
        <p className="library-empty-note">{text.noPlaylists}</p>
      ) : (
        <div className="playlist-list">
          {playlists.map((playlist) => (
            <div
              className={`playlist-list-item${
                playlist.id === selectedPlaylistId ? " is-selected" : ""
              }`}
              key={playlist.id}
            >
              <button type="button" onClick={() => onPlaylistSelect(playlist.id)}>
                {playlist.name}
              </button>
              <span>{playlist.songIds.length}</span>
              <button type="button" onClick={() => onRenamePlaylist(playlist.id)}>
                {text.renamePlaylist}
              </button>
              <button
                className="library-danger-button"
                type="button"
                onClick={() => onDeletePlaylist(playlist.id)}
              >
                {text.deletePlaylist}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddToPlaylistSelect({
  onAddSongToPlaylist,
  onCreatePlaylistWithSong,
  playlists,
  songIndex,
  text,
}: Pick<
  LibraryPanelProps,
  "onAddSongToPlaylist" | "onCreatePlaylistWithSong" | "playlists" | "text"
> & {
  songIndex: number;
}) {
  return (
    <select
      className="library-playlist-select"
      value=""
      aria-label={text.addToPlaylist}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const value = event.currentTarget.value;

        if (value === createPlaylistOptionValue) {
          onCreatePlaylistWithSong(songIndex);
        } else if (value) {
          onAddSongToPlaylist(value, songIndex);
        }

        event.currentTarget.value = "";
      }}
    >
      <option value="">{text.addToPlaylist}</option>
      {playlists.map((playlist) => (
        <option key={playlist.id} value={playlist.id}>
          {playlist.name}
        </option>
      ))}
      <option value={createPlaylistOptionValue}>
        {text.createPlaylistAndAdd}
      </option>
    </select>
  );
}

function LibrarySongTable({
  hasSearchQuery,
  items,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylistWithSong,
  onDeleteLocalSong,
  onPlaySong,
  onPlaySongNext,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onSelectSong,
  onToggleLiked,
  playlists,
  selectedCategory,
  selectedPlaylist,
  selectedSongIndex,
  text,
}: Pick<
  LibraryPanelProps,
  | "hasSearchQuery"
  | "items"
  | "onAddSongToPlaylist"
  | "onAddToQueue"
  | "onCreatePlaylistWithSong"
  | "onDeleteLocalSong"
  | "onPlaySong"
  | "onPlaySongNext"
  | "onRemoveFromLiked"
  | "onRemoveSongFromPlaylist"
  | "onSelectSong"
  | "onToggleLiked"
  | "playlists"
  | "selectedCategory"
  | "selectedPlaylist"
  | "selectedSongIndex"
  | "text"
>) {
  if (items.length === 0) {
    return (
      <div className="library-empty">
        <h3>{hasSearchQuery ? text.noSearchResults : text.emptyTitle}</h3>
        <p>{hasSearchQuery ? text.noSearchResults : text.emptyDescription}</p>
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
        {items.map((item, displayIndex) => {
          const { librarySong, songIndex } = item;
          const song = librarySong.song;
          const isSelected = selectedSongIndex === songIndex;
          const duration = formatDuration(
            getAdjustedPreviewDurationMs(song.songNotes),
          );
          const rowNumber = String(displayIndex + 1).padStart(2, "0");

          return (
            <div
              className={`library-song-row${isSelected ? " is-selected" : ""}`}
              key={librarySong.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSong(songIndex)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectSong(songIndex);
                }
              }}
            >
              <span className="library-song-index">
                <span className="library-song-number">{rowNumber}</span>
                <button
                  className="library-row-play"
                  type="button"
                  aria-label={`${text.playThisScoreAction}: ${song.name}`}
                  title={text.playThisScoreAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlaySong(songIndex);
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
                      onPlaySongNext(songIndex);
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
                      onAddToQueue(songIndex);
                    }}
                  >
                    <LibraryAddToQueueIcon />
                  </button>
                  <AddToPlaylistSelect
                    onAddSongToPlaylist={onAddSongToPlaylist}
                    onCreatePlaylistWithSong={onCreatePlaylistWithSong}
                    playlists={playlists}
                    songIndex={songIndex}
                    text={text}
                  />
                  {selectedCategory === "local-imports" ? (
                    <button
                      className="library-danger-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteLocalSong(songIndex);
                      }}
                    >
                      {text.deleteLocalSong}
                    </button>
                  ) : null}
                  {selectedCategory === "liked" ? (
                    <button
                      className="library-muted-action"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveFromLiked(librarySong.id);
                      }}
                    >
                      {text.removeFromLiked}
                    </button>
                  ) : null}
                  {selectedCategory === "playlists" && selectedPlaylist ? (
                    <button
                      className="library-muted-action"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveSongFromPlaylist(
                          selectedPlaylist.id,
                          librarySong.id,
                        );
                      }}
                    >
                      {text.removeFromPlaylist}
                    </button>
                  ) : null}
                </span>
                {isSelected ? (
                  <span className="library-selected-badge">{text.selected}</span>
                ) : null}
              </span>
              <span className="library-song-source">{text.localImport}</span>
              <span className="library-song-liked">
                <button
                  className={`library-heart-button${
                    item.isLiked ? " is-liked" : ""
                  }`}
                  type="button"
                  aria-label={`${
                    item.isLiked ? text.unlikeAction : text.likeAction
                  }: ${song.name}`}
                  title={item.isLiked ? text.unlikeAction : text.likeAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLiked(songIndex);
                  }}
                >
                  <HeartIcon isLiked={item.isLiked} />
                </button>
              </span>
              <span className="library-song-duration">{duration}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LibraryPanel({
  hasSearchQuery,
  importDisabled,
  importError,
  items,
  onAddSongToPlaylist,
  onAddToQueue,
  onCreatePlaylist,
  onCreatePlaylistWithSong,
  onDeleteLocalSong,
  onDeletePlaylist,
  onImportFiles,
  onPlaySong,
  onPlaySongNext,
  onPlaylistSelect,
  onRemoveFromLiked,
  onRemoveSongFromPlaylist,
  onRenamePlaylist,
  onSearchQueryChange,
  onSelectSong,
  onToggleLiked,
  playlists,
  searchQuery,
  selectedCategory,
  selectedPlaylist,
  selectedPlaylistId,
  selectedSongIndex,
  text,
}: LibraryPanelProps) {
  const isLocalImports = selectedCategory === "local-imports";
  const isPlaylists = selectedCategory === "playlists";
  const isBuiltIn = selectedCategory === "built-in";
  const emptyState = text.categoryEmptyStates[selectedCategory];
  const contentTitle =
    isPlaylists && selectedPlaylist ? selectedPlaylist.name : emptyState.title;

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
            <h3>{isLocalImports ? text.tableTitle : contentTitle}</h3>
            {!isLocalImports && !isPlaylists ? <p>{emptyState.description}</p> : null}
          </div>
          <label className="library-search">
            <span className="sr-only">{text.searchPlaceholder}</span>
            <input
              type="search"
              value={searchQuery}
              placeholder={text.searchPlaceholder}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            />
          </label>
        </div>
        {isPlaylists ? (
          <PlaylistManager
            onCreatePlaylist={onCreatePlaylist}
            onDeletePlaylist={onDeletePlaylist}
            onPlaylistSelect={onPlaylistSelect}
            onRenamePlaylist={onRenamePlaylist}
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            text={text}
          />
        ) : null}
        {isBuiltIn ? (
          <div className="library-empty">
            <h3>{emptyState.title}</h3>
            <p>{emptyState.description}</p>
          </div>
        ) : isPlaylists && !selectedPlaylist ? (
          <div className="library-empty">
            <h3>{text.emptyPlaylistTitle}</h3>
            <p>{text.emptyPlaylistDescription}</p>
          </div>
        ) : (
          <LibrarySongTable
            hasSearchQuery={hasSearchQuery}
            items={items}
            onAddSongToPlaylist={onAddSongToPlaylist}
            onAddToQueue={onAddToQueue}
            onCreatePlaylistWithSong={onCreatePlaylistWithSong}
            onDeleteLocalSong={onDeleteLocalSong}
            onPlaySong={onPlaySong}
            onPlaySongNext={onPlaySongNext}
            onRemoveFromLiked={onRemoveFromLiked}
            onRemoveSongFromPlaylist={onRemoveSongFromPlaylist}
            onSelectSong={onSelectSong}
            onToggleLiked={onToggleLiked}
            playlists={playlists}
            selectedCategory={selectedCategory}
            selectedPlaylist={selectedPlaylist}
            selectedSongIndex={selectedSongIndex}
            text={text}
          />
        )}
      </div>
    </section>
  );
}
