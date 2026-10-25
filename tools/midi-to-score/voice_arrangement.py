"""Experimental melody voice tracking for polyphonic piano MIDI.

A deterministic heuristic, not trained or validated melody recognition.
"""
from __future__ import annotations
from dataclasses import dataclass
from math import log1p
from statistics import median
from typing import Iterable

SKY = (60,62,64,65,67,69,71,72,74,76,77,79,81,83,84)

@dataclass(frozen=True)
class VoiceNote:
    start_ms: float
    end_ms: float
    midi_pitch: int
    strength: float

@dataclass(frozen=True)
class VoiceResult:
    notes: tuple[dict,...]
    melody_events: tuple[VoiceNote,...]
    selected_octave: int
    source_notes: int
    onset_groups: int
    dropped_collision_notes: int

def pick_voice(notes: list[VoiceNote]):
    groups=[]
    for note in notes:
        if not groups or note.start_ms-groups[-1][0].start_ms>42:
            groups.append([note])
        else:
            groups[-1].append(note)
    if not groups:
        return (),0
    upper=[max(n.midi_pitch for n in g) for g in groups]
    center=median(upper)
    nodes=[]
    for gi,group in enumerate(groups):
        # Filter much lower-register chords, not just bottom C4 absolute.
        choices=sorted((n for n in group if n.midi_pitch>=center-8),
                       key=lambda n:(-n.midi_pitch,-n.strength))[:4]
        for n in choices:
            dur=max(1,n.end_ms-n.start_ms)
            reward=(1.0+min(0.5,0.12*log1p(dur/90.0))
                    +0.032*max(-12,min(12,n.midi_pitch-center))
                    +0.18*(n.strength-0.5)
                    +(0.08 if n.midi_pitch==upper[gi] else 0)
                    -(0.45 if dur>2300 else 0))
            nodes.append((gi,n,reward))
    if not nodes:
        return (),len(groups)
    scores=[0.0]*len(nodes)
    parents=[-1]*len(nodes)
    for i,(gi,n,rew) in enumerate(nodes):
        best=rew
        parent=-1
        for j in range(i-1,-1,-1):
            pg,p,_=nodes[j]
            gap=n.start_ms-p.start_ms
            if gap>2400:
                break
            if pg==gi or gap<95:
                continue
            leap=abs(n.midi_pitch-p.midi_pitch)
            cost=0.030*leap+0.065*max(0,leap-5)**1.35
            if leap>12:
                cost+=0.8
            cost+=min(0.55,max(0,p.end_ms-n.start_ms-80)/1100.0)
            cost+=max(0,gap-1050)/1000.0*0.48
            proposal=scores[j]+rew-cost
            if proposal>best:
                best=proposal
                parent=j
        scores[i],parents[i]=best,parent
    # Do not discard disconnected opening phrases by taking one global path.
    boundaries=[0]
    for i in range(1,len(nodes)):
        if nodes[i][1].start_ms-nodes[i-1][1].start_ms>2400:
            boundaries.append(i)
    boundaries.append(len(nodes))
    selected=[]
    for left,right in zip(boundaries,boundaries[1:]):
        chosen=[]
        i=max(range(left,right),key=scores.__getitem__)
        while i>=left:
            chosen.append(nodes[i][1])
            i=parents[i]
        selected.extend(reversed(chosen))
    return tuple(selected),len(groups)

def choose_octave(melody,transpose):
    best=None
    for octave in range(-2,4):
        pitches=[n.midi_pitch+transpose+octave*12 for n in melody]
        outside=sum(max(60-p,0)**2+max(p-84,0)**2 for p in pitches)
        center=sum(abs(p-72) for p in pitches)/len(pitches)
        choice=(outside*20+center,abs(octave),octave)
        if best is None or choice<best:
            best=choice
    return best[2]

def arrange_voice(events: Iterable[object], *, transpose: int=0, accompaniment: bool=False) -> VoiceResult:
    notes=[VoiceNote(float(e.start_ms),float(e.end_ms),int(e.midi_pitch),float(e.amplitude))
           for e in events if e.end_ms-e.start_ms>=65 and 0<=e.midi_pitch<=127]
    notes.sort(key=lambda n:(n.start_ms,-n.midi_pitch))
    if not notes:
        raise ValueError("No playable MIDI notes (>=65 ms)")
    melody,groups=pick_voice(notes)
    if not melody:
        raise ValueError("No melody candidates found")
    octave=choose_octave(melody,transpose)
    base=min(n.start_ms for n in notes)
    candidates=[]
    for n in melody:
        pitch=n.midi_pitch+transpose+octave*12
        key=min(range(15),key=lambda i:(abs(SKY[i]-pitch),SKY[i]))
        candidates.append((round(n.start_ms-base),key,round(n.end_ms-n.start_ms),"melody"))
    if accompaniment:
        for m in melody:
            others=[n for n in notes if n is not m and abs(n.start_ms-m.start_ms)<=42
                    and 3<=m.midi_pitch-n.midi_pitch<=12]
            if not others:
                continue
            n=max(others,key=lambda x:(x.midi_pitch,x.end_ms-x.start_ms))
            pitch=n.midi_pitch+transpose+octave*12
            if not 60<=pitch<=84:
                continue
            key=min(range(15),key=lambda i:(abs(SKY[i]-pitch),SKY[i]))
            candidates.append((round(n.start_ms-base),key,round(n.end_ms-n.start_ms),"accompaniment"))
    candidates.sort(key=lambda n:(n[0],n[3]!="melody",n[1]))
    unique=[]
    dropped=0
    for time,key,duration,role in candidates:
        if any(t==time and k==key for t,k,_,_ in unique[-3:]):
            dropped+=1
            continue
        unique.append((time,key,min(60000,max(1,duration)),role))
    by_key={}
    for i,(_,key,_,_) in enumerate(unique):
        by_key.setdefault(key,[]).append(i)
    durations=[x[2] for x in unique]
    for indexes in by_key.values():
        for old,new in zip(indexes,indexes[1:]):
            if unique[new][0]>unique[old][0]:
                durations[old]=min(durations[old],max(1,unique[new][0]-unique[old][0]-1))
    output=tuple(dict(time=t,key="1Key"+str(k),duration=durations[i])
                 for i,(t,k,_,_) in enumerate(unique))
    return VoiceResult(output,melody,octave,len(notes),groups,dropped)

def build_voice_score(name,notes):
    return [dict(name=name,formatVersion=2,bpm=120,bitsPerPage=16,pitchLevel=0,
                 isComposed=True,songNotes=list(notes))]
