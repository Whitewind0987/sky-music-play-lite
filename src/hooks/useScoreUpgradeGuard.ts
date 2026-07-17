import { useRef } from "react";
import type { UiText } from "../i18n/uiText";

type UseScoreUpgradeGuardOptions = {
  appendLog: (message: string) => void;
  isAnyPlaybackActive: boolean;
  isImportedScoreReconciliationInProgress: boolean;
  showNotice: (message: string) => void;
  text: UiText["logs"];
};

export function useScoreUpgradeGuard({
  appendLog,
  isAnyPlaybackActive,
  isImportedScoreReconciliationInProgress,
  showNotice,
  text,
}: UseScoreUpgradeGuardOptions) {
  const blockedMessage = isAnyPlaybackActive
    ? text.scoreUpgradePlaybackBlocked
    : isImportedScoreReconciliationInProgress
      ? text.scoreUpgradeMutationBlocked
      : null;
  const blockedMessageRef = useRef<string | null>(blockedMessage);

  blockedMessageRef.current = blockedMessage;

  return {
    getBlockedMessage: () => blockedMessageRef.current,
    isBlocked: blockedMessage !== null,
    reportBlocked() {
      const currentBlockedMessage = blockedMessageRef.current;

      if (currentBlockedMessage === null) {
        return;
      }

      appendLog(currentBlockedMessage);
      showNotice(currentBlockedMessage);
    },
  };
}
