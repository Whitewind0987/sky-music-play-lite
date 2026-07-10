import type { UiText } from "../i18n/uiText";
import {
  getLibrarySongBpm,
  getLibrarySongName,
  getLibrarySongNoteCount,
} from "../lib/libraryCollections";
import type { LibrarySong } from "../types/library";
import type { PlaybackQueueItem } from "../types/playbackQueue";

type QueuePanelProps = {
  onClearQueue: () => void;
  onPlayQueueItem: (queueItem: PlaybackQueueItem) => void;
  onRemoveQueueItem: (queueItemId: string) => void;
  queueItems: PlaybackQueueItem[];
  songs: LibrarySong[];
  text: UiText["bottomPlayer"];
};

export function QueuePanel({
  onClearQueue,
  onPlayQueueItem,
  onRemoveQueueItem,
  queueItems,
  songs,
  text,
}: QueuePanelProps) {
  return (
    <section className="queue-panel" aria-label={text.queuePanelTitle}>
      <div className="queue-panel-header">
        <div>
          <p className="queue-panel-eyebrow">{text.queue}</p>
          <h3>{text.queuePanelTitle}</h3>
        </div>
        <button
          className="queue-panel-clear"
          type="button"
          disabled={queueItems.length === 0}
          onClick={onClearQueue}
        >
          {text.queueClear}
        </button>
      </div>

      {queueItems.length === 0 ? (
        <p className="queue-panel-empty">{text.queueEmpty}</p>
      ) : (
        <ol className="queue-panel-list">
          {queueItems.map((queueItem, index) => {
            const song = songs[queueItem.songIndex];

            return (
              <li className="queue-panel-item" key={queueItem.id}>
                <span className="queue-panel-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <button
                  className="queue-panel-song"
                  type="button"
                  disabled={!song}
                  onClick={() => onPlayQueueItem(queueItem)}
                >
                  <strong className="queue-panel-song-title">
                    <span className="queue-panel-song-name">
                      {song ? getLibrarySongName(song) : text.queueMissingSong}
                    </span>
                    {index === 0 ? (
                      <span className="queue-current-badge">
                        {text.queueCurrent}
                      </span>
                    ) : null}
                  </strong>
                  <span className="queue-panel-song-meta">
                    {song
                      ? `${text.bpm}: ${getLibrarySongBpm(song)} / ${text.notes}: ${getLibrarySongNoteCount(song)}`
                      : text.queueMissingSongDescription}
                  </span>
                </button>
                <button
                  className="queue-panel-remove"
                  type="button"
                  aria-label={`${text.queueRemove}: ${
                    song ? getLibrarySongName(song) : text.queueMissingSong
                  }`}
                  onClick={() => onRemoveQueueItem(queueItem.id)}
                >
                  {text.queueRemove}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
