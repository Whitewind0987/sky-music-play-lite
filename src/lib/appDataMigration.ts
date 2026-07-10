import type {
  PersistedAppData,
} from "../types/appData";
import type { ImportedScoreReconcileReport } from "./tauriApi";
import { retainUnverifiedMigrationFallbackSongs } from "./importedScoreReconciliation";
import type { SupportedAppDataVersion } from "./appData";

type FinalizeAppDataMigrationOptions = {
  appData: PersistedAppData;
  reconcileReport: ImportedScoreReconcileReport | null;
  saveAppData: (appData: PersistedAppData) => Promise<unknown>;
  sourceVersion: SupportedAppDataVersion;
};

export type FinalizeAppDataMigrationResult = {
  appData: PersistedAppData;
  persistenceError: unknown | null;
  persisted: boolean;
};

export async function finalizeAppDataMigration({
  appData,
  reconcileReport,
  saveAppData,
  sourceVersion,
}: FinalizeAppDataMigrationOptions): Promise<FinalizeAppDataMigrationResult> {
  const originalFallbackSongs = appData.library.migrationFallbackSongs ?? {};
  const remainingFallbackSongs = retainUnverifiedMigrationFallbackSongs(
    originalFallbackSongs,
    reconcileReport,
  );
  const shouldPersist =
    sourceVersion !== 3 ||
    Object.keys(remainingFallbackSongs).length !==
      Object.keys(originalFallbackSongs).length;

  if (!shouldPersist) {
    return { appData, persistenceError: null, persisted: false };
  }

  const migratedAppData: PersistedAppData = {
    ...appData,
    library: {
      ...appData.library,
      ...(Object.keys(remainingFallbackSongs).length > 0
        ? { migrationFallbackSongs: remainingFallbackSongs }
        : { migrationFallbackSongs: undefined }),
    },
  };

  try {
    await saveAppData(migratedAppData);

    return {
      appData: migratedAppData,
      persistenceError: null,
      persisted: true,
    };
  } catch (persistenceError) {
    return {
      appData,
      persistenceError,
      persisted: false,
    };
  }
}
