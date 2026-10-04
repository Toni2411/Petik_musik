// Add a song to the library from a chord sheet (chords above lyrics) or a ChordPro file.
//
//   node tools/add-song.mjs song.txt --title "Judul" --artist "Penyanyi" --license "Permission from <rights holder>, <date>"
//
// --license is required: write "Public domain: ..." or who gave permission and when.
// Then run: node tools/build-songs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong, sheetToChordPro, songChords, unknownChords, slugify } from "../js/chordpro.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const title = opt("title"), artist = opt("artist"), license = opt("license"), key = opt("key"), language = opt("language") || "id";

if (!file || !title || !artist || !license) {
  console.error('Usage: node tools/add-song.mjs <file> --title "..." --artist "..." --license "..." [--key C] [--language id|en]');
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
const isPro = /\[[A-G][^\]\s]*\]/.test(raw) || /^\s*\{[a-z_]+\s*:/im.test(raw);
const body = (isPro ? raw : sheetToChordPro(raw)).replace(/^\s*\{(title|t|artist|subtitle|st|license|key|language)\s*:.*\}\s*$/gim, "").trim();
const song = parseSong(body);
const chords = songChords(song);
if (!chords.length) { console.error("No chords found in the file."); process.exit(1); }
const bad = unknownChords(song);
if (bad.length) { console.error("Chords Petik cannot read:", bad.join(", "), "\nFix them in the file and run again."); process.exit(1); }

const slug = opt("slug") || slugify(`${title} ${artist}`);
const out = path.join(ROOT, "data/songs", `${slug}.pro`);
const header = [`{title: ${title}}`, `{artist: ${artist}}`, `{key: ${key || chords[0]}}`, `{license: ${license}}`, `{language: ${language}}`].join("\n");
fs.writeFileSync(out, `${header}\n\n${body}\n`);
console.log(`saved ${path.relative(ROOT, out)} with chords: ${chords.join(" ")}`);
console.log("now run: node tools/build-songs.mjs");
