// Petik. Copyright (c) 2026 Muhammad Fathoni. All rights reserved. See LICENSE.txt.
import { FilesetResolver, HandLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";
import { parseChord, splitChords, ROOTS, QUALITY_GROUPS, QUALITY_COUNT } from "./chords.js";
import { describeFrame, classify, ChordDecider, HandTracker, matchSign, isFist, shapeOf, countUp,
  DEFAULT_SIGNS, MAX_SIGNS, EMOJI, signKey } from "./gestures.js";
import { handSVG } from "./handicon.js";
import { Sound } from "./sound.js";
import { Recorder, recordingSupported } from "./recorder.js";
import { PRESETS, GENRES } from "./presets.js";
import { t, setLang, detectLang } from "./i18n.js";

const Tone = window.Tone;
// Low latency audio: Tone schedules 100 ms ahead by default, which is a delay you can hear when
// switching chords. Live playing needs notes now.
Tone.setContext(new Tone.Context({ latencyHint: "interactive", lookAhead: 0 }));
const $ = (id) => document.getElementById(id);
const COUNT_MAX = 10;
const SAMPLES_PER_GESTURE = 30;
const FINGER_KEYS = ["thumb", "index", "middle", "ring", "pinky"];
const QUICK = ["01000", "01100", "01110", "01111", "11111", "11001", "01001", "10001", "10000", "11000", "00001"];

/* ---------------- state ---------------- */

const DEFAULT = { title: "", chords: "C G Am F", mode: "signs", instrument: "piano", volume: 0, reverb: 0.18,
  rhythm: "off", bpm: 80, gestures: {}, shapes: {}, signs: {}, withMic: true, handTone: true, response: "balanced" };

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const state = { ...DEFAULT, ...loadJSON("petik.current", {}) };
if (!["signs", "count", "custom"].includes(state.mode)) state.mode = "signs";
// Players who picked the old guitar get the cleaner acoustic guitar by default.
if (state.instrument === "guitar" && !state.instrumentV2) { state.instrument = "steel"; }
state.instrumentV2 = true;
const persist = () => saveJSON("petik.current", state);

// A shared link (#s=...) overrides the song part of the state. Signs travel with it; recorded poses do not.
(function readShareLink() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  try {
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))));
    const s = JSON.parse(json);
    if (typeof s.c === "string") {
      Object.assign(state, {
        title: String(s.t || "").slice(0, 60), chords: s.c.slice(0, 400),
        mode: ["signs", "count", "custom"].includes(s.m) ? s.m : "signs",
        instrument: ["piano", "steel", "nylon", "guitar", "pad", "soft"].includes(s.i) ? s.i : "piano",
        signs: s.s && typeof s.s === "object" ? s.s : {}, gestures: {}, shapes: {},
      });
    }
  } catch {}
  history.replaceState(null, "", location.pathname);
})();

const maxChords = () => (state.mode === "count" ? COUNT_MAX : MAX_SIGNS);
const allChords = () => splitChords(state.chords).slice(0, MAX_SIGNS);
const chordList = () => allChords().slice(0, maxChords());
const signOf = (i) => state.signs[i] || DEFAULT_SIGNS[i] || { L: null, R: null };
const signList = () => chordList().map((_, i) => signOf(i));

/* ---------------- small ui helpers ---------------- */

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Icons for one sign: left hand drawing, right hand drawing, emoji where one exists. */
function signHTML(sign, size = 30) {
  if (!sign) return "";
  const parts = [];
  for (const side of ["L", "R"]) {
    const p = sign[side];
    const name = side === "L" ? t("handL") : t("handR");
    const cls = p ? "hand-wrap" : "hand-wrap off";
    const emoji = p && EMOJI[p] ? `<span class="emoji">${EMOJI[p]}</span>` : "";
    parts.push(`<span class="${cls}" title="${name}">${handSVG(p || "00000", side,
      { size, label: side === "L" ? t("sideL") : t("sideR") })}${emoji}</span>`);
  }
  return `<span class="sign">${parts.join("")}</span>`;
}

function slotVisual(i) {
  if (state.mode === "count") {
    const n = i + 1;
    return `<span class="count">${n} ${n === 1 ? t("finger") : t("fingers")}</span>`;
  }
  if (state.mode === "signs") return signHTML(signOf(i), 28);
  const shape = state.shapes[i];
  return shape ? signHTML(shape, 28) : `<span class="count">${t("notLearned")}</span>`;
}

/* ---------------- rendering ---------------- */

function renderStrip() {
  const strip = $("strip");
  strip.innerHTML = "";
  chordList().forEach((sym, i) => {
    const li = el("li");
    li.dataset.slot = i;
    if (!parseChord(sym)) li.classList.add("bad");
    li.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span><span class="key">${slotVisual(i)}</span>`;
    li.querySelector(".name").textContent = sym;
    strip.appendChild(li);
  });
  highlight(activeSlot);
}

function renderChips() {
  const box = $("chordChips");
  box.innerHTML = "";
  allChords().forEach((sym, i) => {
    const c = el("span", "chip" + (parseChord(sym) ? "" : " bad"));
    c.append(el("span", "", sym));
    if (!parseChord(sym)) c.title = t("unknownChord");
    const x = el("button", "chip-x", "x");
    x.type = "button";
    x.setAttribute("aria-label", `${t("removeChord")} ${sym}`);
    x.onclick = () => removeChordAt(i);
    c.append(x);
    box.appendChild(c);
  });
}

function removeChordAt(i) {
  const list = allChords();
  list.splice(i, 1);
  // Shift per-slot settings so each chord keeps its own sign and recorded pose.
  for (const key of ["signs", "gestures", "shapes"]) {
    const next = {};
    for (const [k, v] of Object.entries(state[key])) {
      const n = Number(k);
      if (n < i) next[n] = v; else if (n > i) next[n - 1] = v;
    }
    state[key] = next;
  }
  state.chords = list.join(" ");
  $("chords").value = state.chords;
  songChanged();
}

function addChord(sym) {
  const list = allChords();
  if (list.length >= MAX_SIGNS) return;
  list.push(sym);
  state.chords = list.join(" ");
  $("chords").value = state.chords;
  songChanged();
  preview(sym);
}

let pickRoot = "C";
function renderPicker() {
  $("chordCount").textContent = t("chordCount", { n: (QUALITY_COUNT * ROOTS.length).toLocaleString() });
  const roots = $("roots");
  roots.innerHTML = "";
  for (const r of ROOTS) {
    const b = el("button", "root" + (r === pickRoot ? " on" : ""), r);
    b.type = "button";
    b.onclick = () => { pickRoot = r; renderPicker(); };
    roots.appendChild(b);
  }
  const bassSel = $("bassSel");
  const keep = bassSel.value;
  bassSel.innerHTML = "";
  bassSel.append(new Option(t("noBass"), ""));
  for (const r of ROOTS) bassSel.append(new Option(`/${r}`, r));
  bassSel.value = keep || "";
  const q = $("qualities");
  q.innerHTML = "";
  for (const g of QUALITY_GROUPS) {
    q.append(el("div", "picker-label", t(`g_${g.id}`)));
    const row = el("div", "quals");
    for (const suffix of Object.keys(g.items)) {
      const bass = bassSel.value;
      const sym = pickRoot + suffix + (bass && bass !== pickRoot ? `/${bass}` : "");
      const b = el("button", "qual", sym);
      b.type = "button";
      b.onclick = () => addChord(sym);
      row.appendChild(b);
    }
    q.appendChild(row);
  }
}

let genre = "all";
function renderPresets() {
  const gbox = $("genres");
  gbox.innerHTML = "";
  for (const g of ["all", ...GENRES]) {
    const b = el("button", "genre" + (g === genre ? " on" : ""), t(`genre_${g}`));
    b.type = "button";
    b.onclick = () => { genre = g; renderPresets(); };
    gbox.appendChild(b);
  }
  const box = $("presets");
  box.innerHTML = "";
  for (const p of PRESETS.filter((x) => genre === "all" || x.g === genre)) {
    const b = el("button");
    b.type = "button";
    b.append(el("b", "", p.name), el("span", "", p.chords));
    b.onclick = () => {
      Object.assign(state, { chords: p.chords, title: p.name, gestures: {}, shapes: {}, signs: {} });
      $("chords").value = state.chords; $("title").value = state.title;
      songChanged();
    };
    box.appendChild(b);
  }
}

function renderSongs() {
  const songs = loadJSON("petik.songs", []);
  const ul = $("songs");
  ul.innerHTML = "";
  if (!songs.length) { ul.append(el("li", "empty", t("noSongs"))); return; }
  for (const s of songs) {
    const li = el("li");
    const grow = el("div", "grow");
    grow.append(el("div", "t", s.title || t("songTitlePh")), el("div", "sub", s.chords));
    const open = el("button", "btn small", t("load")); open.type = "button";
    const del = el("button", "btn small ghost danger", t("del")); del.type = "button";
    open.onclick = () => {
      Object.assign(state, { title: s.title, chords: s.chords, mode: s.mode || "signs",
        gestures: s.gestures || {}, shapes: s.shapes || {}, signs: s.signs || {} });
      syncInputs(); songChanged();
    };
    del.onclick = () => { saveJSON("petik.songs", loadJSON("petik.songs", []).filter((x) => x.id !== s.id)); renderSongs(); };
    li.append(grow, open, del);
    ul.appendChild(li);
  }
}

function duplicateSigns() {
  const seen = {}, dup = new Set();
  signList().forEach((s, i) => {
    const k = signKey(s);
    if (k in seen) { dup.add(i); dup.add(seen[k]); } else seen[k] = i;
  });
  return dup;
}

function renderGestures() {
  const helpKey = { count: "modeCountHelp", signs: "modeSignsHelp", custom: "modeCustomHelp" }[state.mode];
  $("modeHelp").textContent = t(helpKey, { n: MAX_SIGNS });
  const warn = $("modeWarn");
  warn.hidden = !(state.mode === "count" && allChords().length > COUNT_MAX);
  warn.textContent = t("tooManyForCount");
  const dups = state.mode === "signs" ? duplicateSigns() : new Set();
  const ul = $("gestureList");
  ul.innerHTML = "";
  chordList().forEach((sym, i) => {
    const li = el("li");
    li.append(el("span", "num", String(i + 1)), el("span", "name", sym));
    const vis = el("div", "grow");
    vis.innerHTML = slotVisual(i);
    if (dups.has(i)) vis.append(el("div", "sub warn-text", t("sameAs")));
    li.append(vis);
    if (state.mode === "signs") {
      const b = el("button", "btn small", t("edit")); b.type = "button";
      b.onclick = () => openSignEditor(i);
      li.append(b);
    } else if (state.mode === "custom") {
      const n = state.gestures[i]?.length || 0;
      const rec = el("button", "btn small", n ? t("rerecord") : t("recordGesture")); rec.type = "button";
      rec.onclick = () => learnGesture(i);
      li.append(rec);
      if (n) {
        const clr = el("button", "btn small ghost danger", t("clear")); clr.type = "button";
        clr.onclick = () => { delete state.gestures[i]; delete state.shapes[i]; persist(); renderGestures(); renderStrip(); };
        li.append(clr);
      }
    }
    ul.appendChild(li);
  });
}

function syncInputs() {
  $("title").value = state.title;
  $("chords").value = state.chords;
  document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
  document.querySelector(`input[name="instrument"][value="${state.instrument}"]`).checked = true;
  document.querySelector(`input[name="rhythm"][value="${state.rhythm}"]`).checked = true;
  $("volume").value = state.volume; $("reverb").value = state.reverb; $("bpm").value = state.bpm;
  $("bpmVal").textContent = state.bpm;
  $("withMic").checked = state.withMic !== false;
  $("handTone").checked = state.handTone !== false;
  const resp = document.querySelector(`input[name="response"][value="${state.response || "balanced"}"]`);
  if (resp) resp.checked = true;
}

function renderAll() {
  renderChips(); renderStrip(); renderGestures(); renderSongs(); renderPresets(); renderPicker(); renderRecBar();
}

function songChanged() {
  persist();
  stab.reset(); smoother.reset(); activeSlot = null; sound?.stop(); showChord(null);
  renderChips(); renderStrip(); renderGestures();
}

/* ---------------- sign editor ---------------- */

let editing = null; // { slot, sign }
function openSignEditor(slot) {
  editing = { slot, sign: { ...signOf(slot) } };
  $("signChord").textContent = chordList()[slot];
  drawSignEditor();
  $("signDialog").showModal();
}

function drawSignEditor() {
  const { sign, slot } = editing;
  for (const col of document.querySelectorAll(".sign-col")) {
    const side = col.dataset.side;
    const p = sign[side];
    col.innerHTML = "";
    col.append(el("h3", "", side === "L" ? t("handL") : t("handR")));
    const big = el("div", "big-hand" + (p ? "" : " off"));
    big.innerHTML = handSVG(p || "00000", side, { size: 72, label: side === "L" ? t("sideL") : t("sideR") }) +
      (p && EMOJI[p] ? `<span class="emoji big">${EMOJI[p]}</span>` : "");
    col.append(big);
    const use = el("label", "check");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!p;
    cb.onchange = () => { sign[side] = cb.checked ? (sign[side] || "01000") : null; drawSignEditor(); };
    use.append(cb, el("span", "", t("useHand")));
    col.append(use);
    if (!p) { col.append(el("p", "help", t("handDown"))); continue; }
    const fingers = el("div", "fingers");
    FINGER_KEYS.forEach((k, i) => {
      const b = el("button", "finger" + (p[i] === "1" ? " on" : ""), t(k));
      b.type = "button";
      b.onclick = () => {
        const arr = [...sign[side]]; arr[i] = arr[i] === "1" ? "0" : "1";
        sign[side] = arr.join("") === "00000" ? null : arr.join("");
        drawSignEditor();
      };
      fingers.append(b);
    });
    col.append(fingers);
    col.append(el("div", "picker-label", t("quickSigns")));
    const quick = el("div", "quick");
    for (const q of QUICK) {
      const b = el("button", "quick-btn" + (q === p ? " on" : ""));
      b.type = "button";
      b.title = q;
      b.innerHTML = EMOJI[q] ? `<span class="emoji">${EMOJI[q]}</span>` : handSVG(q, side, { size: 22, label: "" });
      b.onclick = () => { sign[side] = q; drawSignEditor(); };
      quick.append(b);
    }
    col.append(quick);
  }
  // Warn about a sign another chord already uses.
  const key = signKey(sign);
  const other = signList().findIndex((s, i) => i !== slot && signKey(s) === key);
  const w = $("signWarn");
  if (!sign.L && !sign.R) { w.textContent = t("needOneHand"); w.hidden = false; }
  else if (other >= 0) { w.textContent = `${t("sameAs")} ${chordList()[other]} (${other + 1})`; w.hidden = false; }
  else w.hidden = true;
  $("signSave").disabled = !sign.L && !sign.R;
}

/* ---------------- playing ---------------- */

let sound = null;
let activeSlot = null;
// Accepts a new chord once the pose has settled; see ChordDecider for why.
const RESPONSE = {
  fast: { holdMs: 60, presenceMs: 110, speed: 4 },
  balanced: { holdMs: 90, presenceMs: 160, speed: 3 },
  accurate: { holdMs: 150, presenceMs: 240, speed: 2.4 },
};
const decider = new ChordDecider(RESPONSE[state.response] || RESPONSE.balanced);
const stab = { reset: () => decider.reset() };
const HANDS_GONE_FRAMES = 6;   // about 0.1 to 0.2 s depending on frame rate
let noHandFrames = 0;
const smoother = new HandTracker(0.35);   // per-finger hysteresis

async function ensureSound() {
  if (sound) return sound;
  await Tone.start();
  sound = new Sound();
  sound.setVolume(Number(state.volume)); sound.setReverb(Number(state.reverb));
  await sound.use(state.instrument);
  setupRhythm();
  return sound;
}

async function preview(sym) {
  try { const s = await ensureSound(); s.play(sym, { velocity: 0.6 }); } catch {}
}

function highlight(slot) {
  for (const li of $("strip").children) li.classList.toggle("on", Number(li.dataset.slot) === slot);
  const on = $("strip").querySelector("li.on");
  on?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function showChord(slot) {
  const list = chordList();
  const now = $("chordNow");
  now.textContent = slot === null ? "" : list[slot] || "";
  const next = $("chordNext");
  if (slot !== null && list[slot + 1]) {
    next.innerHTML = `<span>${t("next")}: <b></b></span>${state.mode === "count" ? "" : slotVisual(slot + 1)}`;
    next.querySelector("b").textContent = list[slot + 1];
  } else next.innerHTML = "";
  now.classList.remove("pop"); void now.offsetWidth; if (slot !== null) now.classList.add("pop");
  highlight(slot);
}

function setSlot(slot) {
  if (slot === "stop") { activeSlot = null; sound.stop(); showChord(null); return; }
  const sym = chordList()[slot];
  if (!sym || !parseChord(sym)) return;
  activeSlot = slot;
  sound.play(sym);
  showChord(slot);
}

/** Live drawing of what the camera reads right now, so players can check their fingers. */
function liveHands(frame) {
  return signHTML({ L: frame.Lp, R: frame.Rp }, 26);
}

function decide(frame) {
  const list = chordList();
  if (frame.count === 0) {
    // Sound only while hands are seen. A short grace period covers a frame or two of lost tracking.
    $("status").textContent = t("showHands");
    if (++noHandFrames >= HANDS_GONE_FRAMES && activeSlot !== null) { setSlot("stop"); stab.reset(); }
    return;
  }
  noHandFrames = 0;
  let cand = null;
  if (isFist(frame)) cand = "stop";
  else if (state.mode === "count") {
    const n = frame.fingers;
    cand = n === 0 ? "stop" : n <= list.length ? n - 1 : null;
  } else if (state.mode === "signs") {
    cand = matchSign(frame, signList(), activeSlot);
  } else {
    const r = classify(frame, state.gestures);
    cand = r ? r.slot : null;
  }
  const count = `${frame.fingers} ${frame.fingers === 1 ? t("finger") : t("fingers")}`;
  $("status").innerHTML = `${liveHands(frame)}<span class="status-text">${state.mode === "count" ? `${count}  |  ` : ""}${t("fist")}</span>`;
  const current = activeSlot === null ? "stop" : activeSlot;
  const next = decider.push(frame, cand, current);
  if (next !== undefined) setSlot(next);
}

/* ---------------- camera + tracking ---------------- */

let landmarker = null;
let lastVideoTime = -1;
let lastResult = null;
let capture = null;
const video = $("cam");
const canvas = $("overlay");
const g2d = canvas.getContext("2d");

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(new URL("../vendor/mediapipe/wasm", import.meta.url).href);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: new URL("../models/hand_landmarker.task", import.meta.url).href, delegate },
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { return await HandLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { return await HandLandmarker.createFromOptions(fileset, opts("CPU")); }
}

async function start() {
  const btn = $("startBtn");
  btn.disabled = true; btn.textContent = t("starting");
  $("introError").hidden = true;
  try {
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 },
        frameRate: { ideal: 60 } }, audio: false }),
      ensureSound(),
    ]);
    video.srcObject = stream;
    await video.play();
    landmarker = await createLandmarker();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $("intro").hidden = true;
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e);
    const msg = e?.name === "NotAllowedError" ? t("camDenied") : e?.name === "NotFoundError" ? t("noCamera") : t("loadFail");
    $("introError").textContent = msg; $("introError").hidden = false;
    btn.disabled = false; btn.textContent = t("start");
  }
}

function drawHands(result, sides = []) {
  g2d.clearRect(0, 0, canvas.width, canvas.height);
  if (!result?.landmarks) return;
  const W = canvas.width, H = canvas.height;
  g2d.lineWidth = Math.max(2, W / 400);
  g2d.strokeStyle = "rgba(92, 225, 198, 0.85)";
  g2d.fillStyle = "#ffc45c";
  for (const lm of result.landmarks) {
    for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
      g2d.beginPath();
      g2d.moveTo(lm[start].x * W, lm[start].y * H);
      g2d.lineTo(lm[end].x * W, lm[end].y * H);
      g2d.stroke();
    }
    for (const p of lm) { g2d.beginPath(); g2d.arc(p.x * W, p.y * H, Math.max(3, W / 300), 0, Math.PI * 2); g2d.fill(); }
  }
  // Left / right label under each wrist. The canvas is mirrored by CSS, so flip the text back.
  result.landmarks.forEach((lm, i) => {
    const side = sides[i];
    if (!side) return;
    const label = side === "L" ? t("handL") : t("handR");
    const x = lm[0].x * W, y = Math.min(H - 20, lm[0].y * H + W / 28);
    const fs = Math.max(14, W / 48);
    g2d.save();
    g2d.translate(x, y); g2d.scale(-1, 1);
    g2d.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    const tw = g2d.measureText(label).width;
    g2d.fillStyle = "rgba(13, 15, 20, 0.78)";
    g2d.beginPath(); g2d.roundRect(-tw / 2 - fs * 0.6, -fs * 0.85, tw + fs * 1.2, fs * 1.6, fs * 0.8); g2d.fill();
    g2d.fillStyle = side === "L" ? "#5ce1c6" : "#ffc45c";
    g2d.textAlign = "center"; g2d.textBaseline = "middle";
    g2d.fillText(label, 0, 0);
    g2d.restore();
  });
}

function loop() {
  requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2) return;
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const tDetect = performance.now();
    lastResult = landmarker.detectForVideo(video, tDetect);
    perf.note(tDetect, performance.now() - tDetect);
    const raw = describeFrame(lastResult);
    drawHands(lastResult, raw.sides);
    const frame = smoother.push(raw);
    if (state.handTone && sound && lastResult.landmarks?.length) {
      // Highest wrist on screen: y = 0 at the top of the frame.
      const y = Math.min(...lastResult.landmarks.map((lm) => lm[0].y));
      sound.setBrightness(Math.max(0, Math.min(1, (0.95 - y) / 0.7)));
    }
    window.__petikFrame = frame; // for debugging in the console
    if (capture) { if (frame.count) capture.push(frame); }
    else decide(frame);
  }
  if (recorder?.active) {
    if (!recorder.paused) {
      const list = chordList();
      recorder.draw({
        landmarks: lastResult?.landmarks,
        chord: activeSlot !== null ? list[activeSlot] : "",
        next: activeSlot !== null && list[activeSlot + 1] ? `${t("next")}: ${list[activeSlot + 1]}` : "",
        title: state.title,
        madeWith: t("madeWith"),
      });
    }
    const s = recorder.seconds;
    $("recTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
}

/* ---------------- performance readout (press P) ---------------- */

const perf = {
  frames: [], detect: 0, show: false,
  note(t, ms) {
    this.frames.push(t); while (this.frames.length && t - this.frames[0] > 1000) this.frames.shift();
    this.detect = this.detect * 0.9 + ms * 0.1;
    if (this.show) {
      const fps = this.frames.length;
      const frameMs = fps ? 1000 / fps : 0;
      // camera frame + detection + smoothing (about one frame) + hold time + audio output
      const total = frameMs + this.detect + frameMs + Math.max(70, frameMs * 2) + (Tone.getContext().rawContext.outputLatency || 0.02) * 1000;
      $("perf").textContent = `${fps} fps | detect ${this.detect.toFixed(0)} ms | about ${total.toFixed(0)} ms from hand to sound | finger motion ${decider.motion.toFixed(1)}`;
    }
  },
};

/* ---------------- learning custom gestures ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function learnGesture(slot) {
  if (!landmarker) { toast(t("needCamera")); return; }
  if (capture) return;
  const cd = $("countdown"), num = $("countdownNum"), label = $("countdownLabel"), bar = $("countdownBar");
  cd.hidden = false; bar.style.width = "0";
  label.textContent = `${t("getReady")}: ${chordList()[slot]}`;
  for (const n of [3, 2, 1]) { num.textContent = n; await sleep(800); }
  label.textContent = t("holdStill"); num.textContent = chordList()[slot];
  capture = [];
  const t0 = performance.now(), dur = 2000;
  while (performance.now() - t0 < dur) {
    bar.style.width = `${((performance.now() - t0) / dur) * 100}%`;
    await sleep(50);
  }
  const frames = capture; capture = null; cd.hidden = true;
  if (frames.length < 8) { toast(t("noHands")); return; }
  // Keep the most common hand combination and spread samples evenly over the take.
  const pattern = (f) => `${!!f.L}${!!f.R}`;
  const counts = {};
  frames.forEach((f) => (counts[pattern(f)] = (counts[pattern(f)] || 0) + 1));
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const kept = frames.filter((f) => pattern(f) === main);
  const step = Math.max(1, kept.length / SAMPLES_PER_GESTURE);
  const round = (v) => v && v.map((x) => Math.round(x * 1000) / 1000);
  const out = [];
  for (let i = 0; i < kept.length && out.length < SAMPLES_PER_GESTURE; i += step) {
    const f = kept[Math.floor(i)];
    out.push({ L: round(f.L), R: round(f.R) });
  }
  state.gestures[slot] = out;
  state.shapes[slot] = shapeOf(kept);
  persist(); stab.reset();
  renderGestures(); renderStrip();
  toast(`${t("learned")}: ${chordList()[slot]}`);
}

/* ---------------- rhythm ---------------- */

let rhythmId = null;
function setupRhythm() {
  const tr = Tone.getTransport();
  tr.bpm.value = Number(state.bpm);
  if (rhythmId !== null) { tr.clear(rhythmId); rhythmId = null; }
  if (state.rhythm === "on") {
    rhythmId = tr.scheduleRepeat(() => {
      if (sound?.current) sound.play(sound.current, { restrike: true, velocity: 0.55 });
    }, "4n");
    tr.start();
  } else tr.stop();
}

/* ---------------- recording ---------------- */

let recorder = null;
let lastUrl = null;

function renderRecBar() {
  const active = !!recorder?.active, paused = !!recorder?.paused;
  $("recStartBtn").hidden = active;
  $("recPauseBtn").hidden = !active;
  $("recStopBtn").hidden = !active;
  $("recPauseBtn").innerHTML = paused
    ? `<span class="play-tri"></span><span>${t("recResume")}</span>`
    : `<span class="pause-bars"></span><span>${t("recPause")}</span>`;
  $("recState").textContent = active ? (paused ? t("recPaused") : t("recLive")) : "";
  $("recState").className = "rec-state" + (active ? (paused ? " paused" : " live") : "");
  $("recBadge").hidden = !active;
  $("recBadge").classList.toggle("paused", paused);
  $("recBadgeText").textContent = paused ? t("recPaused") : t("recLive");
  $("withMic").disabled = active;
}

async function startRecording() {
  const err = $("recError");
  err.hidden = true;
  if (!landmarker) { toast(t("needCamera")); return; }
  if (!recordingSupported()) { err.textContent = t("recUnsupported"); err.hidden = false; toast(t("recUnsupported")); return; }
  recorder = new Recorder({ video, toneOutput: sound.output, rawContext: Tone.getContext().rawContext });
  try {
    await recorder.start({ withMic: $("withMic").checked });
  } catch (e) {
    console.error(e);
    recorder = null;
    err.textContent = e?.name === "NotAllowedError" ? t("camDenied") : t("recUnsupported");
    err.hidden = false; toast(err.textContent);
  }
  renderRecBar();
}

function togglePause() {
  if (!recorder?.active) return;
  if (recorder.paused) recorder.resume(); else recorder.pause();
  renderRecBar();
}

async function stopRecording() {
  if (!recorder?.active) return;
  $("recState").textContent = t("recProcessing");
  const out = await recorder.stop();
  renderRecBar();
  if (!out || !out.blob.size) return;
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(out.blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const name = `petik-${(state.title || "song").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song"}-${stamp}.${out.ext}`;
  // Download automatically.
  const a = document.createElement("a");
  a.href = lastUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  for (const id of ["recDownload", "recDialogDownload"]) { $(id).href = lastUrl; $(id).download = name; }
  $("recPreview").src = lastUrl;
  $("recResult").hidden = false;
  $("recDialogVideo").src = lastUrl;
  $("recDialog").showModal();
  toast(t("recSaved"));
}

/* ---------------- wiring ---------------- */

function shareLink() {
  const payload = JSON.stringify({ t: state.title, c: state.chords, m: state.mode, i: state.instrument, s: state.signs });
  const b64 = btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${location.origin}${location.pathname}#s=${b64}`;
}

function init() {
  setLang(detectLang());
  syncInputs();
  renderAll();

  for (const b of document.querySelectorAll("[data-lang]")) b.onclick = () => { setLang(b.dataset.lang); renderAll(); };

  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.onclick = () => {
      for (const x of document.querySelectorAll("[data-tab]")) x.classList.toggle("on", x === tab);
      for (const body of document.querySelectorAll("[data-body]")) body.hidden = body.dataset.body !== tab.dataset.tab;
    };
  }

  $("startBtn").onclick = start;
  $("title").oninput = (e) => { state.title = e.target.value; persist(); };
  $("chords").oninput = (e) => { state.chords = e.target.value; songChanged(); };
  $("bassSel").onchange = renderPicker;
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.onchange = () => { state.mode = r.value; songChanged(); };
  }
  for (const r of document.querySelectorAll('input[name="instrument"]')) {
    r.onchange = async () => { state.instrument = r.value; persist(); if (sound) await sound.use(r.value); stab.reset(); };
  }
  for (const r of document.querySelectorAll('input[name="rhythm"]')) {
    r.onchange = () => { state.rhythm = r.value; persist(); if (sound) setupRhythm(); };
  }
  $("volume").oninput = (e) => { state.volume = Number(e.target.value); persist(); sound?.setVolume(state.volume); };
  $("reverb").oninput = (e) => { state.reverb = Number(e.target.value); persist(); sound?.setReverb(state.reverb); };
  $("bpm").oninput = (e) => {
    state.bpm = Number(e.target.value); $("bpmVal").textContent = state.bpm; persist();
    Tone.getTransport().bpm.value = state.bpm;
  };
  $("withMic").onchange = (e) => { state.withMic = e.target.checked; persist(); };
  for (const r of document.querySelectorAll('input[name="response"]')) {
    r.onchange = () => { state.response = r.value; persist(); Object.assign(decider, RESPONSE[r.value]); decider.reset(); };
  }
  $("handTone").onchange = (e) => { state.handTone = e.target.checked; persist(); if (!state.handTone) sound?.resetBrightness(); };

  $("saveBtn").onclick = () => {
    const songs = loadJSON("petik.songs", []);
    const id = (state.title || state.chords).toLowerCase();
    const entry = { id, title: state.title, chords: state.chords, mode: state.mode, gestures: state.gestures,
      shapes: state.shapes, signs: state.signs, updated: Date.now() };
    saveJSON("petik.songs", [entry, ...songs.filter((s) => s.id !== id)].slice(0, 50));
    renderSongs(); toast(t("saved"));
  };
  $("shareBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(shareLink()); toast(t("copied")); }
    catch { prompt("Link", shareLink()); }
  };

  $("recStartBtn").onclick = startRecording;
  $("recPauseBtn").onclick = togglePause;
  $("recStopBtn").onclick = stopRecording;

  $("signCancel").onclick = () => $("signDialog").close();
  $("signReset").onclick = () => { editing.sign = { ...(DEFAULT_SIGNS[editing.slot] || { L: null, R: null }) }; drawSignEditor(); };
  $("signSave").onclick = () => {
    state.signs[editing.slot] = { L: editing.sign.L, R: editing.sign.R };
    persist(); stab.reset();
    $("signDialog").close();
    renderGestures(); renderStrip();
  };
  $("creditsBtn").onclick = () => $("credits").showModal();

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "KeyP") { perf.show = !perf.show; $("perf").hidden = !perf.show; return; }
    if (e.code !== "Space" || e.target.matches("button")) return;
    e.preventDefault();
    if (sound?.current) sound.play(sound.current, { restrike: true });
  });
}

init();
