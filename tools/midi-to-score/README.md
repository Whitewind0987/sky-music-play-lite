# MIDI to SkyMusicPlay Lite TXT (experimental)

Standalone local command-line converter for **type 0/1 MIDI** files. It reuses
sky_arrangement.py copied unchanged from the historical
feature/audio-to-score-mvp branch (source blob
e381ace746f23af375e90d597f24d87525358faf).

The converter accepts MIDI exported by MuScriptor or other tools. It does not
run audio transcription, affect the application's UI, or modify existing data.
It produces the app's V1 JSON-array format in a UTF-8 .txt file.

## Installation (Windows PowerShell)

From the repository root, install Python 3.10+ and the `mido` package:

```powershell
python -m pip install -r .\tools\midi-to-score\requirements.txt
```

## Convert

Run from the repository root with a MIDI file in the current directory:

```powershell
python .\tools\midi-to-score\midi_to_sky_txt.py .\example.mid --output .\example.txt --mode polyphonic --mapping octave-fold
```

Automatic key analysis is enabled by default. The converter reads an explicit
MIDI key-signature event if available; otherwise it estimates tonic and mode
from the duration-weighted distribution of note pitch classes. Major keys are
transposed toward C major, minor keys toward A minor (for example, E-flat
major selects -3 semitones). Low-confidence estimates fall back to the old
octave-only adjustment. Printed profile margin is not a probability. Modulating
or noisy MIDI may still be misclassified.

Transposition controls:

- `--transpose auto`: detect musical key (default).
- `--transpose -3`: manually force -3 semitones, overriding analysis.
- `--transpose 0`: do not transpose.
- `--transpose octave`: use historical octave-only selection.
- `--mode melody-dp`: experimental single-melody extraction; dense pieces
  may take longer.
- `--mapping clamp`: use original range-clamping baseline.
- `--max-chord-notes`: limit chord size (default 3).

Existing output files are protected; use --force to overwrite deliberately.
Writes use a temporary file and atomic replacement.

## Limitations

- V1 output does not preserve MIDI note-hold durations.
- General MIDI drum channel 10 is skipped.
- MIDI type 2 is rejected; unmatched note-on events are ignored.
- Note velocity is used as the arrangement algorithm's note weight.
- Sustain pedal controllers are not interpreted.
- Sky's 15-key, natural-note range approximates chromatic/out-of-range notes.
- This is an independent research tool, not part of the released app.

## Tests (PowerShell)

From the repository root:

```powershell
python -m unittest discover -s .\tools\midi-to-score\tests -p "test_*.py" -v
```
