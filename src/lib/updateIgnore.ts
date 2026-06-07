import type { UpdateInfo } from "./updateCheck";

const IGNORED_UPDATE_STORAGE_KEY = "skyMusicPlayLite.ignoredUpdate";

export function getUpdateIgnoreKey(updateInfo: UpdateInfo) {
  // Ignoring an update only hides this exact latestVersion + releaseUrl pair.
  // A newer alpha version or a different release URL will show NEW again.
  return `${updateInfo.latestVersion}|${updateInfo.releaseUrl}`;
}

export function isUpdateIgnored(updateInfo: UpdateInfo) {
  try {
    return (
      window.localStorage.getItem(IGNORED_UPDATE_STORAGE_KEY) ===
      getUpdateIgnoreKey(updateInfo)
    );
  } catch (error) {
    console.warn("[update-ignore] read failed", error);
    return false;
  }
}

export function ignoreUpdate(updateInfo: UpdateInfo) {
  try {
    window.localStorage.setItem(
      IGNORED_UPDATE_STORAGE_KEY,
      getUpdateIgnoreKey(updateInfo),
    );
  } catch (error) {
    console.warn("[update-ignore] write failed", error);
  }
}
