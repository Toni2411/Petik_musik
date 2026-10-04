import assert from "node:assert/strict";
import { parseChordPro, sheetToChordPro, parseSong, chordSequence, songChords, transposeSong, toChordPro,
  isChordLine, lineText, slugify, unknownChords } from "../js/chordpro.js";

// ChordPro
const cp = parseChordPro(`{title: Test Song}
{artist: Nobody}
{key: C}

{comment: Verse}
[C]Rasa sa[G]yange
[Am]  [F]
{soc}
Plain line no chords
{eoc}`);
assert.equal(cp.meta.title, "Test Song");
assert.equal(cp.meta.artist, "Nobody");
assert.deepEqual(cp.lines[0], { type: "section", name: "Verse" });
assert.deepEqual(cp.lines[1].segs, [{ chord: "C", text: "Rasa sa" }, { chord: "G", text: "yange" }]);
assert.deepEqual(songChords(cp), ["C", "G", "Am", "F"]);
assert.equal(chordSequence(cp).length, 4);
assert.equal(lineText(cp.lines[1]), "Rasa sayange");
assert.equal(cp.lines[3].name, "Chorus");

// Chord lines
assert.ok(isChordLine("C    G    Am   F"));
assert.ok(isChordLine("| C . . . | G7 | x2"));
assert.ok(!isChordLine("A day in the life"));           // "A" is a chord, "day" is not
assert.ok(!isChordLine("Am I the one"));

// "Chords above lyrics" sheet (lyrics written for this test)
const sheet = `Intro: C G Am F

[Verse 1]
C             G
Morning light on the river
Am              F
slowly walking back home
Reff:
F    G       C
sing it once again
`;
const pro = sheetToChordPro(sheet, { title: "Morning", artist: "Test" });
const song = parseChordPro(pro);
assert.equal(song.meta.title, "Morning");
const verse = song.lines.find((l) => l.type === "line" && lineText(l).startsWith("Morning"));
assert.deepEqual(verse.segs.map((s) => s.chord), ["C", "G"]);
assert.equal(verse.segs[1].text.trim().startsWith("on"), true, "G lands above 'on': " + JSON.stringify(verse.segs));
assert.deepEqual(songChords(song), ["C", "G", "Am", "F"]);
assert.ok(song.lines.some((l) => l.type === "section" && /Verse 1/.test(l.name)));
assert.ok(song.lines.some((l) => l.type === "section" && /Reff/.test(l.name)));
assert.ok(song.lines.some((l) => l.type === "section" && /Intro/.test(l.name)));

// parseSong picks the format by itself
assert.deepEqual(songChords(parseSong(sheet)), ["C", "G", "Am", "F"]);
assert.deepEqual(songChords(parseSong("[D]one [A]two")), ["D", "A"]);

// Transpose and round trip
const up = transposeSong(cp, 2);
assert.deepEqual(songChords(up), ["D", "A", "Bm", "G"]);
assert.equal(up.meta.key, "D");
assert.deepEqual(songChords(parseChordPro(toChordPro(cp))), songChords(cp));

assert.deepEqual(songChords(transposeSong(cp, 1)), ["Db", "Ab", "Bbm", "Gb"]);   // C up 1 -> Db major, flats
assert.deepEqual(songChords(transposeSong(cp, -1)), ["B", "F#", "G#m", "E"]);    // C down 1 -> B major, sharps
assert.equal(slugify("Ibu Kita Kartini"), "ibu-kita-kartini");
assert.equal(slugify("Lir-Ilir (Jawa)"), "lir-ilir-jawa");
assert.deepEqual(unknownChords(parseChordPro("[Xyz]bad [C]good")), ["Xyz"]);
console.log("chordpro: all tests passed");
