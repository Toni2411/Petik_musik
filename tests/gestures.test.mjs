import assert from "node:assert/strict";
import { matchSign, isFist, DEFAULT_SIGNS, MAX_SIGNS, signKey, Stabilizer, PatternSmoother } from "../js/gestures.js";

// Default signs must all be different, otherwise two chords would fight over one gesture.
const keys = DEFAULT_SIGNS.map(signKey);
assert.equal(new Set(keys).size, keys.length, "default signs are unique");
assert.equal(MAX_SIGNS, 40);

const f = (Lp, Rp) => ({ Lp, Rp, count: (Lp ? 1 : 0) + (Rp ? 1 : 0) });
assert.equal(matchSign(f(null, "01000"), DEFAULT_SIGNS), 0);            // right index = chord 1
assert.equal(matchSign(f("00000", "01000"), DEFAULT_SIGNS), 0);         // other hand in a fist still ok
assert.equal(matchSign(f("11111", "01000"), DEFAULT_SIGNS), 5);         // open left + right index = chord 6
assert.equal(matchSign(f("11111", "11111"), DEFAULT_SIGNS), 9);         // both open = chord 10
assert.equal(matchSign(f(null, "11001"), DEFAULT_SIGNS), 10);           // love-you sign = chord 11
assert.equal(matchSign(f("01001", "01001"), DEFAULT_SIGNS), 25);
assert.equal(matchSign(f(null, "00110"), DEFAULT_SIGNS), 2);            // one finger off: closest is 3 fingers
const song7 = DEFAULT_SIGNS.slice(0, 7);                                 // a 7-chord song like A Am G#m C#m F#m B E
assert.equal(matchSign(f("11000", "01000"), song7), 0);                 // relaxed: left hand resting in an unused shape
assert.equal(matchSign(f("11111", "01000"), song7), 5);                 // B in that song
assert.equal(matchSign(f("11110", "01000"), song7, 0), 5);              // even while A is playing, a nearly open left hand means B
assert.equal(matchSign(f("00110", "00110"), DEFAULT_SIGNS), null);

// The bug the user hit: chord 6 (open left + right index) must not fall back to chord 1 when one
// finger of the open left hand flickers.
const song7b = DEFAULT_SIGNS.slice(0, 7);
for (const flicker of ["11110", "01111", "11101", "10111"]) {
  assert.equal(matchSign(f(flicker, "01000"), song7b), 5, `flicker ${flicker} in a 7-chord song`);
  assert.equal(matchSign(f(flicker, "01000"), song7b, 0), 5, `flicker ${flicker} while chord 1 plays`);
  assert.equal(matchSign(f(flicker, "01000"), DEFAULT_SIGNS, 5), 5, `flicker ${flicker} while chord 6 plays, all 40 signs`);
}
// Lowering the left hand really switches to chord 1.
assert.equal(matchSign(f(null, "01000"), DEFAULT_SIGNS, 5), 0);
assert.equal(matchSign(f("00000", "01000"), DEFAULT_SIGNS, 5), 0);
// Ties keep the chord already playing.
assert.equal(matchSign(f(null, "11110"), DEFAULT_SIGNS, 3), null);           // two fingers off and a tie: hold (keep playing)
assert.equal(matchSign(f(null, "01101"), DEFAULT_SIGNS.slice(0, 5), 3), 3);   // one finger off from the playing chord: stay
assert.equal(matchSign(f(null, "01110"), DEFAULT_SIGNS.slice(0, 5), 3), 2);   // an exact other sign still switches

// Smoother: a single bad frame is voted out.
const sm = new PatternSmoother(5);
let out;
for (const p of ["11111", "11111", "11110", "11111", "11111"]) out = sm.push({ Lp: p, Rp: "01000", count: 2 });
assert.equal(out.Lp, "11111");
assert.equal(out.fingers, 6);
assert.equal(sm.push({ Lp: null, Rp: "01000", count: 1 }).Lp, null);
assert.ok(isFist(f("00000", "00000")) && isFist(f(null, "00000")) && !isFist(f(null, null)));

// Stabilizer is time based: 2 frames and 70 ms.
const s = new Stabilizer(2, 70);
assert.equal(s.push(1, 0).changed, false);
assert.equal(s.push(1, 33).changed, false);                 // 2 frames but only 33 ms
assert.deepEqual(s.push(1, 70), { changed: true, value: 1 });
assert.equal(s.push(1, 100).changed, false);                // already playing
assert.equal(s.push(2, 110).changed, false);
assert.equal(s.push(1, 120).changed, false);                // one-frame blip resets the timer
assert.equal(s.push(2, 130).changed, false);
assert.deepEqual(s.push(2, 200), { changed: true, value: 2 });
// At 60 fps a switch lands after about 70 ms, at 30 fps after about 2-3 frames.
console.log("gestures: all tests passed");
