import { describe, expect, it } from "vitest";
import type { BackgroundPlaybackEventPayload } from "./tauriApi";
import {
  bufferBackgroundPlaybackEvent,
  getBackgroundPlaybackEventRoute,
  takePendingBackgroundPlaybackEvents,
} from "./backgroundPlaybackEvents";

function event(
  sessionId: number,
  type: BackgroundPlaybackEventPayload["type"],
): BackgroundPlaybackEventPayload {
  return { sessionId, type };
}

describe("getBackgroundPlaybackEventRoute", () => {
  it.each(["progress", "state", "finished", "error"] as const)(
    "buffers early %s events while a start is pending",
    (type) => {
      expect(
        getBackgroundPlaybackEventRoute({
          currentSessionId: 7,
          eventSessionId: event(12, type).sessionId,
          isStartPending: true,
        }),
      ).toBe("buffer");
    },
  );

  it("buffers even when the temporary frontend token equals the Rust session id", () => {
    expect(
      getBackgroundPlaybackEventRoute({
        currentSessionId: 12,
        eventSessionId: 12,
        isStartPending: true,
      }),
    ).toBe("buffer");
  });

  it("applies only the current session after start resolves", () => {
    expect(
      getBackgroundPlaybackEventRoute({
        currentSessionId: 12,
        eventSessionId: 12,
        isStartPending: false,
      }),
    ).toBe("apply");
  });

  it("ignores unrelated stale session events after start resolves", () => {
    expect(
      getBackgroundPlaybackEventRoute({
        currentSessionId: 12,
        eventSessionId: 11,
        isStartPending: false,
      }),
    ).toBe("ignore");
  });
});

describe("pending background playback events", () => {
  it("preserves early events in original order for the matching session", () => {
    let pendingEvents = new Map<number, BackgroundPlaybackEventPayload[]>();

    pendingEvents = bufferBackgroundPlaybackEvent(
      pendingEvents,
      event(12, "progress"),
    );
    pendingEvents = bufferBackgroundPlaybackEvent(
      pendingEvents,
      event(12, "state"),
    );
    pendingEvents = bufferBackgroundPlaybackEvent(
      pendingEvents,
      event(12, "finished"),
    );
    pendingEvents = bufferBackgroundPlaybackEvent(
      pendingEvents,
      event(12, "error"),
    );

    expect(takePendingBackgroundPlaybackEvents(pendingEvents, 12)).toEqual([
      event(12, "progress"),
      event(12, "state"),
      event(12, "finished"),
      event(12, "error"),
    ]);
  });

  it("does not return unrelated stale session events", () => {
    const pendingEvents = bufferBackgroundPlaybackEvent(
      new Map(),
      event(11, "finished"),
    );

    expect(takePendingBackgroundPlaybackEvents(pendingEvents, 12)).toEqual([]);
  });

  it("drops all pending events when a start is cancelled", () => {
    const pendingEvents = bufferBackgroundPlaybackEvent(
      new Map(),
      event(12, "error"),
    );
    const cancelledPendingEvents = new Map<number, BackgroundPlaybackEventPayload[]>();

    expect(takePendingBackgroundPlaybackEvents(cancelledPendingEvents, 12)).toEqual(
      [],
    );
    expect(pendingEvents.size).toBe(1);
  });
});
