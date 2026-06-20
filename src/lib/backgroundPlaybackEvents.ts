import type { BackgroundPlaybackEventPayload } from "./tauriApi";

export type BackgroundPlaybackEventRoute = "apply" | "buffer" | "ignore";

export function getBackgroundPlaybackEventRoute({
  currentSessionId,
  eventSessionId,
  isStartPending,
}: {
  currentSessionId: number;
  eventSessionId: number;
  isStartPending: boolean;
}): BackgroundPlaybackEventRoute {
  if (isStartPending) {
    return "buffer";
  }

  return eventSessionId === currentSessionId ? "apply" : "ignore";
}

export function bufferBackgroundPlaybackEvent(
  pendingEvents: Map<number, BackgroundPlaybackEventPayload[]>,
  event: BackgroundPlaybackEventPayload,
) {
  const nextPendingEvents = new Map(pendingEvents);
  const sessionEvents = nextPendingEvents.get(event.sessionId) ?? [];

  nextPendingEvents.set(event.sessionId, [...sessionEvents, event]);

  return nextPendingEvents;
}

export function takePendingBackgroundPlaybackEvents(
  pendingEvents: Map<number, BackgroundPlaybackEventPayload[]>,
  sessionId: number,
) {
  return pendingEvents.get(sessionId) ?? [];
}
