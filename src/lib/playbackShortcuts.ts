import type { PlaybackShortcutBinding } from "../types/playbackShortcuts";

export function formatShortcutCode(code: string) {
  if (code === "") {
    return "";
  }

  if (code === "Space") {
    return "Space";
  }

  if (code === "ArrowRight") {
    return "\u2192";
  }

  if (code === "ArrowLeft") {
    return "\u2190";
  }

  if (code === "ArrowUp") {
    return "\u2191";
  }

  if (code === "ArrowDown") {
    return "\u2193";
  }

  if (code === "Escape") {
    return "Esc";
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  return code;
}

export function toGlobalShortcutAccelerators(code: string) {
  const trimmedCode = code.trim();

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(trimmedCode)) {
    return [trimmedCode];
  }

  return [];
}

export function isUnsafeGlobalPlaybackShortcut(code: string) {
  return toGlobalShortcutAccelerators(code).length === 0;
}

export function normalizeGlobalPlaybackShortcutScope(
  binding: PlaybackShortcutBinding,
): PlaybackShortcutBinding {
  return binding.scope === "global" &&
    isUnsafeGlobalPlaybackShortcut(binding.code)
    ? { ...binding, scope: "in-app" }
    : binding;
}

export function shouldUnregisterGlobalPlaybackShortcut(
  binding: PlaybackShortcutBinding,
  registeredAccelerator: string,
) {
  return (
    binding.scope !== "global" ||
    !toGlobalShortcutAccelerators(binding.code).includes(registeredAccelerator)
  );
}
