"""Estimate MIDI key for transposition onto Sky's C-major 15-key layout.

Use explicit MIDI key-signature metadata if available. For transcription without
metadata, fit the pitch-class note-duration distribution against major/minor
Krumhansl-Kessler profiles. Ambiguous estimates should not be applied.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable

from sky_arrangement import RawNoteEvent

_MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
_MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
_NAMES = ("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
_PITCH_CLASS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_SIGNATURE_PATTERN = re.compile(r"^([A-G])([#b]?)(m?)$")


@dataclass(frozen=True)
class KeyEstimate:
    name: str
    mode: str
    tonic: int
    transpose: int
    source: str
    confidence: float
    reliable: bool


def _transpose_for_tonic(tonic: int, mode: str) -> int:
    """Major tonic to C, minor tonic to A, using the shortest semitone shift."""
    target = 0 if mode == "major" else 9
    semitones = (target - tonic) % 12
    return semitones - 12 if semitones > 6 else semitones


def _parse_signature(signature: str) -> tuple[int, str] | None:
    match = _SIGNATURE_PATTERN.fullmatch(signature.strip())
    if match is None:
        return None
    letter, accidental, minor_suffix = match.groups()
    tonic = (
        _PITCH_CLASS[letter] + (1 if accidental == "#" else -1 if accidental == "b" else 0)
    ) % 12
    return tonic, "minor" if minor_suffix else "major"


def _correlation(histogram: list[float], profile: tuple[float, ...], tonic: int) -> float:
    shifted = [profile[(pc - tonic) % 12] for pc in range(12)]
    hist_mean = sum(histogram) / 12
    profile_mean = sum(shifted) / 12
    numerator = sum(
        (frequency - hist_mean) * (weight - profile_mean)
        for frequency, weight in zip(histogram, shifted)
    )
    h_norm = math.sqrt(sum((frequency - hist_mean) ** 2 for frequency in histogram))
    p_norm = math.sqrt(sum((weight - profile_mean) ** 2 for weight in shifted))
    return numerator / (h_norm * p_norm) if h_norm and p_norm else 0.0


def estimate_key(
    events: Iterable[RawNoteEvent], *, key_signature: str | None = None
) -> KeyEstimate | None:
    """Infer tonic/mode with a conservative reliability flag.

    The profile confidence value is a score gap, not a calibrated probability.
    """
    if key_signature is not None:
        parsed = _parse_signature(key_signature)
        if parsed is not None:
            tonic, mode = parsed
            return KeyEstimate(
                name=f"{_NAMES[tonic]} {mode}",
                mode=mode,
                tonic=tonic,
                transpose=_transpose_for_tonic(tonic, mode),
                source="MIDI key signature",
                confidence=1.0,
                reliable=True,
            )

    note_events = tuple(events)
    if not note_events:
        return None

    histogram = [0.0] * 12
    for event in note_events:
        duration = max(0.0, event.end_ms - event.start_ms)
        # Cap sustained notes so a single bass tone cannot dominate.
        velocity_weight = 0.3 + 0.7 * max(0.0, min(1.0, event.amplitude))
        histogram[event.midi_pitch % 12] += min(duration, 1800.0) * velocity_weight

    ranked = sorted(
        (
            (_correlation(histogram, profile, tonic), tonic, mode)
            for mode, profile in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE))
            for tonic in range(12)
        ),
        reverse=True,
    )
    best_score, tonic, mode = ranked[0]
    margin = best_score - ranked[1][0]
    distinct = sum(frequency > 0 for frequency in histogram)
    reliable = (
        len(note_events) >= 8
        and distinct >= 5
        and best_score >= 0.55
        and margin >= 0.04
    )
    return KeyEstimate(
        name=f"{_NAMES[tonic]} {mode}",
        mode=mode,
        tonic=tonic,
        transpose=_transpose_for_tonic(tonic, mode),
        source="pitch-class analysis",
        confidence=round(margin, 3),
        reliable=reliable,
    )


def midi_key_signature(song: object) -> str | None:
    """Trust key-signature metadata only when all metadata events agree."""
    signatures = {
        message.key
        for track in song.tracks  # type: ignore[attr-defined]
        for message in track
        if message.type == "key_signature" and _parse_signature(message.key) is not None
    }
    return next(iter(signatures)) if len(signatures) == 1 else None
