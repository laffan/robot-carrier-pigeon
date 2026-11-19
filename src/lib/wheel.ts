/**
 * Trackpad gestures. Two-finger swipes on a trackpad (a Mac, or an iPad with
 * a Magic Keyboard or trackpad) reach the page as wheel events, not touches.
 *
 * Wheel events with no gap longer than WHEEL_IDLE between them form one
 * gesture, momentum included. Once the gesture has moved a few pixels it is
 * locked to one axis. Rows (swipe actions) and the list (pull to refresh) read
 * the same gesture through wheelStep, so a vertical scroll can't turn into a
 * swipe partway through, whichever row ends up under the pointer.
 */

/** Gap (ms) that ends a gesture. */
export const WHEEL_IDLE = 150;
/** Movement (px) before a gesture is locked to an axis. */
const DECIDE = 8;

export interface WheelStep {
  /** Increases with each new gesture. */
  gesture: number;
  /** null until the gesture has moved far enough to tell. */
  axis: "x" | "y" | null;
  /** True on the step that locks the axis; dx/dy then hold all movement so far. */
  first: boolean;
  /** Movement in content direction: positive dx follows fingers moving right, positive dy fingers moving down (natural scrolling). */
  dx: number;
  dy: number;
}

let gesture = 0;
let axis: "x" | "y" | null = null;
let last = -Infinity;
let tx = 0;
let ty = 0;
const seen = new WeakMap<Event, WheelStep | null>();

/** Reads one wheel event as a step of the current gesture. The same event always gives the same step. */
export function wheelStep(e: WheelEvent): WheelStep | null {
  if (seen.has(e)) return seen.get(e)!;
  const step = read(e);
  seen.set(e, step);
  return step;
}

function read(e: WheelEvent): WheelStep | null {
  // Pinch to zoom arrives as a wheel event with ctrlKey.
  if (e.ctrlKey) return null;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = -e.deltaX * unit;
  const dy = -e.deltaY * unit;
  const now = e.timeStamp || performance.now();
  if (now - last > WHEEL_IDLE) {
    if (dx === 0 && dy === 0) return null;
    gesture++;
    axis = null;
    tx = 0;
    ty = 0;
  }
  last = now;
  if (axis) return { gesture, axis, first: false, dx, dy };
  tx += dx;
  ty += dy;
  if (Math.abs(tx) + Math.abs(ty) < DECIDE) return { gesture, axis: null, first: false, dx, dy };
  axis = Math.abs(tx) > Math.abs(ty) * 1.2 ? "x" : "y";
  return { gesture, axis, first: true, dx: tx, dy: ty };
}
