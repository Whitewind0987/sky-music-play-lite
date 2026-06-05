// Default production update manifest URL.
// VITE_UPDATE_MANIFEST_URL can still override this for local testing.
export const UPDATE_MANIFEST_URL =
  import.meta.env.VITE_UPDATE_MANIFEST_URL ||
  "https://gitee.com/whitecrane0678/skymusicplay-lite-update/raw/master/latest.json";

export const ALLOWED_RELEASE_URL_PREFIX =
  "https://github.com/Whitewind0987/sky-music-play-lite/releases";

export const USER_MANUAL_URL =
  "https://www.kdocs.cn/l/ca0kaYgxB59Z";
