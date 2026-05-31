import type { UiText } from "../i18n/uiText";
import { ScoreFileImportError } from "./scoreFileImport";
import { formatText } from "./formatText";

export type ImportFailure = {
  error: string;
  fileName: string;
};

export function formatImportError(error: unknown, text: UiText) {
  if (error instanceof ScoreFileImportError) {
    return formatText(text.score.importErrors[error.code], error.details);
  }

  return String(error instanceof Error ? error.message : error);
}

export function formatImportFailureSummary(failedImports: ImportFailure[]) {
  return failedImports
    .map(({ error, fileName }) => `${fileName}: ${error}`)
    .join("; ");
}
