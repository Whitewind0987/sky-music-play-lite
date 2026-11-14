// At 50% the master gain is 0.8, giving a reference RMS of 0.004 per note.
const referenceRms = 0.005;
const peakBudget = 0.018;
const maxBoost = 4;

type SampleData = Pick<AudioBuffer, "sampleRate" | "length" | "numberOfChannels" | "getChannelData">;

export function measurePreviewSampleGain(buffer: SampleData): number {
  const windowFrames = Math.max(1, Math.round(buffer.sampleRate * 0.05));
  const analysisFrames = Math.min(buffer.length, buffer.sampleRate);
  const energy = new Float64Array(Math.ceil(analysisFrames / windowFrames));
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let frame = 0; frame < samples.length; frame++) {
      const sample = samples[frame];
      peak = Math.max(peak, Math.abs(sample));
      if (frame < analysisFrames) energy[Math.floor(frame / windowFrames)] += sample * sample;
    }
  }

  let rms = 0;
  for (let index = 0; index < energy.length; index++) {
    const frames = Math.min(windowFrames, analysisFrames - index * windowFrames);
    rms = Math.max(rms, Math.sqrt(energy[index] / (frames * buffer.numberOfChannels)));
  }
  // Limit both high-crest-factor transients and amplification of quiet recordings.
  return peak > 0 ? Math.min(referenceRms / rms, peakBudget / peak, maxBoost) : 1;
}
