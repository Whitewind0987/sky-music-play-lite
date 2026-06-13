import * as Toast from "@radix-ui/react-toast";

type AppNoticeToastProps = {
  message: string | null;
  noticeKey: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function AppNoticeToast({
  message,
  noticeKey,
  onOpenChange,
  open,
}: AppNoticeToastProps) {
  return (
    <Toast.Provider duration={3000} swipeDirection="down">
      {message ? (
        <Toast.Root
          key={noticeKey}
          className="app-notice"
          open={open}
          onOpenChange={onOpenChange}
        >
          <Toast.Description>{message}</Toast.Description>
        </Toast.Root>
      ) : null}
      <Toast.Viewport className="app-notice-viewport" />
    </Toast.Provider>
  );
}
