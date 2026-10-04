// Renders a song (from chordpro.js) as HTML: chords sit above the syllable they belong to.
// Returns a string so the same code builds static song pages in Node and live views in the browser.
import { parseChord } from "./chords.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Each chord gets data-i = its position in chordSequence(song), so the player can highlight
 * the chord being played and the one coming next.
 */
export function songHTML(song) {
  let i = 0;
  const out = [];
  for (const l of song.lines) {
    if (l.type === "blank") { out.push('<div class="sv-gap"></div>'); continue; }
    if (l.type === "section") { out.push(`<div class="sv-sec">${esc(l.name)}</div>`); continue; }
    const hasText = l.segs.some((s) => s.text.trim());
    const parts = l.segs.map((s) => {
      let chord = "";
      if (s.chord) {
        const ok = !!parseChord(s.chord);
        chord = ok ? `<b class="sv-ch" data-i="${i++}">${esc(s.chord)}</b>` : `<b class="sv-ch sv-bad">${esc(s.chord)}</b>`;
      }
      // Keep spaces visible so words do not glue together under wide chords.
      const text = esc(s.text).replace(/ /g, "&nbsp;") || (s.chord && hasText ? "&nbsp;" : "");
      return `<span class="sv-seg">${chord || (hasText ? '<b class="sv-ch sv-empty"></b>' : "")}<span class="sv-tx">${text}</span></span>`;
    });
    out.push(`<div class="sv-line${hasText ? "" : " sv-chords-only"}">${parts.join("")}</div>`);
  }
  return out.join("\n");
}
