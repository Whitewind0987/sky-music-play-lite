import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { UiText } from "../i18n/uiText";

type RenamePlaylistDialogProps = {
  initialName: string;
  onClose: () => void;
  onRename: (playlistName: string) => void;
  text: UiText["library"];
};

export function RenamePlaylistDialog({
  initialName,
  onClose,
  onRename,
  text,
}: RenamePlaylistDialogProps) {
  const [playlistName, setPlaylistName] = useState(initialName);

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
                onRename(playlistName);
              }}
            >
              <div className="library-collect-dialog-header">
                <Dialog.Title asChild>
                  <h3>{text.renamePlaylistDialogTitle}</h3>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" aria-label={text.closeDialog}>
                    x
                  </button>
                </Dialog.Close>
              </div>
              <label className="library-create-playlist-field">
                <span>{text.renamePlaylistNameLabel}</span>
                <input
                  type="text"
                  value={playlistName}
                  placeholder={initialName}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    setPlaylistName(event.currentTarget.value)
                  }
                />
              </label>
              <button className="library-create-playlist-submit" type="submit">
                {text.renamePlaylistConfirm}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
