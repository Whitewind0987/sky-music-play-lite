import type { LibrarySong } from "../types/library";
import { formatText } from "./formatText";
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
  librarySongs: LibrarySong[];
  reconcileImportedScoreFiles: ReconcileImportedScoreFiles;
  showNotice?: (message: string) => void;
  text: ImportedScoreReconciliationText;
};

const completedReconciliationSignatures = new Set<string>();
const activeReconciliationSignatures = new Set<string>();

export function createImportedScoreReconcileEntries(
  librarySongs: LibrarySong[],
): ImportedScoreReconcileEntry[] {
  return librarySongs
    .filter((librarySong) => librarySong.source === "local-import")
    .map((librarySong) => ({
      song: librarySong.song,
      songId: librarySong.id,
    }));
}

export async function reconcilePersistedImportedScores({
  appendLog,
  librarySongs,
  reconcileImportedScoreFiles,
  showNotice,
  text,
}: ReconcilePersistedImportedScoresOptions): Promise<ImportedScoreReconcileReport | null> {
  const entries = createImportedScoreReconcileEntries(librarySongs);

  if (entries.length === 0) {
    return null;
  }

  const signature = buildReconciliationSignature(entries);

  if (
    completedReconciliationSignatures.has(signature) ||
    activeReconciliationSignatures.has(signature)
  ) {
    return null;
  }

  activeReconciliationSignatures.add(signature);

  try {
    const report = await reconcileImportedScoreFiles(entries);
    completedReconciliationSignatures.add(signature);
    logReconciliationReport({
      appendLog,
      report,
      showNotice,
      text,
    });

    return report;
  } catch (error) {
    const message = formatText(text.importedScoreReconcileCommandFailed, {
      error: String(error),
    });

    appendLog(message);
    showNotice?.(message);
    return null;
  } finally {
    activeReconciliationSignatures.delete(signature);
  }
}

export function resetImportedScoreReconciliationForTests() {
  completedReconciliationSignatures.clear();
  activeReconciliationSignatures.clear();
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
    entries.map(({ song, songId }) => [
        songId,
        song.name,
        song.bpm,
        song.bitsPerPage,
        song.pitchLevel,
        song.isComposed,
        song.songNotes.length,
      ]),
  );
}
