export const previewInstruments = ["piano", "violin", "guitar"] as const;
export type PreviewInstrument = (typeof previewInstruments)[number];

const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];

type Sample = {
  file: string;
  rate: number;
  loopEndFrame?: number;
};

type Instrument = {
  directory: string;
  notes: Sample[];
  gain: number;
  attackSeconds: number;
  implicitHoldMs: number;
  implicitReleaseSeconds: number;
  explicitReleaseSeconds: number;
};

const pianoSamples = [
  [60, "C4"], [63, "Ds4"], [66, "Fs4"], [69, "A4"], [72, "C5"],
  [75, "Ds5"], [78, "Fs5"], [81, "A5"], [84, "C6"],
] as const;

// Key ranges and roots from VSCO 2 CE 1.1.0 SViolinVib.sfz, forte layer.
// Loop endpoints refer to the crossfaded 44.1 kHz WAVs bundled here.
const violinRegions = [
  [61, 60, "C4", 106496], [65, 64, "E4", 118464], [67, 67, "G4", 109650],
  [70, 69, "A4", 103199], [73, 72, "C5", 120361], [77, 76, "E5", 126736],
  [79, 79, "G5", 105760], [82, 81, "A5", 101784], [85, 84, "C6", 105248],
] as const;

const guitarSamples = [
  "C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4",
  "D4", "E4", "F4", "G4", "A4", "B4", "C5",
];

export const previewInstrumentSamples: Record<PreviewInstrument, Instrument> = {
  piano: {
    directory: "salamander",
    notes: pitches.map(pitch => {
      const [root, name] = pianoSamples.reduce((nearest, candidate) =>
        Math.abs(candidate[0] - pitch) < Math.abs(nearest[0] - pitch) ? candidate : nearest,
      );
      return { file: `${name}.mp3`, rate: 2 ** ((pitch - root) / 12) };
    }),
    gain: 0.065,
    attackSeconds: 0.0008,
    implicitHoldMs: 120,
    implicitReleaseSeconds: 0.26,
    explicitReleaseSeconds: 0.18,
  },
  violin: {
    directory: "vsco-violin",
    notes: pitches.map(pitch => {
      const [, root, name, loopEndFrame] = violinRegions.find(([high]) => pitch <= high)!;
      return { file: `${name}.wav`, rate: 2 ** ((pitch - root) / 12), loopEndFrame };
    }),
    gain: 0.07,
    attackSeconds: 0.001,
    implicitHoldMs: 160,
    implicitReleaseSeconds: 0.12,
    explicitReleaseSeconds: 0.28,
  },
  guitar: {
    directory: "spanish-guitar",
    notes: guitarSamples.map(name => ({ file: `${name}.wav`, rate: 1 })),
    gain: 0.025,
    attackSeconds: 0.0008,
    implicitHoldMs: 95,
    implicitReleaseSeconds: 0.32,
    explicitReleaseSeconds: 0.24,
  },
};
