// Chord parsing and voicing. Pure functions, no browser APIs, so they can be tested in Node.

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Roots offered in the chord picker, spelled the way musicians usually write them. */
export const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * Chord qualities: canonical suffix -> intervals in semitones above the root.
 * Grouped for the picker; every suffix here is also accepted when typed.
 */
export const QUALITY_GROUPS = [
  { id: "triads", items: {
    "": [0, 4, 7], "m": [0, 3, 7], "5": [0, 7], "dim": [0, 3, 6], "aug": [0, 4, 8],
    "sus2": [0, 2, 7], "sus4": [0, 5, 7], "add2": [0, 2, 4, 7], "add4": [0, 4, 5, 7],
    "sus2sus4": [0, 2, 5, 7], "madd4": [0, 3, 5, 7], "(b5)": [0, 4, 6], "m#5": [0, 3, 8], "6sus4": [0, 5, 7, 9],
  } },
  { id: "sixths", items: {
    "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9], "6/9": [0, 4, 7, 9, 14], "m6/9": [0, 3, 7, 9, 14],
    "6add11": [0, 4, 7, 9, 17], "6/9#11": [0, 4, 7, 9, 14, 18],
  } },
  { id: "sevenths", items: {
    "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "mmaj7": [0, 3, 7, 11],
    "m7b5": [0, 3, 6, 10], "dim7": [0, 3, 6, 9], "7sus4": [0, 5, 7, 10], "7sus2": [0, 2, 7, 10],
    "aug7": [0, 4, 8, 10], "7b5": [0, 4, 6, 10], "maj7b5": [0, 4, 6, 11], "maj7#5": [0, 4, 8, 11],
    "m7#5": [0, 3, 8, 10], "maj7sus2": [0, 2, 7, 11], "maj7sus4": [0, 5, 7, 11], "7sus2sus4": [0, 2, 5, 7, 10],
  } },
  { id: "added", items: {
    "add9": [0, 4, 7, 14], "madd9": [0, 3, 7, 14], "add11": [0, 4, 7, 17], "madd11": [0, 3, 7, 17],
    "m7add11": [0, 3, 7, 10, 17], "maj7add13": [0, 4, 7, 11, 21],
    "add13": [0, 4, 7, 21], "add#11": [0, 4, 7, 18], "madd2": [0, 2, 3, 7], "add9add11": [0, 4, 7, 14, 17],
  } },
  { id: "ninths", items: {
    "9": [0, 4, 7, 10, 14], "m9": [0, 3, 7, 10, 14], "maj9": [0, 4, 7, 11, 14], "mmaj9": [0, 3, 7, 11, 14],
    "9sus4": [0, 5, 7, 10, 14], "aug9": [0, 4, 8, 10, 14], "m9b5": [0, 3, 6, 10, 14],
    "9b5": [0, 4, 6, 10, 14], "maj9sus4": [0, 5, 7, 11, 14], "maj9#11": [0, 4, 7, 11, 14, 18],
    "maj9#5": [0, 4, 8, 11, 14], "m9maj7": [0, 3, 7, 11, 14], "dim9": [0, 3, 6, 9, 14],
  } },
  { id: "elevenths", items: {
    "11": [0, 7, 10, 14, 17], "m11": [0, 3, 7, 10, 14, 17], "maj11": [0, 4, 7, 11, 14, 17],
    "7#11": [0, 4, 7, 10, 18], "maj7#11": [0, 4, 7, 11, 18], "9#11": [0, 4, 7, 10, 14, 18],
    "m11b5": [0, 3, 6, 10, 14, 17], "mmaj11": [0, 3, 7, 11, 14, 17], "11b9": [0, 7, 10, 13, 17],
  } },
  { id: "thirteenths", items: {
    "13": [0, 4, 7, 10, 14, 21], "m13": [0, 3, 7, 10, 14, 21], "maj13": [0, 4, 7, 11, 14, 21],
    "13sus4": [0, 5, 7, 10, 14, 21], "7add13": [0, 4, 7, 10, 21],
    "13#11": [0, 4, 7, 10, 14, 18, 21], "maj13#11": [0, 4, 7, 11, 14, 18, 21], "13#9": [0, 4, 10, 15, 21],
    "13b5": [0, 4, 6, 10, 14, 21], "m13b5": [0, 3, 6, 10, 14, 21], "mmaj13": [0, 3, 7, 11, 14, 21],
  } },
  { id: "altered", items: {
    "7b9": [0, 4, 7, 10, 13], "7#9": [0, 4, 7, 10, 15], "7b13": [0, 4, 7, 10, 20], "7#5": [0, 4, 8, 10],
    "7b9b13": [0, 4, 10, 13, 20], "7#9b13": [0, 4, 10, 15, 20], "7b5b9": [0, 4, 6, 10, 13],
    "m7b9": [0, 3, 7, 10, 13], "dim(maj7)": [0, 3, 6, 11], "13b9": [0, 4, 10, 13, 21],
    "7alt": [0, 4, 10, 13, 15, 20], "7#5#9": [0, 4, 8, 10, 15], "7#5b9": [0, 4, 8, 10, 13], "7b5#9": [0, 4, 6, 10, 15],
    "7b9#11": [0, 4, 7, 10, 13, 18], "7#9#11": [0, 4, 7, 10, 15, 18], "7b9sus4": [0, 5, 7, 10, 13],
    "m7b13": [0, 3, 7, 10, 20], "7b9#9": [0, 4, 7, 10, 13, 15],
  } },
];

const QUALITIES = Object.assign({}, ...QUALITY_GROUPS.map((g) => g.items));

// Other common ways of writing the same chord.
const ALIASES = {
  "maj": "", "M": "", "major": "", "min": "m", "mi": "m", "-": "m", "minor": "m",
  "o": "dim", "°": "dim", "dim5": "dim", "+": "aug", "+5": "aug",
  "sus": "sus4", "2": "add2", "4": "add4", "69": "6/9", "m69": "m6/9", "maj6": "6",
  "dom7": "7", "M7": "maj7", "ma7": "maj7", "Maj7": "maj7", "Δ": "maj7", "Δ7": "maj7", "j7": "maj7",
  "mi7": "m7", "min7": "m7", "-7": "m7", "mM7": "mmaj7", "m(maj7)": "mmaj7", "mMaj7": "mmaj7", "minmaj7": "mmaj7",
  "ø": "m7b5", "ø7": "m7b5", "m7(b5)": "m7b5", "-7b5": "m7b5", "o7": "dim7", "°7": "dim7",
  "+7": "aug7", "7+": "aug7", "7aug": "aug7", "7(#5)": "7#5", "7(b5)": "7b5", "7-5": "7b5",
  "m(add9)": "madd9", "(add9)": "add9", "add2": "add2", "madd2": "madd9",
  "M9": "maj9", "Maj9": "maj9", "ma9": "maj9", "mi9": "m9", "min9": "m9", "-9": "m9", "mM9": "mmaj9",
  "M11": "maj11", "mi11": "m11", "min11": "m11", "M13": "maj13", "Maj13": "maj13", "mi13": "m13", "min13": "m13",
  "7(b9)": "7b9", "7-9": "7b9", "7(#9)": "7#9", "7+9": "7#9", "7(#11)": "7#11", "7(b13)": "7b13",
  "maj7(#11)": "maj7#11", "M7#11": "maj7#11", "sus24": "sus2sus4", "9sus": "9sus4", "7sus": "7sus4",
  "9#5": "aug9", "+9": "aug9", "9+5": "aug9", "m(maj9)": "mmaj9", "mM9": "mmaj9", "6add9": "6/9", "m6add9": "m6/9",
  "M6/9": "6/9", "maj6/9": "6/9", "7+5": "aug7", "alt": "7alt", "7alt.": "7alt", "mi7b5": "m7b5", "min7b5": "m7b5",
  "-maj7": "mmaj7", "M7b5": "maj7b5", "M7#5": "maj7#5", "maj7+5": "maj7#5", "+M7": "maj7#5", "+maj7": "maj7#5",
  "m+": "m#5", "-5": "(b5)", "majb5": "(b5)", "Mb5": "(b5)", "M9#11": "maj9#11", "M13#11": "maj13#11",
  "add6": "6", "m(add4)": "madd4", "m(add2)": "madd2", "add2add4": "sus2sus4", "o9": "dim9", "°9": "dim9",
  "M7sus4": "maj7sus4", "M7sus2": "maj7sus2", "maj9sus": "maj9sus4", "m(maj11)": "mmaj11", "m(maj13)": "mmaj13",
};

export const QUALITY_COUNT = Object.keys(QUALITIES).length;

function pcOf(letter, accidental) {
  let pc = NOTE_PC[letter];
  if (accidental === "#" || accidental === "♯") pc += 1;
  if (accidental === "b" || accidental === "♭") pc -= 1;
  return (pc + 12) % 12;
}

function lookupQuality(q) {
  if (q in QUALITIES) return QUALITIES[q];
  if (q in ALIASES) return QUALITIES[ALIASES[q]];
  const noParens = q.replace(/[(),\s]/g, "");   // "7(b9,#11)" -> "7b9#11"
  if (noParens in QUALITIES) return QUALITIES[noParens];
  if (noParens in ALIASES) return QUALITIES[ALIASES[noParens]];
  return null;
}

/** Parse a chord symbol like "Am", "G#m7", "Bb/D", "C6/9". Returns null when it is not a chord we know. */
export function parseChord(symbol) {
  const s = String(symbol || "").trim();
  // The bass part must be a single note, so "6/9" stays part of the quality.
  const m = s.match(/^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/);
  if (!m) return null;
  const [, letter, acc, quality, bassLetter, bassAcc] = m;
  const intervals = lookupQuality(quality);
  if (!intervals) return null;
  const root = pcOf(letter, acc);
  const bass = bassLetter ? pcOf(bassLetter, bassAcc) : root;
  return { symbol: s, root, bass, intervals };
}

/** Split free text ("Am  G#m, C#m | E") into chord tokens. */
export function splitChords(text) {
  return String(text || "").split(/[\s,|]+/).map((t) => t.trim()).filter(Boolean);
}

export function midiToNote(midi) {
  return SHARP_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Lowest MIDI number with pitch class pc that is >= min. */
function atOrAbove(pc, min) {
  return min + ((pc - min) % 12 + 12) % 12;
}

const pcsOf = (chord) => [...new Set(chord.intervals.map((i) => (chord.root + i) % 12))];

/** Piano: bass note in octave 2, chord tones stacked from around middle C. */
export function pianoVoicing(chord) {
  const bass = atOrAbove(chord.bass, 36);               // C2..B2
  const root = atOrAbove(chord.root, 55);               // G3..F#4
  let ints = chord.intervals;
  // Big chords: leave out the plain fifth so the top stays clear.
  if (ints.length >= 6) ints = ints.filter((i) => i !== 7);
  const upper = ints.map((i) => root + (i > 12 && i - 12 > 4 ? i - 12 : i)); // fold 11ths/13ths down an octave
  return [bass, ...[...new Set(upper)].sort((a, b) => a - b)].map(midiToNote);
}

/** Guitar: open, strummable voicing from E2 up, at most 6 notes, ordered low to high. */
export function guitarVoicing(chord) {
  const iv = (pc) => ((pc - chord.root) % 12 + 12) % 12;
  const pcs = pcsOf(chord);
  const fifth = pcs.find((p) => [6, 7, 8].includes(iv(p)));
  const third = pcs.find((p) => [3, 4].includes(iv(p)));
  // Colour tones in stacking order: 6th/7th first, then 9th, 11th, 13th (by their written interval).
  const written = (p) => Math.min(...chord.intervals.filter((i) => (chord.root + i) % 12 === p));
  const colors = pcs.filter((p) => p !== chord.root && p !== fifth && p !== third).sort((a, b) => written(a) - written(b));
  // Triads keep the root an octave up (barre-chord shape); bigger chords skip the doubled bass.
  let upper = [fifth, chord.root, third, ...colors]
    .filter((p) => p !== undefined && (pcs.length <= 3 ? true : p !== chord.bass));
  if (upper.length > 5) upper = upper.filter((p) => p !== fifth);           // too many tones: drop the fifth
  const notes = [atOrAbove(chord.bass, 40)];                                // E2 or above
  for (const pc of upper) notes.push(atOrAbove(pc, notes[notes.length - 1] + 1));
  // Simple triads and power chords get the doublings of an open-position strum.
  if (pcs.length <= 3) {
    for (const pc of [fifth, chord.root, third]) {
      if (notes.length >= 6 || pc === undefined) continue;
      const n = atOrAbove(pc, notes[notes.length - 1] + 1);
      if (n <= 76) notes.push(n);
    }
  }
  return notes.slice(0, 6).map(midiToNote);
}

/**
 * Synth pad: low, open voicing like Gesture Synth (root around A2, then fifth, octave, third),
 * at most 5 notes so the pad stays clear.
 */
export function padVoicing(chord) {
  const g = guitarVoicing(chord);
  // Triads: bass, fifth, octave, third (exactly the 4-note stack heard in Gesture Synth videos).
  return pcsOf(chord).length <= 3 ? g.slice(0, 4) : g.slice(0, 5);
}

/** Every chord name Petik can build from the picker, for docs and tests. */
export function allChordSymbols() {
  const out = [];
  for (const r of ROOTS) for (const g of QUALITY_GROUPS) for (const q of Object.keys(g.items)) out.push(r + q);
  return out;
}

const SHARP_SPELL = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_SPELL = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Move a chord up or down by `steps` semitones, keeping its quality and slash bass.
 * `flats` picks the spelling (Bb vs A#); by default it follows the chord's own accidental.
 * Text that is not a chord comes back unchanged.
 */
export function transposeChord(symbol, steps, flats) {
  const s = String(symbol || "").trim();
  const m = s.match(/^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/);
  if (!m || !parseChord(s) || !steps) return s;
  const [, letter, acc, quality, bassLetter, bassAcc] = m;
  const useFlats = flats ?? (acc === "b" || acc === "♭");
  const spell = useFlats ? FLAT_SPELL : SHARP_SPELL;
  const move = (pc) => spell[((pc + steps) % 12 + 12) % 12];
  let out = move(pcOf(letter, acc)) + quality;
  if (bassLetter) out += "/" + move(pcOf(bassLetter, bassAcc));
  return out;
}
