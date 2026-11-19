/**
 * Readable text in mail. Messages sit on the app's own background, and many
 * set their own text colours: black text written for a white page turns up on
 * the dark theme, white text from a dark-mode mail client on the light one.
 *
 * fixContrast finds text whose colour is too close to whatever it is actually
 * drawn on (its own background, its container's, or the app's), and flips its
 * lightness, keeping its hue, until it reads comfortably. Text over images is
 * left alone: its background can't be known.
 */

/** sRGB, 0–255 per channel. */
export type RGB = [number, number, number];
type RGBA = [number, number, number, number];

/** Below this contrast ratio, text is changed (WCAG's minimum for large text). */
export const MIN_CONTRAST = 3;
/** Changed text aims for at least this ratio (WCAG AA for body text). */
const TARGET_CONTRAST = 4.5;
/** Marks text already changed, so a second pass leaves it alone. */
const MARK = "data-carrier-contrast";

/** Reads a computed colour: rgb()/rgba(), as browsers report them. */
export function parseColor(s: string): RGBA | null {
  const m = s.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A translucent colour drawn over an opaque one. */
export function over([r, g, b, a]: RGBA, [R, G, B]: RGB): RGB {
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}

export function invert([r, g, b]: RGB): RGB {
  return [255 - r, 255 - g, 255 - b];
}

function toHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

/**
 * The text colour to use instead of `fg` on `bg`: same hue, lightness flipped
 * to the other side of the background, then pushed further towards white (on
 * a dark background) or black (on a light one) until it reads.
 */
export function readableOn(fg: RGB, bg: RGB, target = TARGET_CONTRAST): RGB {
  // Below this luminance, white text reads better than black.
  const darkBg = luminance(bg) < 0.179;
  const [h, s, l0] = toHsl(fg);
  let l = darkBg ? Math.max(l0, 1 - l0) : Math.min(l0, 1 - l0);
  const goal = darkBg ? 1 : 0;
  for (let i = 0; i < 24 && contrast(fromHsl(h, s, l), bg) < target; i++) l += (goal - l) * 0.2;
  if (contrast(fromHsl(h, s, l), bg) < target) l = goal;
  return fromHsl(h, s, l);
}

/**
 * The opaque colour an element is drawn on, from its own background and its
 * ancestors', over `base` (what shows through a transparent page). null when
 * an image is part of it.
 */
export function backgroundOf(el: Element, base: RGB, win: Window, cache = new Map<Element, RGB | null>()): RGB | null {
  const walk = (n: Element | null): RGB | null => {
    if (!n) return base;
    if (cache.has(n)) return cache.get(n)!;
    const cs = win.getComputedStyle(n);
    let out: RGB | null;
    const c = parseColor(cs.backgroundColor);
    if (cs.backgroundImage && cs.backgroundImage !== "none") out = null;
    else if (!c) out = null;
    else if (c[3] >= 0.99) out = [c[0], c[1], c[2]];
    else {
      const under = walk(n.parentElement);
      out = under && (c[3] > 0 ? over(c, under) : under);
    }
    cache.set(n, out);
    return out;
  };
  return walk(el);
}

/** Whether the element holds text of its own (not only in children). */
function ownsText(el: Element): boolean {
  for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent?.trim()) return true;
  return false;
}

/**
 * Recolours low-contrast text in a rendered document. `base` is the colour
 * behind the document, in the document's own colour space (inverted if the
 * document is drawn through an invert filter). Only laid-out text is checked;
 * call again after revealing hidden parts. Returns how many elements changed.
 */
export function fixContrast(doc: Document, base: RGB, min = MIN_CONTRAST): number {
  const win = doc.defaultView;
  if (!win || !doc.body) return 0;
  const HTMLEl = (win as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement;
  const cache = new Map<Element, RGB | null>();
  const fixes: [HTMLElement, RGB][] = [];
  const walker = doc.createTreeWalker(doc.body, 1 /* NodeFilter.SHOW_ELEMENT */);
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (!(n instanceof HTMLEl) || n.hasAttribute(MARK) || !ownsText(n)) continue;
    const cs = win.getComputedStyle(n);
    // Hidden text (e.g. preheaders: tiny, transparent or collapsed) stays hidden.
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || parseFloat(cs.fontSize) < 6) continue;
    const box = n.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const color = parseColor(cs.color);
    const bg = color && backgroundOf(n, base, win, cache);
    if (!color || !bg || color[3] === 0) continue;
    const fg = over(color, bg);
    if (contrast(fg, bg) >= min) continue;
    fixes.push([n, readableOn(fg, bg)]);
  }
  // Written after reading, so changes don't cascade into the checks.
  for (const [el, c] of fixes) {
    el.style.setProperty("color", `rgb(${c.map((v) => Math.round(v)).join(", ")})`, "important");
    el.setAttribute(MARK, "");
  }
  return fixes.length;
}
