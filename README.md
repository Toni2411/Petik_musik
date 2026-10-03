# Petik

Play piano or guitar chords with hand gestures, right in the browser. Show fingers (or your own recorded poses) to the webcam, Petik plays the chord, and you can record a 9:16 video for TikTok, Reels and Shorts.

Bilingual UI: English and Bahasa Indonesia.

## Features

- **708 chords**: 59 chord types on all 12 roots (triads, sus, add, 6, 6/9, 7ths, 9ths, 11ths, 13ths, altered jazz chords), plus any bass note (D/F#, G/B). Type them or tap the chord picker. Common alternative spellings are understood (CM7, C-7, Cø, C°7, Cm(maj7), C7(b9)).
- **55 starter progressions** in 11 genres: pop, Indonesian styles (ballad, dangdut, koplo, melayu, keroncong), rock, blues, jazz, soul and R&B, lo-fi, anime and K-pop, folk, latin and reggae, worship.
- **Three ways to choose a chord**
  - **Hand signs** (default, up to 40 chords): every chord has its own finger combination on the left and/or right hand, shown as a drawing of the hand plus the matching emoji where one exists (for example chord 11 is the love-you sign, thumb + index + pinky). Any sign can be edited finger by finger or from quick picks; duplicates are flagged.
  - **Count** (up to 10 chords): show 1 to 10 fingers, any fingers.
  - **Record my own**: hold any pose for two seconds; Petik learns it (nearest-neighbour on hand landmarks) and draws the shape it saw.
- **Finger reading** uses MediaPipe 3D world landmarks and joint angles, so a thumb pointing sideways still counts. Each finger has hysteresis (a half-bent finger keeps its last state), and a chord change is accepted only once the pose has settled: held for 90 ms, no fast finger motion, and no hand entering or leaving in the last 160 ms while a chord plays. This stops in-between shapes (for example passing through Am on the way from E to A) from sounding. A Response setting (Fast, Balanced, Accurate) trades speed for strictness. Press P for live fps, detection time and latency. The status chip on the camera shows live drawings of what each hand is read as. A fist on both hands stops the sound.
- **Piano, acoustic (steel) guitar, nylon guitar and a bright guitar** from sampled instruments, with barre-style guitar voicings, plus two browser synths: **Synth pad** (the warm, filtered pad heard in Gesture Synth videos, low open voicing root-fifth-octave-third) and **Soft synth**. With a synth, hand height shapes the tone (higher hands, brighter sound). Every instrument is level-matched and runs through a compressor and limiter, so strums never clip. Room reverb, volume, rhythm on the beat, Space to strum again.
- **Recording**: Record, Pause/Continue and Stop under the camera. Stop downloads the 9:16 video automatically (MP4 in Chrome and Edge) and opens a preview to watch it back. Optional microphone.
- **Songs**: save locally, share a link (chords and hand signs; recorded poses stay on each device).

## Run locally

The camera needs `localhost` or HTTPS.

```bash
python -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765
```

## Tests

```bash
node tests/chords.test.mjs     # every chord voices correctly on piano and guitar
node tests/gestures.test.mjs   # hand sign matching
node tests/transitions.test.mjs  # frame-by-frame chord changes: no in-between chords, fast real ones
```

`tests/landmarks.html?f=img1.jpg,img2.jpg` draws the finger pattern Petik reads on still images, for tuning.

## Deploy

It is a static site with no build step. Any static host works:

- **Vercel**: `npx vercel` in this folder, or import the folder from GitHub.
- **GitHub Pages**: push to a repository and enable Pages on the main branch.
- **Netlify**: drag the folder into the Netlify dashboard.

## Structure

```
index.html          page
css/style.css       styles
js/app.js           camera, tracking loop, UI, songs, recording
js/gestures.js      finger patterns, hand signs, custom gesture classifier, stabilizer
js/handicon.js      SVG hand drawings
js/presets.js       starter progressions by genre
js/chords.js        chord parser and piano/guitar voicings (tested)
js/sound.js         Tone.js samplers
js/recorder.js      9:16 canvas compositor and MediaRecorder
js/i18n.js          English and Indonesian strings
vendor/             MediaPipe Tasks Vision, Tone.js
models/             hand_landmarker.task
samples/            piano and guitar samples
```

## Credits

- Hand tracking: MediaPipe Hand Landmarker by Google, Apache License 2.0.
- Audio engine: Tone.js, MIT License.
- Piano: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
- Acoustic and nylon guitar: Musyng Kite soundfont, rendered by midi-js-soundfonts (Benjamin Gleitzman), CC BY-SA 3.0.
- Bright guitar: acoustic guitar samples from tonejs-instruments by Nicholaus Brosowsky, CC BY 3.0.

## Copyright and contact

Copyright (c) 2026 Muhammad Fathoni. All rights reserved. See [LICENSE.txt](LICENSE.txt); third-party
libraries and samples keep their own licenses.

Problems or ideas: fathonimuhammad2411@gmail.com | [GitHub](https://github.com/Toni2411) | [LinkedIn](https://www.linkedin.com/in/muhammad-fathoni-038274266)
