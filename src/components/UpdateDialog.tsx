import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { UiText } from "../i18n/uiText";
import type { UpdateInfo } from "../lib/updateCheck";

type UpdateDialogProps = {
  onClose: () => void;
  onDownload: () => void;
  onIgnore: () => void;
  text: UiText["updateDialog"];
  updateInfo: UpdateInfo;
};

export function UpdateDialog({
  onClose,
  onDownload,
  onIgnore,
  text,
  updateInfo,
}: UpdateDialogProps) {
  const canIgnore = updateInfo.updateKind === "alpha";
  const title = updateInfo.title ?? text.titleFallback;

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
          <Dialog.Content
            className={`update-dialog-card is-${updateInfo.updateKind}`}
            aria-describedby={undefined}
          >
            <div className="library-collect-dialog-header update-dialog-header">
              <div>
                <p className="update-dialog-kind">
                  {text.updateKindLabels[updateInfo.updateKind]}
                </p>
                <Dialog.Title asChild>
                  <h3 id="update-dialog-title">{title}</h3>
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  className="update-dialog-close"
                  type="button"
                  aria-label={text.close}
                >
                  <X aria-hidden="true" focusable="false" />
                </button>
              </Dialog.Close>
            </div>

            <dl className="update-dialog-meta">
              <div>
                <dt>{text.latestVersion}</dt>
                <dd>{updateInfo.latestVersion}</dd>
              </div>
              <div>
                <dt>{text.updateKind}</dt>
                <dd>{text.updateKindLabels[updateInfo.updateKind]}</dd>
              </div>
            </dl>

            {updateInfo.notes.length > 0 ? (
              <div className="update-dialog-notes">
                <h4>{text.notesTitle}</h4>
                <ul>
                  {updateInfo.notes.map((note, index) => (
                    <li key={`${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="update-dialog-actions">
              {canIgnore ? (
                <button
                  className="update-dialog-secondary"
                  type="button"
                  onClick={onIgnore}
                >
                  {text.ignore}
                </button>
              ) : null}
              <Dialog.Close asChild>
                <button className="update-dialog-secondary" type="button">
                  {text.later}
                </button>
              </Dialog.Close>
              <button
                className="update-dialog-primary"
                type="button"
                onClick={onDownload}
              >
                {text.download}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
