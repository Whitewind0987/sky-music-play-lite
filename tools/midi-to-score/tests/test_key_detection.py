"""Regression tests for MIDI key detection and CLI transposition."""
from __future__ import annotations

import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import mido

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from key_detection import estimate_key, midi_key_signature
from midi_to_sky_txt import main
from sky_arrangement import RawNoteEvent


def events_for(pitches):
    return [RawNoteEvent(i * 250.0, i * 250.0 + 250.0, pitch, 0.8) for i, pitch in enumerate(pitches)]


def make_midi(path, pitches, signature=None):
    midi = mido.MidiFile(type=0, ticks_per_beat=480)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    if signature:
        track.append(mido.MetaMessage("key_signature", key=signature, time=0))
    for pitch in pitches:
        track.append(mido.Message("note_on", channel=0, note=pitch, velocity=95, time=0))
        track.append(mido.Message("note_off", channel=0, note=pitch, velocity=0, time=480))
    midi.save(path)


class KeyDetectionTests(unittest.TestCase):
    def test_signature_eb_major(self):
        e = estimate_key([], key_signature="Eb")
        self.assertEqual((e.name, e.transpose, e.reliable), ("Eb major", -3, True))

    def test_signature_c_minor(self):
        e = estimate_key([], key_signature="Cm")
        self.assertEqual((e.name, e.transpose), ("C minor", -3))

    def test_eb_major_without_metadata(self):
        notes = [63, 67, 70, 67, 70, 63, 65, 67, 68, 70, 72, 74, 75, 72, 70, 67, 63, 70] * 3
        e = estimate_key(events_for(notes))
        self.assertEqual((e.name, e.transpose), ("Eb major", -3))
        self.assertTrue(e.reliable)

    def test_c_major_and_a_minor(self):
        c = [60, 64, 67, 60, 64, 67, 72, 60, 62, 64, 65, 67, 69, 71, 72, 67] * 3
        am = [69, 72, 76, 69, 72, 76, 69, 71, 72, 74, 76, 77, 79, 81, 76, 72] * 4
        self.assertEqual(estimate_key(events_for(c)).name, "C major")
        self.assertEqual(estimate_key(events_for(am)).name, "A minor")

    def test_sparse_notes_uncertain(self):
        self.assertFalse(estimate_key(events_for([60, 64, 67])).reliable)

    def test_conflicting_metadata_ignored(self):
        song = mido.MidiFile(type=0)
        track = mido.MidiTrack()
        song.tracks.append(track)
        track.append(mido.MetaMessage("key_signature", key="Eb"))
        track.append(mido.MetaMessage("key_signature", key="F"))
        self.assertIsNone(midi_key_signature(song))

    def test_cli_eb_major_defaults_minus_three(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "song.mid", Path(tmp) / "song.txt"
            make_midi(source, [63, 67, 70, 63, 65, 67, 70, 63], signature="Eb")
            capture = io.StringIO()
            with patch("sys.stdout", capture):
                self.assertEqual(main([str(source), "--output", str(output)]), 0)
            self.assertIn("Detected key: Eb major", capture.getvalue())
            self.assertIn("Transpose: -3 semitones", capture.getvalue())
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["songNotes"][0]["key"], "1Key0")

    def test_manual_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "song.mid", Path(tmp) / "song.txt"
            make_midi(source, [63, 67, 70], signature="Eb")
            capture = io.StringIO()
            with patch("sys.stdout", capture):
                self.assertEqual(main([str(source), "--output", str(output), "--transpose", "0"]), 0)
            self.assertIn("Manual transpose: +0", capture.getvalue())
            data = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["songNotes"][0]["key"], "1Key2")

    def test_uncertain_analysis_falls_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "short.mid"
            make_midi(source, [60, 64])
            capture = io.StringIO()
            with patch("sys.stdout", capture):
                self.assertEqual(main([str(source)]), 0)
            self.assertIn("Uncertain key estimate", capture.getvalue())

    def test_out_of_range_override_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "song.mid"
            make_midi(source, [60, 64, 67])
            error = io.StringIO()
            with patch("sys.stderr", error):
                self.assertEqual(main([str(source), "--transpose", "77"]), 1)
            self.assertIn("between -36 and 36", error.getvalue())


if __name__ == "__main__":
    unittest.main()
