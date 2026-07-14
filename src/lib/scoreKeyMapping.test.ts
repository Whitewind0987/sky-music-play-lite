import { describe, expect, it } from "vitest";
import { defaultKeyMapping } from "../types/keyMapping";
import { prepareMappedKeyboardKeyGroups } from "./scoreKeyMapping";

describe("prepareMappedKeyboardKeyGroups", () => {
  it("carries note durations as holdMs", () => {
    const groups = prepareMappedKeyboardKeyGroups(
      [
        { time: 0, key: "1Key0", duration: 1500 },
        { time: 0, key: "1Key1" },
      ],
      defaultKeyMapping,
    );

    expect(groups.get(0)).toEqual([
      { key: "y", holdMs: 1500 },
      { key: "u" },
    ]);
  });

  it("dedupes the same key at the same time keeping the longest hold", () => {
    const groups = prepareMappedKeyboardKeyGroups(
      [
        { time: 0, key: "1Key0", duration: 500 },
        { time: 0, key: "1Key0", duration: 1500 },
        { time: 0, key: "1Key0" },
      ],
      defaultKeyMapping,
    );

    expect(groups.get(0)).toEqual([{ key: "y", holdMs: 1500 }]);
  });

  it("keeps tap entries deduped without holdMs", () => {
    const groups = prepareMappedKeyboardKeyGroups(
      [
        { time: 0, key: "1Key0" },
        { time: 0, key: "1Key0" },
      ],
      defaultKeyMapping,
    );

    expect(groups.get(0)).toEqual([{ key: "y" }]);
  });

  it("groups notes at different times separately", () => {
    const groups = prepareMappedKeyboardKeyGroups(
      [
        { time: 0, key: "1Key0" },
        { time: 500, key: "1Key0", duration: 800 },
      ],
      defaultKeyMapping,
    );

    expect(groups.get(0)).toEqual([{ key: "y" }]);
    expect(groups.get(500)).toEqual([{ key: "y", holdMs: 800 }]);
  });
});
