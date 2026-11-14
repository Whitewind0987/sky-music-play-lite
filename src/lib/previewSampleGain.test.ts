import { expect, it } from "vitest";
import { measurePreviewSampleGain } from "./previewSampleGain";

function buffer(samples: Float32Array<ArrayBuffer>) {
  return {
    length: samples.length,
    sampleRate: 1000,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

it("matches different recording levels at 50% master volume", () => {
  for (const level of [0.01, 0.1, 0.5]) {
    const gain = measurePreviewSampleGain(buffer(new Float32Array(100).fill(level)));
    expect(level * gain * 0.8).toBeCloseTo(0.004, 6);
  }
});

it("reserves peak headroom for late transients and limits quiet-sample boost", () => {
  const samples = new Float32Array(1200).fill(0.01);
  samples[1100] = 1;
  expect(measurePreviewSampleGain(buffer(samples))).toBeCloseTo(0.018, 6);
  expect(measurePreviewSampleGain(buffer(new Float32Array(100).fill(0.00001)))).toBe(4);
  expect(measurePreviewSampleGain(buffer(new Float32Array(100)))).toBe(1);
});
