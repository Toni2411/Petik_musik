// Song page: transpose, chord list with hand signs, language switch, "Play in Petik" link.
import { parseChordPro, transposeSong, songChords } from "./chordpro.js";
import { songHTML } from "./songview.js";
import { DEFAULT_SIGNS, EMOJI } from "./gestures.js";
import { handSVG } from "./handicon.js";
import { setLang, detectLang, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const original = parseChordPro($("songSrc").textContent);
const slug = location.pathname.split("/").filter(Boolean).pop();
let steps = 0;

function signHTML(sign) {
  return ["L", "R"].map((side) => {
    const p = sign?.[side];
    const emoji = p && EMOJI[p] ? `<span class="emoji">${EMOJI[p]}</span>` : "";
    return `<span class="hand-wrap${p ? "" : " off"}">${handSVG(p || "00000", side, { size: 22, label: side === "L" ? t("sideL") : t("sideR") })}${emoji}</span>`;
  }).join("");
}

function render() {
  const song = transposeSong(original, steps);
  $("songBody").innerHTML = songHTML(song);
  $("tVal").textContent = steps > 0 ? `+${steps}` : String(steps);
  $("keyVal").textContent = song.meta.key || "-";
  $("chordList").innerHTML = songChords(song).slice(0, DEFAULT_SIGNS.length).map((c, i) =>
    `<span class="chip-sign"><b>${c}</b><span class="sign">${signHTML(DEFAULT_SIGNS[i])}</span></span>`).join("");
  $("playBtn").href = `../../?song=${slug}${steps ? `&t=${steps}` : ""}`;
}

// -11 .. +11 semitones; one more step wraps back to the original key.
$("tUp").onclick = () => { steps = steps >= 11 ? 0 : steps + 1; render(); };
$("tDown").onclick = () => { steps = steps <= -11 ? 0 : steps - 1; render(); };

setLang(detectLang());
for (const b of document.querySelectorAll("[data-lang]")) b.onclick = () => { setLang(b.dataset.lang); render(); };
render();
