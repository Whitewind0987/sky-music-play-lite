import * as Dialog from "@radix-ui/react-dialog";

type ConfirmDialogVariant = "danger" | "default";

type ConfirmDialogProps = {
  cancelLabel: string;
  confirmLabel: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: string;
  variant?: ConfirmDialogVariant;
};

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  title,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (onOpenChange) {
          onOpenChange(nextOpen);
          return;
        }

        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="library-dialog-backdrop">
          <Dialog.Content
            className="confirm-dialog-card"
            aria-describedby={
              description ? "confirm-dialog-description" : undefined
            }
          >
            <div className="confirm-dialog-header">
              <Dialog.Title asChild>
                <h3>{title}</h3>
              </Dialog.Title>
              {description ? (
                <Dialog.Description asChild>
                  <p
                    className="confirm-dialog-description"
                    id="confirm-dialog-description"
                  >
                    {description}
                  </p>
                </Dialog.Description>
              ) : null}
            </div>
            <div className="confirm-dialog-actions">
              <Dialog.Close asChild>
                <button
                  className="confirm-dialog-secondary"
                  type="button"
                  onClick={onCancel}
                >
                  {cancelLabel}
                </button>
              </Dialog.Close>
              <button
                className={`confirm-dialog-primary${
                  variant === "danger" ? " is-danger" : ""
                }`}
                type="button"
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
