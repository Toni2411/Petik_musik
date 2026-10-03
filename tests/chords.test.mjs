import assert from "node:assert/strict";
import { parseChord, splitChords, pianoVoicing, guitarVoicing, allChordSymbols, QUALITY_COUNT, ROOTS } from "../js/chords.js";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pcSet = (notes) => new Set(notes.map((n) => n.replace(/-?\d+$/, "")));
const midi = (n) => { const m = n.match(/^([A-G]#?)(-?\d+)$/); return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1); };

// Parsing
assert.deepEqual(splitChords("Am  G#m, C#m | E"), ["Am", "G#m", "C#m", "E"]);
assert.equal(parseChord("Am").root, 9);
assert.deepEqual(parseChord("Am").intervals, [0, 3, 7]);
assert.equal(parseChord("Bb").root, 10);
assert.equal(parseChord("G#m7").root, 8);
assert.equal(parseChord("C/G").bass, 7);
assert.deepEqual(parseChord("C6/9").intervals, [0, 4, 7, 9, 14]);
assert.equal(parseChord("C6/9").bass, 0);
assert.equal(parseChord("Cm6/9/G").bass, 7);
for (const [a, b] of [["CM7", "Cmaj7"], ["C-7", "Cm7"], ["Cø", "Cm7b5"], ["C°7", "Cdim7"], ["Cm(maj7)", "Cmmaj7"],
  ["C7(b9)", "C7b9"], ["Csus", "Csus4"], ["C+", "Caug"], ["CΔ7", "Cmaj7"], ["Cmin", "Cm"],
  ["C7(b9,#11)", "C7b9#11"], ["C9#5", "Caug9"], ["Cm(maj9)", "Cmmaj9"], ["C6add9", "C6/9"], ["Csus24", "Csus2sus4"], ["Calt", "C7alt"]]) {
  assert.deepEqual(parseChord(a).intervals, parseChord(b).intervals, `${a} == ${b}`);
}
assert.equal(parseChord("Hm"), null);
// Names that could be misread: C#5 is a C# power chord, Cb5 a Cb power chord, C(b5) is C with a flat fifth.
assert.deepEqual([parseChord("C#5").root, parseChord("C#5").intervals], [1, [0, 7]]);
assert.deepEqual([parseChord("Cb5").root, parseChord("Cb5").intervals], [11, [0, 7]]);
assert.deepEqual([parseChord("C(b5)").root, parseChord("C(b5)").intervals], [0, [0, 4, 6]]);
// Every picker name must read back as the root it was built from.
{ const R = { C: 0, "C#": 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  for (const sym of allChordSymbols()) {
    const root = sym.match(/^[A-G][#b]?/)[0];
    assert.equal(parseChord(sym).root, R[root], `${sym} reads back with the wrong root`);
  } }
assert.equal(parseChord("Cxyz"), null);

// Every chord the picker can make must voice correctly on both instruments.
const all = allChordSymbols();
assert.equal(all.length, ROOTS.length * QUALITY_COUNT);
for (const sym of [...all, "D/F#", "G/B", "Am/G", "Fmaj7/A", "C13/E", "G7b9/B"]) {
  const ch = parseChord(sym);
  assert.ok(ch, `parse ${sym}`);
  const want = new Set(ch.intervals.map((i) => NAMES[(ch.root + i) % 12]));
  const fifth = NAMES[(ch.root + 7) % 12];
  for (const [inst, notes] of [["piano", pianoVoicing(ch)], ["guitar", guitarVoicing(ch)]]) {
    const have = pcSet(notes);
    for (const n of want) if (n !== fifth) assert.ok(have.has(n), `${sym} ${inst} missing ${n}: ${notes}`);
    assert.equal(notes[0].replace(/-?\d+$/, ""), NAMES[ch.bass], `${sym} ${inst} bass: ${notes}`);
    const ms = notes.map(midi);
    assert.ok(ms.every((m, i) => i === 0 || m > ms[i - 1]), `${sym} ${inst} not ascending: ${notes}`);
    if (inst === "guitar") {
      assert.ok(notes.length <= 6 && ms[0] >= 40, `${sym} guitar range: ${notes}`);
      assert.ok(ms[ms.length - 1] <= 84, `${sym} guitar too high: ${notes}`);
    }
  }
}
for (const sym of ["C", "Am", "G7", "Cmaj7", "Dm9", "G13", "C6/9", "E7#9", "D/F#"]) {
  const ch = parseChord(sym);
  console.log(sym.padEnd(6), "piano", pianoVoicing(ch).join(" ").padEnd(26), "guitar", guitarVoicing(ch).join(" "));
}
console.log(`chords: ${QUALITY_COUNT} qualities x ${ROOTS.length} roots = ${all.length} chords, all tests passed`);
