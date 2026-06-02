import type { UiText } from "../i18n/uiText";
import { PanelHeader } from "./PanelHeader";

type PlaybackLogProps = {
  entries: string[];
  text: UiText["logs"];
};

export function PlaybackLog({ entries, text }: PlaybackLogProps) {
  const logGroups = groupLogEntries(entries);

  return (
    <section className="panel log-panel" aria-labelledby="playback-log-title">
      <PanelHeader
        id="playback-log-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      {entries.length === 0 ? (
        <p className="log-empty">{text.emptyState}</p>
      ) : (
        <div className="log-group-list" aria-live="polite">
          {logGroups.map((group) => (
            <details className="log-group" key={group.id} open>
              <summary>
                <span>{text.groups[group.id]}</span>
                <span>{group.entries.length}</span>
              </summary>
              <ul className="log-list">
                {group.entries.map((entry) => (
                  <li key={`${entry.entry}-${entry.index}`}>{entry.entry}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function groupLogEntries(entries: string[]) {
  const groups = [
    { entries: [] as Array<{ entry: string; index: number }>, id: "system" },
    { entries: [] as Array<{ entry: string; index: number }>, id: "imports" },
    { entries: [] as Array<{ entry: string; index: number }>, id: "playback" },
    {
      entries: [] as Array<{ entry: string; index: number }>,
      id: "experimentalInput",
    },
  ] as const;

  entries.forEach((entry, index) => {
    const groupId = getLogGroupId(entry);
    const group = groups.find((candidate) => candidate.id === groupId);

    group?.entries.push({ entry, index });
  });

  return groups.filter((group) => group.entries.length > 0);
}

function getLogGroupId(entry: string) {
  const normalizedEntry = entry.toLowerCase();

  if (
    normalizedEntry.includes("experimental") ||
    normalizedEntry.includes("foreground") ||
    normalizedEntry.includes("target") ||
    normalizedEntry.includes("window") ||
    normalizedEntry.includes("hwnd") ||
    entry.includes("实验") ||
    entry.includes("前台") ||
    entry.includes("目标") ||
    entry.includes("窗口")
  ) {
    return "experimentalInput";
  }

  if (normalizedEntry.includes("import") || entry.includes("导入")) {
    return "imports";
  }

  if (
    normalizedEntry.includes("play") ||
    normalizedEntry.includes("preview") ||
    normalizedEntry.includes("queue") ||
    normalizedEntry.includes("repeat") ||
    entry.includes("播放") ||
    entry.includes("预览") ||
    entry.includes("队列") ||
    entry.includes("循环")
  ) {
    return "playback";
  }

  return "system";
}
