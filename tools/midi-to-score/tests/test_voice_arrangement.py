from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voice_arrangement import arrange_voice,build_voice_score

def note(t,p,d=260):
    return SimpleNamespace(start_ms=t,end_ms=t+d,midi_pitch=p,amplitude=.7)

class VoiceTests(unittest.TestCase):
    def test_lead_vs_bass(self):
        pitches=[64,65,67,69,71,72]
        notes=[n for i,p in enumerate(pitches) for n in (note(i*400,p,330),note(i*400,40,900),note(i*400,52,450))]
        out=arrange_voice(notes)
        self.assertEqual([n.midi_pitch for n in out.melody_events],pitches)
        self.assertEqual(len(out.notes),6)
        self.assertEqual(build_voice_score("test",out.notes)[0]["formatVersion"],2)

    def test_does_not_discard_opening_phrase(self):
        notes=[note(i*300,p,230) for i,p in enumerate([64,65,67,69])]
        notes += [note(5000+i*300,p,230) for i,p in enumerate([69,67,65,64])]
        out=arrange_voice(notes)
        self.assertEqual(len(out.melody_events),8)
        self.assertEqual(out.notes[0]["time"],0)

    def test_preserve_durations_and_trim_repeat_overlap(self):
        out=arrange_voice([note(0,60,900),note(480,60,1000),note(1100,62,200)])
        self.assertLessEqual(out.notes[0]["duration"],479)
        self.assertTrue(all(1<=x["duration"]<=60000 for x in out.notes))

    def test_accompaniment_is_opt_in(self):
        notes=[n for i,p in enumerate([64,65,67,69,71,72]) for n in
               (note(i*390,p,300),note(i*390,p-7,300),note(i*390,32,900))]
        mono=arrange_voice(notes)
        duo=arrange_voice(notes,accompaniment=True)
        self.assertEqual(len(mono.notes),6)
        self.assertGreaterEqual(len(duo.notes),6)
        self.assertLessEqual(len(duo.notes),12)

    def test_reject_too_short_notes(self):
        with self.assertRaisesRegex(ValueError,"No playable"):
            arrange_voice([note(0,72,12)])

if __name__=="__main__":
    unittest.main()
