import type {
  LocalLibrarySong,
  MigrationFallbackSongs,
} from "../types/library";
import { formatText } from "./formatText";
import { getSongFingerprint } from "./libraryCollections";
import type {
  ImportedScoreReconcileEntry,
  ImportedScoreReconcileReport,
} from "./tauriApi";

export type ImportedScoreReconciliationText = {
  importedScoreReconcileCommandFailed: string;
  importedScoreReconcileFailed: string;
  importedScoreReconcileFailedSummary: string;
  importedScoreReconcileSucceeded: string;
};

type ReconcileImportedScoreFiles = (
  entries: ImportedScoreReconcileEntry[],
) => Promise<ImportedScoreReconcileReport>;

type ReconcilePersistedImportedScoresOptions = {
  appendLog: (entry: string) => void;
  librarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
  reconcileImportedScoreFiles: ReconcileImportedScoreFiles;
  showNotice?: (message: string) => void;
  text: ImportedScoreReconciliationText;
};

type ReconcilePersistedImportedScoresWithProgressOptions =
  ReconcilePersistedImportedScoresOptions & {
    setInProgress: (isInProgress: boolean) => void;
  };

const completedReconciliationSignatures = new Set<string>();
const activeReconciliationRuns = new Map<
  string,
  Promise<ImportedScoreReconcileReport | null>
>();

export function createImportedScoreReconcileEntries(
  librarySongs: LocalLibrarySong[],
  migrationFallbackSongs: MigrationFallbackSongs,
): ImportedScoreReconcileEntry[] {
  const localSongIds = new Set(librarySongs.map((librarySong) => librarySong.id));

  return Object.entries(migrationFallbackSongs).reduce<
    ImportedScoreReconcileEntry[]
  >((entries, [songId, song]) => {
    if (localSongIds.has(songId)) {
      entries.push({ song, songId });
    }

    return entries;
  }, []);
}

export function retainUnverifiedMigrationFallbackSongs(
  migrationFallbackSongs: MigrationFallbackSongs,
  report: ImportedScoreReconcileReport | null,
): MigrationFallbackSongs {
  if (report === null) {
    return { ...migrationFallbackSongs };
  }

  const verifiedSongIds = new Set(report.verifiedSongIds);

  return Object.fromEntries(
    Object.entries(migrationFallbackSongs).filter(
      ([songId]) => !verifiedSongIds.has(songId),
    ),
  );
}

export async function reconcilePersistedImportedScores({
  appendLog,
  librarySongs,
  migrationFallbackSongs,
  reconcileImportedScoreFiles,
  showNotice,
  text,
}: ReconcilePersistedImportedScoresOptions): Promise<ImportedScoreReconcileReport | null> {
  const entries = createImportedScoreReconcileEntries(
    librarySongs,
    migrationFallbackSongs,
  );

  if (entries.length === 0) {
    return null;
  }

  const signature = buildReconciliationSignature(entries);
  const activeRun = activeReconciliationRuns.get(signature);

  if (completedReconciliationSignatures.has(signature)) {
    return null;
  }

  if (activeRun) {
    return activeRun;
  }

  const run = runImportedScoreReconciliation({
    appendLog,
    entries,
    reconcileImportedScoreFiles,
    showNotice,
    signature,
    text,
  });

  activeReconciliationRuns.set(signature, run);

  return run;
}

export async function reconcilePersistedImportedScoresWithProgress({
  setInProgress,
  ...options
}: ReconcilePersistedImportedScoresWithProgressOptions): Promise<ImportedScoreReconcileReport | null> {
  if (
    createImportedScoreReconcileEntries(
      options.librarySongs,
      options.migrationFallbackSongs,
    ).length === 0
  ) {
    return null;
  }

  setInProgress(true);

  try {
    return await reconcilePersistedImportedScores(options);
  } finally {
    setInProgress(false);
  }
}

export function resetImportedScoreReconciliationForTests() {
  completedReconciliationSignatures.clear();
  activeReconciliationRuns.clear();
}

async function runImportedScoreReconciliation({
  appendLog,
  entries,
  reconcileImportedScoreFiles,
  showNotice,
  signature,
  text,
}: {
  appendLog: (entry: string) => void;
  entries: ImportedScoreReconcileEntry[];
  reconcileImportedScoreFiles: ReconcileImportedScoreFiles;
  showNotice?: (message: string) => void;
  signature: string;
  text: ImportedScoreReconciliationText;
}) {
  try {
    const report = await reconcileImportedScoreFiles(entries);

    completedReconciliationSignatures.add(signature);
    logReconciliationReport({ appendLog, report, showNotice, text });

    return report;
  } catch (error) {
    const message = formatText(text.importedScoreReconcileCommandFailed, {
      error: String(error),
    });

    appendLog(message);
    showNotice?.(message);
    return null;
  } finally {
    activeReconciliationRuns.delete(signature);
  }
}

function logReconciliationReport({
  appendLog,
  report,
  showNotice,
  text,
}: {
  appendLog: (entry: string) => void;
  report: ImportedScoreReconcileReport;
  showNotice?: (message: string) => void;
  text: ImportedScoreReconciliationText;
}) {
  if (report.createdCount > 0 || report.renamedCount > 0) {
    appendLog(
      formatText(text.importedScoreReconcileSucceeded, {
        createdCount: report.createdCount,
        renamedCount: report.renamedCount,
      }),
    );
  }

  report.failed.forEach((failure) => {
    appendLog(
      formatText(text.importedScoreReconcileFailed, {
        error: failure.error,
        songId: failure.songId,
        songName: failure.songName,
      }),
    );
  });

  if (report.failed.length > 0) {
    showNotice?.(
      formatText(text.importedScoreReconcileFailedSummary, {
        count: report.failed.length,
      }),
    );
  }
}

function buildReconciliationSignature(entries: ImportedScoreReconcileEntry[]) {
  return JSON.stringify(
    entries.map(({ song, songId }) => [songId, getSongFingerprint(song)]),
  );
}
