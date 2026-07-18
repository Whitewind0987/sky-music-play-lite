import { describe, expect, it } from "vitest";
import { uiText } from "../i18n/uiText";
import { V1_TO_V2_SUSTAIN_STYLE_PRESETS } from "./v1ToV2UpgradePreferences";
import { getV1ToV2GeneratedName } from "./v1ToV2GeneratedName";

const customValues = {
  minimumSustainGapMs: 333,
  releaseLeadMs: 22,
  restGapThresholdMs: 1444,
  maxDurationMs: 1333,
  finalGroupDurationMs: 444,
};

describe("getV1ToV2GeneratedName", () => {
  it.each([
    ["zh-CN", "conservative", "原曲（V2 保守版）"],
    ["zh-CN", "balanced", "原曲（V2 均衡版）"],
    ["zh-CN", "connected", "原曲（V2 连贯版）"],
    ["en-US", "conservative", "原曲 (V2 Conservative)"],
    ["en-US", "balanced", "原曲 (V2 Balanced)"],
    ["en-US", "connected", "原曲 (V2 Connected)"],
  ] as const)("uses the exact %s %s name", (language, style, expected) => {
    expect(
      getV1ToV2GeneratedName({
        songName: "原曲",
        style,
        templates: uiText[language].library.upgradeToV2.generatedNames,
        values: V1_TO_V2_SUSTAIN_STYLE_PRESETS[style],
      }),
    ).toBe(expected);
  });

  it.each([
    ["zh-CN", "原曲（V2 自定义 333-22-1444-1333-444）"],
    ["en-US", "原曲 (V2 Custom 333-22-1444-1333-444)"],
  ] as const)("includes all five values in the %s Custom name", (language, expected) => {
    expect(
      getV1ToV2GeneratedName({
        songName: "原曲",
        style: "custom",
        templates: uiText[language].library.upgradeToV2.generatedNames,
        values: customValues,
      }),
    ).toBe(expected);
  });
});
