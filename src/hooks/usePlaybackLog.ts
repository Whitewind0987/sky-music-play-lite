import { useState } from "react";

export function usePlaybackLog(initialEntries: string[]) {
  const [logEntries, setLogEntries] = useState<string[]>(() => initialEntries);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
  }

  return {
    appendLog,
    logEntries,
    setLogEntries,
  };
}
