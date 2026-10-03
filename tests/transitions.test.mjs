// Frame-by-frame scenarios at 30 fps: moving between hand signs must not sound the shapes passed
// on the way, while chords that are really held still switch quickly.
import assert from "node:assert/strict";
import { matchSign, ChordDecider, DEFAULT_SIGNS } from "../js/gestures.js";

const SONG = ["A", "Am", "G#m", "C#m", "F#m", "B", "E"];       // signs: R1, R2, R3, R4, R5, L5+R1, L5+R2
const signs = DEFAULT_SIGNS.slice(0, SONG.length);
const FRAME = 1000 / 30;
const P = { one: "01000", two: "01100", three: "01110", four: "01111", five: "11111" };

/** segments: [ms, L, R, motion]; returns the chords played with their start time. */
function play(segments) {
  const d = new ChordDecider({ holdMs: 90, presenceMs: 160, speed: 3 });
  let t = 0, current = "stop";
  const played = [];
  for (const [ms, L, R, motion = 0.5] of segments) {
    const end = t + ms;
    for (; t < end; t += FRAME) {
      const frame = { Lp: L, Rp: R, motion };
      const cand = matchSign(frame, signs, current === "stop" ? null : current);
      const next = d.push(frame, cand, current, t);
      if (next !== undefined) { current = next; played.push({ chord: SONG[next] ?? next, t: Math.round(t) }); }
    }
  }
  return played;
}
const names = (p) => p.map((x) => x.chord).join(" > ");

// 1. E -> A: the left hand drops first, the right middle finger follows 0..133 ms later.
for (const lag of [0, 33, 66, 100, 133]) {
  const p = play([
    [600, P.five, P.two],                 // E held
    ...(lag ? [[lag, null, P.two, 1]] : []), // left hand gone, right still shows two fingers (Am shape)
    [FRAME, null, P.one, 4],              // middle finger curling: fast motion
    [600, null, P.one],                   // A held
  ]);
  assert.equal(names(p), "E > A", `E to A with ${lag} ms lag played: ${names(p)}`);
}

// 2. A -> G#m: middle finger rises before the ring finger, passing the Am shape for 2 frames.
{
  const p = play([[600, null, P.one], [2 * FRAME, null, P.two, 4], [FRAME, null, P.three, 4], [600, null, P.three]]);
  assert.equal(names(p), "A > G#m", names(p));
}

// 3. B -> E -> B -> A quickly, each held about 0.4 s.
{
  const p = play([[400, P.five, P.one], [FRAME, P.five, P.two, 4], [400, P.five, P.two], [FRAME, P.five, P.one, 4],
    [400, P.five, P.one], [FRAME, null, P.one, 2], [400, null, P.one]]);
  assert.equal(names(p), "B > E > B > A", names(p));
}

// 4. Speed: a clean one-finger change switches within about 0.13 s.
{
  const p = play([[600, null, P.one], [600, null, P.two]]);
  assert.equal(names(p), "A > Am");
  const lat = p[1].t - 600;
  assert.ok(lat <= 130, `A to Am took ${lat} ms`);
  console.log(`clean change: ${lat} ms`);
}

// 5. Dropping a hand to change chord (E -> Am, keep the right hand) still works, a bit slower.
{
  const p = play([[600, P.five, P.two], [600, null, P.two]]);
  assert.equal(names(p), "E > Am", names(p));
  const lat = p[1].t - 600;
  assert.ok(lat <= 200, `E to Am took ${lat} ms`);
  console.log(`hand drop change: ${lat} ms`);
}

// 6. A first chord after silence plays quickly once the hand is up and still.
{
  const p = play([[300, null, P.one, 4], [500, null, P.one]]);
  assert.equal(names(p), "A");
  console.log(`first chord, counted from when the hand stopped moving: ${p[0].t - 300} ms`);
}
console.log("transitions: all tests passed");

// Response presets: "accurate" also survives a slower left-hand drop (200 ms) without Am.
{
  const d = new ChordDecider({ holdMs: 150, presenceMs: 240, speed: 2.4 });
  let t = 0, current = "stop"; const played = [];
  for (const [ms, L, R, motion = 0.5] of [[600, P.five, P.two], [200, null, P.two, 1], [FRAME, null, P.one, 4], [600, null, P.one]]) {
    for (const end = t + ms; t < end; t += FRAME) {
      const frame = { Lp: L, Rp: R, motion };
      const next = d.push(frame, matchSign(frame, signs, current === "stop" ? null : current), current, t);
      if (next !== undefined) { current = next; played.push(SONG[next]); }
    }
  }
  assert.equal(played.join(" > "), "E > A", `accurate mode: ${played.join(" > ")}`);
  console.log("accurate preset: slow 200 ms hand drop still clean");
}
