// 9:16 video recorder: composes the mirrored camera, hand points and chord overlay on a canvas,
// mixes instrument (+ optional microphone) audio, and records with MediaRecorder.

const W = 720, H = 1280;

function pickMime() {
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || null;
}

export const recordingSupported = () => !!pickMime() && !!HTMLCanvasElement.prototype.captureStream;

export class Recorder {
  constructor({ video, toneOutput, rawContext }) {
    this.video = video;
    this.toneOutput = toneOutput;
    this.ctx = rawContext;
    this.canvas = document.createElement("canvas");
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext("2d");
    this.active = false;
  }

  /** Draw one frame. overlay = { landmarks, chord, next, title, madeWith } */
  draw(overlay) {
    const { g, video } = this;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    // Center-crop the camera to 9:16 and mirror it, like a selfie.
    const cropW = Math.min(vw, vh * (W / H)), cropH = cropW * (H / W);
    const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;
    g.save();
    g.translate(W, 0); g.scale(-1, 1);
    g.drawImage(video, sx, sy, cropW, cropH, 0, 0, W, H);
    // Hand points, in the same mirrored space.
    g.fillStyle = "rgba(255, 196, 92, 0.95)";
    for (const lm of overlay.landmarks || []) {
      for (const p of lm) {
        const x = (p.x * vw - sx) * (W / cropW), y = (p.y * vh - sy) * (H / cropH);
        g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();

    // Bottom gradient for legibility.
    const grad = g.createLinearGradient(0, H * 0.62, 0, H);
    grad.addColorStop(0, "rgba(10,11,15,0)"); grad.addColorStop(1, "rgba(10,11,15,0.82)");
    g.fillStyle = grad; g.fillRect(0, H * 0.62, W, H * 0.38);

    g.textAlign = "center";
    if (overlay.chord) {
      g.font = "700 150px 'Space Grotesk', system-ui, sans-serif";
      g.fillStyle = "#ffc45c";
      g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 18;
      g.fillText(overlay.chord, W / 2, H - 250);
      g.shadowBlur = 0;
    }
    if (overlay.next) {
      g.font = "500 40px 'Inter', system-ui, sans-serif";
      g.fillStyle = "rgba(238,240,243,0.75)";
      g.fillText(overlay.next, W / 2, H - 175);
    }
    if (overlay.title) {
      g.font = "600 34px 'Inter', system-ui, sans-serif";
      g.fillStyle = "rgba(238,240,243,0.9)";
      g.fillText(overlay.title, W / 2, 90);
    }
    g.font = "500 26px 'Inter', system-ui, sans-serif";
    g.fillStyle = "rgba(238,240,243,0.7)";
    if (overlay.lyric) {
      // The line being sung, shrunk to fit the width.
      let size = 38;
      g.font = `600 ${size}px 'Inter', system-ui, sans-serif`;
      while (size > 22 && g.measureText(overlay.lyric).width > W - 60) { size -= 2; g.font = `600 ${size}px 'Inter', system-ui, sans-serif`; }
      g.fillStyle = "#eef0f3";
      g.fillText(overlay.lyric, W / 2, H - 115);
    }
    g.font = "500 26px 'Inter', system-ui, sans-serif";
    g.fillStyle = "rgba(238,240,243,0.7)";
    g.fillText(overlay.madeWith || "Made with Petik", W / 2, H - 60);
  }

  async start({ withMic }) {
    const mimeType = pickMime();
    if (!mimeType) throw new Error("unsupported");
    const dest = this.ctx.createMediaStreamDestination();
    this.toneOutput.connect(dest);
    this.dest = dest;
    if (withMic) {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micNode = this.ctx.createMediaStreamSource(this.mic);
      this.micNode.connect(dest);
    }
    const stream = new MediaStream([
      ...this.canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    this.chunks = [];
    this.mimeType = mimeType;
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(500);
    this.active = true;
    this.paused = false;
    this.elapsedBefore = 0;          // ms recorded before the current run (pauses excluded)
    this.runStart = performance.now();
  }

  /** Recorded time in seconds, not counting pauses. */
  get seconds() {
    const running = this.paused ? 0 : performance.now() - this.runStart;
    return Math.floor((this.elapsedBefore + running) / 1000);
  }

  pause() {
    if (!this.active || this.paused) return;
    this.rec.pause();
    this.elapsedBefore += performance.now() - this.runStart;
    this.paused = true;
  }

  resume() {
    if (!this.active || !this.paused) return;
    this.rec.resume();
    this.runStart = performance.now();
    this.paused = false;
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType.split(";")[0] });
        try { this.toneOutput.disconnect(this.dest); } catch {}
        this.micNode?.disconnect();
        this.mic?.getTracks().forEach((t) => t.stop());
        this.active = false;
        this.paused = false;
        resolve({ blob, ext: this.mimeType.startsWith("video/mp4") ? "mp4" : "webm" });
      };
      this.rec.stop();
    });
  }
}
