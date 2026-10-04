// Song library page: instant search by title, artist or first lyric line.
import { setLang, detectLang } from "./i18n.js";

const input = document.getElementById("libSearch");
const items = [...document.querySelectorAll(".lib-list li")];
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

function filter() {
  const words = norm(input.value).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const li of items) {
    const hit = words.every((w) => norm(li.dataset.search).includes(w));
    li.hidden = !hit;
    if (hit) shown++;
  }
  for (const ul of document.querySelectorAll(".lib-list")) {
    const any = [...ul.children].some((li) => !li.hidden);
    ul.hidden = !any;
    ul.previousElementSibling.hidden = !any;
  }
  document.getElementById("libEmpty").hidden = shown > 0;
}

input.addEventListener("input", filter);
const q = new URLSearchParams(location.search).get("q");
if (q) { input.value = q; filter(); }
setLang(detectLang());
for (const b of document.querySelectorAll("[data-lang]")) b.onclick = () => setLang(b.dataset.lang);
