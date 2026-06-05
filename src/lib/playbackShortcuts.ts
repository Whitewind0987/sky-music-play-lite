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

  if (trimmedCode === "") {
    return [];
  }

  if (
    trimmedCode === "Space" ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(trimmedCode)
  ) {
    return [trimmedCode];
  }

  if (trimmedCode === "ArrowRight") {
    return ["ArrowRight", "Right"];
  }

  if (trimmedCode === "ArrowLeft") {
    return ["ArrowLeft", "Left"];
  }

  if (trimmedCode === "ArrowUp") {
    return ["ArrowUp", "Up"];
  }

  if (trimmedCode === "ArrowDown") {
    return ["ArrowDown", "Down"];
  }

  if (/^Key[A-Z]$/.test(trimmedCode)) {
    return [trimmedCode.slice(3)];
  }

  if (/^Digit[0-9]$/.test(trimmedCode)) {
    return [trimmedCode.slice(5)];
  }

  return [];
}

export function isUnsafeGlobalStopShortcut(code: string) {
  return code === "Space" || code.startsWith("Arrow");
}
