# Audio-to-Sky Score Engine (experimental)

This development-only MVP turns one audio file into one SkyMusicPlay Lite JSON score. It is a standalone source-sidecar tool: it does not change the React UI, Tauri application, or any playback path.

It requires Python 3.10 or 3.11. The tool has its own virtual environment and `basic-pitch==0.4.0`; neither should be installed globally or committed.

## Setup

In PowerShell, create the private virtual environment and install the pinned inference dependency:

```powershell
py -3.11 -m venv tools\audio-to-score-engine\.venv

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install --upgrade pip

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install -r tools\audio-to-score-engine\requirements.txt
```

If the Windows `py` launcher is not installed, use an existing Python 3.10/3.11 executable instead:

```powershell
python -m venv tools\audio-to-score-engine\.venv
```

## Convert audio

Supported input extensions are `.wav`, `.mp3`, `.flac`, `.ogg`, and `.m4a`.

By default, automatic transpose only moves detected notes by whole octaves. It will not shift a song into a different musical key.

```powershell
& ".\tools\audio-to-score-engine\.venv\Scripts\python.exe" `
  ".\tools\audio-to-score-engine\transcribe.py" `
  "D:\Music\test.wav" `
  --output ".\tools\audio-to-score-engine\output\test.json"
```

Optional parameters:

- `--min-amplitude` (default `0.25`, from `0` through `1`)
- `--min-duration-ms` (default `50`)
- `--chord-window-ms` (default `35`)
- `--max-chord-notes` (default `3`, from `1` through `15`)
- `--transpose` (default `auto`, or a manual integer from `-36` through `36`)

The command creates the output parent directory if needed and writes the JSON atomically. It derives the score name from the input filename unless `--name` is supplied.

### Transpose choices

`--transpose auto` is the default. It evaluates only `-24`, `-12`, `0`, `12`, and `24` semitones, so automatic adjustment preserves the detected musical key and interval relationships.

To completely disable automatic octave adjustment, use:

```powershell
--transpose 0
```

This preserves Basic Pitch's detected absolute pitches as closely as possible. Notes outside the Sky 15-key range will still be clamped to boundary keys, and chromatic notes will still be mapped to the nearest natural note.

For diagnosis or a user correction, a non-octave manual transpose is also available:

```powershell
--transpose -4
```

Non-octave manual transposition is intended for diagnosis and user correction, not as the automatic default.

## Import and preview

Import the generated `.json` in SkyMusicPlay Lite's existing local import section. Start with preview playback before enabling foreground or target-window game playback. The output is one Lite-compatible JSON array containing one song and absolute millisecond note times.

## Known MVP limits

Basic Pitch works best with isolated or simple instruments. Full mixed songs can produce dense or inaccurate notes. This phase intentionally does not include melody extraction, Demucs, beat detection/BPM estimation, MIDI input, an LLM, UI integration, or release packaging. BPM is fixed at `120` because Lite playback uses absolute note times.

Do not commit `.venv`, Basic Pitch/model caches, generated output, or PyInstaller temporary build directories. This repository does not yet build or ship an executable Sidecar; source-sidecar packaging is a later, explicitly scoped task.

## Test the deterministic arrangement

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m unittest discover `
  -s tools\audio-to-score-engine\tests `
  -p "test_*.py"
```
