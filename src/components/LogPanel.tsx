import type { UiText } from "../i18n/uiText";
import { PanelHeader } from "./PanelHeader";

type PlaybackLogProps = {
  entries: string[];
  text: UiText["logs"];
};

export function PlaybackLog({ entries, text }: PlaybackLogProps) {
  return (
    <section className="panel log-panel" aria-labelledby="playback-log-title">
      <PanelHeader
        id="playback-log-title"
        title={text.panelTitle}
        description={text.panelDescription}
      />
      <ul className="log-list">
        {entries.map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}
