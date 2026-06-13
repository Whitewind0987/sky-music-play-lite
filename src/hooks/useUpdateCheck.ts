import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import {
  ALLOWED_RELEASE_URL_PREFIX,
  UPDATE_MANIFEST_URL,
} from "../config/update";
import { checkForUpdate, type UpdateInfo } from "../lib/updateCheck";
import { ignoreUpdate, isUpdateIgnored } from "../lib/updateIgnore";

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadUpdateInfo() {
      try {
        const currentVersion = await getVersion();
        const nextUpdateInfo = await checkForUpdate({
          allowedReleaseUrlPrefix: ALLOWED_RELEASE_URL_PREFIX,
          currentVersion,
          manifestUrl: UPDATE_MANIFEST_URL,
        });

        if (
          !isCancelled &&
          nextUpdateInfo !== null &&
          !isUpdateIgnored(nextUpdateInfo)
        ) {
          setUpdateInfo(nextUpdateInfo);
        }
      } catch (error) {
        console.warn("[update-check] startup check failed", error);
      }
    }

    void loadUpdateInfo();

    return () => {
      isCancelled = true;
    };
  }, []);

  function openUpdateDialog() {
    if (updateInfo !== null) {
      setIsUpdateDialogOpen(true);
    }
  }

  function closeUpdateDialog() {
    setIsUpdateDialogOpen(false);
  }

  async function openUpdateReleasePage() {
    if (updateInfo === null) {
      return;
    }

    try {
      await openUrl(updateInfo.releaseUrl);
    } catch (error) {
      console.warn("Failed to open release page.", error);
    }
  }

  function ignoreCurrentUpdate() {
    if (updateInfo === null || updateInfo.updateKind !== "alpha") {
      return;
    }

    ignoreUpdate(updateInfo);
    setIsUpdateDialogOpen(false);
    setUpdateInfo(null);
  }

  return {
    closeUpdateDialog,
    ignoreCurrentUpdate,
    isUpdateDialogOpen,
    openUpdateDialog,
    openUpdateReleasePage,
    updateInfo,
  };
}
