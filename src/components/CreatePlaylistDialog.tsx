import { useEffect, useState } from "react";
import type { UiText } from "../i18n/uiText";

type CreatePlaylistDialogProps = {
  onClose: () => void;
  onCreate: (playlistName: string) => void;
  text: UiText["library"];
};

export function CreatePlaylistDialog({
  onClose,
  onCreate,
  text,
}: CreatePlaylistDialogProps) {
  const [playlistName, setPlaylistName] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="library-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        className="library-create-playlist-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={text.createPlaylistDialogTitle}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(playlistName.trim() || text.defaultPlaylistName);
        }}
      >
        <div className="library-collect-dialog-header">
          <h3>{text.createPlaylistDialogTitle}</h3>
          <button type="button" onClick={onClose} aria-label={text.closeDialog}>
            x
          </button>
        </div>
        <label className="library-create-playlist-field">
          <span>{text.playlistTitlePlaceholder}</span>
          <input
            type="text"
            value={playlistName}
            placeholder={text.defaultPlaylistName}
            autoFocus
            onChange={(event) => setPlaylistName(event.currentTarget.value)}
          />
        </label>
        <button className="library-create-playlist-submit" type="submit">
          {text.createPlaylistConfirm}
        </button>
      </form>
    </div>
  );
}
