// Small SVG drawing of a hand with the raised fingers highlighted.
// Drawn as the player sees their own hand facing the camera: right hand has the thumb on the left.

const UP = [30, 40, 44, 40, 32];   // finger lengths when raised: thumb, index, middle, ring, pinky
const X = [8, 20, 31, 42, 52];     // finger x positions for a right hand

export function handSVG(pattern, side = "R", { size = 44, title = "", label = side } = {}) {
  const p = pattern || "00000";
  const flip = side === "L";
  let fingers = "";
  for (let i = 0; i < 5; i++) {
    const up = p[i] === "1";
    const x = flip ? 60 - X[i] : X[i];
    const w = i === 0 ? 10 : 9;
    if (i === 0) {
      // Thumb comes out of the side of the palm at an angle.
      const h = up ? UP[0] : 12;
      const rot = flip ? 35 : -35;
      fingers += `<rect class="f${up ? " up" : ""}" x="${x - w / 2}" y="${58 - h}" width="${w}" height="${h}" rx="${w / 2}"
        transform="rotate(${rot} ${x} 58)"/>`;
    } else {
      const h = up ? UP[i] : 10;
      fingers += `<rect class="f${up ? " up" : ""}" x="${x - w / 2}" y="${44 - h}" width="${w}" height="${h + 8}" rx="${w / 2}"/>`;
    }
  }
  const tip = title ? `<title>${title}</title>` : "";
  return `<svg class="hand" viewBox="0 0 60 80" width="${size}" height="${(size * 80) / 60}" role="img">${tip}
    ${fingers}<rect class="palm" x="14" y="40" width="34" height="32" rx="10" transform="translate(${flip ? -2 : 0} 0)"/>
    <text class="side" x="30" y="62" text-anchor="middle">${label}</text></svg>`;
}
