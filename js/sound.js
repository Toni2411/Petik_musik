// Instruments built on Tone.js samplers (window.Tone, loaded as a classic script).
// Signal chain: sampler/synth -> trim -> reverb -> master volume -> limiter -> speakers.
// The trims make every instrument equally loud (matched by measured RMS, see tests); the limiter
// only acts on rare peaks so nothing clips, it does not squash normal playing.
import { parseChord, pianoVoicing, guitarVoicing, padVoicing } from "./chords.js";

const Tone = window.Tone;

const FLAT_SET = ["E2", "G2", "Bb2", "Db3", "E3", "G3", "Bb3", "Db4", "E4", "G4", "Bb4", "Db5", "E5", "G5"];

export const INSTRUMENTS = {
  piano: {
    dir: "piano", kind: "piano", trim: 5, release: 0.8,
    files: ["C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6"],
  },
  steel: { dir: "mk_steel", kind: "guitar", trim: 14, release: 0.6, files: FLAT_SET },
  nylon: { dir: "mk_nylon", kind: "guitar", trim: 16, release: 0.7, files: FLAT_SET },
  // Synths, made in the browser (no samples). "pad" is the warm, filtered sound of Gesture Synth videos.
  pad: {
    kind: "synth", trim: -12, cutoff: 1100, q: 0.6, rolloff: -12,
    voice: { oscillator: { type: "fatsquare", count: 3, spread: 22 },
      envelope: { attack: 0.03, decay: 0.4, sustain: 0.8, release: 0.6 } },
  },
  soft: {
    kind: "synth", trim: -3, cutoff: 2400, q: 0.8, rolloff: -24,
    voice: { oscillator: { type: "fattriangle", count: 2, spread: 12 },
      envelope: { attack: 0.008, decay: 0.6, sustain: 0.55, release: 0.5 } },
  },
  guitar: {
    dir: "guitar", kind: "guitar", trim: -2, release: 0.6,
    files: ["E2", "F2", "Fs2", "G2", "Gs2", "A2", "As2", "B2", "C3", "Cs3", "D3", "Ds3", "E3", "F3", "Fs3", "G3",
      "Gs3", "A3", "As3", "B3", "C4", "Cs4", "D4", "Ds4", "E4", "F4", "Fs4", "G4", "Gs4", "A4", "As4", "B4", "C5", "D5"],
  },
};

// File names use "s" for sharp (Cs4); Tone wants "C#4". Flat names (Bb2) are understood as is.
const noteName = (f) => f.replace(/^([A-G])s/, "$1#");

export class Sound {
  constructor() {
    this.limiter = new Tone.Limiter(-3).toDestination();
    this.master = new Tone.Volume(0).connect(this.limiter);
    this.reverb = new Tone.Reverb({ decay: 2.6, wet: 0.18 }).connect(this.master);
    this.samplers = {};
    this.instrument = "piano";
    this.held = [];
    this.current = null;
    this.strumDown = true;
  }

  load(name) {
    if (this.samplers[name]) return this.samplers[name].ready;
    const def = INSTRUMENTS[name] || INSTRUMENTS.piano;
    const trim = new Tone.Volume(def.trim).connect(this.reverb);
    if (def.kind === "synth") {
      const filter = new Tone.Filter({ type: "lowpass", frequency: def.cutoff, Q: def.q, rolloff: def.rolloff }).connect(trim);
      const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.35, wet: 0.35 }).connect(filter).start();
      const s = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 24, ...def.voice }).connect(chorus);
      const ready = Promise.resolve();
      this.samplers[name] = { s, ready, def, filter };
      return ready;
    }
    let done;
    const ready = new Promise((r) => (done = r));
    const s = new Tone.Sampler({
      urls: Object.fromEntries(def.files.map((f) => [noteName(f), `${f}.mp3`])),
      baseUrl: `samples/${def.dir}/`,
      release: def.release,
      onload: () => done(),
    }).connect(trim);
    this.samplers[name] = { s, ready, def };
    return ready;
  }

  async use(name) {
    if (!INSTRUMENTS[name]) name = "piano";
    this.stop();
    this.instrument = name;
    await this.load(name);
  }

  setVolume(db) { this.master.volume.rampTo(db, 0.05); }
  setReverb(wet) { this.reverb.wet.rampTo(wet, 0.1); }

  /** The node to tap for recording (after the limiter, so recordings never clip either). */
  get output() { return this.limiter; }

  get kind() { return INSTRUMENTS[this.instrument]?.kind || "piano"; }

  voicing(symbol) {
    const ch = parseChord(symbol);
    if (!ch) return null;
    if (this.kind === "synth") return padVoicing(ch);
    return this.kind === "guitar" ? guitarVoicing(ch) : pianoVoicing(ch);
  }

  /** Guitar strums (alternating direction on repeats), piano plays a soft block chord. */
  play(symbol, { velocity = 0.75, restrike = false } = {}) {
    const notes = this.voicing(symbol);
    const entry = this.samplers[this.instrument];
    if (!notes || !entry) return;
    const s = entry.s;
    const now = Tone.now();
    if (this.held.length) s.triggerRelease(this.held, now);
    // More notes sound louder together; scale so a 6-note strum is not much louder than a triad.
    const v = velocity * Math.min(1, Math.sqrt(3 / notes.length));
    if (this.kind === "guitar") {
      this.strumDown = restrike ? !this.strumDown : true;
      const seq = this.strumDown ? notes : [...notes].reverse();
      seq.forEach((n, i) => s.triggerAttack(n, now + i * 0.014, v * (this.strumDown ? 1 : 0.8)));
    } else if (this.kind === "synth") {
      notes.forEach((n, i) => s.triggerAttack(n, now + i * 0.004, v * (i === 0 ? 0.9 : 0.7)));
    } else {
      notes.forEach((n, i) => s.triggerAttack(n, now + i * 0.003, v * (i === 0 ? 0.9 : 0.75)));
    }
    this.held = notes;
    this.current = symbol;
  }

  /**
   * Hand height shapes the synth tone: 0 = hands low (dark), 1 = hands high (bright).
   * Ignored by sampled instruments.
   */
  setBrightness(level) {
    const entry = this.samplers[this.instrument];
    if (!entry?.filter) return;
    const hz = Math.max(250, Math.min(9000, entry.def.cutoff * Math.pow(2, (level - 0.5) * 4)));
    entry.filter.frequency.rampTo(hz, 0.08);
  }

  resetBrightness() {
    const entry = this.samplers[this.instrument];
    if (entry?.filter) entry.filter.frequency.rampTo(entry.def.cutoff, 0.2);
  }

  stop() {
    const entry = this.samplers[this.instrument];
    if (entry && this.held.length) entry.s.triggerRelease(this.held, Tone.now());
    this.held = [];
    this.current = null;
  }
}
