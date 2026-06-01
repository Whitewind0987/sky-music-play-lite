import type { UiText } from "../i18n/uiText";
import type { PlaybackQueueItem } from "../types/playbackQueue";
import type { Song } from "../types/score";

type QueuePanelProps = {
  onClearQueue: () => void;
  onRemoveQueueItem: (queueItemId: string) => void;
  queueItems: PlaybackQueueItem[];
  songs: Song[];
  text: UiText["bottomPlayer"];
};

export function QueuePanel({
  onClearQueue,
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
                <span className="queue-panel-song">
                  <strong>{song?.name ?? text.queueMissingSong}</strong>
                  <span>
                    {song
                      ? `${text.bpm}: ${song.bpm} / ${text.notes}: ${song.songNotes.length}`
                      : text.queueMissingSongDescription}
                  </span>
                </span>
                <button
                  className="queue-panel-remove"
                  type="button"
                  aria-label={`${text.queueRemove}: ${
                    song?.name ?? text.queueMissingSong
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
