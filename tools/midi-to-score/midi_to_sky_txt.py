"""Convert standard MIDI files to SkyMusicPlay Lite V1 TXT scores.

Uses the historical, deterministic Sky 15-key arrangement algorithm kept in
this directory; no audio transcription model is required.
"""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Sequence

from sky_arrangement import RawNoteEvent, arrange_events, build_lite_score


def midi_note_events(source: Path) -> tuple[list[RawNoteEvent], int]:
    """Read MIDI type 0/1 note-on/off pairs with merged tempo-aware timing."""
    import mido

    song = mido.MidiFile(str(source))
    if song.type == 2:
        raise ValueError("MIDI type 2 has independent timelines; use a type 0/1 MIDI file")

    active = defaultdict(deque)
    elapsed_seconds = 0.0
    notes: list[RawNoteEvent] = []
    percussion_events = 0

    for message in song:  # Mido merges tracks, converting delta time to seconds.
        elapsed_seconds += message.time
        if message.type not in ("note_on", "note_off"):
            continue

        channel = getattr(message, "channel", 0)
        if channel == 9:  # General MIDI percussion channel.
            percussion_events += 1
            continue

        key = (channel, message.note)
        if message.type == "note_on" and message.velocity > 0:
            active[key].append((elapsed_seconds, message.velocity))
            continue

        if not active[key]:
            continue
        start_seconds, velocity = active[key].popleft()
        if elapsed_seconds <= start_seconds:
            continue
        notes.append(
            RawNoteEvent(
                start_ms=start_seconds * 1000,
                end_ms=elapsed_seconds * 1000,
                midi_pitch=int(message.note),
                amplitude=velocity / 127,
            )
        )

    return notes, percussion_events


def write_score(output: Path, document: object, *, force: bool) -> None:
    """Atomically write UTF-8 JSON in a .txt file without unapproved overwrites."""
    if output.exists() and not force:
        raise ValueError(f"output already exists: {output} (pass --force to overwrite)")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=f".{output.name}.",
            suffix=".tmp",
            dir=output.parent,
            delete=False,
        ) as file:
            temporary_path = Path(file.name)
            json.dump(document, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary_path, output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert MIDI to SkyMusicPlay Lite TXT with the historical arrangement algorithm"
    )
    parser.add_argument("midi", type=Path, help="input .mid or .midi file")
    parser.add_argument("--output", type=Path, help="output .txt (default: beside the MIDI)")
    parser.add_argument("--name", help="song title in SkyMusicPlay Lite")
    parser.add_argument("--mode", choices=("polyphonic", "melody-dp"), default="polyphonic")
    parser.add_argument("--mapping", choices=("clamp", "octave-fold"), default="octave-fold")
    parser.add_argument("--max-chord-notes", type=int, default=3)
    parser.add_argument("--transpose", type=int, help="semitone shift; default selects an octave automatically")
    parser.add_argument("--force", action="store_true", help="overwrite an existing output file")
    args = parser.parse_args(argv)

    try:
        if not args.midi.is_file() or args.midi.suffix.lower() not in {".mid", ".midi"}:
            raise ValueError(f"MIDI file not found or invalid extension: {args.midi}")
        output = args.output or args.midi.with_suffix(".txt")
        if output.suffix.lower() != ".txt":
            raise ValueError("output file must have the .txt extension")
        if output.resolve() == args.midi.resolve():
            raise ValueError("output path must differ from the MIDI input")
        if output.exists() and not args.force:
            raise ValueError(f"output already exists: {output} (pass --force to overwrite)")
        events, skipped_percussion = midi_note_events(args.midi)
        if not events:
            raise ValueError("No complete melodic MIDI notes found")

        result = arrange_events(
            events,
            min_amplitude=0.001,
            min_duration_ms=1,
            chord_window_ms=35,
            max_chord_notes=args.max_chord_notes,
            transpose=args.transpose,
            pitch_mapping_mode=args.mapping,
            arrangement_mode=args.mode,
        )
        document = build_lite_score(args.name or args.midi.stem, result.notes)
        write_score(output, document, force=args.force)
        print(f"Input MIDI notes: {len(events)}")
        print(f"Output Sky notes: {len(result.notes)}")
        print(f"Transpose: {result.transpose} semitones")
        print(f"Mode: {args.mode} / mapping: {args.mapping}")
        if skipped_percussion:
            print(f"Skipped percussion-channel events: {skipped_percussion}")
        print(f"Saved: {output.resolve()}")
        return 0
    except (OSError, ValueError, ImportError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
