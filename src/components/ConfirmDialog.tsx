import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type ConfirmDialogVariant = "danger" | "default";

type ConfirmDialogProps = {
  cancelLabel: string;
  children?: ReactNode;
  confirmLabel: string;
  description?: string;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: string;
  variant?: ConfirmDialogVariant;
};

export function ConfirmDialog({
  cancelLabel,
  children,
  confirmLabel,
  description,
  isConfirming = false,
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
        if (isConfirming) {
          return;
        }

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
            {children}
            <div className="confirm-dialog-actions">
              {isConfirming ? (
                <button
                  className="confirm-dialog-secondary"
                  type="button"
                  disabled
                >
                  {cancelLabel}
                </button>
              ) : (
                <Dialog.Close asChild>
                  <button
                    className="confirm-dialog-secondary"
                    type="button"
                    onClick={onCancel}
                  >
                    {cancelLabel}
                  </button>
                </Dialog.Close>
              )}
              <button
                className={`confirm-dialog-primary${
                  variant === "danger" ? " is-danger" : ""
                }`}
                type="button"
                disabled={isConfirming}
                onClick={() => {
                  if (!isConfirming) {
                    onConfirm();
                  }
                }}
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
