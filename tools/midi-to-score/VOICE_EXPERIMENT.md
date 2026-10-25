# Experimental voice-aware MIDI to Sky TXT (V2)

This opt-in CLI is experimental and **does not replace** the existing MIDI-to-TXT converter or application playback. The algorithm is a deterministic heuristic, **not proven voice separation**.

It groups note onsets, traces a predominant melody through interval/timing/register scoring, preserves independent opening/ending phrases, places the melody at one global octave instead of folding every bass note up, and outputs V2 note durations. Optional `--accompaniment` adds sparse chord-neighbor notes (not a complete left-hand arrangement).

## Run (PowerShell)

After downloading `voice_arrangement.py` and `voice_to_sky_txt.py` beside existing `sky_arrangement.py`, `key_detection.py`, and installing `mido`:

```powershell
& "D:\AI\MuScriptor\.venv\Scripts\python.exe" `
  "D:\AI\MuScriptor\score-converter\voice_to_sky_txt.py" `
  "F:\Users\YMXD\Downloads\piano.mid" `
  --output "F:\Users\YMXD\Downloads\piano-voice-v2.txt"
```

The command defaults to automatic key detection. Use `--transpose -3` to force E-flat-major transposition, `--accompaniment` to add sparse accompaniment, and `--force` only to overwrite previous output.

## Evidence and limitations

Five focused structural tests passed against the local algorithm, and the supplied 684-note piano MIDI produced **297 V2 melody notes**, detected E-flat major (-3 semitones), and selected a global +12-semitone melody octave. This is not an auditory or ground-truth melody accuracy validation. Complex polyphonic piano, inaccurate MIDI, voice crossings, modulation, and loss of bass harmony can still sound poor.

Tests:

```powershell
python -m unittest discover -s tools/midi-to-score/tests -p "test_voice_arrangement.py" -v
```

The prior A/B/C unsuccessful score examples remain separate historical diagnostics and should not be merged as production assets.
