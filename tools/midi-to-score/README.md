# MIDI to SkyMusicPlay Lite TXT (experimental)

Standalone local command-line converter for **type 0/1 MIDI** files. It reuses
sky_arrangement.py copied unchanged from the historical
feature/audio-to-score-mvp branch (source blob
e381ace746f23af375e90d597f24d87525358faf).

The converter accepts MIDI exported by MuScriptor or other tools. It does not
run audio transcription, affect the application's UI, or modify existing data.
It produces the app's V1 JSON-array format in a UTF-8 .txt file.

## Installation (Windows PowerShell)

Use Python 3.10+ with the one CLI dependency, mido. For an existing MuScriptor
environment under D:\AI\MuScriptor:

    $repo = "F:\code\Project\sky-music-play-lite"
    uv pip install --python "D:\AI\MuScriptor\.venv\Scripts\python.exe" -r "$repo\tools\midi-to-score\requirements.txt"

Change $repo to your actual checkout location.

## Convert

    $repo = "F:\code\Project\sky-music-play-lite"
    & "D:\AI\MuScriptor\.venv\Scripts\python.exe" "$repo\tools\midi-to-score\midi_to_sky_txt.py" "D:\Music\piano.mid" --output "D:\Music\piano.txt" --mode polyphonic --mapping octave-fold

Try --mode melody-dp for experimental single-melody extraction; long or dense
pieces may make it slow. Use --mapping clamp for the historical baseline,
--transpose 0 to disable automatic octave transposition, and --max-chord-notes
to control polyphonic density (default: 3).

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

    $repo = "F:\code\Project\sky-music-play-lite"
    & "D:\AI\MuScriptor\.venv\Scripts\python.exe" -m unittest discover -s "$repo\tools\midi-to-score\tests" -p "test_*.py" -v
