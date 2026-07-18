import type {
  V1ToV2CustomValues,
  V1ToV2SustainStyle,
} from "../types/v1ToV2Upgrade";
import { formatText } from "./formatText";

export type V1ToV2GeneratedNameTemplates = Record<
  V1ToV2SustainStyle,
  string
>;

export function getV1ToV2GeneratedName({
  songName,
  style,
  templates,
  values,
}: {
  songName: string;
  style: V1ToV2SustainStyle;
  templates: V1ToV2GeneratedNameTemplates;
  values: V1ToV2CustomValues;
}) {
  return formatText(templates[style], {
    finalGroupDurationMs: values.finalGroupDurationMs,
    maxDurationMs: values.maxDurationMs,
    minimumSustainGapMs: values.minimumSustainGapMs,
    releaseLeadMs: values.releaseLeadMs,
    restGapThresholdMs: values.restGapThresholdMs,
    songName,
  });
}
