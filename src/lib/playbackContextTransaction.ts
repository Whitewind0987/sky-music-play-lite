export interface ActivePlaybackContext {
  currentSongId: string;
  songIds: string[];
  source: "local-imports" | "liked" | "playlist" | "search";
}

export interface PlaybackContextTransaction {
  token: number;
}

interface ActiveTransaction extends PlaybackContextTransaction {
  previousContext: ActivePlaybackContext | null;
}

function cloneContext(
  context: ActivePlaybackContext | null,
): ActivePlaybackContext | null {
  return context
    ? {
        ...context,
        currentSongId: context.currentSongId,
        songIds: [...context.songIds],
      }
    : null;
}

export function removeSongFromActivePlaybackContext(
  context: ActivePlaybackContext | null,
  songId: string,
): ActivePlaybackContext | null {
  if (!context) {
    return context;
  }

  if (context.currentSongId === songId) {
    return null;
  }

  if (!context.songIds.includes(songId)) {
    return context;
  }

  const songIds = context.songIds.filter(
    (orderedSongId) => orderedSongId !== songId,
  );
  if (songIds.length === 0) {
    return null;
  }

  return {
    ...context,
    songIds,
  };
}

export class PlaybackContextTransactionStore {
  private activeTransaction: ActiveTransaction | null = null;
  private context: ActivePlaybackContext | null = null;
  private nextToken = 0;

  getContext(): ActivePlaybackContext | null {
    return this.context;
  }

  getCurrentSongId(): string | null {
    return this.context?.currentSongId ?? null;
  }

  replace(context: ActivePlaybackContext | null): void {
    this.nextToken += 1;
    this.activeTransaction = null;
    this.context = cloneContext(context);
  }

  begin(context: ActivePlaybackContext): PlaybackContextTransaction {
    const transaction = { token: ++this.nextToken };
    this.activeTransaction = {
      ...transaction,
      previousContext: cloneContext(this.context),
    };
    this.context = cloneContext(context);
    return transaction;
  }

  beginCurrentSong(songId: string): PlaybackContextTransaction | null {
    if (!this.context) {
      return null;
    }

    return this.begin({
      ...this.context,
      currentSongId: songId,
      songIds: this.context.songIds.includes(songId)
        ? this.context.songIds
        : [...this.context.songIds, songId],
    });
  }

  commit(transaction: PlaybackContextTransaction): boolean {
    if (this.activeTransaction?.token !== transaction.token) {
      return false;
    }

    this.activeTransaction = null;
    return true;
  }

  rollback(transaction: PlaybackContextTransaction): boolean {
    if (this.activeTransaction?.token !== transaction.token) {
      return false;
    }

    this.context = cloneContext(this.activeTransaction.previousContext);
    this.activeTransaction = null;
    return true;
  }

  markCurrentSong(songId: string): void {
    if (!this.context?.songIds.includes(songId)) {
      return;
    }

    this.context = {
      ...this.context,
      currentSongId: songId,
    };
  }

  removeSong(songId: string): void {
    this.context = removeSongFromActivePlaybackContext(this.context, songId);
    if (this.activeTransaction) {
      this.activeTransaction.previousContext =
        removeSongFromActivePlaybackContext(
          this.activeTransaction.previousContext,
          songId,
        );
    }
  }
}

export type PlaybackContextTransactionResult = "started" | "failed" | "stale";

export async function runPlaybackContextTransaction({
  commit,
  rollback,
  start,
  transaction,
}: {
  commit: (transaction: PlaybackContextTransaction) => boolean;
  rollback: (transaction: PlaybackContextTransaction) => boolean;
  start: () => Promise<boolean>;
  transaction: PlaybackContextTransaction;
}): Promise<PlaybackContextTransactionResult> {
  try {
    const didStart = await start();
    if (!didStart) {
      return rollback(transaction) ? "failed" : "stale";
    }

    return commit(transaction) ? "started" : "stale";
  } catch (error) {
    rollback(transaction);
    throw error;
  }
}
