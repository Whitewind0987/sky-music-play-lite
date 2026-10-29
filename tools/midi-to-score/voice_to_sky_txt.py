"""Experimental piano MIDI -> SkyMusicPlay Lite V2 TXT with melody-first mapping."""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import os
from pathlib import Path
import sys
import tempfile

import mido
from sky_arrangement import RawNoteEvent
from key_detection import estimate_key, midi_key_signature
from voice_arrangement import arrange_voice, build_voice_score


def midi_note_events(source: Path):
    song=mido.MidiFile(str(source))
    if song.type==2:
        raise ValueError("MIDI type 2 uses independent timelines")
    active=defaultdict(deque)
    seconds=0.0
    notes=[]
    percussion=0
    for message in song:
        seconds+=message.time
        if message.type not in ("note_on","note_off"):
            continue
        if message.channel==9:
            percussion+=1
            continue
        key=(message.channel,message.note)
        if message.type=="note_on" and message.velocity>0:
            active[key].append((seconds,message.velocity))
        elif active[key]:
            start,velocity=active[key].popleft()
            if seconds>start:
                notes.append(RawNoteEvent(
                    start_ms=start*1000,end_ms=seconds*1000,
                    midi_pitch=int(message.note),amplitude=velocity/127
                ))
    return notes,percussion


def write_score(path: Path, document: object, *, force: bool):
    if path.exists() and not force:
        raise ValueError("Output exists; use --force")
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=None
    try:
        with tempfile.NamedTemporaryFile(
            "w",encoding="utf-8",dir=path.parent,
            prefix="."+path.name+".",suffix=".tmp",delete=False
        ) as stream:
            temp=Path(stream.name)
            json.dump(document,stream,indent=2,ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp,path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def main(argv=None):
    parser=argparse.ArgumentParser(description="Experimental MIDI voice -> SkyMusicPlay Lite V2 TXT")
    parser.add_argument("input",type=Path,help="MIDI type 0/1 input file")
    parser.add_argument("--output",type=Path,help="output .txt file")
    parser.add_argument("--name",help="score display name")
    parser.add_argument("--transpose",default="auto",help="auto (default) or semitones -36..36")
    parser.add_argument("--accompaniment",action="store_true",help="include sparse chord-neighbor accompaniment")
    parser.add_argument("--force",action="store_true",help="overwrite existing output")
    args=parser.parse_args(argv)
    try:
        if not args.input.is_file() or args.input.suffix.lower() not in (".mid",".midi"):
            raise ValueError("Input MIDI .mid/.midi does not exist")
        output=args.output or args.input.with_name(args.input.stem+"-voice-v2.txt")
        if output.suffix.lower()!=".txt":
            raise ValueError("Output must have .txt extension")
        if output.resolve()==args.input.resolve():
            raise ValueError("Output would overwrite input")
        if output.exists() and not args.force:
            raise ValueError("Output exists; use --force")
        events,percussion=midi_note_events(args.input)
        if not events:
            raise ValueError("No complete melodic MIDI notes found")
        estimate=None
        if args.transpose=="auto":
            estimate=estimate_key(events,key_signature=midi_key_signature(mido.MidiFile(str(args.input))))
            semitones=estimate.transpose if estimate is not None and estimate.reliable else 0
        else:
            try:
                semitones=int(args.transpose)
            except ValueError as error:
                raise ValueError("--transpose must be auto or -36..36") from error
            if not -36<=semitones<=36:
                raise ValueError("--transpose must be -36..36")
        result=arrange_voice(events,transpose=semitones,accompaniment=args.accompaniment)
        write_score(output,build_voice_score(args.name or args.input.stem,result.notes),force=args.force)
        if estimate is not None:
            status="accepted" if estimate.reliable else "uncertain"
            print(f"Key estimate: {estimate.name} ({status}; {estimate.source})")
        print(f"Chromatic shift: {semitones:+d}, melody octave shift: {result.selected_octave:+d}")
        print(f"MIDI notes: {len(events)}; onset groups: {result.onset_groups}; lead notes: {len(result.melody_events)}; V2 notes: {len(result.notes)}")
        if percussion:
            print(f"Skipped percussion messages: {percussion}")
        print(f"Saved: {output.resolve()}")
        return 0
    except (OSError,ValueError,ImportError) as error:
        print(f"Error: {error}",file=sys.stderr)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
