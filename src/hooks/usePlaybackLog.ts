import { useState } from "react";

export function usePlaybackLog(
  initialEntries: string[],
  options: { onAppend?: (entry: string) => void } = {},
) {
  const [logEntries, setLogEntries] = useState<string[]>(() => initialEntries);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
    options.onAppend?.(entry);
  }

  return {
    appendLog,
    logEntries,
    setLogEntries,
  };
}
