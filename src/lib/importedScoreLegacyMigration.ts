import type { PersistedAppData } from "../types/appData";
import type {
  LocalLibrarySong,
  MigrationFallbackSongs,
} from "../types/library";
import type { ImportedScoreReconcileReport } from "./tauriApi";
import { retainUnverifiedMigrationFallbackSongs } from "./importedScoreReconciliation";

type ReconcileLegacyFallbackSongs = (options: {
  librarySongs: LocalLibrarySong[];
  migrationFallbackSongs: MigrationFallbackSongs;
}) => Promise<ImportedScoreReconcileReport | null>;

export type LegacyImportedScoreMigrationResult = {
  appData: PersistedAppData;
  didRunLegacyFallbackMigration: boolean;
};

export function shouldRunLegacyImportedScoreMigration(
  appData: PersistedAppData,
): boolean {
  return (
    appData.importedScoreStoragePath === undefined &&
    Object.keys(appData.library.migrationFallbackSongs ?? {}).length > 0
  );
}

export async function migrateLegacyImportedScoreFallbacks({
  appData,
  currentStoragePath,
  reconcile,
}: {
  appData: PersistedAppData;
  currentStoragePath: string;
  reconcile: ReconcileLegacyFallbackSongs;
}): Promise<LegacyImportedScoreMigrationResult> {
  if (!shouldRunLegacyImportedScoreMigration(appData)) {
    return { appData, didRunLegacyFallbackMigration: false };
  }

  const originalFallbackSongs =
    appData.library.migrationFallbackSongs ?? {};
  const report = await reconcile({
    librarySongs: appData.library.librarySongs,
    migrationFallbackSongs: originalFallbackSongs,
  });

  if (report === null) {
    return { appData, didRunLegacyFallbackMigration: false };
  }

  const remainingFallbackSongs = retainUnverifiedMigrationFallbackSongs(
    originalFallbackSongs,
    report,
  );

  return {
    appData: {
      ...appData,
      importedScoreStoragePath: currentStoragePath,
      library: {
        ...appData.library,
        ...(Object.keys(remainingFallbackSongs).length > 0
          ? { migrationFallbackSongs: remainingFallbackSongs }
          : { migrationFallbackSongs: undefined }),
      },
    },
    didRunLegacyFallbackMigration: true,
  };
}

export function shouldRunTrustedStorageReconciliation(
  didRunLegacyFallbackMigration: boolean,
): boolean {
  return !didRunLegacyFallbackMigration;
}
