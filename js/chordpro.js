// Songs: lyrics with chords. Reads ChordPro ("[C]Rasa sa[G]yange") and the common
// "chords above lyrics" layout used by chord sites, and turns both into one song structure.
// Pure functions, no browser APIs, so they can be tested in Node.
import { parseChord, transposeChord } from "./chords.js";

/**
 * Song structure:
 * { meta: { title, artist, key, license, note, ... },
 *   lines: [ { type: "section", name } | { type: "blank" } |
 *            { type: "line", segs: [ { chord: "C" | null, text: "Rasa sa" }, ... ] } ] }
 */

const DIRECTIVE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i;
const SECTION_START = { start_of_chorus: "Chorus", soc: "Chorus", start_of_verse: "Verse", sov: "Verse",
  start_of_bridge: "Bridge", sob: "Bridge", start_of_intro: "Intro" };
const META_KEYS = { t: "title", title: "title", st: "artist", subtitle: "artist", artist: "artist", key: "key",
  license: "license", note: "note", composer: "composer", lyricist: "lyricist", source: "source", capo: "capo",
  tempo: "tempo", slug: "slug", language: "language", lang: "language" };

/** Parse ChordPro text. */
export function parseChordPro(text) {
  const meta = {};
  const lines = [];
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const d = line.trim().match(DIRECTIVE);
    if (d) {
      const name = d[1].toLowerCase(), value = (d[2] || "").trim();
      if (META_KEYS[name]) meta[META_KEYS[name]] = value;
      else if (SECTION_START[name]) lines.push({ type: "section", name: value || SECTION_START[name] });
      else if (["c", "comment", "ci", "comment_italic"].includes(name)) lines.push({ type: "section", name: value });
      continue;                                   // end_of_* and unknown directives carry no content
    }
    if (!line.trim()) { if (lines.length && lines[lines.length - 1].type !== "blank") lines.push({ type: "blank" }); continue; }
    const segs = [];
    let re = /\[([^\]]+)\]/g, last = 0, chord = null, m;
    while ((m = re.exec(line))) {
      const before = line.slice(last, m.index);
      if (before || chord) segs.push({ chord, text: before });
      chord = m[1].trim();
      last = m.index + m[0].length;
    }
    segs.push({ chord, text: line.slice(last) });
    lines.push({ type: "line", segs: segs.filter((s, i) => s.chord || s.text || i === 0) });
  }
  while (lines.length && lines[lines.length - 1].type === "blank") lines.pop();
  return { meta, lines };
}

/* ---------------- "chords above lyrics" ---------------- */

const SECTION_WORDS = /^(intro|outro|verse|chorus|reff?|refrain|pre[- ]?chorus|bridge|interlude|coda|ending|solo|instrumental|bait|ref|musik|music)\b/i;

const isChordToken = (tok) => !!parseChord(tok.replace(/^\(|\)$/g, "")) ||
  /^(\|+|:?\|:?|\/|-+|x\d+|\d+x|N\.?C\.?|\(|\)|%|\.+)$/i.test(tok);

/** True when every word on the line is a chord (or a bar line, repeat mark and similar). */
export function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.some((t) => parseChord(t.replace(/^\(|\)$/g, ""))) && toks.every(isChordToken);
}

function sectionName(line) {
  const t = line.trim().replace(/^\[|\]$/g, "").replace(/:$/, "").trim();
  if (!t || t.length > 30) return null;
  return SECTION_WORDS.test(t) ? t : null;
}

/** Chords at their columns: [{ col, chord }]. */
function chordsAt(line) {
  const out = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(line))) {
    const tok = m[0].replace(/^\(|\)$/g, "");
    if (parseChord(tok)) out.push({ col: m.index, chord: tok });
  }
  return out;
}

/** Put chords found above a lyric line into it as ChordPro brackets, by column. */
function mergeLine(chordLine, lyric) {
  const cs = chordsAt(chordLine);
  let text = lyric.padEnd(Math.max(lyric.length, cs.length ? cs[cs.length - 1].col : 0), " ");
  for (let i = cs.length - 1; i >= 0; i--) text = text.slice(0, cs[i].col) + `[${cs[i].chord}]` + text.slice(cs[i].col);
  return text.replace(/\s+$/, "");
}

/** Convert a "chords above lyrics" sheet to ChordPro text. */
export function sheetToChordPro(text, meta = {}) {
  const src = String(text || "").replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
  const out = [];
  for (const [k, v] of Object.entries(meta)) if (v) out.push(`{${k}: ${v}}`);
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    // "Intro: C G Am F" or "Reff:" on its own line
    const inline = line.match(/^\s*\[?([A-Za-z][A-Za-z -]{1,20}?)\]?\s*:\s*(.*)$/);
    if (inline && SECTION_WORDS.test(inline[1]) && (!inline[2] || isChordLine(inline[2]))) {
      out.push(`{comment: ${inline[1].trim()}}`);
      if (inline[2]) out.push(chordsAt(inline[2]).map((c) => `[${c.chord}]`).join(" "));
      continue;
    }
    const sec = sectionName(line);
    if (sec && !isChordLine(line)) { out.push(`{comment: ${sec}}`); continue; }
    if (isChordLine(line)) {
      const next = src[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next) && !sectionName(next)) {
        out.push(mergeLine(line, next));
        i++;
      } else {
        out.push(chordsAt(line).map((c) => `[${c.chord}]`).join(" "));   // chords with no lyric below
      }
      continue;
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Read either format. */
export function parseSong(text, meta = {}) {
  const looksChordPro = /\[[A-G][^\]\s]*\][^\s\[]/.test(text) || /^\s*\{[a-z_]+\s*:/im.test(text);
  const song = parseChordPro(looksChordPro ? text : sheetToChordPro(text));
  song.meta = { ...song.meta, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v)) };
  return song;
}

/* ---------------- working with a song ---------------- */

/** Every chord in reading order: [{ chord, line, seg }]. */
export function chordSequence(song) {
  const seq = [];
  song.lines.forEach((l, li) => {
    if (l.type !== "line") return;
    l.segs.forEach((s, si) => { if (s.chord && parseChord(s.chord)) seq.push({ chord: s.chord, line: li, seg: si }); });
  });
  return seq;
}

/** Distinct chords in the order they first appear. */
export function songChords(song) {
  return [...new Set(chordSequence(song).map((c) => c.chord))];
}

/** Chords that Petik cannot read, so the editor can point them out. */
export function unknownChords(song) {
  const bad = new Set();
  for (const l of song.lines) if (l.type === "line") for (const s of l.segs) if (s.chord && !parseChord(s.chord)) bad.add(s.chord);
  return [...bad];
}

/** Keys musicians write with flats: F, Bb, Eb, Ab, Db major and Dm, Gm, Cm, Fm, Bbm, Ebm. */
function keyUsesFlats(key) {
  const k = parseChord(key);
  if (!k) return undefined;
  const minor = k.intervals[1] === 3;
  return minor ? [2, 7, 0, 5, 10, 3].includes(k.root) : [5, 10, 3, 8, 1].includes(k.root);
}

export function transposeSong(song, steps, flats) {
  if (!steps) return song;
  // Spell the new chords the way the new key is usually written (Db, not C#).
  if (flats === undefined) {
    const key = song.meta.key || songChords(song)[0];
    if (key) flats = keyUsesFlats(transposeChord(key, steps, false)) ?? false;
  }
  return {
    meta: { ...song.meta, key: song.meta.key ? transposeChord(song.meta.key, steps, flats) : song.meta.key },
    lines: song.lines.map((l) => l.type !== "line" ? l
      : { ...l, segs: l.segs.map((s) => ({ ...s, chord: s.chord ? transposeChord(s.chord, steps, flats) : s.chord })) }),
  };
}

/** Back to ChordPro text. */
export function toChordPro(song) {
  const out = [];
  for (const [k, v] of Object.entries(song.meta)) if (v) out.push(`{${k}: ${v}}`);
  if (out.length) out.push("");
  for (const l of song.lines) {
    if (l.type === "blank") out.push("");
    else if (l.type === "section") out.push(`{comment: ${l.name}}`);
    else out.push(l.segs.map((s) => (s.chord ? `[${s.chord}]` : "") + s.text).join(""));
  }
  return out.join("\n") + "\n";
}

/** Plain lyric of one line (no chords). */
export const lineText = (l) => (l.type === "line" ? l.segs.map((s) => s.text).join("").replace(/\s+/g, " ").trim() : "");

/** URL-friendly name: "Rasa Sayange" by "Lagu daerah Maluku" -> "rasa-sayange". */
export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
