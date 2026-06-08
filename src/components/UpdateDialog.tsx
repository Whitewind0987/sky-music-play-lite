import { X } from "lucide-react";
import { useEffect } from "react";
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
      <section
        className={`update-dialog-card is-${updateInfo.updateKind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <div className="library-collect-dialog-header update-dialog-header">
          <div>
            <p className="update-dialog-kind">
              {text.updateKindLabels[updateInfo.updateKind]}
            </p>
            <h3 id="update-dialog-title">{title}</h3>
          </div>
          <button
            className="update-dialog-close"
            type="button"
            onClick={onClose}
            aria-label={text.close}
          >
            <X aria-hidden="true" focusable="false" />
          </button>
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
          <button
            className="update-dialog-secondary"
            type="button"
            onClick={onClose}
          >
            {text.later}
          </button>
          <button
            className="update-dialog-primary"
            type="button"
            onClick={onDownload}
          >
            {text.download}
          </button>
        </div>
      </section>
    </div>
  );
}
