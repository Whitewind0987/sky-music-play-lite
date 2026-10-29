"""Focused regression coverage for the local MIDI-to-TXT wrapper."""
from __future__ import annotations

import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import mido

TOOL_DIRECTORY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_DIRECTORY))

# sky_arrangement.py is shipped unchanged from the archived branch.
from midi_to_sky_txt import main, midi_note_events


def make_midi(path: Path, *, tempo_change: bool = False, type_number: int = 0) -> None:
    file = mido.MidiFile(type=type_number, ticks_per_beat=480)
    track = mido.MidiTrack()
    file.tracks.append(track)
    track.append(mido.Message("note_on", channel=0, note=60, velocity=90, time=0))
    if tempo_change:
        track.append(mido.MetaMessage("set_tempo", tempo=1000000, time=240))
        track.append(mido.Message("note_off", channel=0, note=60, velocity=0, time=240))
    else:
        track.append(mido.Message("note_on", channel=0, note=60, velocity=0, time=480))
    track.append(mido.Message("note_on", channel=9, note=42, velocity=90, time=0))
    track.append(mido.Message("note_off", channel=9, note=42, velocity=0, time=0))
    file.save(path)


class MidiConverterTests(unittest.TestCase):
    def test_notes_and_drum_filter(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "song.mid"
            make_midi(source)
            notes, skipped = midi_note_events(source)
            self.assertEqual(len(notes), 1)
            self.assertEqual(skipped, 2)
            self.assertEqual(notes[0].midi_pitch, 60)
            self.assertAlmostEqual(notes[0].end_ms - notes[0].start_ms, 500)

    def test_tempo_change_uses_elapsed_seconds(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "song.mid"
            make_midi(source, tempo_change=True)
            notes, _ = midi_note_events(source)
            self.assertAlmostEqual(notes[0].end_ms, 750)

    def test_outputs_importable_txt_array_and_protects_existing(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "song.mid"
            target = Path(directory) / "out.txt"
            make_midi(source)
            with patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(main([str(source), "--output", str(target), "--transpose", "0"]), 0)
            song = json.loads(target.read_text(encoding="utf-8"))[0]
            self.assertEqual(song["name"], "song")
            self.assertIn("songNotes", song)
            self.assertEqual(song["songNotes"][0]["key"], "1Key0")
            snapshot = target.read_bytes()
            with patch("sys.stderr", new_callable=io.StringIO):
                self.assertEqual(main([str(source), "--output", str(target)]), 1)
            self.assertEqual(target.read_bytes(), snapshot)
            with patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(main([str(source), "--output", str(target), "--force"]), 0)

    def test_rejects_type_two_and_invalid_output_extension(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "song.mid"
            make_midi(source, type_number=2)
            with self.assertRaisesRegex(ValueError, "type 2"):
                midi_note_events(source)
            with patch("sys.stderr", new_callable=io.StringIO):
                self.assertEqual(main([str(source), "--output", str(Path(directory)/"out.json")]), 1)


if __name__ == "__main__":
    unittest.main()
