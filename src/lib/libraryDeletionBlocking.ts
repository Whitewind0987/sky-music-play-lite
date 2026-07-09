export type LibraryDeleteRequestType = "local-song" | "playlist";

export type LocalSongDeletionBlockers = {
  isBackgroundHandoffPending: boolean;
  isForegroundStartPending: boolean;
  isImportedScoreReconciliationInProgress: boolean;
};

export function shouldBlockLocalSongDeletion({
  isBackgroundHandoffPending,
  isForegroundStartPending,
  isImportedScoreReconciliationInProgress,
}: LocalSongDeletionBlockers) {
  return (
    isBackgroundHandoffPending ||
    isForegroundStartPending ||
    isImportedScoreReconciliationInProgress
  );
}

export function shouldBlockLibraryDeleteRequest({
  isLocalSongDeleteBlocked,
  requestType,
}: {
  isLocalSongDeleteBlocked: boolean;
  requestType: LibraryDeleteRequestType;
}) {
  return requestType === "local-song" && isLocalSongDeleteBlocked;
}
