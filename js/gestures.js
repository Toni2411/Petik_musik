// Hand reading: finger patterns, hand signs, pose vectors and the custom gesture classifier.
// Pure functions over MediaPipe landmarks, testable in Node.
//
// A finger pattern is a 5 character string, thumb to pinky, "1" = finger up. "01100" = peace sign.
// Hands are named from the player's point of view: "L" = their left hand, "R" = their right hand.

const WRIST = 0, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4, INDEX_MCP = 5, MIDDLE_MCP = 9, PINKY_MCP = 17;
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]; // mcp, pip, dip, tip

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist = (a, b) => len(sub(a, b));
function angle(a, b, c) { // angle at b, degrees
  const u = sub(a, b), v = sub(c, b);
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / ((len(u) * len(v)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * How clearly each finger is up, thumb to pinky. Above 0 = up, below 0 = down, and the size says
 * how sure: about +1 for a finger fully stretched, about -1 for one fully curled, near 0 for a
 * finger caught half way while moving. Works best with MediaPipe world landmarks (real 3D).
 */
export function fingerScores(lm) {
  const w = lm[WRIST];
  const palm = dist(w, lm[MIDDLE_MCP]) || 1;
  // Thumb: pointing away from the palm and clear of the index base. A thumb sticking out
  // sideways often bends a little at its last joint, so a far-away tip also counts.
  const tipToIndex = dist(lm[THUMB_TIP], lm[INDEX_MCP]) / palm;
  const away = (tipToIndex - 0.5) / 0.2;
  const out = (dist(lm[THUMB_TIP], lm[PINKY_MCP]) / (dist(lm[THUMB_MCP], lm[PINKY_MCP]) || 1) - 1.1) / 0.12;
  const straightOrFar = Math.max((angle(lm[THUMB_MCP], lm[THUMB_IP], lm[THUMB_TIP]) - 130) / 25, (tipToIndex - 0.75) / 0.2);
  const scores = [Math.min(away, out, straightOrFar)];
  for (const [mcp, pip, , tip] of FINGERS) {
    const straight = (angle(lm[mcp], lm[pip], lm[tip]) - 140) / 25;
    const far = (dist(lm[tip], w) / (dist(lm[pip], w) || 1) - 1.08) / 0.15;
    scores.push(Math.min(straight, far));
  }
  return scores.map((s) => Math.max(-2, Math.min(2, s)));
}

/** Which fingers are up, as a 5 character string. */
export const fingerPattern = (lm) => fingerScores(lm).map((s) => (s > 0 ? "1" : "0")).join("");

/**
 * Per-finger hysteresis. A finger only flips once it is clearly on the other side, so a finger
 * half way through opening or closing keeps its old state and no half-made shape is reported.
 */
export class HandTracker {
  constructor(margin = 0.35) { this.margin = margin; this.state = { L: null, R: null }; }
  push(frame) {
    const out = { ...frame, fingers: 0 };
    for (const side of ["L", "R"]) {
      const sc = frame[side + "s"];
      if (!sc) { this.state[side] = null; out[side + "p"] = null; continue; }
      const prev = this.state[side];
      const bits = sc.map((s, i) => {
        if (!prev) return s > 0;                      // a hand that just appeared: plain reading
        if (prev[i]) return s > -this.margin;         // was up: stays up until clearly down
        return s > this.margin;                       // was down: needs to be clearly up
      });
      this.state[side] = bits;
      out[side + "p"] = bits.map((b) => (b ? "1" : "0")).join("");
      out.fingers += bits.filter(Boolean).length;
    }
    return out;
  }
  reset() { this.state = { L: null, R: null }; }
}

export const countUp = (p) => (p ? [...p].filter((c) => c === "1").length : 0);

/** 63-number pose vector: landmarks relative to the wrist, scaled by palm size. */
export function handVector(lm) {
  const w = lm[WRIST];
  const s = dist(w, lm[MIDDLE_MCP]) || 1;
  const v = [];
  for (const p of lm) v.push((p.x - w.x) / s, (p.y - w.y) / s, ((p.z - w.z) / s) * 0.5);
  return v;
}

/**
 * Describe a MediaPipe HandLandmarker result.
 * Tested on raw (unmirrored) selfie frames: the Tasks API handedness label matches the player's
 * real hand. With two hands visible we use screen position instead, which never flips between
 * frames: in a raw selfie frame the player's left hand has the larger x.
 */
export function describeFrame(result) {
  const lms = result?.landmarks || [];
  const hands = lms.map((lm, i) => ({
    i, lm, world: result.worldLandmarks?.[i] || lm,
    side: (result.handedness?.[i]?.[0]?.categoryName || "Right") === "Left" ? "L" : "R",
    x: lm[WRIST].x,
  }));
  if (hands.length === 2) {
    hands.sort((a, b) => b.x - a.x);
    hands[0].side = "L"; hands[1].side = "R";
  }
  const frame = { L: null, R: null, Lp: null, Rp: null, Lraw: null, Rraw: null, fingers: 0, count: hands.length, sides: [] };
  for (const h of hands) {
    frame.sides[h.i] = h.side;
    frame[h.side + "raw"] = h.lm;
    frame[h.side] = handVector(h.lm);
    frame[h.side + "s"] = fingerScores(h.world);
    frame[h.side + "p"] = frame[h.side + "s"].map((s) => (s > 0 ? "1" : "0")).join("");
    frame.fingers += countUp(frame[h.side + "p"]);
  }
  return frame;
}

/* ---------------- motion: telling a held pose from a hand on its way somewhere ---------------- */

/**
 * How fast the hand changes shape, in palm lengths per second. Points are measured relative to
 * the wrist, so moving or swaying a hand while holding a sign does not count, only fingers
 * opening or closing do.
 */
export function handSpeed(prev, cur, dtMs) {
  if (!prev || !cur || dtMs <= 0) return 0;
  const palm = dist(cur[WRIST], cur[MIDDLE_MCP]) || 0.1;
  const pw = prev[WRIST], cw = cur[WRIST];
  let sum = 0;
  for (let i = 1; i < cur.length; i++) {
    sum += Math.hypot((cur[i].x - cw.x) - (prev[i].x - pw.x), (cur[i].y - cw.y) - (prev[i].y - pw.y));
  }
  return (sum / (cur.length - 1) / palm) * (1000 / dtMs);
}

/**
 * Decides when a new chord is really meant. In-between shapes appear while moving from one sign
 * to the next; they are short, they come with fingers moving fast, and they often show up right
 * when one hand enters or leaves the frame. So a new chord is accepted only when it has been held
 * for `holdMs`, no hand has entered or left for `presenceMs`, and the fingers are not moving fast.
 * The chord already playing is never interrupted by a pose that has not settled.
 */
export class ChordDecider {
  constructor({ holdMs = 90, presenceMs = 160, speed = 3, motionMs = 60, minFrames = 2 } = {}) {
    Object.assign(this, { holdMs, presenceMs, speed, motionMs, minFrames });
    this.reset();
  }
  /** frame: { Lp, Rp, Lraw?, Rraw?, motion? }, cand: what the pose matches (or null). Returns the chord to switch to, or undefined. */
  push(frame, cand, current, now = performance.now()) {
    const presence = `${!!frame.Lp}${!!frame.Rp}`;
    // A hand entering or leaving only needs the wait while a chord is playing; from silence there
    // is no chord to confuse it with, and the hold time covers the hand still forming its shape.
    const playing = current !== null && current !== "stop";
    if (playing && this.presence !== null && presence !== this.presence) this.busyUntil = Math.max(this.busyUntil, now + this.presenceMs);
    this.presence = presence;
    let motion = frame.motion;
    if (motion === undefined) {
      const dt = this.prevT ? now - this.prevT : 0;
      let fast = 0;
      for (const side of ["L", "R"]) {
        const a = this.prevRaw?.[side], b = frame[side + "raw"];
        if (a && b) fast = Math.max(fast, handSpeed(a, b, dt));
      }
      this.motion = this.motion * 0.5 + fast * 0.5;   // smooth out single jittery frames
      motion = this.motion;
      this.prevRaw = { L: frame.Lraw, R: frame.Rraw };
      this.prevT = now;
    }
    if (motion > this.speed) this.busyUntil = Math.max(this.busyUntil, now + this.motionMs);
    if (cand === null || cand === undefined || cand === current) { this.pending = null; return undefined; }
    if (!this.pending || this.pending.cand !== cand) this.pending = { cand, since: now, frames: 0 };
    this.pending.frames++;
    if (this.pending.frames >= this.minFrames && now - this.pending.since >= this.holdMs && now >= this.busyUntil) {
      this.pending = null;
      return cand;
    }
    return undefined;
  }
  // After a reset (e.g. hands left the frame) a hand coming back counts as entering.
  reset() { this.presence = "falsefalse"; this.busyUntil = -Infinity; this.pending = null; this.motion = 0; this.prevRaw = null; this.prevT = 0; }
}

/* ---------------- hand signs ---------------- */

// Standard emoji for the patterns that have one. Other patterns are shown by the hand drawing only.
export const EMOJI = {
  "00000": "✊", "01000": "☝️", "01100": "✌️", "11111": "🖐️", "10000": "👍",
  "10001": "🤙", "11001": "🤟", "01001": "🤘",
};

const ONE = "01000", TWO = "01100", THREE = "01110", FOUR = "01111", FIVE = "11111";
const LOVE = "11001", ROCK = "01001", CALL = "10001", THUMB = "10000", GUN = "11000", PINKY = "00001";

/** Default sign for chord n (0 based). Counting 1-10 first, then hand signs, then two-hand pairs. */
export const DEFAULT_SIGNS = [
  { R: ONE }, { R: TWO }, { R: THREE }, { R: FOUR }, { R: FIVE },
  { L: FIVE, R: ONE }, { L: FIVE, R: TWO }, { L: FIVE, R: THREE }, { L: FIVE, R: FOUR }, { L: FIVE, R: FIVE },
  { R: LOVE }, { R: ROCK }, { R: CALL }, { R: THUMB }, { R: GUN }, { R: PINKY },
  { L: ONE }, { L: TWO }, { L: THREE }, { L: FOUR }, { L: LOVE }, { L: ROCK }, { L: CALL }, { L: THUMB },
  { L: LOVE, R: LOVE }, { L: ROCK, R: ROCK }, { L: CALL, R: CALL }, { L: THUMB, R: THUMB },
  { L: TWO, R: TWO }, { L: ONE, R: ONE }, { L: GUN, R: GUN }, { L: PINKY, R: PINKY },
  { L: ROCK, R: LOVE }, { L: LOVE, R: ROCK }, { L: THUMB, R: ONE }, { L: ONE, R: THUMB },
  { L: CALL, R: TWO }, { L: TWO, R: CALL }, { L: GUN, R: ROCK }, { L: ROCK, R: GUN },
].map((s) => ({ L: s.L || null, R: s.R || null }));

export const MAX_SIGNS = DEFAULT_SIGNS.length;

export const signKey = (s) => `${s?.L || "-"}|${s?.R || "-"}`;

const hamming = (a, b) => { let h = 0; for (let i = 0; i < 5; i++) if (a[i] !== b[i]) h++; return h; };

/**
 * How far a hand is from what a sign wants. 0 = exact.
 * Wanted hand: number of fingers that differ (a missing hand counts as all five).
 * Unused hand: free when it is down or a fist; the more fingers it raises, the less likely this
 * sign is meant (one finger 1, two 1.5, ... an open hand 3).
 */
function handCost(want, got) {
  if (!want) return !got || got === "00000" ? 0 : 0.5 + 0.5 * countUp(got);
  if (!got) return 5;
  return hamming(want, got);
}

export const signCost = (sign, frame) => handCost(sign.L, frame.Lp) + handCost(sign.R, frame.Rp);

/**
 * Index of the sign the frame shows, or null.
 * Picks the closest sign, tolerating one finger read wrong. Two equally close signs give null,
 * except that the chord already playing wins ties and stays while the pose is still close to it,
 * so a flickering finger never bounces between two chords.
 */
export function matchSign(frame, signs, current = null) {
  const scored = [];
  signs.forEach((s, i) => { if (s && (s.L || s.R)) scored.push({ i, c: signCost(s, frame) }); });
  if (!scored.length) return null;
  scored.sort((a, b) => a.c - b.c);
  const best = scored[0], second = scored[1];
  const cur = current !== null ? scored.find((x) => x.i === current) : null;
  if (cur && cur.c <= 1 && best.c > cur.c - 1) return current;      // still close to the playing chord
  if (best.c > 1.5) return null;
  if (second && second.c - best.c < 1) return cur && cur.c === best.c ? current : null;
  return best.i;
}

/**
 * Majority vote per finger over the last few frames, so one bad frame does not change the pattern.
 * A hand that leaves the frame resets its history.
 */
export class PatternSmoother {
  constructor(size = 5) { this.size = size; this.hist = { L: [], R: [] }; }
  push(frame) {
    const out = { ...frame, fingers: 0 };
    for (const side of ["L", "R"]) {
      const p = frame[side + "p"];
      const h = this.hist[side];
      if (!p) { h.length = 0; out[side + "p"] = null; continue; }
      h.push(p); if (h.length > this.size) h.shift();
      let sm = "";
      for (let i = 0; i < 5; i++) sm += h.filter((x) => x[i] === "1").length * 2 > h.length ? "1" : "0";
      out[side + "p"] = sm;
      out.fingers += countUp(sm);
    }
    return out;
  }
  reset() { this.hist = { L: [], R: [] }; }
}

/** True when every visible hand is a fist (used as "stop"). */
export const isFist = (frame) => frame.count > 0 &&
  (!frame.Lp || frame.Lp === "00000") && (!frame.Rp || frame.Rp === "00000");

/* ---------------- custom (recorded) gestures ---------------- */

function rms(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const t = a[i] - b[i]; s += t * t; }
  return Math.sqrt(s / a.length);
}

/** Distance between two frames. Different set of visible hands = not the same gesture. */
export function frameDistance(f, g) {
  let total = 0, parts = 0;
  for (const k of ["L", "R"]) {
    if (!!f[k] !== !!g[k]) return Infinity;
    if (f[k]) { total += rms(f[k], g[k]); parts++; }
  }
  return parts ? total / parts : Infinity;
}

export const MATCH_THRESHOLD = 0.28;

/**
 * k-nearest-neighbour over recorded samples. samples: { [slot]: frame[] }.
 * Returns { slot, distance } or null when nothing is close enough or two gestures are too alike.
 */
export function classify(frame, samples, k = 3, threshold = MATCH_THRESHOLD) {
  const best = [];
  for (const [slot, list] of Object.entries(samples)) {
    if (!list?.length) continue;
    const ds = list.map((s) => frameDistance(frame, s)).sort((a, b) => a - b).slice(0, k);
    best.push({ slot: Number(slot), distance: ds.reduce((a, b) => a + b, 0) / ds.length });
  }
  best.sort((a, b) => a.distance - b.distance);
  if (!best.length || !isFinite(best[0].distance) || best[0].distance > threshold) return null;
  if (best[1] && best[1].distance < best[0].distance * 1.15) return null;
  return best[0];
}

/** Most common finger pattern per hand across recorded frames, to draw what was learned. */
export function shapeOf(frames) {
  const pick = (key) => {
    const c = {};
    for (const f of frames) if (f[key]) c[f[key]] = (c[f[key]] || 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  };
  return { L: pick("Lp"), R: pick("Rp") };
}

/**
 * Holds a candidate until it has been seen for at least `ms` milliseconds and `frames` frames in a
 * row. Time based, so it reacts equally fast at 30 or 60 fps.
 */
export class Stabilizer {
  constructor(frames = 2, ms = 70) { this.frames = frames; this.ms = ms; this.reset(); }
  push(v, now = performance.now()) {
    if (v === this.cand) this.n++; else { this.cand = v; this.n = 1; this.since = now; }
    if (this.n >= this.frames && now - this.since >= this.ms && v !== this.value) {
      this.value = v; return { changed: true, value: v };
    }
    return { changed: false, value: this.value };
  }
  reset() { this.cand = undefined; this.n = 0; this.since = 0; this.value = undefined; }
}
