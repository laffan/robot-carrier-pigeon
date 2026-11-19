import { describe, expect, it } from "vitest";
import { contrast, invert, luminance, MIN_CONTRAST, over, parseColor, readableOn, type RGB } from "../contrast";

const DARK_APP: RGB = [18, 18, 19];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function hue([r, g, b]: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

describe("contrast", () => {
  it("reads computed colours", () => {
    expect(parseColor("rgb(0, 0, 0)")).toEqual([0, 0, 0, 1]);
    expect(parseColor("rgba(255, 255, 255, 0.5)")).toEqual([255, 255, 255, 0.5]);
    expect(parseColor("rgb(10 20 30 / 40%)")).toEqual([10, 20, 30, 0.4]);
    expect(parseColor("color(srgb 0 0 0)")).toBeNull();
  });

  it("measures WCAG contrast", () => {
    expect(contrast(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrast(WHITE, WHITE)).toBe(1);
    expect(luminance(WHITE)).toBeCloseTo(1, 5);
    expect(over([0, 0, 0, 0.5], WHITE).map(Math.round)).toEqual([128, 128, 128]);
    expect(invert(DARK_APP)).toEqual([237, 237, 236]);
  });

  it("turns dark text light on a dark background", () => {
    expect(contrast(BLACK, DARK_APP)).toBeLessThan(MIN_CONTRAST);
    const c = readableOn(BLACK, DARK_APP);
    expect(contrast(c, DARK_APP)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(c)).toBeGreaterThan(0.5);
  });

  it("turns light text dark on a light background", () => {
    const c = readableOn(WHITE, WHITE);
    expect(contrast(c, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(c)).toBeLessThan(0.2);
  });

  it("keeps the hue of coloured text", () => {
    const navy: RGB = [11, 46, 107];
    const c = readableOn(navy, DARK_APP);
    expect(contrast(c, DARK_APP)).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(hue(c) - hue(navy))).toBeLessThan(2);
  });

  it("handles a mid-grey background in either direction", () => {
    const grey: RGB = [128, 128, 128];
    for (const fg of [[100, 100, 100], [150, 150, 150]] as RGB[]) {
      expect(contrast(readableOn(fg, grey), grey)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
