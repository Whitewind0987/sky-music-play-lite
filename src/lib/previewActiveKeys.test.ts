import { describe, expect, it } from "vitest";
import {
  applyNoteGroupToPreviewActiveKeys,
  getNextPreviewExpiryMs,
  prunePreviewActiveKeys,
} from "./previewActiveKeys";

describe("previewActiveKeys", () => {
  it("replaces tap entries with the next group", () => {
    const first = applyNoteGroupToPreviewActiveKeys(
      [],
      [{ time: 0, key: "1Key0" }],
      0,
      1,
    );
    const second = applyNoteGroupToPreviewActiveKeys(
      first,
      [{ time: 500, key: "1Key1" }],
      500,
      1,
    );

    expect(second).toEqual([{ key: "1Key1", expiresAtMs: null }]);
  });

  it("keeps held keys across groups until they expire", () => {
    const first = applyNoteGroupToPreviewActiveKeys(
      [],
      [{ time: 0, key: "1Key0", duration: 2000 }],
      0,
      1,
    );
    const second = applyNoteGroupToPreviewActiveKeys(
      first,
      [{ time: 500, key: "1Key1" }],
      500,
      1,
    );

    expect(second).toEqual([
      { key: "1Key0", expiresAtMs: 2000 },
      { key: "1Key1", expiresAtMs: null },
    ]);
  });

  it("drops held keys that already expired when a group arrives", () => {
    const first = applyNoteGroupToPreviewActiveKeys(
      [],
      [{ time: 0, key: "1Key0", duration: 300 }],
      0,
      1,
    );
    const second = applyNoteGroupToPreviewActiveKeys(
      first,
      [{ time: 500, key: "1Key1" }],
      500,
      1,
    );

    expect(second).toEqual([{ key: "1Key1", expiresAtMs: null }]);
  });

  it("scales hold expiry by playback speed", () => {
    const entries = applyNoteGroupToPreviewActiveKeys(
      [],
      [{ time: 0, key: "1Key0", duration: 2000 }],
      1000,
      2,
    );

    expect(entries).toEqual([{ key: "1Key0", expiresAtMs: 2000 }]);
  });

  it("lets a new press take over the same held key", () => {
    const first = applyNoteGroupToPreviewActiveKeys(
      [],
      [{ time: 0, key: "1Key0", duration: 5000 }],
      0,
      1,
    );
    const second = applyNoteGroupToPreviewActiveKeys(
      first,
      [{ time: 500, key: "1Key0" }],
      500,
      1,
    );

    expect(second).toEqual([{ key: "1Key0", expiresAtMs: null }]);
  });

  it("keeps the longest hold when the same key repeats in one group", () => {
    const entries = applyNoteGroupToPreviewActiveKeys(
      [],
      [
        { time: 0, key: "1Key0", duration: 500 },
        { time: 0, key: "1Key0", duration: 1500 },
      ],
      0,
      1,
    );

    expect(entries).toEqual([{ key: "1Key0", expiresAtMs: 1500 }]);
  });

  it("prunes expired held keys and reports the next expiry", () => {
    const entries = [
      { key: "1Key0", expiresAtMs: 1000 },
      { key: "1Key1", expiresAtMs: 3000 },
      { key: "1Key2", expiresAtMs: null },
    ];

    expect(prunePreviewActiveKeys(entries, 2000)).toEqual([
      { key: "1Key1", expiresAtMs: 3000 },
      { key: "1Key2", expiresAtMs: null },
    ]);
    expect(getNextPreviewExpiryMs(entries)).toBe(1000);
    expect(
      getNextPreviewExpiryMs([{ key: "a", expiresAtMs: null }]),
    ).toBeNull();
    expect(getNextPreviewExpiryMs([])).toBeNull();
  });
});
