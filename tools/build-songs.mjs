// Builds the song pages from data/songs/*.pro:
//   songs/index.json        search index used by the app and the library page
//   lagu/index.html         library with search
//   lagu/<slug>/index.html  one page per song (lyrics with chords, transpose, play in Petik)
//   sitemap.xml, robots.txt
// Run: node tools/build-songs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseChordPro, songChords, unknownChords, lineText } from "../js/chordpro.js";
import { songHTML } from "../js/songview.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://petik-musik.netlify.app";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const songs = [];
for (const f of fs.readdirSync(path.join(ROOT, "data/songs")).filter((f) => f.endsWith(".pro")).sort()) {
  const slug = f.replace(/\.pro$/, "");
  const src = fs.readFileSync(path.join(ROOT, "data/songs", f), "utf8");
  const song = parseChordPro(src);
  const bad = unknownChords(song);
  if (!song.meta.title || !song.meta.artist) throw new Error(`${f}: needs {title:} and {artist:}`);
  if (!song.meta.license) throw new Error(`${f}: needs {license:} (public domain or the permission you got)`);
  if (bad.length) throw new Error(`${f}: chords Petik cannot read: ${bad.join(", ")}`);
  const first = song.lines.find((l) => l.type === "line" && lineText(l));
  songs.push({ slug, song, src, title: song.meta.title, artist: song.meta.artist, key: song.meta.key || "",
    license: song.meta.license, language: song.meta.language || "", chords: songChords(song),
    first: first ? lineText(first) : "" });
}
songs.sort((a, b) => a.title.localeCompare(b.title));

// ---------- shared page pieces ----------
const head = ({ title, description, canonical, depth, extra = "" }) => {
  const up = "../".repeat(depth);
  return `<!doctype html>
<!-- Petik. Copyright (c) 2026 Muhammad Fathoni. All rights reserved. See LICENSE.txt. -->
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta name="theme-color" content="#0d0f14">
  <meta name="author" content="Muhammad Fathoni">
  <link rel="icon" href="${up}assets/icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${up}css/style.css">
  <link rel="stylesheet" href="${up}css/songs.css">
${extra}</head>`;
};

const header = (depth, active) => {
  const up = "../".repeat(depth);
  return `  <header class="top">
    <a class="brand" href="${up}">
      <img src="${up}assets/icon.svg" alt="" width="28" height="28">
      <span class="brand-name">Petik</span>
    </a>
    <nav class="mainnav">
      <a href="${up}"${active === "play" ? ' class="on"' : ""} data-i18n="navPlay">Play</a>
      <a href="${up}lagu/"${active === "songs" ? ' class="on"' : ""} data-i18n="navSongs">Songs</a>
    </nav>
    <div class="lang" role="group" aria-label="Language">
      <button type="button" data-lang="en">EN</button>
      <button type="button" data-lang="id">ID</button>
    </div>
  </header>`;
};

const footer = `  <footer class="foot">
    <div class="foot-contact">
      <span class="foot-label" data-i18n="contactLabel">Problems or ideas? Get in touch:</span>
      <a href="mailto:fathonimuhammad2411@gmail.com?subject=Petik" rel="noopener">fathonimuhammad2411@gmail.com</a>
      <a href="https://github.com/Toni2411" target="_blank" rel="noopener">GitHub</a>
      <a href="https://www.linkedin.com/in/muhammad-fathoni-038274266" target="_blank" rel="noopener">LinkedIn</a>
    </div>
    <div class="foot-legal">
      <span>&copy; 2026 Muhammad Fathoni. <span data-i18n="rights">All rights reserved.</span></span>
    </div>
  </footer>`;

// ---------- song pages ----------
fs.rmSync(path.join(ROOT, "lagu"), { recursive: true, force: true });
for (const s of songs) {
  const dir = path.join(ROOT, "lagu", s.slug);
  fs.mkdirSync(dir, { recursive: true });
  const canonical = `${SITE}/lagu/${s.slug}/`;
  const description = `Chord dan lirik ${s.title} (${s.artist}). Mainkan chord-nya dengan isyarat tangan di Petik, transpose nada, dan rekam videomu.`;
  const ld = { "@context": "https://schema.org", "@type": "MusicComposition", name: s.title, composer: s.artist,
    url: canonical, inLanguage: s.language || undefined };
  const html = `${head({ title: `${s.title} - ${s.artist} | Chord dan lirik | Petik`, description, canonical, depth: 2,
    extra: `  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n` })}
<body class="songpage">
${header(2, "songs")}
  <main class="song-wrap">
    <a class="back" href="../" data-i18n="backToSongs">All songs</a>
    <h1 class="song-title">${esc(s.title)}</h1>
    <p class="song-artist">${esc(s.artist)}</p>
    <div class="song-tools">
      <a class="btn primary" id="playBtn" href="../../?song=${s.slug}" data-i18n="playInPetik">Play in Petik</a>
      <div class="transpose" role="group" aria-label="Transpose">
        <span data-i18n="transpose">Transpose</span>
        <button type="button" class="btn small" id="tDown" aria-label="-1">-</button>
        <b id="tVal">0</b>
        <button type="button" class="btn small" id="tUp" aria-label="+1">+</button>
      </div>
      <span class="song-key"><span data-i18n="keyLabel">Key</span>: <b id="keyVal">${esc(s.key || "-")}</b></span>
    </div>
    <div class="song-chords" id="chordList"></div>
    <article class="sv" id="songBody">
${songHTML(s.song)}
    </article>
    <p class="song-license">${esc(s.license)}. ${esc(s.song.meta.note || "")}.</p>
  </main>
${footer}
  <script type="text/plain" id="songSrc">${s.src.replace(/<\/(script)/gi, "<\\/$1")}</script>
  <script type="module" src="../../js/songpage.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

// ---------- library page ----------
const groups = [
  ["id", "groupIndonesia", "Lagu Indonesia"],
  ["en", "groupWorld", "International"],
];
const cards = (list) => list.map((s) => `      <li data-search="${esc(`${s.title} ${s.artist} ${s.first}`.toLowerCase())}">
        <a href="${s.slug}/"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span><small>${esc(s.chords.slice(0, 6).join("  "))}</small></a>
      </li>`).join("\n");
const library = `${head({ title: "Lagu dan chord | Petik", description: "Pustaka lagu dengan chord dan lirik yang bisa langsung dimainkan dengan isyarat tangan di Petik. Cari berdasarkan judul atau penyanyi.", canonical: `${SITE}/lagu/`, depth: 1 })}
<body class="songpage">
${header(1, "songs")}
  <main class="song-wrap">
    <h1 class="song-title" data-i18n="songsTitle">Songs</h1>
    <p class="song-artist" data-i18n="songsIntro">Lyrics with chords you can play with hand signs. Search by title or artist.</p>
    <input class="lib-search" id="libSearch" type="search" autocomplete="off" data-i18n-ph="searchPh" placeholder="Search title or artist">
    <p class="lib-empty" id="libEmpty" hidden data-i18n="noResults">No songs found.</p>
${groups.map(([lang, key, label]) => {
  const list = songs.filter((s) => (s.language || "id") === lang);
  return list.length ? `    <h2 class="lib-group" data-i18n="${key}">${label}</h2>\n    <ul class="lib-list">\n${cards(list)}\n    </ul>` : "";
}).join("\n")}
    <div class="lib-own">
      <h2 data-i18n="ownSongTitle">Your own song?</h2>
      <p data-i18n="ownSongBody">Paste any lyrics with chords into Petik to play along. It stays on your device.</p>
      <a class="btn" href="../?paste=1" data-i18n="pasteSong">Paste a song</a>
    </div>
  </main>
${footer}
  <script type="module" src="../js/library.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "lagu", "index.html"), library);

// ---------- index, sitemap, robots ----------
fs.mkdirSync(path.join(ROOT, "songs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "songs", "index.json"), JSON.stringify(songs.map((s) => ({
  slug: s.slug, title: s.title, artist: s.artist, key: s.key, chords: s.chords, first: s.first, language: s.language,
}))));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}/lagu/</loc><lastmod>${today}</lastmod></url>
${songs.map((s) => `  <url><loc>${SITE}/lagu/${s.slug}/</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /tests/\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`built ${songs.length} song pages, library, songs/index.json, sitemap.xml`);
