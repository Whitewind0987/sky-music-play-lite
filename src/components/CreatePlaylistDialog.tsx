import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
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

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="library-dialog-backdrop">
          <Dialog.Content asChild aria-describedby={undefined}>
            <form
              className="library-create-playlist-dialog"
              onSubmit={(event) => {
                event.preventDefault();
                onCreate(playlistName.trim() || text.defaultPlaylistName);
              }}
            >
              <div className="library-collect-dialog-header">
                <Dialog.Title asChild>
                  <h3>{text.createPlaylistDialogTitle}</h3>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" aria-label={text.closeDialog}>
                    x
                  </button>
                </Dialog.Close>
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
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
