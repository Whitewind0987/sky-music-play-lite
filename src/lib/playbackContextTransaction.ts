export interface ActivePlaybackContext {
  currentSongId: string;
  songIds: string[];
  source: "local-imports" | "liked" | "playlist" | "queue" | "search";
}

export interface PlaybackContextTransaction {
  token: number;
}

interface ActiveTransaction extends PlaybackContextTransaction {
  pendingContext: ActivePlaybackContext;
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
  private committedContext: ActivePlaybackContext | null = null;
  private nextToken = 0;

  getContext(): ActivePlaybackContext | null {
    return this.activeTransaction?.pendingContext ?? this.committedContext;
  }

  getCommittedContext(): ActivePlaybackContext | null {
    return this.committedContext;
  }

  getPendingContext(): ActivePlaybackContext | null {
    return this.activeTransaction?.pendingContext ?? null;
  }

  getCurrentSongId(): string | null {
    return this.getContext()?.currentSongId ?? null;
  }

  getCommittedCurrentSongId(): string | null {
    return this.committedContext?.currentSongId ?? null;
  }

  getPendingCurrentSongId(): string | null {
    return this.activeTransaction?.pendingContext.currentSongId ?? null;
  }

  hasPendingTransaction(): boolean {
    return this.activeTransaction !== null;
  }

  replace(context: ActivePlaybackContext | null): void {
    this.nextToken += 1;
    this.activeTransaction = null;
    this.committedContext = cloneContext(context);
  }

  begin(context: ActivePlaybackContext): PlaybackContextTransaction {
    const transaction = { token: ++this.nextToken };
    this.activeTransaction = {
      ...transaction,
      pendingContext: cloneContext(context)!,
    };
    return transaction;
  }

  beginCurrentSong(songId: string): PlaybackContextTransaction | null {
    const context = this.getContext();
    if (!context) {
      return null;
    }

    return this.begin({
      ...context,
      currentSongId: songId,
      songIds: context.songIds.includes(songId)
        ? context.songIds
        : [...context.songIds, songId],
    });
  }

  commit(transaction: PlaybackContextTransaction): boolean {
    if (this.activeTransaction?.token !== transaction.token) {
      return false;
    }

    this.committedContext = cloneContext(
      this.activeTransaction.pendingContext,
    );
    this.activeTransaction = null;
    return true;
  }

  rollback(transaction: PlaybackContextTransaction): boolean {
    if (this.activeTransaction?.token !== transaction.token) {
      return false;
    }

    this.activeTransaction = null;
    return true;
  }

  markCurrentSong(songId: string): void {
    const context = this.getContext();
    if (!context?.songIds.includes(songId)) {
      return;
    }

    const nextContext = {
      ...context,
      currentSongId: songId,
    };
    if (this.activeTransaction) {
      this.activeTransaction.pendingContext = nextContext;
    } else {
      this.committedContext = nextContext;
    }
  }

  removeSong(songId: string): void {
    this.committedContext = removeSongFromActivePlaybackContext(
      this.committedContext,
      songId,
    );
    if (this.activeTransaction) {
      const pendingContext = removeSongFromActivePlaybackContext(
        this.activeTransaction.pendingContext,
        songId,
      );
      if (pendingContext) {
        this.activeTransaction.pendingContext = pendingContext;
      } else {
        this.activeTransaction = null;
      }
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
