/**
 * Places text along a circular arc, letter by letter, centred on the top of
 * the circle. Pure geometry (no React) so it can be tested on its own.
 *
 * Letter widths are the proportions of an upper-case serif face, in ems; they
 * keep narrow letters ("I") close together and wide ones ("M", "W") apart, so
 * the spacing along the curve looks even.
 */

const WIDTH_EM: Record<string, number> = {
  A: 0.72, B: 0.67, C: 0.67, D: 0.72, E: 0.61, F: 0.56, G: 0.72, H: 0.72, I: 0.33, J: 0.39, K: 0.72, L: 0.61, M: 0.89,
  N: 0.72, O: 0.72, P: 0.56, Q: 0.72, R: 0.67, S: 0.56, T: 0.61, U: 0.72, V: 0.72, W: 0.94, X: 0.72, Y: 0.72, Z: 0.61,
  ' ': 0.3,
};

export type ArcLetter = {
  char: string;
  /** Degrees clockwise from straight up; negative is to the left. */
  angle: number;
  /** Width of the letter's box. */
  width: number;
};

export type ArcLayout = { fontSize: number; radius: number; letters: ArcLetter[] };

export type ArcOptions = {
  /** Radius of the circle the text sits OUTSIDE of (e.g. the logo's ring). */
  innerRadius: number;
  /** Total angle the text covers, in degrees. */
  spanDeg: number;
  /** Extra space between letters, in ems. */
  letterSpacingEm: number;
  /** Gap between the circle and the letters' bottom edge, in ems of the font size. */
  gapEm: number;
};

const CAP_HEIGHT_EM = 0.7;

export function layoutArc(text: string, { innerRadius, spanDeg, letterSpacingEm, gapEm }: ArcOptions): ArcLayout {
  const chars = [...text.toUpperCase()];
  const widths = chars.map((c) => WIDTH_EM[c] ?? 0.7);
  const n = chars.length;
  const emsTotal = widths.reduce((a, b) => a + b, 0) + (n - 1) * letterSpacingEm;
  const span = (spanDeg * Math.PI) / 180;

  // The letters' centre line sits at radius R = inner + gap + half a cap height, and the
  // text length along it must equal R × span:  fs × emsTotal = R × span.
  const k = gapEm + CAP_HEIGHT_EM / 2;
  const a = span / emsTotal;
  const fontSize = (innerRadius * a) / (1 - k * a);
  const radius = innerRadius + k * fontSize;

  let travelled = 0;
  const letters = chars.map((char, i) => {
    const w = widths[i] * fontSize;
    const centre = travelled + w / 2;
    travelled += w + letterSpacingEm * fontSize;
    return { char, width: w, angle: 0, _c: centre };
  });
  const total = travelled - letterSpacingEm * fontSize;
  return {
    fontSize,
    radius,
    letters: letters.map(({ char, width, _c }) => ({ char, width, angle: ((_c - total / 2) / radius) * (180 / Math.PI) })),
  };
}
