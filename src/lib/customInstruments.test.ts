import { describe, expect, it } from "vitest";
import { skyKeyNames } from "../types/keyMapping";
import { customSamplePitches, hasCustomAudioSignature, mapCustomSamples, resolveCustomSamples } from "./customInstruments";

describe("custom instrument mapping", () => {
  it.each([customSamplePitches, skyKeyNames])("maps all canonical filenames in arbitrary order", (...keys) => {
    const files = keys.map((name, index) => ({ name: name.toLowerCase() + (index % 2 ? ".WaV" : ".MP3") })).reverse();
    const { assignments, conflicts } = mapCustomSamples(files);
    expect(assignments).toEqual(Array.from({ length: 15 }, (_, index) => 14 - index));
    expect(conflicts).toEqual(Array(15).fill(false));
    expect(resolveCustomSamples(files, assignments)).toEqual(files.slice().reverse());
  });

  it("requires explicit correction of duplicates and ignores unrelated names", () => {
    const files = [...skyKeyNames.slice(0, -1), "C4", "unrelated"].map(key => ({ name: key + ".wav" }));
    const { assignments, conflicts } = mapCustomSamples(files);
    expect(conflicts[0]).toBe(true);
    expect(assignments[0]).toBeNull();
    expect(assignments[14]).toBeNull();
    expect(resolveCustomSamples(files, assignments)).toBeNull();
    assignments[0] = 0;
    assignments[14] = 15;
    expect(resolveCustomSamples(files, assignments)?.[14]).toEqual({ name: "unrelated.wav" });
  });

  it("checks the container signature independently of the filename", () => {
    const wav = new TextEncoder().encode("RIFF0000WAVE").buffer;
    expect(hasCustomAudioSignature("sample.WAV", wav)).toBe(true);
    expect(hasCustomAudioSignature("sample.mp3", wav)).toBe(false);
    expect(hasCustomAudioSignature("sample.wav", new ArrayBuffer(0))).toBe(false);
    expect(hasCustomAudioSignature("sample.ogg", wav)).toBe(false);
  });
});
