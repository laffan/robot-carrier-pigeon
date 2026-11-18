// Night vision: the whole app drawn in red alone — no blue light, and no
// green — for reading mail in the dark without losing dark adaptation
// (the rods that see at night are nearly blind to deep red). The list
// header's eye, between Search and Compose, turns it on and off; it is
// a setting (`nightVision`, settings.svelte.ts), kept until turned off,
// and it lies over either theme, the mail itself included (an HTML
// message's frame is drawn inside the page, under the layers).
//
// Two click-through layers on <body>, over everything else (app.css):
//   1. `backdrop-filter: grayscale(1)` — what is under it reduced to its
//      luminance;
//   2. pure red with `mix-blend-mode: multiply` — that grey times
//      (1, 0, 0): luminance in the red channel, green and blue zero.
// Filter functions and a blend mode only: an SVG `url()` filter would do
// it in one step, but WebKit renders those off its accelerated path and
// doesn't take them in `backdrop-filter`. Whatever the grey layer misses
// is still multiplied by the red one, so nothing keeps any blue. They are
// children of <body>, not of one host, because a host would be its own
// stacking context and both would sample its empty backdrop.
//
// The settings load asynchronously, so the choice is also kept in
// localStorage and applied before the app mounts (main.ts): a launch in
// night vision is red from its first frame.

const GREY = "night-vision-grey";
const RED = "night-vision-red";
const MIRROR = "carrier-night-vision";

/** Put the layers up, or take them down. */
export function applyNightVision(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("night-vision", on);
  try {
    localStorage.setItem(MIRROR, on ? "1" : "0");
  } catch {
    /* storage unavailable: the settings still apply it once loaded */
  }
  const have = document.getElementById(GREY);
  if (!on) {
    have?.remove();
    document.getElementById(RED)?.remove();
    return;
  }
  if (have) return;
  for (const id of [GREY, RED]) {
    const el = document.createElement("div");
    el.id = id;
    el.className = "night-vision-layer";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
}

/** Before the app mounts: the choice last made on this device. */
export function applyStoredNightVision(): void {
  try {
    if (localStorage.getItem(MIRROR) === "1") applyNightVision(true);
  } catch {
    /* storage unavailable */
  }
}
